import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { REGEX_VIABILIDADE, formatarData, mascaraViabilidade } from '../lib/format'
import {
  ACOMPANHAMENTO_POR_TIPO,
  STATUS_PROCESSO,
  TIPOS,
  labelDe,
  numeroReferencia,
  type CampoAcompanhamento,
  type Parceiro,
  type Processo,
  type StatusProcesso,
} from '../types'
import { Parceiros } from './Parceiros'
import { ProcessoDetalhes } from './ProcessoDetalhes'
import { ProcessoForm } from './ProcessoForm'
import { corEtapa } from './StatusBadge'
import { Badge, Select } from './ui'
import {
  Archive,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FilePenLine,
  FolderOpen,
  Handshake,
  Landmark,
  LogOut,
  Pencil,
  Plus,
  Search,
  Timer,
  Trash2,
} from 'lucide-react'

const CORES_SELECT: Record<string, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300',
  pendente: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300',
  analise: 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300',
  andamento: 'border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300',
  concluido: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300',
}

const CARTOES: { status: StatusProcesso; icone: typeof Clock3; gradiente: string; sombra: string }[] = [
  { status: 'pendente', icone: Clock3, gradiente: 'from-amber-400 to-orange-500', sombra: 'shadow-orange-500/30' },
  { status: 'andamento', icone: Timer, gradiente: 'from-brand-500 to-indigo-600', sombra: 'shadow-brand-500/30' },
  { status: 'concluido', icone: CheckCircle2, gradiente: 'from-emerald-400 to-teal-500', sombra: 'shadow-emerald-500/30' },
]

