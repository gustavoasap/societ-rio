import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  AlertTriangle,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  FileUp,
  Handshake,
  House,
  LineChart,
  LogOut,
  Pencil,
  Search,
  Settings,
  TrendingUp,
  Undo2,
  Wallet,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Link } from '../../lib/rotas'
import { comRetentativa } from '../../lib/retentar'
import { formatarData } from '../../lib/format'
import { baixarArquivo, gerarXlsx, TIPO_XLSX, type ValorCelula } from '../../lib/planilha'
import { CampoMes } from '../../components/CampoData'
import { Select } from '../../components/ui'
import { BarrasAgrupadas, Legenda } from '../../tributario/components/graficos'
import {
  SITUACOES,
  chaveMensal,
  hojeIso,
  inadimplentes,
  linhaDoMes,
  parceiroDoMes,
  mesDe,
  mesHoje,
  mesesEntre,
  resumoDoMes,
  somarMes,
  type ClienteHon,
  type ConfigHon,
  type HonorarioBase,
  type Linha,
  type Mensal,
  type PeriodoParceiro,
  type Situacao,
} from './calculo'
import { AjustarValor, AlterarVencimento, ConfigHonorarios, MarcarRecebido } from './Modais'
import { mesCurto, nomeMes, salvarMensal, valorTexto } from './util'
import { ImportarExtrato } from './ImportarExtrato'
import { ReajusteMassa } from './ReajusteMassa'
import { MensalidadesParceiro, PeriodosParceiro } from './Parceiros'
import { marcarSemHonorario } from '../acoes'

type Aba = 'mes' | 'inadimplentes' | 'evolucao'

const SERIES = [
  { id: 'previsto', label: 'Honorário total (a receber)', cor: '#6366f1' },
  { id: 'recebido', label: 'Recebido', cor: '#10b981' },
]

