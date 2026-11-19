import { useRef, useState } from 'react'
import { unzipSync } from 'fflate'
import { Building, CheckCircle2, FileStack, FileUp, Loader2, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mascaraCnpj } from '../lib/format'
import { Modal } from '../components/ui'
import { BuscaCliente } from '../components/BuscaCliente'
import { extrairSocios, itensDoPdf, textoDoArquivo } from './contratoSocial'
import {
  identificarCliente,
  lerCartaoCnpj,
  lerCartaoPorPosicao,
  lerEmpresaDoContrato,
  tipoDocumento,
  type DadosEmpresaDoc,
  type TipoDocumento,
} from './documentos'
import { enviarArquivoDrive } from './drive'
import { completarPeloCep, mesclarSocios, semAcento } from './socios'
import type { Cliente, SocioCadastro } from './tipos'

interface Novo {
  ativo: boolean
  codigo: string
  razao_social: string
  cnpj: string
}

interface Linha {
  arquivo: File
  /** Nome do .zip de onde veio */
  zip: string | null
  tipo: TipoDocumento | null
  clienteId: string
  como: string | null
  socios: SocioCadastro[]
  empresa: DadosEmpresaDoc | null
  novo: Novo | null
  erroLeitura: string | null
  status: 'lido' | 'enviando' | 'ok' | 'erro'
  resultado: string | null
}

const ROTULO_TIPO: Record<TipoDocumento, string> = { contrato: 'Contrato Social', cartao: 'Cartão CNPJ' }
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const ehDoc = (n: string) => /\.(pdf|docx)$/i.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)
const nomeChave = (s: string) => semAcento(s).replace(/[^A-Z0-9]/g, '')

/**
 * Empresa nova de cada linha: linhas com o mesmo CNPJ ou a mesma razão social são a mesma empresa
 * (ex.: contrato sem CNPJ + Cartão CNPJ). Devolve, por linha, a chave do grupo ('' se não vai cadastrar).
 */
function gruposNovos(ls: Linha[]) {
  const pai = ls.map((_, i) => i)
  const raiz = (i: number): number => (pai[i] === i ? i : (pai[i] = raiz(pai[i])))
  const ativos = ls.map((l, i) => (!l.clienteId && l.novo?.ativo && l.novo.razao_social.trim() ? i : -1)).filter((i) => i >= 0)
  for (const a of ativos)
    for (const b of ativos) {
      if (b <= a) continue
      const na = ls[a].novo!
      const nb = ls[b].novo!
      const mesmoCnpj = digitos(na.cnpj).length === 14 && digitos(na.cnpj) === digitos(nb.cnpj)
      const mesmoNome = nomeChave(na.razao_social) === nomeChave(nb.razao_social)
      if (mesmoCnpj || mesmoNome) pai[raiz(b)] = raiz(a)
    }
  return ls.map((_, i) => (ativos.includes(i) ? `g${raiz(i)}` : ''))
}
const MIME: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }

/** Abre os .zip (inclusive subpastas) e devolve os PDFs/Word de dentro, junto com os arquivos soltos. */
async function expandir(arquivos: File[]) {
  const r: { arquivo: File; zip: string | null }[] = []
  const erros: string[] = []
  for (const f of arquivos) {
    if (/\.zip$/i.test(f.name)) {
      try {
        const conteudo = unzipSync(new Uint8Array(await f.arrayBuffer()))
        let n = 0
        for (const [caminho, dados] of Object.entries(conteudo)) {
          if (!ehDoc(caminho) || !dados.length) continue
          const nome = caminho.split('/').pop()!
          const ext = nome.split('.').pop()!.toLowerCase()
          r.push({ arquivo: new File([dados as Uint8Array<ArrayBuffer>], nome, { type: MIME[ext] ?? '' }), zip: f.name })
          n++
        }
        if (!n) erros.push(`${f.name}: nenhum PDF ou Word dentro do arquivo.`)
      } catch {
        erros.push(`${f.name}: não consegui abrir o arquivo .zip.`)
      }
    } else if (ehDoc(f.name)) r.push({ arquivo: f, zip: null })
  }
  return { r, erros }
}

