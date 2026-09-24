import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  Barcode,
  BookOpen,
  Calculator,
  CalendarRange,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  HandCoins,
  LayoutDashboard,
  Loader2,
  MapPinned,
  Pencil,
  Percent,
  Scale,
  Settings2,
  Table2,
  Tags,
  Upload,
  Users,
} from 'lucide-react'
import { mascaraCnpj } from '../../lib/format'
import { apurar, type Contexto } from '../engine/apuracao'
import { estimarMix, linhaConsiderada, montarBases, naturezaDe, receitaDaBase, type DadosEstab } from '../engine/base'
import { projetar } from '../engine/projecao'
import { ICMS_INTERNO_UF } from '../engine/tabelas'
import { comPadrao, type Parametros as P, type MovimentoLinha, type RegimeFornecedor, type RegimeId } from '../engine/tipos'
import {
  carregarMovimentos,
  configDosNcms,
  listarImportacoes,
  listarNcms,
  listarParceiros,
  regimesDosParceiros,
  salvarRegimeFornecedor,
  salvarNcm,
  salvarParametros,
  type CamposNcm,
  type EmpresaComEstab,
  type Importacao,
  type NcmRegistro,
  type ParceiroRegistro,
} from '../dados'
import { Abas, Vazio } from './comum'
import type { DadosAnalise } from './contexto'
import { Aliquotas } from './abas/Aliquotas'
import { Apuracao } from './abas/Apuracao'
import { Comparativo } from './abas/Comparativo'
import { Creditos } from './abas/Creditos'
import { Dre } from './abas/Dre'
import { Icms } from './abas/Icms'
import { Importar } from './abas/Importar'
import { Legislacao } from './abas/Legislacao'
import { Movimento } from './abas/Movimento'
import { Parceiros } from './abas/Parceiros'
import { Parametros } from './abas/Parametros'
import { Preco } from './abas/Preco'
import { Produtos } from './abas/Produtos'
import { Reforma } from './abas/Reforma'
import { Relatorio } from './abas/Relatorio'
import { VisaoGeral } from './abas/VisaoGeral'

type Aba =
  | 'geral'
  | 'movimento'
  | 'parceiros'
  | 'apuracao'
  | 'comparativo'
  | 'dre'
  | 'icms'
  | 'creditos'
  | 'aliquotas'
  | 'preco'
  | 'relatorio'
  | 'reforma'
  | 'ncm'
  | 'importar'
  | 'parametros'
  | 'legislacao'

const NOME_REGIME_ATUAL = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' }