export function Honorarios({ session }: { session: Session }) {
  const [aba, setAba] = useState<Aba>('mes')
  const [mes, setMes] = useState(mesHoje)
  const [cfg, setCfg] = useState<ConfigHon>({ inicio: '2026-10-01', dia_vencimento: 10, vence_mes_seguinte: false, tarifa_boleto: 0 })
  const [clientes, setClientes] = useState<ClienteHon[]>([])
  const [hons, setHons] = useState<HonorarioBase[]>([])
  const [mensais, setMensais] = useState<Map<string, Mensal>>(new Map())
  const [periodos, setPeriodos] = useState<PeriodoParceiro[]>([])
  const [parceiros, setParceiros] = useState<{ id: string; nome: string }[]>([])
  const [verParceiro, setVerParceiro] = useState<string | null>(null)
  const [periodosAbertos, setPeriodosAbertos] = useState<{ cliente?: string } | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('')
  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const [recebendo, setRecebendo] = useState<Linha[] | null>(null)
  const [ajustando, setAjustando] = useState<Linha | null>(null)
  const [importando, setImportando] = useState(false)
  const [configurando, setConfigurando] = useState(false)
  const [verSemHonorario, setVerSemHonorario] = useState(false)
  const [reajustando, setReajustando] = useState(false)
  const [vencendo, setVencendo] = useState<Linha | null>(null)

  const carregar = useCallback(async () => {
    const [c, cl, h, m, pp, pa] = await comRetentativa(() =>
      Promise.all([
        supabase.from('adm_hon_config').select('inicio, dia_vencimento, vence_mes_seguinte, tarifa_boleto').eq('id', 1).maybeSingle(),
        supabase
          .from('adm_clientes')
          .select(
            'id, codigo, razao_social, nome_fantasia, cnpj, responsavel, status, data_inicio_servicos, carencia_meses, sem_honorario, sem_honorario_motivo',
          )
          .neq('status', 'encerrado')
          .order('codigo'),
        supabase.from('adm_honorarios').select('cliente_id, valor, vigencia_inicio, vigencia_fim, dia_vencimento'),
        supabase.from('adm_hon_mensal').select('*').range(0, 19999),
        supabase.from('adm_hon_parceiro').select('id, cliente_id, parceiro_id, inicio, meses, observacao'),
        supabase.from('soc_parceiros').select('id, nome').order('nome'),
      ]),
    )
    const falha = c.error ?? cl.error ?? h.error ?? m.error ?? pp.error ?? pa.error
    if (falha) setErro(falha.message)
    if (c.data) setCfg(c.data as ConfigHon)
    setClientes((cl.data as ClienteHon[]) ?? [])
    setHons((h.data as HonorarioBase[]) ?? [])
    setMensais(new Map(((m.data as Mensal[]) ?? []).map((x) => [chaveMensal(x.cliente_id, mesDe(x.competencia)), x])))
    setPeriodos((pp.data as PeriodoParceiro[]) ?? [])
    setParceiros((pa.data as { id: string; nome: string }[]) ?? [])
  }, [])

  useEffect(() => {
    carregar().finally(() => setCarregando(false))
  }, [carregar])

  const hoje = hojeIso()
  const inicio = mesDe(cfg.inicio)
  const ultimo = mesHoje() > mes ? mesHoje() : mes
  const honsPorCliente = useMemo(() => {
    const m = new Map<string, HonorarioBase[]>()
    for (const h of hons) m.set(h.cliente_id, [...(m.get(h.cliente_id) ?? []), h])
    return m
  }, [hons])

  const nomesParceiros = useMemo(() => new Map(parceiros.map((p) => [p.id, p.nome])), [parceiros])
  const periodosPorCliente = useMemo(() => {
    const m = new Map<string, PeriodoParceiro[]>()
    for (const p of periodos) m.set(p.cliente_id, [...(m.get(p.cliente_id) ?? []), p])
    return m
  }, [periodos])

  // Todas as linhas do início do controle até o mês atual (ou o mês escolhido, se for depois)
  const todas = useMemo(() => {
    const r: Linha[] = []
    for (const m of mesesEntre(inicio, ultimo))
      for (const c of clientes) {
        const par = parceiroDoMes(periodosPorCliente.get(c.id) ?? [], m, nomesParceiros)
        const l = linhaDoMes(c, honsPorCliente.get(c.id) ?? [], mensais.get(chaveMensal(c.id, m)) ?? null, m, cfg, hoje, par)
        if (l) r.push(l)
      }
    return r
  }, [inicio, ultimo, clientes, honsPorCliente, mensais, cfg, hoje, periodosPorCliente, nomesParceiros])

  // Mensalidades do mês pagas por parceiro (um botão por parceiro)
  const porParceiro = useMemo(() => {
    const m = new Map<string, { nome: string; linhas: Linha[] }>()
    for (const l of todas)
      if (l.competencia === mes && l.parceiro) {
        const g = m.get(l.parceiro.parceiroId) ?? { nome: l.parceiro.nome, linhas: [] }
        g.linhas.push(l)
        m.set(l.parceiro.parceiroId, g)
      }
    return [...m.entries()].map(([id, g]) => ({
      id,
      ...g,
      total: g.linhas.reduce((s, l) => s + l.valor, 0),
      aberto: g.linhas.reduce((s, l) => s + l.aberto, 0),
    }))
  }, [todas, mes])

  // Parceiros com mensalidades vencidas e não recebidas
  const parceirosAtraso = useMemo(() => {
    const m = new Map<string, { nome: string; linhas: Linha[] }>()
    for (const l of todas)
      if (l.parceiro && l.aberto > 0 && l.vencimento < hoje) {
        const g = m.get(l.parceiro.parceiroId) ?? { nome: l.parceiro.nome, linhas: [] }
        g.linhas.push(l)
        m.set(l.parceiro.parceiroId, g)
      }
    return [...m.values()].map((g) => ({ ...g, total: g.linhas.reduce((s, l) => s + l.aberto, 0) }))
  }, [todas, hoje])

  const doMes = useMemo(() => todas.filter((l) => l.competencia === mes), [todas, mes])
  const resumo = useMemo(() => resumoDoMes(todas, mes, hoje), [todas, mes, hoje])
  const semHonorario = useMemo(() => clientes.filter((c) => !(honsPorCliente.get(c.id) ?? []).length && !c.sem_honorario), [clientes, honsPorCliente])
  const confirmadosSem = useMemo(() => clientes.filter((c) => !(honsPorCliente.get(c.id) ?? []).length && c.sem_honorario), [clientes, honsPorCliente])

  async function confirmarSem(c: ClienteHon, sem: boolean) {
    let motivo: string | null = null
    if (sem) {
      const r = prompt(`Confirmar que ${c.razao_social} não terá honorário?\n\nMotivo (opcional):`, '')
      if (r === null) return
      motivo = r
    }
    const msg = await marcarSemHonorario(c.id, sem, motivo)
    if (msg) setErro(msg)
    carregar()
  }
  const listaInad = useMemo(() => inadimplentes(todas, hoje), [todas, hoje])
  const totalInad = listaInad.reduce((s, i) => s + i.total, 0)
  const evolucao = useMemo(() => mesesEntre(inicio, mesHoje()).map((m) => resumoDoMes(todas, m, hoje)), [todas, inicio, hoje])
  const usados = useMemo(() => new Set([...mensais.values()].map((m) => m.extrato_id).filter((x): x is string => !!x)), [mensais])
  const abertos = useMemo(() => todas.filter((l) => l.aberto > 0), [todas])

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const dig = t.replace(/\D/g, '')
    return doMes.filter((l) => {
      if (filtro === 'aberto' && l.aberto <= 0) return false
      if (filtro && filtro !== 'aberto' && l.situacao !== filtro) return false
      if (filtro === 'ajustado') return l.ajustado
      if (!t) return true
      const c = l.cliente
      return c.razao_social.toLowerCase().includes(t) || String(c.codigo).padStart(3, '0').includes(t) || (dig.length >= 3 && (c.cnpj ?? '').includes(dig))
    })
  }, [doMes, busca, filtro])

  const pct = resumo.previsto ? Math.round((resumo.recebido / resumo.previsto) * 100) : 0
  const selecionadas = linhas.filter((l) => selecao.has(l.cliente.id) && l.aberto > 0 && !l.mensal?.recebido_em)

  async function desfazer(l: Linha) {
    if (!confirm(`Desfazer o recebimento de ${l.cliente.razao_social} (${nomeMes(l.competencia)})?`)) return
    const { error } = await salvarMensal(l.cliente.id, l.competencia, {
      recebido_em: null,
      valor_recebido: null,
      origem: null,
      extrato_id: null,
      extrato_descricao: null,
    })
    if (error) setErro(error.message)
    carregar()
  }

  function exportarMes() {
    const dados: ValorCelula[][] = linhas.map((l) => [
      String(l.cliente.codigo).padStart(3, '0'),
      l.cliente.razao_social,
      l.base,
      l.valor,
      [l.ajustado ? (l.mensal?.motivo_ajuste ?? 'Ajustado') : '', l.parceiro ? `Pago por ${l.parceiro.nome} (${l.parceiro.parcela}/${l.parceiro.total})` : '']
        .filter(Boolean)
        .join(' · '),
      l.vencimento,
      SITUACOES[l.situacao].label,
      l.mensal?.recebido_em ?? null,
      l.recebido || null,
      l.aberto || null,
    ])
    const arq = gerarXlsx({
      aba: `Honorários ${mes}`,
      colunas: [
        { titulo: 'Cód.', largura: 7 },
        { titulo: 'Razão social', largura: 42 },
        { titulo: 'Honorário da base', tipo: 'moeda', largura: 16 },
        { titulo: 'Valor do mês', tipo: 'moeda', largura: 14 },
        { titulo: 'Ajuste / observação', largura: 28 },
        { titulo: 'Vencimento', tipo: 'data', largura: 12 },
        { titulo: 'Situação', largura: 16 },
        { titulo: 'Recebido em', tipo: 'data', largura: 12 },
        { titulo: 'Valor recebido', tipo: 'moeda', largura: 14 },
        { titulo: 'Em aberto', tipo: 'moeda', largura: 14 },
      ],
      linhas: dados,
    })
    baixarArquivo(`honorarios-${mes}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  function exportarInad() {
    const arq = gerarXlsx({
      aba: 'Inadimplentes',
      colunas: [
        { titulo: 'Cód.', largura: 7 },
        { titulo: 'Razão social', largura: 42 },
        { titulo: 'Responsável legal', largura: 30 },
        { titulo: 'Meses em atraso', largura: 30 },
        { titulo: 'Vencimento mais antigo', tipo: 'data', largura: 14 },
        { titulo: 'Dias de atraso', tipo: 'numero', largura: 10 },
        { titulo: 'Total em aberto', tipo: 'moeda', largura: 16 },
      ],
      linhas: listaInad.map((i) => [
        String(i.cliente.codigo).padStart(3, '0'),
        i.cliente.razao_social,
        i.cliente.responsavel,
        i.linhas.map((l) => mesCurto(l.competencia)).join(', '),
        i.maisAntigo,
        i.diasAtraso,
        { valor: i.total, destaque: 'negativo' },
      ]),
    })
    baixarArquivo(`inadimplentes-${hoje}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  const kpis = [
    { r: 'Honorário total', v: valorTexto(resumo.previsto), d: `${doMes.filter((l) => l.valor > 0).length} cliente(s) a receber em ${nomeMes(mes)}` },
    { r: 'Recebido', v: valorTexto(resumo.recebido), d: `${pct}% do total`, barra: true, cor: 'text-emerald-700' },
    { r: 'Diferença (em aberto)', v: valorTexto(resumo.aberto), d: 'honorário total − recebido', cor: resumo.aberto > 0 ? 'text-amber-700' : 'text-slate-900' },
    { r: 'Vencido', v: valorTexto(resumo.atrasado), d: 'em aberto com vencimento passado', cor: resumo.atrasado > 0 ? 'text-rose-600' : 'text-slate-900' },
  ]

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative flex w-full max-w-none items-center gap-4 px-3 py-4 sm:px-4 md:px-6 lg:px-8">
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
        <div className="relative flex w-full max-w-none flex-wrap items-end justify-between gap-4 px-3 pt-4 pb-8 sm:px-4 md:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-cyan-300">
              <Link para="/" className="hover:underline">
                Página inicial
              </Link>{' '}
              ›{' '}
              <Link para="/d/administrativo" className="hover:underline">
                Administrativo
              </Link>{' '}
              · Controle de Honorários
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Controle de Honorários</h1>
            <p className="mt-1 text-sm text-white/60">Honorário mensal de cada cliente ativo, com base no valor cadastrado na Base de Clientes.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setConfigurando(true)}>
              <Settings className="h-4 w-4" />
              Configurações
            </button>
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setPeriodosAbertos({})}>
              <Handshake className="h-4 w-4" />
              Parceiros
            </button>
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setReajustando(true)}>
              <TrendingUp className="h-4 w-4" />
              Reajuste em massa
            </button>
            <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setImportando(true)}>
              <FileUp className="h-4 w-4" />
              Importar extrato
            </button>
          </div>
        </div>
      </div>

      <main className="w-full max-w-none space-y-5 px-3 py-6 sm:px-4 md:px-6 lg:px-8">
        {erro && (
          <p className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {erro}
            <button className="cursor-pointer text-xs underline" onClick={() => setErro(null)}>
              fechar
            </button>
          </p>
        )}

        <div className="flex flex-wrap items-end gap-1 border-b border-slate-200">
          {(
            [
              { id: 'mes', label: 'Honorários do mês', icone: CalendarRange },
              { id: 'inadimplentes', label: 'Inadimplentes', icone: AlertTriangle, n: listaInad.length },
              { id: 'evolucao', label: 'Evolução', icone: LineChart },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className={`-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-bold transition ${aba === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              <t.icone className="h-4 w-4" />
              {t.label}
              {'n' in t && t.n > 0 && <span className="rounded-md bg-rose-100 px-1.5 text-[0.6875rem] text-rose-700">{t.n}</span>}
            </button>
          ))}
        </div>

        {carregando ? (
          <p className="p-10 text-center text-sm text-slate-400">Carregando...</p>
        ) : aba === 'mes' ? (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary px-2.5"
                  onClick={() => setMes((m) => somarMes(m, -1))}
                  disabled={mes <= inicio}
                  aria-label="Mês anterior"
                  title="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <CampoMes value={mes} onChange={(m) => setMes(m < inicio ? inicio : m)} />
                <button className="btn-secondary px-2.5" onClick={() => setMes((m) => somarMes(m, 1))} aria-label="Próximo mês" title="Próximo mês">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <div className="relative min-w-56 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-10" placeholder="Buscar cliente, código ou CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <Select
                value={filtro}
                onChange={setFiltro}
                vazio="Todas as situações"
                opcoes={[
                  { value: 'aberto', label: 'Em aberto' },
                  ...(Object.keys(SITUACOES) as Situacao[]).map((s) => ({ value: s, label: SITUACOES[s].label })),
                  { value: 'ajustado', label: 'Valor ajustado no mês' },
                ]}
                className="input w-auto"
              />
              <button className="btn-primary from-emerald-500 to-emerald-600 shadow-emerald-500/20" onClick={exportarMes} disabled={!linhas.length}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.r} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
                  <div className="text-sm font-medium text-slate-500">{k.r}</div>
                  <div className={`mt-2 truncate text-lg font-extrabold tabular-nums sm:text-2xl ${k.cor ?? 'text-slate-900'}`}>{k.v}</div>
                  {k.barra && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  )}
                  <div className="mt-1 text-xs text-slate-500">{k.d}</div>
                </div>
              ))}
            </div>

            {porParceiro.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {porParceiro.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setVerParceiro(g.id)}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-violet-200 transition hover:ring-violet-400"
                  >
                    <Handshake className="h-5 w-5 text-violet-600" />
                    <span>
                      <span className="block text-sm font-bold text-violet-800">Mensalidades - {g.nome}</span>
                      <span className="block text-xs text-slate-500">
                        {g.linhas.length} cliente(s) · {valorTexto(g.total)}
                        {g.aberto > 0 ? ` · em aberto ${valorTexto(g.aberto)}` : ' · recebido'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {semHonorario.length > 0 && (
              <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{semHonorario.length} cliente(s) ativo(s) sem honorário cadastrado</b> e por isso fora do controle. Cadastre o honorário no Expandir da
                    Base de Clientes.
                  </span>
                  <div className="flex gap-2">
                    <button className="btn-secondary btn-sm" onClick={() => setVerSemHonorario((x) => !x)}>
                      {verSemHonorario ? 'Ocultar lista' : 'Ver lista'}
                    </button>
                    <Link para="/administrativo/clientes" className="btn-secondary btn-sm">
                      Abrir Base de Clientes
                    </Link>
                  </div>
                </div>
                {verSemHonorario && (
                  <ul className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                    {semHonorario.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className="font-mono text-rose-400">{String(c.codigo).padStart(3, '0')}</span>{' '}
                          <span className="font-semibold">{c.razao_social}</span>
                          {c.status === 'pendente' && <span className="text-rose-500"> · contrato pendente</span>}
                        </span>
                        <button
                          className="shrink-0 cursor-pointer rounded-md bg-white px-2 py-0.5 text-[0.6875rem] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                          onClick={() => confirmarSem(c, true)}
                        >
                          Não terá honorário
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {confirmadosSem.length > 0 && (
              <details className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200/70">
                <summary className="cursor-pointer font-semibold">{confirmadosSem.length} cliente(s) com “sem honorário” confirmado</summary>
                <ul className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  {confirmadosSem.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">
                        <span className="font-mono text-slate-400">{String(c.codigo).padStart(3, '0')}</span> {c.razao_social}
                        {c.sem_honorario_motivo && <span className="text-slate-400"> · {c.sem_honorario_motivo}</span>}
                      </span>
                      <button
                        className="shrink-0 cursor-pointer text-[0.6875rem] font-semibold text-brand-600 hover:underline"
                        onClick={() => confirmarSem(c, false)}
                      >
                        Desfazer
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {selecionadas.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
                <span>
                  {selecionadas.length} selecionado(s) · {valorTexto(selecionadas.reduce((s, l) => s + l.valor, 0))}
                </span>
                <div className="flex gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => setSelecao(new Set())}>
                    Limpar
                  </button>
                  <button className="btn-primary btn-sm from-emerald-500 to-emerald-600" onClick={() => setRecebendo(selecionadas)}>
                    <Wallet className="h-3.5 w-3.5" />
                    Marcar como recebidos
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <div className="max-h-[calc(100vh-16rem)] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                    <tr className="border-b border-slate-100">
                      <th className="w-10 py-3 pl-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          aria-label="Selecionar todos em aberto"
                          checked={!!linhas.length && linhas.filter((l) => l.aberto > 0 && !l.mensal?.recebido_em).every((l) => selecao.has(l.cliente.id))}
                          onChange={(e) =>
                            setSelecao(
                              e.target.checked ? new Set(linhas.filter((l) => l.aberto > 0 && !l.mensal?.recebido_em).map((l) => l.cliente.id)) : new Set(),
                            )
                          }
                        />
                      </th>
                      <th className="px-2 py-3">Cliente</th>
                      <th className="px-2 py-3 text-right">Honorário</th>
                      <th className="px-2 py-3">Vencimento</th>
                      <th className="px-2 py-3">Situação</th>
                      <th className="px-2 py-3">Recebimento</th>
                      <th className="py-3 pr-4 pl-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linhas.map((l) => {
                      const podeMarcar = l.aberto > 0 && !l.mensal?.recebido_em
                      return (
                        <tr key={l.cliente.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 pl-4">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-emerald-600"
                              disabled={!podeMarcar}
                              checked={selecao.has(l.cliente.id) && podeMarcar}
                              onChange={(e) =>
                                setSelecao((s) => {
                                  const n = new Set(s)
                                  if (e.target.checked) n.add(l.cliente.id)
                                  else n.delete(l.cliente.id)
                                  return n
                                })
                              }
                              aria-label={`Selecionar ${l.cliente.razao_social}`}
                            />
                          </td>
                          <td className="px-2 py-2.5">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-xs text-slate-400">{String(l.cliente.codigo).padStart(3, '0')}</span>
                              <span className="font-semibold text-slate-800">{l.cliente.razao_social}</span>
                            </div>
                            {l.parceiro && (
                              <span className="mt-0.5 ml-9 inline-block rounded-full bg-violet-50 px-2 py-0.5 text-[0.6875rem] font-semibold text-violet-700 ring-1 ring-violet-200">
                                Responsabilidade do parceiro {l.parceiro.nome} · {l.parceiro.parcela}/{l.parceiro.total}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <span className={`font-bold tabular-nums ${l.ajustado ? 'text-violet-700' : 'text-slate-800'}`}>{valorTexto(l.valor)}</span>
                              <button
                                className="icon-btn h-7 w-7"
                                onClick={() => setAjustando(l)}
                                title="Alterar o valor deste mês"
                                aria-label={`Alterar valor de ${l.cliente.razao_social}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {l.ajustado && (
                              <div className="text-[0.6875rem] text-violet-600" title={l.mensal?.motivo_ajuste ?? ''}>
                                base {l.base !== null ? valorTexto(l.base) : '—'} · {l.mensal?.motivo_ajuste}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2.5 whitespace-nowrap text-slate-600">
                            <button
                              className="group inline-flex cursor-pointer items-center gap-1 rounded-md px-1 hover:bg-slate-100"
                              onClick={() => setVencendo(l)}
                              title="Alterar o dia de vencimento deste cliente"
                            >
                              {formatarData(l.vencimento)}
                              <Pencil className="h-3 w-3 text-slate-300 group-hover:text-slate-500" />
                            </button>
                          </td>
                          <td className="px-2 py-2.5">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${SITUACOES[l.situacao].pill}`}
                            >
                              {SITUACOES[l.situacao].label}
                            </span>
                          </td>
                          <td className="px-2 py-2.5 text-xs whitespace-nowrap text-slate-600">
                            {l.mensal?.recebido_em ? (
                              <>
                                <b className="text-slate-800">{formatarData(l.mensal.recebido_em)}</b> · {valorTexto(l.recebido)}
                                {l.aberto > 0 && <div className="text-orange-700">falta {valorTexto(l.aberto)}</div>}
                                <div className="text-slate-400">{l.mensal.origem === 'extrato' ? 'pelo extrato' : 'manual'}</div>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="py-2.5 pr-4 pl-2 text-right whitespace-nowrap">
                            {l.mensal?.recebido_em ? (
                              <button className="btn-secondary btn-sm" onClick={() => desfazer(l)} title="Desfazer recebimento">
                                <Undo2 className="h-3.5 w-3.5" />
                                Desfazer
                              </button>
                            ) : l.valor > 0 ? (
                              <button className="btn-primary btn-sm from-emerald-500 to-emerald-600" onClick={() => setRecebendo([l])}>
                                <Wallet className="h-3.5 w-3.5" />
                                Recebido
                              </button>
                            ) : null}
                            <button
                              className="icon-btn ml-1 h-7 w-7 align-middle"
                              onClick={() => setPeriodosAbertos({ cliente: l.cliente.id })}
                              title="Período pago pelo parceiro"
                              aria-label={`Período pago pelo parceiro de ${l.cliente.razao_social}`}
                            >
                              <Handshake className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {!linhas.length && <p className="p-10 text-center text-sm text-slate-400">Nenhum honorário encontrado.</p>}
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {linhas.length} de {doMes.length} cliente(s) · {nomeMes(mes)}
                </span>
                <span>Clientes inativos não entram no controle. Use o lápis para alterar o valor de um mês (serviço extra, negociação).</span>
              </div>
            </div>
          </>
        ) : aba === 'inadimplentes' ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
              <div>
                <div className="text-sm font-medium text-slate-500">Total em atraso (desde {nomeMes(inicio)})</div>
                <div className="mt-1 text-2xl font-extrabold text-rose-600 tabular-nums">{valorTexto(totalInad)}</div>
                <div className="text-xs text-slate-500">{listaInad.length} cliente(s) com honorário vencido e não recebido</div>
              </div>
              <button className="btn-primary from-emerald-500 to-emerald-600" onClick={exportarInad} disabled={!listaInad.length}>
                <FileSpreadsheet className="h-4 w-4" />
                Excel
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                    <tr className="border-b border-slate-100">
                      <th className="py-3 pr-2 pl-5">Cliente</th>
                      <th className="px-2 py-3">Responsável legal</th>
                      <th className="px-2 py-3">Meses em atraso</th>
                      <th className="px-2 py-3">Mais antigo</th>
                      <th className="px-2 py-3 text-right">Dias</th>
                      <th className="py-3 pr-5 pl-2 text-right">Total em aberto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {listaInad.map((i) => (
                      <tr key={i.cliente.id}>
                        <td className="py-2.5 pr-2 pl-5">
                          <span className="font-mono text-xs text-slate-400">{String(i.cliente.codigo).padStart(3, '0')}</span>{' '}
                          <span className="font-semibold text-slate-800">{i.cliente.razao_social}</span>
                        </td>
                        <td className="px-2 py-2.5 text-xs text-slate-600">{i.cliente.responsavel ?? '—'}</td>
                        <td className="px-2 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {i.linhas.map((l) => (
                              <button
                                key={l.competencia}
                                className="cursor-pointer rounded-md bg-rose-50 px-1.5 py-0.5 text-[0.6875rem] font-semibold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100"
                                title="Marcar como recebido"
                                onClick={() => setRecebendo([l])}
                              >
                                {mesCurto(l.competencia)} · {valorTexto(l.aberto)}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-2.5 whitespace-nowrap text-slate-600">{formatarData(i.maisAntigo)}</td>
                        <td className={`px-2 py-2.5 text-right font-semibold tabular-nums ${i.diasAtraso > 30 ? 'text-rose-600' : 'text-amber-700'}`}>
                          {i.diasAtraso}
                        </td>
                        <td className="py-2.5 pr-5 pl-2 text-right font-bold whitespace-nowrap text-rose-600 tabular-nums">{valorTexto(i.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!listaInad.length && <p className="p-10 text-center text-sm text-slate-400">Nenhum cliente inadimplente. 🎉</p>}
              </div>
            </div>
            {parceirosAtraso.length > 0 && (
              <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-violet-200">
                <h3 className="text-sm font-bold text-violet-800">Mensalidades de parceiros em atraso</h3>
                <p className="text-xs text-slate-500">Meses em que o parceiro é o responsável pela mensalidade (não entram na lista dos clientes acima).</p>
                <ul className="mt-2 divide-y divide-slate-100 text-sm">
                  {parceirosAtraso.map((g) => (
                    <li key={g.nome} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="font-semibold text-slate-800">{g.nome}</span>
                      <span className="text-xs text-slate-500">
                        {[...new Set(g.linhas.map((l) => mesCurto(l.competencia)))].join(', ')} · {g.linhas.length} mensalidade(s)
                      </span>
                      <span className="font-bold text-rose-600 tabular-nums">{valorTexto(g.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold text-slate-800">Evolução mensal dos honorários</h2>
                <Legenda series={SERIES} />
              </div>
              <BarrasAgrupadas
                grupos={evolucao.map((e) => ({
                  rotulo: mesCurto(e.competencia),
                  valores: { previsto: e.previsto, recebido: e.recebido },
                  extra: { recebido: e.previsto ? `${Math.round((e.recebido / e.previsto) * 100)}% do total` : '' },
                }))}
                series={SERIES}
                formatar={valorTexto}
                aoClicar={(i) => {
                  setMes(evolucao[i].competencia)
                  setAba('mes')
                }}
              />
              <p className="mt-2 text-xs text-slate-500">Por competência, desde o início do controle. Clique numa barra para ver o mês.</p>
            </div>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <table className="w-full text-sm">
                <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr className="border-b border-slate-100">
                    <th className="py-3 pr-2 pl-5">Competência</th>
                    <th className="px-2 py-3 text-right">Honorário total</th>
                    <th className="px-2 py-3 text-right">Recebido</th>
                    <th className="px-2 py-3 text-right">Diferença</th>
                    <th className="py-3 pr-5 pl-2 text-right">% recebido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...evolucao].reverse().map((e) => (
                    <tr key={e.competencia}>
                      <td className="py-2.5 pr-2 pl-5 font-semibold text-slate-700">{nomeMes(e.competencia).replace(/^./, (c) => c.toUpperCase())}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{valorTexto(e.previsto)}</td>
                      <td className="px-2 py-2.5 text-right text-emerald-700 tabular-nums">{valorTexto(e.recebido)}</td>
                      <td className={`px-2 py-2.5 text-right tabular-nums ${e.aberto > 0 ? 'text-rose-600' : 'text-slate-500'}`}>{valorTexto(e.aberto)}</td>
                      <td className="py-2.5 pr-5 pl-2 text-right font-semibold tabular-nums">
                        {e.previsto ? `${Math.round((e.recebido / e.previsto) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {verParceiro && porParceiro.find((g) => g.id === verParceiro) && (
        <MensalidadesParceiro
          nome={porParceiro.find((g) => g.id === verParceiro)!.nome}
          mes={mes}
          linhas={porParceiro.find((g) => g.id === verParceiro)!.linhas}
          onClose={() => setVerParceiro(null)}
          onReceber={(ls) => setRecebendo(ls)}
        />
      )}
      {recebendo && (
        <MarcarRecebido
          linhas={recebendo}
          onClose={() => setRecebendo(null)}
          onSalvo={() => {
            setRecebendo(null)
            setSelecao(new Set())
            carregar()
          }}
        />
      )}
      {ajustando && (
        <AjustarValor
          linha={ajustando}
          onClose={() => setAjustando(null)}
          onSalvo={() => {
            setAjustando(null)
            carregar()
          }}
        />
      )}
      {periodosAbertos && (
        <PeriodosParceiro
          clientes={clientes}
          parceiros={parceiros}
          periodos={periodos}
          clienteInicial={periodosAbertos.cliente}
          onClose={() => setPeriodosAbertos(null)}
          onSalvo={carregar}
        />
      )}
      {vencendo && (
        <AlterarVencimento
          linha={vencendo}
          onClose={() => setVencendo(null)}
          onSalvo={() => {
            setVencendo(null)
            carregar()
          }}
        />
      )}
      {reajustando && (
        <ReajusteMassa
          clientes={clientes}
          hons={hons}
          onClose={() => setReajustando(false)}
          onSalvo={() => {
            setReajustando(false)
            carregar()
          }}
        />
      )}
      {importando && (
        <ImportarExtrato
          abertos={abertos}
          usados={usados}
          clientes={clientes}
          comHonorario={new Set(hons.map((h) => h.cliente_id))}
          tarifaBoleto={Number(cfg.tarifa_boleto ?? 0)}
          onClose={() => setImportando(false)}
          onSalvo={carregar}
        />
      )}
      {configurando && (
        <ConfigHonorarios
          cfg={cfg}
          onClose={() => setConfigurando(false)}
          onSalvo={() => {
            setConfigurando(false)
            carregar()
          }}
        />
      )}
    </div>
  )
}
