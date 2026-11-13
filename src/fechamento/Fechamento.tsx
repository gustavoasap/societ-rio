import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  FileUp,
  FolderOpen,
  House,
  LayoutGrid,
  LogOut,
  Pencil,
  Plus,
  Search,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/rotas'
import { comRetentativa } from '../lib/retentar'
import { baixarArquivo, gerarXlsx, TIPO_XLSX, type ValorCelula } from '../lib/planilha'
import { CampoMes } from '../components/CampoData'
import { formatarData } from '../lib/format'
import { Select } from '../components/ui'
import { ObrigacaoForm } from './ObrigacaoForm'
import { ImportarMarcacoes } from './ImportarMarcacoes'
import { gerarXlsxTexto } from '../lib/planilhaSimples'
import { CABECALHO_CONTA_AZUL, LARGURAS_CONTA_AZUL, linhaContaAzul, type ClienteContaAzul } from './contaAzul'
import {
  NOME_DEPARTAMENTO,
  TITULO_CONTROLE,
  SLUG_DEPARTAMENTO,
  TERMO,
  SUGESTOES,
  COMP_UNICA,
  chave,
  competenciaAtual,
  competenciaDe,
  competenciaStatus,
  corDe,
  empresaNoAno,
  empresaNoMes,
  obrigacaoNaGeral,
  obrigacaoNoMes,
  opcaoAtual,
  textoMeses,
  type Departamento,
  type EmpresaFech,
  type Obrigacao,
  type StatusFech,
} from './tipos'

const somarMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
const formatarCnpj = (c: string | null) => (c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c ?? ''))

