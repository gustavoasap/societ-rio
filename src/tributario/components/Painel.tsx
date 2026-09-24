import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft, BookOpen, Calculator, CalendarRange, LayoutDashboard, Pencil, Save, Scale, Settings2, Table2, Upload } from 'lucide-react'
import { mascaraCnpj } from '../../lib/format'
import type { Contexto } from '../engine/apuracao'
import { estimarMix, montarBases, receitaDaBase } from '../engine/base'
import { ICMS_INTERNO_UF } from '../engine/tabelas'
import { comPadrao, type Parametros as P, type MovimentoLinha, type RegimeId } from '../engine/tipos'
import { carregarMovimentos, listarImportacoes, salvarParametros, type EmpresaComEstab, type Importacao } from '../dados'
import { Abas, Vazio } from './comum'
import { Apuracao } from './abas/Apuracao'
import { Comparativo } from './abas/Comparativo'
import { Importar } from './abas/Importar'
import { Legislacao } from './abas/Legislacao'
import { Movimento } from './abas/Movimento'
import { Parametros } from './abas/Parametros'
import { Reforma } from './abas/Reforma'
import { VisaoGeral } from './abas/VisaoGeral'

type Aba = 'geral' | 'movimento' | 'apuracao' | 'comparativo' | 'reforma' | 'importar' | 'parametros' | 'legislacao'

const NOME_REGIME_ATUAL = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' }

export function Painel({ empresa, onVoltar, onEditar }: { empresa: EmpresaComEstab; onVoltar: () => void; onEditar: () => void }) {
  const [linhas, setLinhas] = useState<MovimentoLinha[]>([])
  const [importacoes, setImportacoes] = useState<Importacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<Aba>('geral')
  const [params, setParams] = useState<P>(() => comPadrao(empresa.parametros))
  const [alterado, setAlterado] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [estabFiltro, setEstabFiltro] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [movs, imps] = await Promise.all([carregarMovimentos(empresa.id), listarImportacoes(empresa.id)])
      setLinhas(movs)
      setImportacoes(imps)
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

  const estabs = empresa.trib_estabelecimentos
  const aliquotaInterna = useCallback(
    (id: string | null) => {
      const e = estabs.find((x) => x.id === id) ?? estabs.find((x) => x.matriz) ?? estabs[0]
      return e?.aliquota_icms ?? ICMS_INTERNO_UF[e?.uf ?? 'SP'] ?? 18
    },
    [estabs],
  )

  // Apuração sempre consolidada (matriz + filiais); o filtro de estabelecimento vale só para a visão de movimento
  const bases = useMemo(() => montarBases(linhas, params, aliquotaInterna), [linhas, params, aliquotaInterna])
  const basesFiltradas = useMemo(
    () => (estabFiltro ? montarBases(linhas.filter((l) => l.estabelecimento_id === estabFiltro), params, aliquotaInterna) : bases),
    [estabFiltro, linhas, params, aliquotaInterna, bases],
  )
  const mix = useMemo(() => estimarMix(linhas, params), [linhas, params])
  const ctx: Contexto = useMemo(() => {
    const receitas = new Map(bases.map((b) => [b.competencia, receitaDaBase(b)]))
    return { params, mix, receitaHistorica: (c: string) => receitas.get(c) ?? params.receitasAnteriores[c] }
  }, [params, mix, bases])

  function mudarParams(p: P) {
    setParams(p)
    setAlterado(true)
  }

  async function salvar() {
    setSalvando(true)
    try {
      await salvarParametros(empresa.id, params)
      setAlterado(false)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const regimeAtual: RegimeId = empresa.regime_atual
  const semDados = !carregando && bases.length === 0
  const abas: { id: Aba; label: string; icone: ReactNode }[] = [
    { id: 'geral', label: 'Visão geral', icone: <LayoutDashboard className="h-4 w-4" /> },
    { id: 'movimento', label: 'Movimento', icone: <Table2 className="h-4 w-4" /> },
    { id: 'apuracao', label: 'Apuração atual', icone: <Calculator className="h-4 w-4" /> },
    { id: 'comparativo', label: 'Comparativo', icone: <Scale className="h-4 w-4" /> },
    { id: 'reforma', label: 'Reforma 2026–2033', icone: <CalendarRange className="h-4 w-4" /> },
    { id: 'importar', label: 'Importar relatórios', icone: <Upload className="h-4 w-4" /> },
    { id: 'parametros', label: 'Parâmetros', icone: <Settings2 className="h-4 w-4" /> },
    { id: 'legislacao', label: 'Legislação', icone: <BookOpen className="h-4 w-4" /> },
  ]
  const precisaDados = ['geral', 'movimento', 'apuracao', 'comparativo', 'reforma'].includes(aba)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70">
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
          {alterado && (
            <button className="btn-primary btn-sm" onClick={salvar} disabled={salvando}>
              <Save className="h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar parâmetros'}
            </button>
          )}
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
          {aba === 'geral' && <VisaoGeral bases={bases} ctx={ctx} regimeAtual={regimeAtual} linhas={linhas} estabelecimentos={estabs} aliquotaInterna={aliquotaInterna} />}
          {aba === 'movimento' && (
            <Movimento bases={basesFiltradas} linhas={estabFiltro ? linhas.filter((l) => l.estabelecimento_id === estabFiltro) : linhas} params={params} onParams={mudarParams} />
          )}
          {aba === 'apuracao' && <Apuracao bases={bases} ctx={ctx} regime={regimeAtual} />}
          {aba === 'comparativo' && <Comparativo bases={bases} ctx={ctx} regimeAtual={regimeAtual} />}
          {aba === 'reforma' && <Reforma bases={bases} ctx={ctx} regimeAtual={regimeAtual} onParams={mudarParams} />}
        </>
      )}
      {!carregando && aba === 'importar' && <Importar empresaId={empresa.id} estabelecimentos={estabs} importacoes={importacoes} onAlterado={carregar} />}
      {aba === 'parametros' && <Parametros params={params} onParams={mudarParams} mixEstimado={estimarMix(linhas, { ...params, percentualMonofasico: null, percentualReducaoIbsCbs: null })} />}
      {aba === 'legislacao' && <Legislacao />}
    </div>
  )
}
