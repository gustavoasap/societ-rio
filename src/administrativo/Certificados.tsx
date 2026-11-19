import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Ban, CheckCircle2, Download, FileUp, KeyRound, Loader2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarData } from '../lib/format'
import { Modal } from '../components/ui'
import { BuscaCliente } from '../components/BuscaCliente'
import { CampoData } from '../components/CampoData'
import { expandirZips } from './arquivosZip'
import {
  ROTULO_SITUACAO,
  certificadoAtual,
  diasAte,
  lerCertificado,
  situacaoCertificado,
  situacaoDoCliente,
  type DocCertificado,
  type InfoCertificado,
  type SituacaoCliente,
} from './certificado'
import { identificarCliente } from './documentos'
import { baixarParaComputador, documentoJaExiste, enviarArquivoDrive, expirarArquivoDrive, hashArquivo } from './drive'
import type { Cliente } from './tipos'
import { lerValidadesDoDrive } from './lerCertificadosDrive'

const ehCert = (n: string) => /\.(pfx|p12|cer|crt)$/i.test(n)
const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const hojeIso = () => new Date().toISOString().slice(0, 10)
const cod = (n: number) => String(n).padStart(3, '0')

interface LinhaCert {
  arquivo: File
  zip: string | null
  info: InfoCertificado
  validade: string
  clienteId: string
  como: string | null
  status: 'lido' | 'enviando' | 'ok' | 'erro'
  resultado: string | null
}

function identificar(info: InfoCertificado, nome: string, clientes: Cliente[]) {
  if (info.cnpj) {
    const c = clientes.find((x) => digitos(x.cnpj) === info.cnpj)
    if (c) return { clienteId: c.id, como: 'CNPJ do certificado' }
  }
  // Pelo nome do arquivo: CNPJ, código ("007 - ...") ou razão social
  const id = identificarCliente(nome, nome, clientes)
  return { clienteId: id.clienteId ?? '', como: id.como ? (id.como === 'CNPJ' ? 'CNPJ no nome do arquivo' : 'Nome do arquivo') : null }
}

/**
 * Envio de certificados digitais (só o arquivo — a senha nunca é guardada): identifica o cliente, lê a validade
 * quando possível, salva em CERTIFICADO DIGITAL no Drive, marca a implantação como concluída e manda o
 * certificado vencido anterior para CERTIFICADO DIGITAL/EXPIRADO.
 */