export function Fechamento({ session, departamento }: { session: Session; departamento: Departamento }) {
  const [visao, setVisao] = useState<'mes' | 'geral'>('mes')
  const [mes, setMes] = useState(competenciaAtual)
  const [ano, setAno] = useState(() => competenciaAtual().slice(0, 4))
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([])
  const [empresas, setEmpresas] = useState<EmpresaFech[]>([])
  const [status, setStatus] = useState<Map<string, string>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [marcandoPlanilha, setMarcandoPlanilha] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState<{ obrigacao: Obrigacao | null; nome?: string } | null>(null)

  const carregarBase = useCallback(async () => {
    const [o, e] = await comRetentativa(() =>
      Promise.all([
        supabase.from('fech_obrigacoes').select('*').eq('departamento', departamento).order('ordem').order('created_at'),
        supabase.rpc('fech_empresas', { p_departamento: departamento }),
      ]),
    )
    const falha = o.error ?? e.error
    if (falha) setErro(falha.message)
    const lista = (o.data as Obrigacao[]) ?? []
    setObrigacoes(lista)
    setEmpresas((e.data as EmpresaFech[]) ?? [])
    return lista
  }, [departamento])

  // Referência das marcações: competência (visão por mês) ou ano (visão geral)
  const ref = visao === 'mes' ? mes : `${ano}-01`
  const comps = useMemo(() => (visao === 'mes' ? [competenciaDe(mes), `${mes.slice(0, 4)}-01-01`] : [COMP_UNICA, `${ano}-01-01`]), [visao, mes, ano])

  const carregarMes = useCallback(async () => {
    const [{ data, error }] = await comRetentativa(() =>
      Promise.all([supabase.from('fech_status').select('obrigacao_id, cliente_id, competencia, valor').in('competencia', comps)]),
    )
    if (error) setErro(error.message)
    setStatus(new Map(((data as StatusFech[]) ?? []).map((s) => [chave(s.obrigacao_id, s.cliente_id, s.competencia), s.valor])))
  }, [comps])

  useEffect(() => {
    carregarBase()
      .then((lista) => {
        // Sem obrigações mensais, abre direto na visão geral
        if (lista.length && !lista.some((o) => o.periodicidade === 'mensal')) setVisao('geral')
      })
      .finally(() => setCarregando(false))
  }, [carregarBase])

  useEffect(() => {
    carregarMes()
  }, [carregarMes])

  const colunas = useMemo(() => obrigacoes.filter((o) => (visao === 'mes' ? obrigacaoNoMes(o, mes) : obrigacaoNaGeral(o, ano))), [obrigacoes, visao, mes, ano])
  const doMes = useMemo(() => empresas.filter((e) => (visao === 'mes' ? empresaNoMes(e, mes) : empresaNoAno(e, ano))), [empresas, visao, mes, ano])

  const valor = useCallback((o: Obrigacao, clienteId: string) => status.get(chave(o.id, clienteId, competenciaStatus(o, ref))), [status, ref])
  const feito = useCallback((o: Obrigacao, clienteId: string) => opcaoAtual(o, valor(o, clienteId)).concluido, [valor])

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const dig = t.replace(/\D/g, '')
    return doMes.filter((e) => {
      const feitas = colunas.filter((o) => feito(o, e.id)).length
      if (filtro === 'pendentes' && colunas.length && feitas === colunas.length) return false
      if (filtro === 'concluidas' && (!colunas.length || feitas < colunas.length)) return false
      if (!t) return true
      return e.razao_social.toLowerCase().includes(t) || String(e.codigo).padStart(3, '0').includes(t) || (dig.length >= 3 && (e.cnpj ?? '').includes(dig))
    })
  }, [doMes, colunas, busca, filtro, feito])

  const totalCelulas = doMes.length * colunas.length
  const totalFeito = useMemo(() => doMes.reduce((s, e) => s + colunas.filter((o) => feito(o, e.id)).length, 0), [doMes, colunas, feito])
  const empresasCompletas = useMemo(() => (colunas.length ? doMes.filter((e) => colunas.every((o) => feito(o, e.id))).length : 0), [doMes, colunas, feito])

  async function marcar(o: Obrigacao, e: EmpresaFech, novo: string) {
    const competencia = competenciaStatus(o, ref)
    const k = chave(o.id, e.id, competencia)
    const antes = status.get(k)
    setStatus((m) => new Map(m).set(k, novo))
    const { error } = await supabase
      .from('fech_status')
      .upsert(
        { obrigacao_id: o.id, cliente_id: e.id, competencia, valor: novo, atualizado_em: new Date().toISOString() },
        { onConflict: 'obrigacao_id,cliente_id,competencia' },
      )
    if (error) {
      setErro(error.message)
      setStatus((m) => {
        const n = new Map(m)
        if (antes === undefined) n.delete(k)
        else n.set(k, antes)
        return n
      })
    }
  }

  async function moverColuna(o: Obrigacao, direcao: number) {
    const lista = [...obrigacoes]
    const i = lista.findIndex((x) => x.id === o.id)
    const j = i + direcao
    if (j < 0 || j >= lista.length) return
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
    const reordenada = lista.map((x, idx) => ({ ...x, ordem: idx }))
    setObrigacoes(reordenada)
    const r = await Promise.all(reordenada.map((x) => supabase.from('fech_obrigacoes').update({ ordem: x.ordem }).eq('id', x.id)))
    const falha = r.find((x) => x.error)
    if (falha?.error) setErro(falha.error.message)
  }

  const obContaAzul = obrigacoes.find((o) => /conta\s*azul/i.test(o.nome))

  /** Planilha de importação do Conta Azul com as empresas ainda pendentes em "Conta Azul" (dados da Base de Clientes). */
  async function exportarContaAzul() {
    if (!obContaAzul) return
    setErro(null)
    const comp = competenciaStatus(obContaAzul, ref)
    const { data: st, error: e1 } = await supabase.from('fech_status').select('cliente_id, valor').eq('obrigacao_id', obContaAzul.id).eq('competencia', comp)
    if (e1) return setErro(e1.message)
    const marcados = new Map(((st as { cliente_id: string; valor: string }[]) ?? []).map((x) => [x.cliente_id, x.valor]))
    const pendente = obContaAzul.opcoes[0]?.id
    const ids = doMes.filter((e) => opcaoAtual(obContaAzul, marcados.get(e.id)).id === pendente).map((e) => e.id)
    if (!ids.length) return setErro('Nenhuma empresa pendente no Conta Azul.')
    const dados: ClienteContaAzul[] = []
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase
        .from('adm_clientes')
        .select('codigo, razao_social, cnpj, email, telefone, endereco, inscricao, tipo_inscricao, data_abertura')
        .in('id', ids.slice(i, i + 150))
      if (error) return setErro(error.message)
      dados.push(...((data as ClienteContaAzul[]) ?? []))
    }
    const d = new Date()
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const linhasCa = dados.sort((a, b) => a.razao_social.localeCompare(b.razao_social)).map((c) => linhaContaAzul(c, hoje))
    const arq = gerarXlsxTexto(`pessoas-clientes-${hoje}`, CABECALHO_CONTA_AZUL, linhasCa, LARGURAS_CONTA_AZUL)
    baixarArquivo(`pessoas-clientes-${hoje}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  function exportar() {
    const cab = [
      { titulo: 'Cód.', largura: 7 },
      { titulo: 'Razão social', largura: 42 },
      { titulo: 'CNPJ', largura: 20 },
      { titulo: 'Responsável legal', largura: 32 },
      { titulo: 'Data de abertura', largura: 14 },
      { titulo: 'Pasta no Drive', largura: 30 },
      ...colunas.map((o) => ({ titulo: o.nome, largura: Math.max(14, o.nome.length + 2) })),
      { titulo: 'Concluídas', largura: 12 },
    ]
    const dados: ValorCelula[][] = linhas.map((e) => [
      String(e.codigo).padStart(3, '0'),
      e.razao_social,
      formatarCnpj(e.cnpj),
      e.responsavel ?? '',
      e.data_abertura ? { valor: formatarData(e.data_abertura), destaque: 'negrito' as const } : '',
      e.link_drive ?? '',
      ...colunas.map((o) => {
        const op = opcaoAtual(o, valor(o, e.id))
        return op.concluido ? { valor: op.label, destaque: 'negrito' as const } : op.label
      }),
      `${colunas.filter((o) => feito(o, e.id)).length}/${colunas.length}`,
    ])
    const periodo = visao === 'mes' ? mes : `geral-${ano}`
    const arq = gerarXlsx({ aba: visao === 'mes' ? `Competência ${mes}` : `Visão geral ${ano}`, colunas: cab, linhas: dados })
    baixarArquivo(`controle-${departamento}-${periodo}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  const nomeDep = NOME_DEPARTAMENTO[departamento]
  const termo = TERMO[departamento]
  const Termos = termo.uns.charAt(0).toUpperCase() + termo.uns.slice(1)
  const rotulo = visao === 'mes' ? `competência ${nomeMes(mes)}` : ano
  const pct = totalCelulas ? Math.round((totalFeito / totalCelulas) * 100) : 0

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
              <Link para={`/d/${SLUG_DEPARTAMENTO[departamento]}`} className="hover:underline">
                {nomeDep}
              </Link>{' '}
              · {TITULO_CONTROLE[departamento]}
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{TITULO_CONTROLE[departamento]}</h1>
            <p className="mt-1 text-sm text-white/60">
              {departamento === 'cadastros'
                ? 'Cadastro de cada empresa ativa da Base de Clientes nos sistemas do escritório. Visível só para os sócios.'
                : `${nomeDep}: ${termo.uns} por competência de cada empresa ativa da Base de Clientes.`}
            </p>
          </div>
          <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando({ obrigacao: null })}>
            <Plus className="h-4 w-4" />
            {termo.novo}
          </button>
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

        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Visão">
            {(
              [
                { v: 'mes', l: 'Por competência', i: CalendarRange },
                { v: 'geral', l: 'Visão geral', i: LayoutGrid },
              ] as const
            ).map(({ v, l, i: Icone }) => (
              <button
                key={v}
                role="tab"
                aria-selected={visao === v}
                onClick={() => setVisao(v)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${visao === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icone className="h-4 w-4" />
                {l}
              </button>
            ))}
          </div>
          {visao === 'mes' ? (
            <div className="flex items-center gap-1">
              <span className="mr-1 hidden text-xs font-semibold text-slate-500 sm:inline">Competência</span>
              <button
                className="btn-secondary px-2.5"
                onClick={() => setMes((m) => somarMes(m, -1))}
                title="Competência anterior"
                aria-label="Competência anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <CampoMes value={mes} onChange={setMes} />
              <button
                className="btn-secondary px-2.5"
                onClick={() => setMes((m) => somarMes(m, 1))}
                title="Próxima competência"
                aria-label="Próxima competência"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className="mr-1 hidden text-xs font-semibold text-slate-500 sm:inline">Ano</span>
              <button className="btn-secondary px-2.5" onClick={() => setAno((a) => String(Number(a) - 1))} title="Ano anterior" aria-label="Ano anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-14 text-center text-sm font-bold text-slate-700 tabular-nums">{ano}</span>
              <button className="btn-secondary px-2.5" onClick={() => setAno((a) => String(Number(a) + 1))} title="Próximo ano" aria-label="Próximo ano">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="busca-fechamento"
              className="input pl-10"
              placeholder="Buscar empresa, código ou CNPJ"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select
            value={filtro}
            onChange={setFiltro}
            opcoes={[
              { value: 'pendentes', label: 'Com pendências' },
              { value: 'concluidas', label: 'Tudo concluído' },
            ]}
            vazio="Todas as empresas"
            className="input w-auto"
          />
          <button className="btn-primary from-emerald-500 to-emerald-600 shadow-emerald-500/20" onClick={exportar} disabled={!linhas.length || !colunas.length}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </button>
          <button
            className="btn-secondary"
            onClick={() => setMarcandoPlanilha(true)}
            disabled={!obrigacoes.length}
            title="Marcar empresas pelo CNPJ de uma planilha"
          >
            <FileUp className="h-4 w-4" />
            Marcar por planilha
          </button>
          {departamento === 'cadastros' && (
            <button
              className="btn-secondary"
              onClick={exportarContaAzul}
              disabled={!obContaAzul}
              title={
                obContaAzul ? `Empresas pendentes em “${obContaAzul.nome}”, no modelo de importação do Conta Azul` : 'Crie o sistema “Conta Azul” para usar'
              }
            >
              <FileSpreadsheet className="h-4 w-4 text-sky-600" />
              Exportar planilha - Conta Azul
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { r: visao === 'mes' ? 'Empresas na competência' : 'Empresas no ano', v: String(doMes.length), d: `ativas em ${rotulo}` },
            { r: Termos, v: String(colunas.length), d: visao === 'mes' ? 'mensais e anuais em entrega' : 'únicas e anuais' },
            { r: 'Progresso geral', v: `${pct}%`, d: `${totalFeito} de ${totalCelulas} concluídas`, barra: true },
            {
              r: 'Empresas fechadas',
              v: String(empresasCompletas),
              d: `com tod${termo.artigo}s ${termo.artigo === 'a' ? 'as' : 'os'} ${termo.uns} concluíd${termo.artigo}s`,
            },
          ].map((k) => (
            <div key={k.r} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
              <div className="text-sm font-medium text-slate-500">{k.r}</div>
              <div className="mt-2 text-lg font-extrabold text-slate-900 tabular-nums sm:text-2xl">{k.v}</div>
              {k.barra && (
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="mt-1 text-xs text-slate-500">{k.d}</div>
            </div>
          ))}
        </div>

        {carregando ? (
          <p className="p-10 text-center text-sm text-slate-400">Carregando...</p>
        ) : !colunas.length ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200/70">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 text-lg font-bold text-slate-800">
              {obrigacoes.length
                ? visao === 'mes'
                  ? `Nenhum${termo.artigo === 'a' ? 'a' : ''} ${termo.um} mensal ou anual em entrega na competência ${nomeMes(mes)}`
                  : `Nenhum${termo.artigo === 'a' ? 'a' : ''} ${termo.um} únic${termo.artigo} ou anual em ${ano}`
                : `Crie ${termo.artigo}s ${termo.uns} do controle`}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {obrigacoes.length
                ? visao === 'mes'
                  ? `${Termos} únic${termo.artigo}s ficam na Visão geral.`
                  : `${Termos} mensais ficam na visão Por competência.`
                : `Cada ${termo.um} vira uma coluna, com uma caixa de seleção para cada empresa.`}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGESTOES[departamento]
                .filter((s) => !obrigacoes.some((o) => o.nome.toLowerCase() === s.toLowerCase()))
                .map((s) => (
                  <button key={s} className="btn-secondary btn-sm" onClick={() => setEditando({ obrigacao: null, nome: s })}>
                    <Sparkles className="h-3.5 w-3.5 text-brand-500" />
                    {s}
                  </button>
                ))}
              <button className="btn-primary btn-sm" onClick={() => setEditando({ obrigacao: null })}>
                <Plus className="h-3.5 w-3.5" />
                {termo.artigo === 'a' ? 'Outra' : 'Outro'} {termo.um}
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <div className="max-h-[calc(100vh-16rem)] overflow-auto">
              <table className="w-full border-separate border-spacing-0 text-[0.8125rem]">
                <thead className="sticky top-0 z-20 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="sticky left-0 z-30 min-w-64 border-b border-slate-100 bg-white py-3 pr-3 pl-5">Razão social</th>
                    <th className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">CNPJ</th>
                    <th className="min-w-44 border-b border-slate-100 px-3 py-3">Responsável legal</th>
                    <th className="border-b border-slate-100 px-3 py-3 whitespace-nowrap">Data de abertura</th>
                    {colunas.map((o) => {
                      const feitas = doMes.filter((e) => feito(o, e.id)).length
                      const idx = obrigacoes.findIndex((x) => x.id === o.id)
                      return (
                        <th key={o.id} className="group min-w-40 border-b border-slate-100 px-2 py-2 align-bottom">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-[0.75rem] leading-tight font-bold tracking-normal text-slate-700 normal-case">
                              {o.nome}
                              {o.periodicidade !== 'mensal' && (
                                <span className="mt-0.5 block text-[0.625rem] font-semibold text-slate-400">
                                  {o.periodicidade === 'unica' ? 'Única' : `Anual · entrega ${textoMeses(o.meses_entrega)}`}
                                </span>
                              )}
                            </span>
                            <span className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                              <button
                                className="icon-btn h-6 w-6"
                                disabled={idx === 0}
                                onClick={() => moverColuna(o, -1)}
                                title="Mover para a esquerda"
                                aria-label="Mover para a esquerda"
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="icon-btn h-6 w-6"
                                disabled={idx === obrigacoes.length - 1}
                                onClick={() => moverColuna(o, 1)}
                                title="Mover para a direita"
                                aria-label="Mover para a direita"
                              >
                                <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                              <button
                                className="icon-btn h-6 w-6"
                                onClick={() => setEditando({ obrigacao: o })}
                                title={`Editar ${termo.um}`}
                                aria-label={`Editar ${o.nome}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 font-semibold tracking-normal normal-case">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${doMes.length ? (feitas / doMes.length) * 100 : 0}%` }} />
                            </div>
                            <span className="text-slate-500 tabular-nums">
                              {feitas}/{doMes.length}
                            </span>
                          </div>
                        </th>
                      )
                    })}
                    <th className="min-w-24 border-b border-slate-100 py-3 pr-5 pl-2 text-right">Concluídas</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((e) => {
                    const feitas = colunas.filter((o) => feito(o, e.id)).length
                    const completa = feitas === colunas.length
                    return (
                      <tr key={e.id} className={`group/linha ${completa ? 'bg-emerald-50/40' : 'hover:bg-slate-50/70'}`}>
                        <td
                          className={`sticky left-0 z-10 border-b border-slate-100 py-2 pr-3 pl-5 ${completa ? 'bg-emerald-50' : 'bg-white group-hover/linha:bg-slate-50'}`}
                        >
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-xs text-slate-400 tabular-nums">{String(e.codigo).padStart(3, '0')}</span>
                            <span className="leading-tight font-semibold text-slate-800">{e.razao_social}</span>
                            {e.link_drive && (
                              <a
                                href={e.link_drive}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="shrink-0 self-center text-sky-600 hover:text-sky-800"
                                title="Abrir pasta no Google Drive"
                                aria-label={`Pasta no Drive de ${e.razao_social}`}
                              >
                                <FolderOpen className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs whitespace-nowrap text-slate-600">
                          {formatarCnpj(e.cnpj) || '—'}
                        </td>
                        <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-700">{e.responsavel || '—'}</td>
                        <td className="border-b border-slate-100 px-3 py-2 font-bold whitespace-nowrap text-slate-800 tabular-nums">
                          {e.data_abertura ? formatarData(e.data_abertura) : '—'}
                        </td>
                        {colunas.map((o) => {
                          const op = opcaoAtual(o, valor(o, e.id))
                          return (
                            <td key={o.id} className="border-b border-slate-100 px-2 py-2">
                              <Select
                                value={op.id}
                                onChange={(v) => marcar(o, e, v)}
                                opcoes={o.opcoes.map((x) => ({ value: x.id, label: x.label }))}
                                className={`w-full rounded-lg border py-1.5 pl-2.5 text-xs font-semibold outline-none ${corDe(op.cor).pill}`}
                              />
                            </td>
                          )
                        })}
                        <td className="border-b border-slate-100 py-2 pr-5 pl-2 text-right whitespace-nowrap">
                          <span className={`text-xs font-bold tabular-nums ${completa ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {feitas}/{colunas.length}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!linhas.length && <p className="p-10 text-center text-sm text-slate-400">Nenhuma empresa encontrada.</p>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
              <span>
                {linhas.length} de {doMes.length} empresa(s) · {rotulo}
              </span>
              <span>
                Passe o mouse sobre o nome d{termo.artigo} {termo.um} para editar ou mudar a coluna de lugar.
              </span>
            </div>
          </div>
        )}
      </main>

      {marcandoPlanilha && (
        <ImportarMarcacoes
          obrigacoes={obrigacoes}
          empresas={empresas}
          referencia={ref}
          onClose={() => setMarcandoPlanilha(false)}
          onSalvo={() => carregarMes()}
        />
      )}
      {editando && (
        <ObrigacaoForm
          departamento={departamento}
          obrigacao={editando.obrigacao}
          nomeSugerido={editando.nome}
          proximaOrdem={obrigacoes.length ? Math.max(...obrigacoes.map((o) => o.ordem)) + 1 : 0}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregarBase()
            carregarMes()
          }}
        />
      )}
    </div>
  )
}

export const FechamentoContabil = ({ session }: { session: Session }) => <Fechamento session={session} departamento="contabil" />
export const FechamentoFiscal = ({ session }: { session: Session }) => <Fechamento session={session} departamento="fiscal" />
export const FechamentoPessoal = ({ session }: { session: Session }) => <Fechamento session={session} departamento="pessoal" />
export const FechamentoSocietario = ({ session }: { session: Session }) => <Fechamento session={session} departamento="societario" />
export const ControleCadastros = ({ session }: { session: Session }) => <Fechamento session={session} departamento="cadastros" />
