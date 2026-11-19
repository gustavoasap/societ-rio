import { useRef, useState } from 'react'
import { CheckCircle2, FileStack, FileUp, Loader2, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Modal } from '../components/ui'
import { BuscaCliente } from '../components/BuscaCliente'
import { extrairSocios, textoDoArquivo } from './contratoSocial'
import { identificarCliente, tipoDocumento, type TipoDocumento } from './documentos'
import { enviarArquivoDrive } from './drive'
import { completarPeloCep, mesclarSocios } from './socios'
import type { Cliente, SocioCadastro } from './tipos'

interface Linha {
  arquivo: File
  tipo: TipoDocumento | null
  clienteId: string
  como: string | null
  socios: SocioCadastro[]
  erroLeitura: string | null
  status: 'lido' | 'enviando' | 'ok' | 'erro'
  resultado: string | null
}

const ROTULO_TIPO: Record<TipoDocumento, string> = { contrato: 'Contrato Social', cartao: 'Cartão CNPJ' }

/**
 * Envio de vários Contratos Sociais / Cartões CNPJ de uma vez: identifica o cliente (CNPJ, razão social
 * ou nome do arquivo), preenche os sócios no cadastro e salva o arquivo no Drive (DEPARTAMENTO - SOCIETÁRIO).
 */
export function ImportarDocumentos({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [lendo, setLendo] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [preencher, setPreencher] = useState(true)
  const [salvarDrive, setSalvarDrive] = useState(true)
  const entrada = useRef<HTMLInputElement>(null)
  const porId = new Map(clientes.map((c) => [c.id, c]))

  async function ler(arquivos: File[]) {
    setLendo(true)
    const novas: Linha[] = []
    for (const arquivo of arquivos) {
      try {
        const texto = await textoDoArquivo(arquivo)
        const semTexto = texto.replace(/\s/g, '').length < 50
        const tipo = semTexto ? null : tipoDocumento(texto)
        const ident = identificarCliente(texto, arquivo.name, clientes)
        const socios = tipo === 'contrato' ? await completarPeloCep(extrairSocios(texto)) : []
        novas.push({
          arquivo,
          tipo,
          clienteId: ident.clienteId ?? '',
          como: ident.como,
          socios,
          erroLeitura: semTexto ? 'Sem texto (PDF escaneado): só dá para salvar no Drive.' : null,
          status: 'lido',
          resultado: null,
        })
      } catch (e) {
        const ident = identificarCliente('', arquivo.name, clientes)
        novas.push({
          arquivo,
          tipo: null,
          clienteId: ident.clienteId ?? '',
          como: ident.como,
          socios: [],
          erroLeitura: e instanceof Error ? e.message : String(e),
          status: 'lido',
          resultado: null,
        })
      }
    }
    setLinhas((l) => [...l, ...novas])
    setLendo(false)
    if (entrada.current) entrada.current.value = ''
  }

  const alterar = (i: number, p: Partial<Linha>) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))

  async function aplicar() {
    setAplicando(true)
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      if (!l.clienteId || l.status === 'ok') continue
      const cli = porId.get(l.clienteId)!
      alterar(i, { status: 'enviando', resultado: null })
      const partes: string[] = []
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

  const prontas = linhas.filter((l) => l.clienteId && l.status !== 'ok').length
  const semCliente = linhas.filter((l) => !l.clienteId).length

  return (
    <Modal
      title="Enviar Contratos Sociais e Cartões CNPJ"
      subtitulo="Vários arquivos de uma vez: o portal identifica a empresa pelo CNPJ, pela razão social ou pelo nome do arquivo"
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
          <button className="btn-primary" onClick={aplicar} disabled={aplicando || lendo || !prontas || (!preencher && !salvarDrive)}>
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {aplicando ? 'Enviando...' : `Aplicar em ${prontas} arquivo(s)`}
          </button>
        </>
      }
    >
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const fs = [...e.dataTransfer.files].filter((f) => /\.(pdf|docx)$/i.test(f.name))
          if (fs.length) ler(fs)
        }}
      >
        <FileStack className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-600">Arraste os arquivos aqui ou</p>
        <button className="btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={lendo}>
          {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          {lendo ? 'Lendo arquivos...' : 'Escolher arquivos (PDF ou Word)'}
        </button>
        <input
          ref={entrada}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => e.target.files?.length && ler([...e.target.files])}
        />
      </div>

      {linhas.length > 0 && (
        <>
          {semCliente > 0 && (
            <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
              {semCliente} arquivo(s) sem empresa identificada: escolha a empresa na coluna “Empresa” (ou deixe em branco para ignorar).
            </p>
          )}
          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr className="border-b border-slate-100">
                  <th className="py-2.5 pr-2 pl-4">Arquivo</th>
                  <th className="px-2 py-2.5">Tipo</th>
                  <th className="min-w-72 px-2 py-2.5">Empresa</th>
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
                      {l.erroLeitura && <div className="text-xs text-amber-700">{l.erroLeitura}</div>}
                    </td>
                    <td className="px-2 py-2.5 whitespace-nowrap text-slate-600">{l.tipo ? ROTULO_TIPO[l.tipo] : '—'}</td>
                    <td className="px-2 py-2.5">
                      <BuscaCliente
                        itens={clientes}
                        value={l.clienteId}
                        onChange={(id) => alterar(i, { clienteId: id, como: id ? 'Escolhido' : null, status: 'lido', resultado: null })}
                        vazio="Ignorar este arquivo"
                      />
                      {l.como && <div className="mt-0.5 text-[0.6875rem] text-slate-400">identificado por: {l.como}</div>}
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
                        <span className="text-slate-400">{l.tipo === 'cartao' ? 'Só salva no Drive' : 'Nenhum'}</span>
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
                      {l.status === 'lido' && <span className="text-slate-400">{l.clienteId ? 'Pronto' : 'Ignorado'}</span>}
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
