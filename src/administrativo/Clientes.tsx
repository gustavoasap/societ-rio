import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  ArrowDown,
  ArrowUp,
  Archive,
  ChevronDown,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  House,
  LayoutDashboard,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  ListPlus,
  FolderCog,
  Search,
  Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/rotas'
import { comRetentativa } from '../lib/retentar'
import { formatarData } from '../lib/format'
import { Select } from '../components/ui'
import { ClienteForm } from './ClienteForm'
import { AtualizarTodas } from './AtualizarTodas'
import { CadastroLote } from './CadastroLote'
import { ConfigDrive } from './CriarPastaDrive'
import { obterUrlDrive } from './drive'
import { baixarArquivo, gerarXlsx, TIPO_XLSX } from '../lib/planilha'
import { ClienteExpandido } from './ClienteExpandido'
import { encerrarCliente } from './acoes'
import { Painel } from './Painel'
import {
  COR_STATUS,
  ETAPAS,
  INSCRICOES,
  OPCOES_ETAPA,
  REGIMES,
  SEGMENTOS,
  MOTIVOS_ENCERRAMENTO,
  textoEncerramento,
  type MotivoEncerramento,
  STATUS_CLIENTE,
  formatarCnpj,
  hojeISO,
  labelDe,
  moeda,
  temPendencia,
  type Cliente,
  type Etapa,
  type ParceiroResumo,
  type StatusCliente,
  type Vigente,
} from './tipos'
import { CampoData } from '../components/CampoData'

type Aba = 'painel' | 'ativos' | 'inativos'
type Ordem = 'codigo' | 'razao_social' | 'honorario' | 'data_assinatura'

const COR_ETAPA: Record<Etapa | 'vazio', string> = {
  concluida: 'bg-emerald-500',
  pdf_enviado: 'bg-sky-400',
  pendente: 'bg-amber-400',
  na: 'bg-slate-300',
  vazio: 'bg-slate-200',
}
const CHIP_ETAPA: Record<Etapa | 'vazio', string> = {
  concluida: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pdf_enviado: 'bg-sky-50 text-sky-700 ring-sky-200',
  pendente: 'bg-amber-50 text-amber-700 ring-amber-200',
  na: 'bg-slate-100 text-slate-500 ring-slate-200',
  vazio: 'bg-white text-slate-400 ring-slate-200',
}
const TEXTO_ETAPA: Record<Etapa | 'vazio', string> = {
  concluida: 'concluída',
  pdf_enviado: 'PDF enviado',
  pendente: 'pendente',
  na: 'não se aplica',
  vazio: 'não informado',
}

function csv(linhas: (string | number | null)[][]) {
  return linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
}