export function ImportarCertificados({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [linhas, setLinhas] = useState<LinhaCert[]>([])
  const [lendo, setLendo] = useState(false)
  const [avisos, setAvisos] = useState<string[]>([])
  const [aplicando, setAplicando] = useState(false)
  const [senha, setSenha] = useState('')
  const entrada = useRef<HTMLInputElement>(null)

  async function ler(arquivos: File[]) {
    setLendo(true)
    const { r, erros } = await expandirZips(arquivos, ehCert)
    setAvisos(erros)
    const novas: LinhaCert[] = []
    for (const { arquivo, zip } of r) {
      const info = await lerCertificado(await arquivo.arrayBuffer(), arquivo.name)
      const id = identificar(info, arquivo.name, clientes)
      novas.push({ arquivo, zip, info, validade: info.validade ?? '', ...id, status: 'lido', resultado: null })
    }
    setLinhas((l) => [...l, ...novas])
    setLendo(false)
    if (entrada.current) entrada.current.value = ''
  }

  /** Lê de novo os protegidos com a senha digitada (a senha fica só na memória desta tela e é apagada em seguida). */
  async function lerComSenha() {
    const s = senha
    setSenha('')
    const atualizadas = await Promise.all(
      linhas.map(async (l) => {
        if (!l.info.protegido || l.status === 'ok') return l
        const info = await lerCertificado(await l.arquivo.arrayBuffer(), l.arquivo.name, s)
        if (info.protegido) return l
        const id = l.clienteId ? { clienteId: l.clienteId, como: l.como } : identificar(info, l.arquivo.name, clientes)
        return { ...l, info, validade: info.validade ?? l.validade, ...id }
      }),
    )
    setLinhas(atualizadas)
  }

  const alterar = (i: number, p: Partial<LinhaCert>) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...p } : x)))

  async function aplicar() {
    setAplicando(true)
    const hoje = hojeIso()
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]
      if (!l.clienteId || l.status === 'ok' || l.info.invalido) continue
      const cli = clientes.find((c) => c.id === l.clienteId)!
      alterar(i, { status: 'enviando', resultado: null })
      const hash = await hashArquivo(l.arquivo)
      if (await documentoJaExiste(cli.id, 'certificado', l.arquivo.name, hash)) {
        alterar(i, { status: 'ok', resultado: 'Já existia no cadastro: ignorado (nada alterado)' })
        continue
      }
      const validade = l.validade || null
      const vencido = !!validade && validade < hoje
      const env = await enviarArquivoDrive(
        cli.codigo,
        l.arquivo,
        { clienteId: cli.id, tipo: 'certificado', hash, validade, titular: l.info.titular, situacao: vencido ? 'expirado' : 'ativo' },
        vencido ? 'CERTIFICADO DIGITAL/EXPIRADO' : 'CERTIFICADO DIGITAL',
      )
      if (!env.ok) {
        alterar(i, { status: 'erro', resultado: `Drive: ${env.erro}` })
        continue
      }
      const partes = [vencido ? 'certificado já vencido: salvo em EXPIRADO' : 'salvo em CERTIFICADO DIGITAL']
      if (!vencido) {
        // Certificados anteriores vencidos (ou substituídos por um com validade maior) vão para EXPIRADO
        const { data } = await supabase
          .from('adm_documentos')
          .select('id, nome, drive_id, validade')
          .eq('cliente_id', cli.id)
          .eq('tipo', 'certificado')
          .eq('situacao', 'ativo')
          .neq('nome', l.arquivo.name)
        let movidos = 0
        for (const ant of (data as { id: string; nome: string; drive_id: string | null; validade: string | null }[]) ?? []) {
          const expirou = !!ant.validade && ant.validade < hoje
          const substituido = !!ant.validade && !!validade && validade > ant.validade
          if (!expirou && !substituido) continue
          if (ant.drive_id) await expirarArquivoDrive(ant.drive_id)
          await supabase.from('adm_documentos').update({ situacao: 'expirado' }).eq('id', ant.id)
          movidos++
        }
        if (movidos) partes.push(`${movidos} anterior(es) movido(s) para EXPIRADO`)
        await supabase.from('adm_clientes').update({ certificado_digital: 'concluida' }).eq('id', cli.id)
        partes.push('implantação concluída')
      }
      alterar(i, { status: 'ok', resultado: partes.join(' · ') })
    }
    setAplicando(false)
    onFeito()
  }

  const prontas = linhas.filter((l) => l.clienteId && l.status !== 'ok' && !l.info.invalido).length
  const protegidos = linhas.filter((l) => l.info.protegido && l.status !== 'ok').length

  return (
    <Modal
      title="Enviar certificados digitais"
      subtitulo="Só o arquivo (.pfx, .p12, .cer ou .zip com vários). A senha não é guardada."
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">Salva em Clientes › pasta do cliente › CERTIFICADO DIGITAL. Vencidos vão para EXPIRADO.</span>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-primary" onClick={aplicar} disabled={aplicando || lendo || !prontas}>
            {aplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {aplicando ? 'Enviando...' : `Aplicar em ${prontas} certificado(s)`}
          </button>
        </>
      }
    >
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-6 py-6 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const fs = [...e.dataTransfer.files].filter((f) => ehCert(f.name) || /\.zip$/i.test(f.name))
          if (fs.length) ler(fs)
        }}
      >
        <ShieldCheck className="h-8 w-8 text-slate-300" />
        <p className="text-sm text-slate-600">Arraste aqui os certificados (.pfx, .p12, .cer) ou uma pasta .zip com vários, ou</p>
        <button className="btn-secondary btn-sm" onClick={() => entrada.current?.click()} disabled={lendo}>
          {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
          {lendo ? 'Lendo...' : 'Escolher arquivos'}
        </button>
        <input
          ref={entrada}
          type="file"
          multiple
          accept=".pfx,.p12,.cer,.crt,.zip"
          className="hidden"
          onChange={(e) => e.target.files?.length && ler([...e.target.files])}
        />
      </div>
      {avisos.map((a) => (
        <p key={a} className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          {a}
        </p>
      ))}
      {protegidos > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 ring-1 ring-slate-200">
          <KeyRound className="h-4 w-4 text-slate-500" />
          <span className="flex-1">
            <b>{protegidos} certificado(s) protegido(s) por senha</b>: não deu para ler a validade só pelo arquivo. Informe a data na coluna “Vencimento” ou, se
            preferir, digite a senha só para leitura (fica no seu navegador por um instante e é apagada; não é salva nem enviada).
          </span>
          <input
            type="password"
            className="input w-44 py-1.5 text-sm"
            placeholder="Senha (opcional)"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="off"
            onKeyDown={(e) => e.key === 'Enter' && senha && lerComSenha()}
          />
          <button className="btn-secondary btn-sm" onClick={lerComSenha} disabled={!senha}>
            Ler validade
          </button>
        </div>
      )}

      {linhas.length > 0 && (
        <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
          <table className="w-full text-sm">
            <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
              <tr className="border-b border-slate-100">
                <th className="py-2.5 pr-2 pl-4">Arquivo</th>
                <th className="min-w-72 px-2 py-2.5">Empresa</th>
                <th className="px-2 py-2.5">Titular do certificado</th>
                <th className="px-2 py-2.5">Vencimento</th>
                <th className="py-2.5 pr-4 pl-2">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {linhas.map((l, i) => {
                const sit = l.info.invalido ? null : situacaoCertificado(l.validade || null)
                return (
                  <tr key={i}>
                    <td className="max-w-56 py-2.5 pr-2 pl-4">
                      <div className="truncate font-medium text-slate-800" title={l.arquivo.name}>
                        {l.arquivo.name}
                      </div>
                      {l.zip && <div className="truncate text-[0.6875rem] text-slate-400">de {l.zip}</div>}
                    </td>
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
                      {l.info.invalido ? (
                        <span className="font-semibold text-rose-600">Arquivo inválido (não é certificado ou está corrompido)</span>
                      ) : l.info.titular ? (
                        <>
                          <b>{l.info.titular}</b>
                          {l.info.cnpj && (
                            <div className="font-mono text-slate-500">{l.info.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-400">{l.info.protegido ? 'Protegido por senha' : '—'}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      {!l.info.invalido && (
                        <>
                          <CampoData value={l.validade || null} onChange={(v) => alterar(i, { validade: v ?? '' })} />
                          {sit && sit !== 'sem_validade' && (
                            <span className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold ${ROTULO_SITUACAO[sit].pill}`}>
                              {sit === 'vencendo' ? `Vence em ${diasAte(l.validade)} dia(s)` : ROTULO_SITUACAO[sit].label}
                            </span>
                          )}
                        </>
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
                      {l.status === 'lido' && (
                        <span className="text-slate-400">{l.info.invalido ? 'Não será enviado' : l.clienteId ? 'Pronto' : 'Escolha a empresa'}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

type Aba = 'pendentes' | 'vencendo' | 'vencidos' | 'sem_validade' | 'validos' | 'na' | 'todos'

/** Painel dos certificados: quem não tem, quem vence em até 10 dias, vencidos, N/A, vencimento e download. */
export function PainelCertificados({
  clientes,
  onClose,
  onAlterado,
  onEnviar,
  abaInicial = 'pendentes',
}: {
  clientes: Cliente[]
  onClose: () => void
  onAlterado: () => void
  onEnviar: () => void
  abaInicial?: Aba
}) {
  const [docs, setDocs] = useState<DocCertificado[]>([])
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [busca, setBusca] = useState('')
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [etapas, setEtapas] = useState<Map<string, string | null>>(() => new Map(clientes.map((c) => [c.id, c.certificado_digital])))

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('adm_documentos')
      .select('id, cliente_id, nome, url, drive_id, validade, titular, situacao, criado_em')
      .eq('tipo', 'certificado')
      .range(0, 9999)
    setDocs((data as DocCertificado[]) ?? [])
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const porCliente = useMemo(() => {
    const m = new Map<string, DocCertificado[]>()
    for (const d of docs) m.set(d.cliente_id, [...(m.get(d.cliente_id) ?? []), d])
    return m
  }, [docs])

  const linhas = useMemo(
    () =>
      clientes
        .filter((c) => c.status !== 'encerrado')
        .map((c) => {
          const ds = porCliente.get(c.id) ?? []
          return { c, atual: certificadoAtual(ds), sit: situacaoDoCliente(etapas.get(c.id) ?? null, ds) as SituacaoCliente }
        }),
    [clientes, porCliente, etapas],
  )
  const conta = (f: (s: SituacaoCliente) => boolean) => linhas.filter((l) => f(l.sit)).length
  const ABAS: { id: Aba; label: string; n: number; f: (s: SituacaoCliente) => boolean }[] = [
    { id: 'pendentes', label: 'Sem certificado', n: conta((s) => s === 'sem' || s === 'invalido'), f: (s) => s === 'sem' || s === 'invalido' },
    { id: 'vencendo', label: 'Vencem em até 10 dias', n: conta((s) => s === 'vencendo'), f: (s) => s === 'vencendo' },
    { id: 'vencidos', label: 'Vencidos', n: conta((s) => s === 'vencido'), f: (s) => s === 'vencido' },
    { id: 'sem_validade', label: 'Sem vencimento informado', n: conta((s) => s === 'sem_validade'), f: (s) => s === 'sem_validade' },
    { id: 'validos', label: 'Válidos', n: conta((s) => s === 'valido'), f: (s) => s === 'valido' },
    { id: 'na', label: 'Não se aplica', n: conta((s) => s === 'na'), f: (s) => s === 'na' },
    { id: 'todos', label: 'Todos', n: linhas.length, f: () => true },
  ]
  const filtro = ABAS.find((a) => a.id === aba)!.f
  const t = busca.trim().toLowerCase()
  const visiveis = linhas
    .filter((l) => filtro(l.sit))
    .filter((l) => !t || `${cod(l.c.codigo)} ${l.c.razao_social} ${l.c.cnpj ?? ''}`.toLowerCase().includes(t))
    .sort((a, b) => (a.atual?.validade ?? '9999').localeCompare(b.atual?.validade ?? '9999') || a.c.codigo - b.c.codigo)

  async function marcarNa(c: Cliente, na: boolean) {
    setErro(null)
    const valor = na ? 'na' : porCliente.get(c.id)?.some((d) => d.situacao === 'ativo') ? 'concluida' : 'pendente'
    const { error } = await supabase.from('adm_clientes').update({ certificado_digital: valor }).eq('id', c.id)
    if (error) return setErro(error.message)
    setEtapas((m) => new Map(m).set(c.id, valor))
    onAlterado()
  }

  async function salvarValidade(d: DocCertificado, v: string | null) {
    const { error } = await supabase.from('adm_documentos').update({ validade: v }).eq('id', d.id)
    if (error) return setErro(error.message)
    setDocs((l) => l.map((x) => (x.id === d.id ? { ...x, validade: v } : x)))
  }

  async function moverExpirado(c: Cliente, d: DocCertificado) {
    setOcupado(d.id)
    if (d.drive_id) {
      const r = await expirarArquivoDrive(d.drive_id)
      if (!r.ok) {
        setOcupado(null)
        return setErro(r.erro)
      }
    }
    await supabase.from('adm_documentos').update({ situacao: 'expirado' }).eq('id', d.id)
    if (!porCliente.get(c.id)?.some((x) => x.id !== d.id && x.situacao === 'ativo')) {
      await supabase.from('adm_clientes').update({ certificado_digital: 'pendente' }).eq('id', c.id)
      setEtapas((m) => new Map(m).set(c.id, 'pendente'))
    }
    setOcupado(null)
    await carregar()
    onAlterado()
  }

  async function lerVencimentos() {
    setErro(null)
    setOcupado('validades')
    try {
      const v = await lerValidadesDoDrive((m) => setAviso(m))
      setAviso(
        `Vencimento lido em ${v.lidos} certificado(s)` +
          (v.protegidos ? `; ${v.protegidos} protegido(s) por senha: informe a data na coluna Vencimento` : '') +
          (v.invalidos ? `; ${v.invalidos} arquivo(s) inválido(s)` : '') +
          (v.falhas.length ? `; ${v.falhas.length} falha(s)` : '') +
          '.',
      )
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
      setAviso(null)
    }
    setOcupado(null)
  }

  async function baixar(d: DocCertificado) {
    if (!d.drive_id) return
    setOcupado(d.id)
    setErro(null)
    try {
      await baixarParaComputador(d.drive_id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setOcupado(null)
  }

  return (
    <Modal title="Certificados digitais" subtitulo="Situação do certificado de cada cliente ativo" onClose={onClose} largura="max-w-6xl">
      <div className="flex flex-wrap items-center gap-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${aba === a.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}
          >
            {a.label} <span className="opacity-70">{a.n}</span>
          </button>
        ))}
        <span className="flex-1" />
        <button
          className="btn-secondary btn-sm"
          onClick={lerVencimentos}
          disabled={!!ocupado}
          title="Lê o vencimento dos certificados que já estão no Drive (sem senha, quando o arquivo permite)"
        >
          {ocupado === 'validades' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
          Ler vencimentos do Drive
        </button>
        <button className="btn-primary btn-sm" onClick={onEnviar}>
          <FileUp className="h-3.5 w-3.5" />
          Enviar certificados
        </button>
      </div>
      <input className="input" placeholder="Buscar cliente, código ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{erro}</p>}
      {aviso && <p className="rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-800">{aviso}</p>}
      <div className="max-h-[55vh] overflow-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
            <tr className="border-b border-slate-100">
              <th className="py-2.5 pr-2 pl-4">Cliente</th>
              <th className="px-2 py-2.5">Certificado</th>
              <th className="px-2 py-2.5">Vencimento</th>
              <th className="px-2 py-2.5">Situação</th>
              <th className="py-2.5 pr-4 pl-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {visiveis.map(({ c, atual, sit }) => (
              <tr key={c.id}>
                <td className="py-2.5 pr-2 pl-4">
                  <span className="font-mono text-xs text-slate-400">{cod(c.codigo)}</span>{' '}
                  <span className="font-semibold text-slate-800">{c.razao_social}</span>
                </td>
                <td className="max-w-64 px-2 py-2.5 text-xs text-slate-700">
                  {atual ? (
                    <>
                      <div className="truncate font-medium" title={atual.nome}>
                        {atual.nome}
                      </div>
                      {atual.titular && <div className="truncate text-slate-500">{atual.titular}</div>}
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  {atual ? (
                    <div className="w-40">
                      <CampoData value={atual.validade} onChange={(v) => salvarValidade(atual, v)} />
                    </div>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-2 py-2.5">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${ROTULO_SITUACAO[sit].pill}`}>
                    {sit === 'vencendo' && atual ? `Vence em ${diasAte(atual.validade)} dia(s)` : ROTULO_SITUACAO[sit].label}
                  </span>
                  {sit === 'vencido' && atual?.validade && <div className="mt-0.5 text-[0.6875rem] text-rose-600">desde {formatarData(atual.validade)}</div>}
                </td>
                <td className="py-2.5 pr-4 pl-2 text-right whitespace-nowrap">
                  {atual?.drive_id && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => baixar(atual)}
                      disabled={ocupado === atual.id}
                      title="Baixar o arquivo do certificado"
                    >
                      {ocupado === atual.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      Baixar
                    </button>
                  )}
                  {sit === 'vencido' && atual && (
                    <button
                      className="btn-secondary btn-sm ml-1"
                      onClick={() => moverExpirado(c, atual)}
                      disabled={ocupado === atual.id}
                      title="Mover para a pasta EXPIRADO"
                    >
                      Mover p/ EXPIRADO
                    </button>
                  )}
                  {(sit === 'sem' || sit === 'invalido') && (
                    <button className="btn-secondary btn-sm ml-1" onClick={() => marcarNa(c, true)} title="Este cliente não terá certificado">
                      <Ban className="h-3.5 w-3.5" />
                      N/A
                    </button>
                  )}
                  {sit === 'na' && (
                    <button className="btn-secondary btn-sm ml-1" onClick={() => marcarNa(c, false)}>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Voltar a exigir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visiveis.length && <p className="p-8 text-center text-sm text-slate-400">Nenhum cliente nesta lista.</p>}
      </div>
      <p className="text-xs text-slate-400">
        O vencimento é lido do próprio arquivo quando o certificado não está protegido por senha; senão, informe a data aqui. Só os arquivos ficam guardados (no
        Drive); a senha nunca é guardada.
      </p>
    </Modal>
  )
}