const ICONES_TIPO = {
  abertura: { icone: Building2, cor: 'bg-brand-100 text-brand-600', barra: 'bg-brand-500' },
  alteracao: { icone: FilePenLine, cor: 'bg-violet-100 text-violet-600', barra: 'bg-violet-500' },
  baixa: { icone: Archive, cor: 'bg-rose-100 text-rose-600', barra: 'bg-rose-500' },
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

function progresso(p: Processo) {
  return ACOMPANHAMENTO_POR_TIPO[p.tipo].filter((a) => p[a.campo] === a.concluido).length
}

export function Dashboard({ session }: { session: Session }) {
  const [processos, setProcessos] = useState<Processo[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusProcesso>('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroParceiro, setFiltroParceiro] = useState('')

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<Processo | 'novo' | null>(null)
  const [detalhes, setDetalhes] = useState<Processo | null>(null)
  const [mostrarParceiros, setMostrarParceiros] = useState(false)

  const carregar = useCallback(async () => {
    const buscar = () =>
      Promise.all([
        supabase.from('soc_processos').select('*').order('data_inicio', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('soc_parceiros').select('*').order('nome'),
      ])
    let [proc, parc] = await buscar()
    // Logo após o login, o token pode chegar com horário levemente à frente do servidor
    // de dados ("JWT issued at future"). Aguarda um pouco e tenta de novo.
    for (let tentativa = 0; tentativa < 3 && /issued at future/i.test((proc.error ?? parc.error)?.message ?? ''); tentativa++) {
      await new Promise((r) => setTimeout(r, 1500))
      ;[proc, parc] = await buscar()
    }
    if (proc.error || parc.error) setErro((proc.error ?? parc.error)!.message)
    else setErro(null)
    setProcessos((proc.data as Processo[]) ?? [])
    setParceiros((parc.data as Parceiro[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const contagem = useMemo(() => {
    const c: Record<StatusProcesso, number> = { pendente: 0, andamento: 0, concluido: 0 }
    processos.forEach((p) => c[p.status]++)
    return c
  }, [processos])

  const porTipo = useMemo(() => {
    const c: Record<string, number> = { abertura: 0, alteracao: 0, baixa: 0 }
    processos.forEach((p) => c[p.tipo]++)
    return c
  }, [processos])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const termoDigitos = termo.replace(/\D/g, '')
    return processos.filter((p) => {
      if (filtroStatus && p.status !== filtroStatus) return false
      if (filtroTipo && p.tipo !== filtroTipo) return false
      if (filtroParceiro && p.parceiro_id !== filtroParceiro) return false
      if (!termo) return true
      const texto = [p.razao_social, p.nome_fantasia, p.responsavel, p.numero_viabilidade, p.numero_dbe, p.cnpj, ...(p.socios ?? []).map((s) => s.nome)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (texto.includes(termo)) return true
      return termoDigitos.length >= 3 && (p.cnpj ?? '').replace(/\D/g, '').includes(termoDigitos)
    })
  }, [processos, busca, filtroStatus, filtroTipo, filtroParceiro])

  async function atualizarCampo(p: Processo, campo: CampoAcompanhamento | 'status' | 'numero_viabilidade' | 'numero_dbe', valor: string | null) {
    setProcessos((lista) => lista.map((x) => (x.id === p.id ? { ...x, [campo]: valor } : x)))
    const { error } = await supabase.from('soc_processos').update({ [campo]: valor }).eq('id', p.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function excluir(p: Processo) {
    if (!confirm(`Excluir o processo de ${labelDe(TIPOS, p.tipo).toLowerCase()} "${p.razao_social ?? ''}"?\n\nEssa ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('soc_processos').delete().eq('id', p.id)
    if (error) return setErro(error.message)
    setProcessos((lista) => lista.filter((x) => x.id !== p.id))
  }

  function alternar(id: string) {
    setExpandidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const nomeParceiro = (id: string | null) => parceiros.find((x) => x.id === id)?.nome
  const email = session.user.email ?? ''
  const nome = email.split('@')[0].split(/[._-]/)[0]
  const nomeExibicao = nome.charAt(0).toUpperCase() + nome.slice(1)
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 pb-24 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute top-20 -left-20 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />

        <header className="relative mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
          <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="h-9 w-auto sm:h-10" />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2.5 rounded-full bg-white/10 py-1 pr-4 pl-1 ring-1 ring-white/10 sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-cyan-400 text-sm font-bold text-asap-950">
                {nomeExibicao.charAt(0)}
              </span>
              <span className="text-sm text-white/80">{email}</span>
            </div>
            <button
              className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
              onClick={() => supabase.auth.signOut()}
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 pt-6 sm:px-6">
          <div>
            <p className="text-sm font-medium text-cyan-300 first-letter:uppercase">{hoje}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {saudacao()}, {nomeExibicao}!
            </h1>
            <p className="mt-1 text-sm text-white/60">Acompanhe as aberturas, alterações e baixas de CNPJ do escritório.</p>
          </div>
          <div className="flex gap-2">
            <a href="#/tributario" className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20">
              <Landmark className="h-4 w-4" />
              Planejamento tributário
            </a>
            <button className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setMostrarParceiros(true)}>
              <Handshake className="h-4 w-4" />
              Parceiros
            </button>
            <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando('novo')}>
              <Plus className="h-4 w-4" />
              Novo processo
            </button>
          </div>
        </div>
      </div>

      <main className="relative mx-auto -mt-16 max-w-7xl space-y-5 px-4 pb-10 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CARTOES.map(({ status, icone: I, gradiente, sombra }) => {
            const ativo = filtroStatus === status
            return (
              <button
                key={status}
                onClick={() => setFiltroStatus(ativo ? '' : status)}
                className={`group cursor-pointer rounded-2xl bg-white p-5 text-left shadow-lg shadow-asap-900/5 ring-1 transition hover:-translate-y-0.5 hover:shadow-xl ${ativo ? 'ring-2 ring-brand-500' : 'ring-slate-200/70'}`}
              >
                <div className="flex items-start justify-between">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradiente} text-white shadow-lg ${sombra}`}>
                    <I className="h-5 w-5" />
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ativo ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                    {ativo ? 'filtrando' : 'filtrar'}
                  </span>
                </div>
                <div className="mt-4 text-3xl font-extrabold text-slate-900">{contagem[status]}</div>
                <div className="text-sm font-medium text-slate-500">{labelDe(STATUS_PROCESSO, status)}</div>
              </button>
            )
          })}
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-indigo-600 to-violet-600 p-5 text-white shadow-lg shadow-indigo-500/30">
            <div className="flex items-start justify-between">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
                <FolderOpen className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-4 text-3xl font-extrabold">{processos.length}</div>
            <div className="text-sm font-medium text-white/80">Processos no total</div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/70">
              <span>{porTipo.abertura} abertura(s)</span>
              <span>{porTipo.alteracao} alteração(ões)</span>
              <span>{porTipo.baixa} baixa(s)</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-10"
                placeholder="Buscar por razão social, CNPJ, viabilidade, sócio..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {[{ value: '', label: 'Todos' }, ...TIPOS].map((t) => {
                const ativo = filtroTipo === t.value
                const qtd = t.value ? porTipo[t.value] : processos.length
                return (
                  <button
                    key={t.value}
                    onClick={() => setFiltroTipo(t.value)}
                    className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${ativo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {t.label}
                    <span className={`rounded-md px-1.5 text-[11px] ${ativo ? 'bg-brand-100 text-brand-700' : 'bg-slate-200 text-slate-500'}`}>{qtd}</span>
                  </button>
                )
              })}
            </div>
            <div className="w-full sm:w-48">
              <Select value={filtroStatus} onChange={(v) => setFiltroStatus(v as StatusProcesso | '')} opcoes={STATUS_PROCESSO} vazio="Todos os status" />
            </div>
            <div className="w-full sm:w-48">
              <Select
                value={filtroParceiro}
                onChange={setFiltroParceiro}
                opcoes={parceiros.map((p) => ({ value: p.id, label: p.nome }))}
                vazio="Todos os parceiros"
              />
            </div>
          </div>
        </div>

        {erro && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  <th className="py-3.5 pr-4 pl-5">Empresa</th>
                  <th className="px-4 py-3.5">CNPJ</th>
                  <th className="px-4 py-3.5">Nº Viabilidade / DBE</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Início</th>
                  <th className="py-3.5 pr-5 pl-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-slate-400">
                      Carregando processos...
                    </td>
                  </tr>
                )}
                {!carregando && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-cyan-100 text-brand-600">
                        <FolderOpen className="h-7 w-7" />
                      </div>
                      <p className="mt-3 font-semibold text-slate-700">
                        {processos.length === 0 ? 'Nenhum processo cadastrado ainda' : 'Nenhum processo encontrado'}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {processos.length === 0 ? 'Cadastre o primeiro processo para começar a acompanhar.' : 'Tente ajustar a busca ou os filtros.'}
                      </p>
                      {processos.length === 0 && (
                        <button className="btn-primary mt-4" onClick={() => setEditando('novo')}>
                          <Plus className="h-4 w-4" />
                          Novo processo
                        </button>
                      )}
                    </td>
                  </tr>
                )}
                {filtrados.map((p) => {
                  const aberto = expandidos.has(p.id)
                  const feitos = progresso(p)
                  const etapas = ACOMPANHAMENTO_POR_TIPO[p.tipo]
                  const pct = (feitos / etapas.length) * 100
                  const T = ICONES_TIPO[p.tipo]
                  return (
                    <Fragment key={p.id}>
                      <tr className={`border-b border-slate-100 transition ${aberto ? 'bg-brand-50/40' : 'hover:bg-slate-50/80'}`}>
                        <td className="py-3.5 pr-4 pl-5">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${T.cor}`} title={labelDe(TIPOS, p.tipo)}>
                              <T.icone className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-slate-800">{p.razao_social || '—'}</span>
                                <Badge cor={p.tipo}>{labelDe(TIPOS, p.tipo)}</Badge>
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs whitespace-nowrap text-slate-400">
                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100" title={`${feitos} de ${etapas.length} etapas concluídas`}>
                                  <div
                                    className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-500 to-cyan-400'}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="font-medium text-slate-500">
                                  {feitos}/{etapas.length} etapas
                                </span>
                                {nomeParceiro(p.parceiro_id) && (
                                  <span className="inline-flex items-center gap-1">
                                    <Handshake className="h-3 w-3" />
                                    {nomeParceiro(p.parceiro_id)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs whitespace-nowrap text-slate-600">{p.cnpj || <span className="text-slate-300">—</span>}</td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{numeroReferencia(p) ? (
                            <span className="font-mono text-xs">
                              {p.tipo === 'baixa' && <span className="mr-1 font-sans text-[10px] font-bold text-rose-500">DBE</span>}
                              {numeroReferencia(p)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}</td>
                        <td className="px-4 py-3.5">
                          <Select
                            value={p.status}
                            onChange={(v) => atualizarCampo(p, 'status', v)}
                            opcoes={STATUS_PROCESSO}
                            className={`rounded-full border py-1.5 pl-3 text-xs font-semibold outline-none transition ${CORES_SELECT[p.status]}`}
                          />
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">{formatarData(p.data_inicio)}</td>
                        <td className="py-3.5 pr-5 pl-4">
                          <div className="flex items-center justify-end gap-1">
                            <button className={`btn-sm btn ${aberto ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}`} onClick={() => alternar(p.id)}>
                              {aberto ? 'Recolher' : 'Expandir'}
                              <ChevronDown className={`h-3.5 w-3.5 transition ${aberto ? 'rotate-180' : ''}`} />
                            </button>
                            <button className="icon-btn" title="Editar" onClick={() => setEditando(p)}>
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button className="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Excluir" onClick={() => excluir(p)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {aberto && (
                        <tr className="border-b border-slate-100 bg-brand-50/40">
                          <td colSpan={6} className="px-5 pt-1 pb-5">
                            <div className="animar-modal rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <NumeroReferencia processo={p} onSalvar={(campo, valor) => atualizarCampo(p, campo, valor)} />
                                {etapas.map((a, i) => {
                                  const cor = corEtapa(a, p[a.campo])
                                  return (
                                    <div key={a.campo} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                                      <div className="mb-2 flex items-center gap-2">
                                        <span
                                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${cor === 'ok' ? 'bg-emerald-500' : cor === 'pendente' ? 'bg-amber-400' : 'bg-sky-500'}`}
                                        >
                                          {cor === 'ok' ? '✓' : i + 1}
                                        </span>
                                        <span className="text-xs font-semibold text-slate-600">{a.label}</span>
                                      </div>
                                      <Select
                                        value={p[a.campo]}
                                        onChange={(v) => atualizarCampo(p, a.campo, v)}
                                        opcoes={a.opcoes}
                                        className={`w-full rounded-lg border px-2.5 py-1.5 text-sm font-medium outline-none transition ${CORES_SELECT[cor]}`}
                                      />
                                    </div>
                                  )
                                })}
                                <div className="flex items-stretch">
                                  <button className="btn-primary w-full" onClick={() => setDetalhes(p)}>
                                    <FolderOpen className="h-4 w-4" />
                                    Detalhes do processo
                                  </button>
                                </div>
                              </div>
                              {(p.responsavel || p.alteracao_descricao || p.observacoes || (p.tipo === 'abertura' && p.socios?.length > 0)) && (
                                <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-sm text-slate-600 sm:grid-cols-2">
                                  {p.tipo === 'abertura' && p.socios?.length > 0 && (
                                    <div>
                                      <span className="font-semibold text-slate-800">Sócios:</span> {p.socios.map((s) => s.nome || s.cpf || 'sem nome').join(', ')}
                                    </div>
                                  )}
                                  {p.responsavel && (
                                    <div>
                                      <span className="font-semibold text-slate-800">Responsável:</span> {p.responsavel}
                                    </div>
                                  )}
                                  {p.alteracao_descricao && (
                                    <div>
                                      <span className="font-semibold text-slate-800">Alteração:</span> {p.alteracao_descricao}
                                    </div>
                                  )}
                                  {p.observacoes && (
                                    <div>
                                      <span className="font-semibold text-slate-800">Obs.:</span> {p.observacoes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!carregando && processos.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Exibindo {filtrados.length} de {processos.length} processo(s)
            </div>
          )}
        </div>
      </main>

      {editando && (
        <ProcessoForm
          processo={editando === 'novo' ? null : editando}
          parceiros={parceiros}
          onClose={() => setEditando(null)}
          onGerenciarParceiros={() => setMostrarParceiros(true)}
          onSaved={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}

      {detalhes && (
        <ProcessoDetalhes
          processo={processos.find((x) => x.id === detalhes.id) ?? detalhes}
          parceiros={parceiros}
          onClose={() => setDetalhes(null)}
          onEditar={() => {
            const atual = processos.find((x) => x.id === detalhes.id) ?? detalhes
            setDetalhes(null)
            setEditando(atual)
          }}
        />
      )}

      {mostrarParceiros && (
        <Parceiros parceiros={parceiros} processos={processos} onClose={() => setMostrarParceiros(false)} onChanged={carregar} />
      )}
    </div>
  )
}

function NumeroReferencia({
  processo: p,
  onSalvar,
}: {
  processo: Processo
  onSalvar: (campo: 'numero_viabilidade' | 'numero_dbe', valor: string | null) => void
}) {
  const baixa = p.tipo === 'baixa'
  const campo = baixa ? 'numero_dbe' : 'numero_viabilidade'
  const atual = p[campo] ?? ''
  const [valor, setValor] = useState(atual)
  const invalido = !baixa && valor !== '' && !REGEX_VIABILIDADE.test(valor)

  function salvar() {
    if (invalido || valor === atual) return
    onSalvar(campo, valor || null)
  }

  return (
    <div className={`rounded-xl border p-3 ${baixa ? 'border-rose-100 bg-rose-50/50' : 'border-brand-100 bg-brand-50/50'}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-5 items-center rounded-full px-1.5 text-[10px] font-bold text-white ${baixa ? 'bg-rose-500' : 'bg-brand-500'}`}>Nº</span>
        <span className="text-xs font-semibold text-slate-600">{baixa ? 'Número DBE' : 'Número da Viabilidade'}</span>
      </div>
      <input
        className={`w-full rounded-lg border bg-white px-2.5 py-1.5 font-mono text-sm tracking-wider outline-none transition focus:ring-2 ${invalido ? 'border-rose-300 focus:ring-rose-100' : 'border-slate-200 focus:border-brand-400 focus:ring-brand-100'}`}
        value={valor}
        placeholder={baixa ? 'Não informado' : 'SPN2633893093'}
        maxLength={baixa ? undefined : 13}
        onChange={(e) => setValor(baixa ? e.target.value.toUpperCase() : mascaraViabilidade(e.target.value))}
        onBlur={salvar}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {invalido && <span className="mt-1 block text-[11px] text-rose-600">3 letras + 10 números</span>}
    </div>
  )
}