export function Clientes({ session }: { session: Session }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vigentes, setVigentes] = useState<Map<string, Vigente>>(new Map())
  const [parceiros, setParceiros] = useState<ParceiroResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('painel')
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fParceiro, setFParceiro] = useState('')
  const [fRegime, setFRegime] = useState('')
  const [fPendencia, setFPendencia] = useState('')
  const [fHonorario, setFHonorario] = useState('')
  const [lote, setLote] = useState(false)
  const [configDrive, setConfigDrive] = useState<{ atual: string | null } | null>(null)
  const [ordem, setOrdem] = useState<{ campo: Ordem; asc: boolean }>({ campo: 'codigo', asc: true })
  const [editando, setEditando] = useState<Cliente | 'novo' | null>(null)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [menuExportar, setMenuExportar] = useState(false)
  const [atualizandoTodas, setAtualizandoTodas] = useState(false)
  const [encerrando, setEncerrando] = useState<Cliente | null>(null)
  const [dataEnc, setDataEnc] = useState(hojeISO())
  const [motivoEnc, setMotivoEnc] = useState<MotivoEncerramento | null>(null)

  const carregar = useCallback(async () => {
    const [c, h, p] = await comRetentativa(() =>
      Promise.all([
        supabase.from('adm_clientes').select('*').order('codigo'),
        supabase.from('adm_clientes_honorario_atual').select('cliente_id, valor, dia_vencimento'),
        supabase.from('soc_parceiros').select('id, nome').order('nome'),
      ]),
    )
    const falha = c.error ?? h.error ?? p.error
    setErro(falha ? falha.message : null)
    setClientes((c.data as Cliente[]) ?? [])
    setVigentes(new Map(((h.data as Vigente[]) ?? []).map((v) => [v.cliente_id, { ...v, valor: Number(v.valor) }])))
    setParceiros((p.data as ParceiroResumo[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeParceiro = useCallback((id: string | null) => parceiros.find((p) => p.id === id)?.nome ?? '', [parceiros])
  const ativos = useMemo(() => clientes.filter((c) => c.status !== 'encerrado'), [clientes])
  const inativos = useMemo(() => clientes.filter((c) => c.status === 'encerrado'), [clientes])

  const lista = useMemo(() => {
    const base = aba === 'inativos' ? inativos : ativos
    const t = busca.trim().toLowerCase()
    const dig = t.replace(/\D/g, '')
    const filtrada = base.filter((c) => {
      if (fStatus && c.status !== fStatus) return false
      if (fParceiro && (fParceiro === 'nenhum' ? c.parceiro_id : c.parceiro_id !== fParceiro)) return false
      if (fRegime && (fRegime === 'nao_informado' ? c.regime_tributario : c.regime_tributario !== fRegime)) return false
      if (fHonorario === 'sem' && (vigentes.has(c.id) || c.sem_honorario)) return false
      if (fHonorario === 'confirmado' && !c.sem_honorario) return false
      if (fHonorario === 'com' && !vigentes.has(c.id)) return false
      if (fPendencia) {
        const etapa = fPendencia === 'qualquer' ? null : c[fPendencia as (typeof ETAPAS)[number]['campo']]
        if (fPendencia === 'qualquer' ? !temPendencia(c) : etapa !== 'pendente' && etapa !== 'pdf_enviado') return false
      }
      if (!t) return true
      const txt = [c.razao_social, c.nome_fantasia, c.responsavel, c.email, String(c.codigo)].filter(Boolean).join(' ').toLowerCase()
      return txt.includes(t) || (dig.length >= 3 && (c.cnpj ?? '').includes(dig))
    })
    const val = (c: Cliente) =>
      ordem.campo === 'honorario'
        ? (vigentes.get(c.id)?.valor ?? -1)
        : ordem.campo === 'codigo'
          ? c.codigo
          : ordem.campo === 'razao_social'
            ? c.razao_social
            : (c.data_assinatura ?? '')
    return [...filtrada].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
      return ordem.asc ? r : -r
    })
  }, [aba, ativos, inativos, busca, fStatus, fParceiro, fRegime, fPendencia, fHonorario, ordem, vigentes])

  const ativosSemHonorario = useMemo(() => ativos.filter((c) => !vigentes.has(c.id) && !c.sem_honorario), [ativos, vigentes])

  const totalLista = lista.reduce((s, c) => s + (vigentes.get(c.id)?.valor ?? 0), 0)

  function alternar(id: string) {
    setExpandidos((x) => {
      const n = new Set(x)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  /** Grava um campo editado no expandir (atualiza a tela na hora). */
  async function atualizarCampo(c: Cliente, campo: keyof Cliente, valor: string | null) {
    setClientes((l) => l.map((x) => (x.id === c.id ? { ...x, [campo]: valor } : x)))
    const { error } = await supabase
      .from('adm_clientes')
      .update({ [campo]: valor })
      .eq('id', c.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function mudarStatus(c: Cliente, status: StatusCliente) {
    if (status === 'encerrado') {
      setDataEnc(hojeISO())
      setMotivoEnc(null)
      return setEncerrando(c)
    }
    setClientes((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)))
    const { error } = await supabase.from('adm_clientes').update({ status }).eq('id', c.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function confirmarEncerramento() {
    if (!encerrando) return
    if (!motivoEnc) return setErro('Informe o motivo do encerramento: Baixa da Empresa ou Distrato.')
    const msg = await encerrarCliente(encerrando, dataEnc, motivoEnc)
    setEncerrando(null)
    if (msg) setErro(msg)
    carregar()
  }

  function irPara(a: Aba, filtros: { status?: string; pendencia?: string; parceiro?: string; honorario?: string } = {}) {
    setAba(a)
    setFHonorario(filtros.honorario ?? '')
    setFStatus(filtros.status ?? '')
    setFPendencia(filtros.pendencia ?? '')
    setFParceiro(filtros.parceiro ?? '')
    setFRegime('')
    setBusca('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Planilha com TODOS os clientes cadastrados (ativos e inativos): uma coluna por informação. */
  function exportar(formato: 'xlsx' | 'csv') {
    setMenuExportar(false)
    const colunas: {
      titulo: string
      tipo?: 'texto' | 'moeda' | 'data' | 'numero'
      largura?: number
      valor: (c: Cliente) => string | number | null | undefined
    }[] = [
      { titulo: 'Código', largura: 8, valor: (c) => String(c.codigo).padStart(3, '0') },
      { titulo: 'Empresa', largura: 9, valor: (c) => c.empresa },
      { titulo: 'CNPJ', largura: 20, valor: (c) => formatarCnpj(c.cnpj) },
      { titulo: 'Razão social', largura: 44, valor: (c) => c.razao_social },
      { titulo: 'Nome fantasia', largura: 28, valor: (c) => c.nome_fantasia },
      { titulo: 'Situação', largura: 22, valor: (c) => labelDe(STATUS_CLIENTE, c.status) },
      { titulo: 'Situação cadastral (Receita)', largura: 16, valor: (c) => c.situacao_cadastral },
      { titulo: 'Data de abertura', tipo: 'data', largura: 13, valor: (c) => c.data_abertura },
      { titulo: 'Início dos serviços', tipo: 'data', largura: 13, valor: (c) => c.data_inicio_servicos },
      { titulo: 'Assinatura do contrato', tipo: 'data', largura: 13, valor: (c) => c.data_assinatura },
      { titulo: 'Carência (meses)', tipo: 'numero', largura: 10, valor: (c) => c.carencia_meses },
      { titulo: 'Encerramento', tipo: 'data', largura: 13, valor: (c) => c.data_encerramento },
      { titulo: 'Motivo do encerramento', largura: 18, valor: (c) => labelDe(MOTIVOS_ENCERRAMENTO, c.motivo_encerramento ?? '') || null },
      { titulo: 'Situação do encerramento', largura: 20, valor: (c) => c.situacao_encerramento },
      { titulo: 'Responsável', largura: 32, valor: (c) => c.responsavel },
      { titulo: 'E-mail', largura: 32, valor: (c) => c.email },
      { titulo: 'Telefone', largura: 16, valor: (c) => c.telefone },
      { titulo: 'Endereço', largura: 60, valor: (c) => c.endereco },
      { titulo: 'Parceiro', largura: 18, valor: (c) => nomeParceiro(c.parceiro_id) },
      { titulo: 'Regime tributário', largura: 16, valor: (c) => labelDe(REGIMES, c.regime_tributario) },
      { titulo: 'Segmento', largura: 12, valor: (c) => labelDe(SEGMENTOS, c.segmento) },
      { titulo: 'Tipo de inscrição', largura: 14, valor: (c) => labelDe(INSCRICOES, c.tipo_inscricao) },
      { titulo: 'Número da inscrição', largura: 18, valor: (c) => c.inscricao },
      ...ETAPAS.map((e) => ({ titulo: e.label, largura: 14, valor: (c: Cliente) => (c[e.campo] ? labelDe(OPCOES_ETAPA, c[e.campo]) : '') })),
      { titulo: 'Honorário mensal', tipo: 'moeda', largura: 15, valor: (c) => vigentes.get(c.id)?.valor ?? null },
      { titulo: 'Dia de vencimento', tipo: 'numero', largura: 10, valor: (c) => vigentes.get(c.id)?.dia_vencimento ?? null },
      { titulo: 'Pasta no Drive', largura: 30, valor: (c) => c.link_drive },
      { titulo: 'Observações', largura: 40, valor: (c) => c.observacoes },
      { titulo: 'Atualizado na Receita em', tipo: 'data', largura: 14, valor: (c) => c.receita_atualizada_em?.slice(0, 10) },
    ]
    const todos = [...clientes].sort((a, b) => a.codigo - b.codigo)
    const nome = `base-de-clientes-${hojeISO()}`
    if (formato === 'xlsx') {
      const arq = gerarXlsx({
        aba: 'Base de Clientes',
        colunas: colunas.map(({ titulo, tipo, largura }) => ({ titulo, tipo, largura })),
        linhas: todos.map((c) => colunas.map((col) => col.valor(c) ?? null)),
      })
      return baixarArquivo(`${nome}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
    }
    // CSV: datas em DD/MM/AAAA e valores com R$
    const texto = (col: (typeof colunas)[number], c: Cliente) => {
      const v = col.valor(c)
      if (v === null || v === undefined || v === '') return ''
      if (col.tipo === 'data') return formatarData(String(v))
      if (col.tipo === 'moeda') return moeda(Number(v))
      return v
    }
    baixarArquivo(
      `${nome}.csv`,
      '\uFEFF' + csv([colunas.map((c) => c.titulo), ...todos.map((c) => colunas.map((col) => texto(col, c)))]),
      'text/csv;charset=utf-8',
    )
  }

  const cabecalho = (campo: Ordem, children: string, className = '') => (
    <th className={`px-3 py-3 ${className}`}>
      <button
        className="inline-flex cursor-pointer items-center gap-1 tracking-wide uppercase hover:text-slate-700"
        onClick={() => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : campo !== 'honorario' && campo !== 'data_assinatura' }))}
      >
        {children}
        {ordem.campo === campo && (ordem.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )

  const ABAS: { id: Aba; label: string; icone: typeof Users; n?: number }[] = [
    { id: 'painel', label: 'Painel', icone: LayoutDashboard },
    { id: 'ativos', label: 'Clientes ativos', icone: Users, n: ativos.length },
    { id: 'inativos', label: 'Inativos', icone: Archive, n: inativos.length },
  ]

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative flex w-full max-w-none items-center gap-4 py-4 px-3 sm:px-4 md:px-6 lg:px-8">
          <Link para="/" aria-label="Ir para a página inicial do portal">
            <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="h-9 w-auto sm:h-10" />
          </Link>
          <Link para="/" className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20">
            <House className="h-4 w-4" />
            <span className="hidden sm:inline">Página inicial</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-white/70 md:inline">{session.user.email}</span>
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => supabase.auth.signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="relative flex w-full max-w-none flex-wrap items-end justify-between gap-4 pt-4 pb-6 px-3 sm:px-4 md:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-cyan-300">
              <Link para="/" className="hover:underline">
                Página inicial
              </Link>{' '}
              ›{' '}
              <Link para="/d/administrativo" className="hover:underline">
                Administrativo
              </Link>{' '}
              · Base de Clientes
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Base de Clientes</h1>
            <p className="mt-1 text-sm text-white/60">Cadastro, honorários e implantação dos clientes do escritório.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
              onClick={() => setAtualizandoTodas(true)}
              title="Consultar o Cartão CNPJ de todas as empresas na Receita"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar dados de todas as empresas
            </button>
            <button
              className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
              onClick={async () => setConfigDrive({ atual: await obterUrlDrive() })}
              title="Ligar o portal ao script que cria as pastas no Google Drive"
            >
              <FolderCog className="h-4 w-4" />
              Drive
            </button>
            <button
              className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
              onClick={() => setLote(true)}
              title="Informe código e CNPJ de várias empresas"
            >
              <ListPlus className="h-4 w-4" />
              Cadastrar em lote
            </button>
            <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando('novo')}>
              <Plus className="h-4 w-4" />
              Novo cliente
            </button>
          </div>
        </div>
        <nav className="relative flex w-full max-w-none gap-1 overflow-x-auto px-3 sm:px-4 md:px-6 lg:px-8" role="tablist">
          {ABAS.map(({ id, label, icone: I, n }) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => irPara(id)}
              className={`flex cursor-pointer items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${aba === id ? 'bg-[#f3f6fc] text-slate-900' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <I className="h-4 w-4" />
              {label}
              {n !== undefined && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${aba === id ? 'bg-slate-200 text-slate-600' : 'bg-white/15'}`}>{n}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="w-full max-w-none space-y-5 py-6 px-3 sm:px-4 md:px-6 lg:px-8">
        {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
        {carregando ? (
          <p className="p-10 text-center text-sm text-slate-400">Carregando clientes...</p>
        ) : aba === 'painel' ? (
          <Painel clientes={clientes} vigentes={vigentes} parceiros={parceiros} irPara={irPara} />
        ) : (
          <>
            {aba === 'ativos' && ativosSemHonorario.length > 0 && fHonorario !== 'sem' && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <span>
                  <b>{ativosSemHonorario.length} cliente(s) ativo(s) sem honorário cadastrado.</b> Eles ficam fora do Controle de Honorários até o honorário ser
                  informado no Expandir.
                </span>
                <button className="btn-secondary btn-sm" onClick={() => setFHonorario('sem')}>
                  Ver quais são
                </button>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="busca-clientes"
                  className="input pl-10"
                  placeholder="Buscar por razão social, CNPJ, responsável, e-mail ou código"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              {aba === 'ativos' && (
                <Select
                  value={fStatus}
                  onChange={setFStatus}
                  opcoes={STATUS_CLIENTE.filter((s) => s.value !== 'encerrado')}
                  vazio="Todas as situações"
                  className="input w-auto"
                />
              )}
              <Select
                value={fParceiro}
                onChange={setFParceiro}
                opcoes={[...parceiros.map((p) => ({ value: p.id, label: p.nome })), { value: 'nenhum', label: 'Sem parceiro' }]}
                vazio="Todos os parceiros"
                className="input w-auto"
              />
              <Select
                value={fRegime}
                onChange={setFRegime}
                opcoes={[...REGIMES, { value: 'nao_informado', label: 'Regime não informado' }]}
                vazio="Todos os regimes"
                className="input w-auto"
              />
              {aba === 'ativos' && (
                <Select
                  value={fHonorario}
                  onChange={setFHonorario}
                  opcoes={[
                    { value: 'sem', label: 'Sem honorário cadastrado' },
                    { value: 'com', label: 'Com honorário' },
                    { value: 'confirmado', label: 'Sem cobrança confirmada' },
                  ]}
                  vazio="Honorário: todos"
                  className={`input w-auto ${fHonorario === 'sem' ? 'border-rose-300 bg-rose-50 text-rose-700' : ''}`}
                />
              )}
              {aba === 'ativos' && (
                <Select
                  value={fPendencia}
                  onChange={setFPendencia}
                  opcoes={[{ value: 'qualquer', label: 'Com alguma pendência' }, ...ETAPAS.map((e) => ({ value: e.campo, label: `${e.label} pendente` }))]}
                  vazio="Implantação: todas"
                  className="input w-auto"
                />
              )}
              <div className="relative">
                <button
                  className="btn-secondary"
                  onClick={() => setMenuExportar((x) => !x)}
                  aria-expanded={menuExportar}
                  title="Planilha com todos os clientes cadastrados"
                >
                  <Download className="h-4 w-4" />
                  Exportar
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {menuExportar && (
                  <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200">
                    <button
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => exportar('xlsx')}
                    >
                      <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                      Excel (.xlsx) · todos os clientes
                    </button>
                    <button
                      className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onClick={() => exportar('csv')}
                    >
                      <FileText className="h-4 w-4 text-slate-500" />
                      CSV · todos os clientes
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold text-slate-400">
                    <tr>
                      {cabecalho('codigo', 'Cód.', 'pl-5')}
                      {cabecalho('razao_social', 'Cliente')}
                      <th className="px-3 py-3 tracking-wide uppercase">Parceiro</th>
                      <th className="px-3 py-3 tracking-wide uppercase">Situação</th>
                      {cabecalho('data_assinatura', 'Assinatura')}
                      {cabecalho('honorario', 'Honorário', 'text-right')}
                      <th className="px-3 py-3 tracking-wide uppercase">Implantação</th>
                      <th className="py-3 pr-5 pl-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lista.map((c) => {
                      const v = vigentes.get(c.id)
                      return (
                        <Fragment key={c.id}>
                          <tr className={`transition ${expandidos.has(c.id) ? 'bg-brand-50/40' : 'hover:bg-slate-50/70'}`}>
                            <td className="py-3 pr-3 pl-5 font-mono text-xs text-slate-400 tabular-nums">{String(c.codigo).padStart(3, '0')}</td>
                            <td className="min-w-56 px-3 py-3">
                              <button className="cursor-pointer text-left font-semibold text-slate-900 hover:text-brand-600" onClick={() => setEditando(c)}>
                                {c.razao_social}
                              </button>
                              <div className="font-mono text-xs text-slate-400">{formatarCnpj(c.cnpj) || 'CNPJ não informado'}</div>
                              {c.responsavel && (
                                <div className="mt-0.5 text-xs text-slate-500" title={c.email ?? undefined}>
                                  {c.responsavel}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                              {nomeParceiro(c.parceiro_id) || <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${COR_STATUS[c.status]}`}>
                                {c.status === 'encerrado'
                                  ? textoEncerramento(c.motivo_encerramento, formatarData(c.data_encerramento))
                                  : labelDe(STATUS_CLIENTE, c.status)}
                              </span>
                              {c.situacao_encerramento && <div className="mt-1 pl-1 text-xs font-semibold text-rose-600">{c.situacao_encerramento}</div>}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-slate-600 tabular-nums">{formatarData(c.data_assinatura)}</td>
                            <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                              {v ? (
                                moeda(v.valor)
                              ) : c.sem_honorario ? (
                                <span
                                  className="inline-block rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap text-slate-600"
                                  title={c.sem_honorario_motivo ?? 'Confirmado sem honorário'}
                                >
                                  Sem cobrança
                                </span>
                              ) : c.status !== 'encerrado' ? (
                                <span className="inline-block rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap text-rose-700">
                                  Sem honorário
                                </span>
                              ) : (
                                <span className="font-normal text-slate-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex gap-1.5">
                                {ETAPAS.map((e) => {
                                  const st = c[e.campo] ?? 'vazio'
                                  return (
                                    <div
                                      key={e.campo}
                                      className={`min-w-[5.75rem] rounded-lg px-2 py-1 ring-1 ring-inset ${CHIP_ETAPA[st]}`}
                                      title={`${e.label}: ${TEXTO_ETAPA[st]}`}
                                    >
                                      <div className="text-[0.625rem] font-semibold tracking-wide uppercase opacity-70">{e.label.replace(' digital', '')}</div>
                                      <div className="text-xs font-bold whitespace-nowrap first-letter:uppercase">{st === 'vazio' ? '—' : TEXTO_ETAPA[st]}</div>
                                    </div>
                                  )
                                })}
                              </div>
                            </td>
                            <td className="py-3 pr-5 pl-3">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  className={`btn-sm btn ${expandidos.has(c.id) ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`}
                                  onClick={() => alternar(c.id)}
                                  aria-expanded={expandidos.has(c.id)}
                                >
                                  {expandidos.has(c.id) ? 'Recolher' : 'Expandir'}
                                  <ChevronDown className={`h-3.5 w-3.5 transition ${expandidos.has(c.id) ? 'rotate-180' : ''}`} />
                                </button>
                                {c.link_drive && (
                                  <a
                                    className="icon-btn"
                                    href={c.link_drive}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Abrir pasta no Drive"
                                    aria-label="Abrir pasta no Drive"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                )}
                                <button className="icon-btn" onClick={() => setEditando(c)} title="Editar" aria-label="Editar cliente">
                                  <Pencil className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {expandidos.has(c.id) && (
                            <tr className="bg-brand-50/40">
                              <td colSpan={8} className="px-5 pt-1 pb-5">
                                <ClienteExpandido
                                  cliente={c}
                                  vigente={v}
                                  onCampo={(campo, valor) => atualizarCampo(c, campo, valor)}
                                  onStatus={(st) => mudarStatus(c, st)}
                                  onHonorario={carregar}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                    {lista.length === 0 && (
                      <tr>
                        <td colSpan={8} className="p-10 text-center text-sm text-slate-400">
                          {aba === 'inativos' ? 'Nenhum cliente inativo com esses filtros.' : 'Nenhum cliente encontrado com esses filtros.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {lista.length} de {aba === 'inativos' ? inativos.length : ativos.length} cliente(s)
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {(['concluida', 'pdf_enviado', 'pendente', 'na'] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${COR_ETAPA[k]}`} />
                      {TEXTO_ETAPA[k]}
                    </span>
                  ))}
                  <span className="font-semibold text-slate-700 tabular-nums">Honorários da lista: {moeda(totalLista)}/mês</span>
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {encerrando && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-asap-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Encerrar {encerrando.razao_social}?</h2>
            <p className="text-sm text-slate-600">
              O cliente sai da lista de ativos e vai para Inativos. O honorário vigente é encerrado na mesma data e o controle de obrigações deixa de trazer a
              empresa a partir da competência seguinte.
            </p>
            <div className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Motivo *</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Motivo do encerramento">
                {MOTIVOS_ENCERRAMENTO.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={motivoEnc === m.value}
                    onClick={() => setMotivoEnc(m.value)}
                    className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold transition ${motivoEnc === m.value ? 'border-rose-500 bg-rose-50 text-rose-700 ring-1 ring-rose-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">{motivoEnc === 'distrato' ? 'Data do distrato *' : 'Data da baixa *'}</span>
              <CampoData id="data-encerramento-lista" className="input" value={dataEnc} onChange={(v) => setDataEnc(v)} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEncerrando(null)}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={confirmarEncerramento} disabled={!motivoEnc || !dataEnc}>
                Encerrar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {configDrive && <ConfigDrive atual={configDrive.atual} onClose={() => setConfigDrive(null)} onSalvo={() => setConfigDrive(null)} />}
      {lote && <CadastroLote clientes={clientes} onClose={() => setLote(false)} onFeito={carregar} />}
      {atualizandoTodas && <AtualizarTodas clientes={clientes} onClose={() => setAtualizandoTodas(false)} onFeito={carregar} />}
      {editando && (
        <ClienteForm
          cliente={editando === 'novo' ? null : editando}
          parceiros={parceiros}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </div>
  )
}