/**
 * Envio de vários Contratos Sociais / Cartões CNPJ de uma vez (soltos ou em .zip): identifica o cliente
 * (CNPJ, razão social ou nome do arquivo), cadastra quem ainda não está na Base, preenche os sócios e salva
 * o arquivo no Drive (DEPARTAMENTO - SOCIETÁRIO).
 */
export function ImportarDocumentos({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [lendo, setLendo] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [aplicando, setAplicando] = useState(false)
  const [preencher, setPreencher] = useState(true)
  const [salvarDrive, setSalvarDrive] = useState(true)
  const [criados, setCriados] = useState<Cliente[]>([])
  const entrada = useRef<HTMLInputElement>(null)
  const todos = [...clientes, ...criados]

  async function ler(arquivos: File[]) {
    setLendo('Abrindo arquivos...')
    const { r: lista, erros } = await expandir(arquivos)
    setAvisos(erros)
    const novas: Linha[] = []
    for (let n = 0; n < lista.length; n++) {
      const { arquivo, zip } = lista[n]
      setLendo(`Lendo ${n + 1} de ${lista.length}: ${arquivo.name}`)
      let texto = ''
      let erroLeitura: string | null = null
      try {
        texto = await textoDoArquivo(arquivo)
        if (texto.replace(/\s/g, '').length < 50) erroLeitura = 'Sem texto (PDF escaneado): escolha a empresa; o arquivo pode ser salvo no Drive.'
      } catch (e) {
        erroLeitura = e instanceof Error ? e.message : String(e)
      }
      const tipo = texto && !erroLeitura ? tipoDocumento(texto) : null
      let empresa: DadosEmpresaDoc | null = null
      if (tipo === 'cartao') {
        // Pela posição na página (caixas lado a lado); se não der, pelo texto corrido
        const itens = /\.pdf$/i.test(arquivo.name) ? await itensDoPdf(await arquivo.arrayBuffer()).catch(() => []) : []
        const pos = itens.length ? lerCartaoPorPosicao(itens) : null
        empresa = pos?.cnpj && pos.razao_social ? pos : lerCartaoCnpj(texto)
      } else if (tipo === 'contrato') empresa = lerEmpresaDoContrato(texto)
      const ident = identificarCliente(texto, arquivo.name, todos)
      const socios = tipo === 'contrato' ? await completarPeloCep(extrairSocios(texto)) : []
      const podeCriar = !ident.clienteId && !!(empresa?.razao_social || empresa?.cnpj)
      novas.push({
        arquivo,
        zip,
        tipo,
        clienteId: ident.clienteId ?? '',
        como: ident.como,
        socios,
        empresa,
        novo: podeCriar ? { ativo: true, codigo: '', razao_social: empresa?.razao_social ?? '', cnpj: empresa?.cnpj ? mascaraCnpj(empresa.cnpj) : '' } : null,
        erroLeitura,
        status: 'lido',
        resultado: null,
      })
    }
    // Mesma empresa nova em mais de um arquivo (ex.: contrato + cartão): o cartão traz CNPJ e razão social oficiais
    const chaves = gruposNovos(novas)
    novas.forEach((l, i) => {
      if (!l.novo || !chaves[i]) return
      const cartao = novas.find((o, j) => chaves[j] === chaves[i] && o.tipo === 'cartao')
      if (cartao?.novo) {
        l.novo.razao_social = cartao.novo.razao_social || l.novo.razao_social
        l.novo.cnpj = cartao.novo.cnpj || l.novo.cnpj
      }
    })
    setLinhas((l) => [...l, ...novas])
    setLendo(null)
    if (entrada.current) entrada.current.value = ''
  }

  const alterar = (i: number, p: Partial<Linha>) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const alterarNovo = (i: number, p: Partial<Novo>) => setLinhas((l) => l.map((x, j) => (j === i && x.novo ? { ...x, novo: { ...x.novo, ...p } } : x)))

  /** Cadastra as empresas novas (uma vez por CNPJ/razão social) e devolve o id do cliente de cada linha. */
  async function cadastrarNovos(ls: Linha[], chaves: string[]) {
    const ids = new Map<string, string>()
    const erros = new Map<string, string>()
    const feitos: Cliente[] = []
    const grupos = new Map<string, Linha[]>()
    ls.forEach((l, i) => {
      if (chaves[i]) grupos.set(chaves[i], [...(grupos.get(chaves[i]) ?? []), l])
    })
    for (const [k, grupo] of grupos) {
      const base = grupo.find((g) => g.novo!.codigo.trim()) ?? grupo[0]
      const cartao = grupo.find((g) => g.tipo === 'cartao')?.empresa
      const cnpj = digitos(base.novo!.cnpj) || digitos(grupo.find((g) => digitos(g.novo!.cnpj).length === 14)?.novo!.cnpj)
      const cod = base.novo!.codigo.trim() ? Number(base.novo!.codigo) : null
      if (cod !== null && (!Number.isInteger(cod) || cod <= 0)) {
        erros.set(k, 'Código inválido.')
        continue
      }
      if (cnpj && cnpj.length !== 14) {
        erros.set(k, 'CNPJ precisa ter 14 dígitos.')
        continue
      }
      const dados = {
        ...(cod !== null ? { codigo: cod } : {}),
        razao_social: base.novo!.razao_social.trim().toUpperCase(),
        cnpj: cnpj || null,
        nome_fantasia: cartao?.nome_fantasia ?? null,
        data_abertura: cartao?.data_abertura ?? null,
        endereco: cartao?.endereco ?? null,
        situacao_cadastral: cartao?.situacao_cadastral ?? null,
        email: cartao?.email ?? null,
        telefone: cartao?.telefone ?? null,
        status: 'pendente',
        procuracao: 'pendente',
        onboarding: 'pendente',
        empresa: 'ASAP',
        observacoes: 'Cadastrado automaticamente pelo envio de documentos.',
      }
      const { data, error } = await supabase.from('adm_clientes').insert(dados).select('*').single()
      if (error) {
        erros.set(
          k,
          error.code === '23505'
            ? error.message.includes('codigo')
              ? `Já existe um cliente com o código ${cod}.`
              : 'Já existe um cliente com esse CNPJ.'
            : error.message,
        )
        continue
      }
      ids.set(k, (data as Cliente).id)
      feitos.push(data as Cliente)
    }
    setCriados((c) => [...c, ...feitos])
    return { ids, erros, feitos }
  }

  async function aplicar() {
    setAplicando(true)
    const atual = linhas
    const chaves = gruposNovos(atual)
    const { ids, erros } = await cadastrarNovos(atual, chaves)
    const mapa = new Map(todos.map((c) => [c.id, c]))
    const { data: recem } = ids.size
      ? await supabase
          .from('adm_clientes')
          .select('*')
          .in('id', [...ids.values()])
      : { data: [] }
    for (const c of (recem as Cliente[]) ?? []) mapa.set(c.id, c)

    for (let i = 0; i < atual.length; i++) {
      const l = atual[i]
      if (l.status === 'ok') continue
      const k = chaves[i]
      const idNovo = k ? ids.get(k) : undefined
      const clienteId = l.clienteId || idNovo
      if (!clienteId) {
        if (k && erros.get(k)) alterar(i, { status: 'erro', resultado: `Cadastro: ${erros.get(k)}` })
        continue
      }
      const cli = mapa.get(clienteId)!
      alterar(i, { status: 'enviando', resultado: null, ...(idNovo ? { clienteId: idNovo, como: 'Cadastrado agora' } : {}) })
      const partes: string[] = idNovo ? [`cliente ${String(cli.codigo).padStart(3, '0')} cadastrado`] : []
      let falhou = false
      if (preencher && l.socios.length) {
        // Lê o cadastro atual para não perder sócios digitados por outra pessoa
        const { data, error } = await supabase.from('adm_clientes').select('socios').eq('id', cli.id).single()
        const atuais = ((data?.socios as SocioCadastro[] | null) ?? []) as SocioCadastro[]
        const { error: e2 } = error
          ? { error }
          : await supabase
              .from('adm_clientes')
              .update({ socios: mesclarSocios(atuais, l.socios) })
              .eq('id', cli.id)
        if (e2) {
          falhou = true
          partes.push(`Sócios: ${e2.message}`)
        } else partes.push(`${l.socios.length} sócio(s) preenchido(s)`)
      }
      if (salvarDrive) {
        const r = await enviarArquivoDrive(cli.codigo, l.arquivo)
        if (r.ok) partes.push(r.duplicado ? 'já estava no Drive' : 'salvo no Drive')
        else {
          falhou = true
          partes.push(`Drive: ${r.erro}`)
        }
      }
      alterar(i, { status: falhou ? 'erro' : 'ok', resultado: partes.join(' · ') || 'Nada a fazer' })
    }
    setAplicando(false)
    onFeito()
  }

  const prontas = linhas.filter((l) => (l.clienteId || (l.novo?.ativo && l.novo.razao_social.trim())) && l.status !== 'ok').length
  const novasEmpresas = new Set(gruposNovos(linhas).filter(Boolean)).size
  const semCliente = linhas.filter((l) => !l.clienteId && !l.novo?.ativo).length

  return (
    <Modal
      title="Enviar Contratos Sociais e Cartões CNPJ"
      subtitulo="Vários arquivos de uma vez (PDF, Word ou .zip): o portal identifica a empresa pelo CNPJ, pela razão social ou pelo nome do arquivo"
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          <label className="mr-auto flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={preencher} onChange={(e) => setPreencher(e.target.checked)} />
              Preencher os sócios no cadastro
            </span>
            <span className="flex items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={salvarDrive} onChange={(e) => setSalvarDrive(e.target.checked)} />
              Salvar no Drive (DEPARTAMENTO - SOCIETÁRIO)
            </span>
          </label>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-primary" onClick={aplicar} disabled={aplicando || !!lendo || !prontas}>
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {aplicando ? 'Enviando...' : `Aplicar em ${prontas} arquivo(s)${novasEmpresas ? ` · cadastrar ${novasEmpresas}` : ''}`}
          </button>
        </>
      }
    >
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const fs = [...e.dataTransfer.files].filter((f) => /\.(pdf|docx|zip)$/i.test(f.name))
          if (fs.length) ler(fs)
        }}
      >
        <FileStack className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-600">Arraste aqui Contratos Sociais e Cartões CNPJ (PDF, Word ou uma pasta .zip com vários) ou</p>
        <button className="btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={!!lendo}>
          {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          {lendo ? 'Lendo...' : 'Escolher arquivos'}
        </button>
        {lendo && <p className="text-xs text-slate-500">{lendo}</p>}
        <input
          ref={entrada}
          type="file"
          multiple
          accept=".pdf,.docx,.zip,application/pdf,application/zip,application/x-zip-compressed,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => e.target.files?.length && ler([...e.target.files])}
        />
      </div>
      {avisos.map((a) => (
        <p key={a} className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {a}
        </p>
      ))}

      {linhas.length > 0 && (
        <>
          {novasEmpresas > 0 && (
            <p className="rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-800 ring-1 ring-sky-200">
              <b>{novasEmpresas} empresa(s) não estão na Base</b> e serão cadastradas com os dados do documento. Informe o número do cliente (ou deixe em branco
              para usar o próximo livre). Depois, se precisar, use “Atualizar cadastro” nos Detalhes da Empresa para completar pela Receita.
            </p>
          )}
          {semCliente > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
              {semCliente} arquivo(s) sem empresa: escolha a empresa na coluna “Empresa” (ou deixe em branco para ignorar).
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr className="border-b border-slate-100">
                  <th className="py-2.5 pr-2 pl-4">Arquivo</th>
                  <th className="px-2 py-2.5">Tipo</th>
                  <th className="min-w-80 px-2 py-2.5">Empresa</th>
                  <th className="px-2 py-2.5">Sócios encontrados</th>
                  <th className="py-2.5 pr-4 pl-2">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td className="max-w-56 py-2.5 pr-2 pl-4">
                      <div className="truncate font-medium text-slate-800" title={l.arquivo.name}>
                        {l.arquivo.name}
                      </div>
                      {l.zip && <div className="truncate text-[0.6875rem] text-slate-400">de {l.zip}</div>}
                      {l.erroLeitura && <div className="text-xs text-amber-700">{l.erroLeitura}</div>}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-slate-600">{l.tipo ? ROTULO_TIPO[l.tipo] : '—'}</td>
                    <td className="px-2 py-2.5">
                      {(l.clienteId || !l.novo?.ativo) && (
                        <>
                          <BuscaCliente
                            itens={todos}
                            value={l.clienteId}
                            onChange={(id) => alterar(i, { clienteId: id, como: id ? 'Escolhido' : null, status: 'lido', resultado: null })}
                            vazio="Ignorar este arquivo"
                          />
                          {l.como && <div className="mt-0.5 text-[0.6875rem] text-slate-400">identificado por: {l.como}</div>}
                        </>
                      )}
                      {!l.clienteId && l.novo && (
                        <div className={`rounded-xl p-2.5 ring-1 ${l.novo.ativo ? 'bg-sky-50/60 ring-sky-200' : 'mt-1.5 ring-slate-200'}`}>
                          <label className="flex items-center gap-2 text-xs font-semibold text-sky-800">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 accent-sky-600"
                              checked={l.novo.ativo}
                              onChange={(e) => alterarNovo(i, { ativo: e.target.checked })}
                            />
                            <Building className="h-3.5 w-3.5" />
                            Não está na Base: cadastrar como cliente novo
                          </label>
                          {l.novo.ativo && (
                            <div className="mt-2 grid grid-cols-[5rem_1fr] gap-2">
                              <input
                                className="input py-1.5 font-mono text-xs"
                                placeholder="Nº"
                                inputMode="numeric"
                                value={l.novo.codigo}
                                onChange={(e) => alterarNovo(i, { codigo: e.target.value.replace(/\D/g, '') })}
                                title="Número do cliente (em branco: o próximo livre)"
                                aria-label="Número do cliente"
                              />
                              <input
                                className="input py-1.5 font-mono text-xs"
                                placeholder="CNPJ"
                                value={l.novo.cnpj}
                                onChange={(e) => alterarNovo(i, { cnpj: mascaraCnpj(e.target.value) })}
                                aria-label="CNPJ"
                              />
                              <input
                                className="input col-span-2 py-1.5 text-xs"
                                placeholder="Razão social"
                                value={l.novo.razao_social}
                                onChange={(e) => alterarNovo(i, { razao_social: e.target.value.toUpperCase() })}
                                aria-label="Razão social"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-700">
                      {l.socios.length ? (
                        <ul className="space-y-0.5">
                          {l.socios.map((s, k) => (
                            <li key={k}>
                              <b>{s.nome || 'Sem nome'}</b>
                              {s.cpf ? <span className="ml-1 font-mono text-slate-500">{s.cpf}</span> : null}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-slate-400">{l.tipo === 'cartao' ? 'Cartão CNPJ: só salva no Drive' : 'Nenhum'}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 pl-2 text-xs">
                      {l.status === 'enviando' && <Loader2 className="h-4 w-4 animate-spin text-brand-600" />}
                      {l.status === 'ok' && (
                        <span className="flex items-start gap-1 text-emerald-700">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {l.resultado}
                        </span>
                      )}
                      {l.status === 'erro' && (
                        <span className="flex items-start gap-1 text-rose-600">
                          <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {l.resultado}
                        </span>
                      )}
                      {l.status === 'lido' && <span className="text-slate-400">{l.clienteId ? 'Pronto' : l.novo?.ativo ? 'Será cadastrado' : 'Ignorado'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Nos sócios que já existem no cadastro, só os campos vazios são completados. Arquivos com o mesmo nome e tamanho não são duplicados no Drive.
          </p>
        </>
      )}
    </Modal>
  )
}