export function Painel({ empresa, onVoltar, onEditar }: { empresa: EmpresaComEstab; onVoltar: () => void; onEditar: () => void }) {
  const [linhas, setLinhas] = useState<MovimentoLinha[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [parceiros, setParceiros] = useState<ParceiroRegistro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('geral')
  const [paramsSalvos, setParams] = useState<P>(() => comPadrao(empresa.parametros))
  const [ncms, setNcms] = useState<NcmRegistro[]>([])
  const [gravacao, setGravacao] = useState<'salvo' | 'pendente' | 'salvando'>('salvo')
  const [estabFiltro, setEstabFiltro] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [movs, imps, regs, parcs] = await Promise.all([carregarMovimentos(empresa.id), listarImportacoes(empresa.id), listarNcms(empresa.id), listarParceiros(empresa.id)])
      setLinhas(movs)
      setImportacoes(imps)
      setNcms(regs)
      setParceiros(parcs)
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [empresa.id])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Parâmetros e seleções são gravados automaticamente (1 s após a última alteração)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mudarParams = useCallback((p: P) => {
    setParams(p)
    setGravacao('pendente')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setGravacao('salvando')
      try {
        await salvarParametros(empresa.id, p)
        setGravacao('salvo')
      } catch (e) {
        setErro((e as Error).message)
        setGravacao('pendente')
      }
    }, 1000)
  }, [empresa.id])

  const estabs = empresa.trib_estabelecimentos
  const dadosEstab: DadosEstab = useCallback(
    (id: string | null) => {
      const e = estabs.find((x) => x.id === id) ?? estabs.find((x) => x.matriz) ?? estabs[0]
      const uf = e?.uf ?? 'SP'
      return { uf, aliquota: e?.aliquota_icms ?? ICMS_INTERNO_UF[uf] ?? 18 }
    },
    [estabs],
  )
  // o tratamento por NCM vem da tabela trib_ncms
  const params = useMemo(() => ({ ...paramsSalvos, ncms: configDosNcms(ncms), regimeFornecedores: regimesDosParceiros(parceiros) }), [paramsSalvos, ncms, parceiros])

  async function mudarRegimeFornecedor(documento: string, regime: RegimeFornecedor | null) {
    setParceiros((l) => l.map((p) => (p.documento === documento ? { ...p, regime } : p)))
    try {
      await salvarRegimeFornecedor(empresa.id, documento, regime)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function mudarNcm(ncm: string, campos: CamposNcm) {
    setNcms((l) => (l.some((n) => n.ncm === ncm) ? l.map((n) => (n.ncm === ncm ? { ...n, ...campos } : n)) : [...l, { empresa_id: empresa.id, ncm, descricao: null, ...campos }]))
    try {
      await salvarNcm(empresa.id, ncm, campos)
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  // Apuração sempre consolidada (matriz + filiais); o filtro de estabelecimento vale só para a visão de movimento
  const bases = useMemo(() => montarBases(linhas, params, dadosEstab), [linhas, params, dadosEstab])
  const basesFiltradas = useMemo(
    () => (estabFiltro ? montarBases(linhas.filter((l) => l.estabelecimento_id === estabFiltro), params, dadosEstab) : bases),
    [estabFiltro, linhas, params, dadosEstab, bases],
  )
  const mix = useMemo(() => estimarMix(linhas, params), [linhas, params])
  const regimeAtual: RegimeId = empresa.regime_atual
  const ctx: Contexto = useMemo(() => {
    const receitas = new Map(bases.map((b) => [b.competencia, receitaDaBase(b)]))
    const c: Contexto = { params, mix, receitaHistorica: (x: string) => receitas.get(x) ?? params.receitasAnteriores[x] }
    // PIS/COFINS "por dentro" do preço atual, no regime em que a empresa está (débito, não o líquido de créditos)
    const hoje = bases.filter((b) => Number(b.competencia.slice(0, 4)) <= 2026)
    const r = apurar(regimeAtual, hoje.length ? hoje : bases, { ...c, anoRegras: 2026 })
    const pc = regimeAtual === 'simples' ? r.tributos.PIS + r.tributos.COFINS : (r.dre.deducoes['PIS'] ?? 0) + (r.dre.deducoes['COFINS'] ?? 0)
    return { ...c, pisCofinsEmbutido: r.receita ? pc / r.receita : 0 }
  }, [params, mix, bases, regimeAtual])
  const anos = useMemo(() => projetar(bases, ctx), [bases, ctx])

  const dados: DadosAnalise = useMemo(() => {
    const nomes = new Map(parceiros.map((p) => [p.documento, p]))
    const eVenda = (l: MovimentoLinha) => l.tipo === 'saida' && linhaConsiderada(l, params) && naturezaDe(l, params.cfopNatureza) === 'venda'
    const eCompra = (l: MovimentoLinha) => {
      if (l.tipo !== 'entrada' || !linhaConsiderada(l, params)) return false
      const n = naturezaDe(l, params.cfopNatureza)
      return n === 'compra_revenda' || n === 'compra_insumo'
    }
    const produtos = new Map(ncms.map((n) => [n.ncm, n.descricao ?? '']))
    return { linhas, params, bases, ctx, anos, estabs, dadosEstab, regimeAtual, parceiros: nomes, produtos, eVenda, eCompra, onParams: mudarParams }
  }, [linhas, params, bases, ctx, anos, estabs, dadosEstab, regimeAtual, parceiros, ncms, mudarParams])

  const semDados = !carregando && bases.length === 0
  const abas: { id: Aba; label: string; icone: ReactNode; grupo: string }[] = [
    { id: 'geral', label: 'Visão geral', icone: <LayoutDashboard className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'dre', label: 'DRE', icone: <FileSpreadsheet className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'comparativo', label: 'Comparativo', icone: <Scale className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'reforma', label: 'Reforma 2026–2033', icone: <CalendarRange className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'icms', label: 'ICMS e DIFAL', icone: <MapPinned className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'creditos', label: 'Créditos', icone: <HandCoins className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'aliquotas', label: 'Alíquotas', icone: <Percent className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'apuracao', label: 'Apuração atual', icone: <Calculator className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'preco', label: 'Preço e markup', icone: <Tags className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'relatorio', label: 'Relatório PDF', icone: <FileDown className="h-4 w-4" />, grupo: 'Análises' },
    { id: 'movimento', label: 'Movimento e CFOP', icone: <Table2 className="h-4 w-4" />, grupo: 'Dados' },
    { id: 'parceiros', label: 'Clientes e fornecedores', icone: <Users className="h-4 w-4" />, grupo: 'Dados' },
    { id: 'ncm', label: 'Produtos (NCM)', icone: <Barcode className="h-4 w-4" />, grupo: 'Dados' },
    { id: 'importar', label: 'Importar', icone: <Upload className="h-4 w-4" />, grupo: 'Dados' },
    { id: 'parametros', label: 'Parâmetros', icone: <Settings2 className="h-4 w-4" />, grupo: 'Dados' },
    { id: 'legislacao', label: 'Legislação', icone: <BookOpen className="h-4 w-4" />, grupo: 'Dados' },
  ]
  const precisaDados = !['ncm', 'importar', 'parametros', 'legislacao', 'parceiros'].includes(aba)

  return (
    <div className="space-y-5">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70 ${aba === 'relatorio' ? 'no-print' : ''}`}>
        <div className="flex min-w-0 items-center gap-3">
          <button className="icon-btn no-print" onClick={onVoltar} title="Voltar às empresas">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-slate-900">{empresa.razao_social}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">{NOME_REGIME_ATUAL[empresa.regime_atual]}</span>
              {empresa.cnpj && <span>{mascaraCnpj(empresa.cnpj)}</span>}
              <span>
                {estabs.length} estabelecimento{estabs.length > 1 ? 's' : ''} ({estabs.filter((e) => !e.matriz).length} filia{estabs.filter((e) => !e.matriz).length === 1 ? 'l' : 'is'})
              </span>
              {(params.cfopsExcluidos.length > 0 || params.parceirosExcluidos.length > 0) && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                  {params.cfopsExcluidos.length} CFOP(s) e {params.parceirosExcluidos.length} cliente(s)/fornecedor(es) fora da análise
                </span>
              )}
              {params.cenarioIcms.ativo && <span className="rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-700">Cenário de ICMS ativo</span>}
            </div>
          </div>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          {aba === 'movimento' && estabs.length > 1 && (
            <select className="input w-auto py-2" value={estabFiltro} onChange={(e) => setEstabFiltro(e.target.value)}>
              <option value="">Consolidado (todos)</option>
              {estabs.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          )}
          <span className="flex items-center gap-1.5 text-xs text-slate-500" title="Parâmetros e seleções são salvos automaticamente">
            {gravacao === 'salvo' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
            {gravacao === 'salvo' ? 'Tudo salvo' : 'Salvando...'}
          </span>
          <button className="btn-secondary btn-sm" onClick={onEditar}>
            <Pencil className="h-4 w-4" /> Cadastro
          </button>
        </div>
      </div>

      <Abas abas={abas} ativa={aba} onChange={setAba} />

      {erro && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}
      {carregando && <div className="py-16 text-center text-slate-400">Carregando movimento...</div>}

      {!carregando && precisaDados && semDados && (
        <Vazio
          titulo="Nenhum movimento importado"
          texto="Importe os relatórios de entradas, saídas e serviços da matriz e das filiais para gerar a análise."
          acao={
            <button className="btn-primary" onClick={() => setAba('importar')}>
              <Upload className="h-4 w-4" /> Importar relatórios
            </button>
          }
        />
      )}

      {!carregando && !semDados && (
        <>
          {aba === 'geral' && <VisaoGeral d={dados} />}
          {aba === 'dre' && <Dre d={dados} />}
          {aba === 'comparativo' && <Comparativo bases={bases} ctx={ctx} regimeAtual={regimeAtual} />}
          {aba === 'reforma' && <Reforma bases={bases} ctx={ctx} regimeAtual={regimeAtual} onParams={mudarParams} />}
          {aba === 'icms' && <Icms d={dados} />}
          {aba === 'creditos' && <Creditos d={dados} />}
          {aba === 'aliquotas' && <Aliquotas d={dados} />}
          {aba === 'apuracao' && <Apuracao bases={bases} ctx={ctx} regime={regimeAtual} />}
          {aba === 'preco' && <Preco d={dados} />}
          {aba === 'relatorio' && <Relatorio d={dados} empresa={empresa} />}
          {aba === 'movimento' && (
            <Movimento bases={basesFiltradas} linhas={estabFiltro ? linhas.filter((l) => l.estabelecimento_id === estabFiltro) : linhas} params={params} onParams={mudarParams} />
          )}
        </>
      )}
      {!carregando && aba === 'parceiros' && <Parceiros d={dados} onRegime={mudarRegimeFornecedor} />}
      {!carregando && aba === 'ncm' && <Produtos linhas={linhas} registros={ncms} params={params} onMudar={mudarNcm} />}
      {!carregando && aba === 'importar' && <Importar empresaId={empresa.id} estabelecimentos={estabs} importacoes={importacoes} onAlterado={carregar} />}
      {aba === 'parametros' && (
        <Parametros params={params} onParams={mudarParams} mixEstimado={estimarMix(linhas, { ...params, percentualMonofasico: null, percentualReducaoIbsCbs: null, percentualSt: null, percentualB2B: null })} />
      )}
      {aba === 'legislacao' && <Legislacao />}
    </div>
  )
}
