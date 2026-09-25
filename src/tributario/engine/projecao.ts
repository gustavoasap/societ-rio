import { apurar, type Contexto } from './apuracao'
import { escalarBase, somarBases } from './base'
import { ANOS_TRANSICAO } from './tabelas'
import { BASE_VAZIA, receitaBruta, type BaseMensal, type RegimeId, type Resultado } from './tipos'

/**
 * Monta um ano-base de 12 meses a partir dos meses importados:
 * usa os últimos 12 meses disponíveis e completa os meses faltantes com a média dos meses existentes.
 */
export function montarAnoBase(bases: BaseMensal[]): { meses: BaseMensal[]; mesesReais: number; anualizado: boolean } {
  const ultimos = [...bases].sort((a, b) => a.competencia.localeCompare(b.competencia)).slice(-12)
  if (ultimos.length === 0) return { meses: [], mesesReais: 0, anualizado: false }
  const media = escalarBase(somarBases(ultimos), 1 / ultimos.length)
  const porMes = new Map(ultimos.map((b) => [b.competencia.slice(5, 7), b]))
  const meses: BaseMensal[] = []
  for (let m = 1; m <= 12; m++) {
    const mm = String(m).padStart(2, '0')
    meses.push({ ...(porMes.get(mm) ?? media), competencia: `0000-${mm}` })
  }
  return { meses, mesesReais: ultimos.length, anualizado: ultimos.length < 12 }
}

export interface AnoProjetado {
  ano: number
  receita: number
  meses: BaseMensal[]
  resultados: Partial<Record<RegimeId, Resultado>>
  melhor: RegimeId | null
}

export const regimesDoAno = (ano: number): RegimeId[] => (ano >= 2027 ? ['simples', 'simples_hibrido', 'presumido', 'real'] : ['simples', 'presumido', 'real'])

/** Projeta a carga de cada regime em cada ano da transição (2026-2033), a partir do ano-base. */
export function projetar(bases: BaseMensal[], ctx: Contexto, anos: readonly number[] = ANOS_TRANSICAO): AnoProjetado[] {
  const { meses } = montarAnoBase(bases)
  if (!meses.length) return []
  const anoRef = Math.max(...bases.map((b) => Number(b.competencia.slice(0, 4))))
  const g = ctx.params.crescimentoAnual / 100
  return anos.map((ano) => {
    const fator = Math.pow(1 + g, Math.max(0, ano - anoRef))
    const mesesAno = meses.map((b) => escalarBase(b, fator, `${ano}-${b.competencia.slice(5, 7)}`))
    const receita = mesesAno.reduce((a, b) => a + receitaBruta(b), 0)
    const ctxAno: Contexto = { ...ctx, anoRegras: ano, rbt12Fixo: receita / (1 + g) }
    const resultados: Partial<Record<RegimeId, Resultado>> = {}
    for (const r of regimesDoAno(ano)) resultados[r] = apurar(r, mesesAno, ctxAno)
    const elegiveis = Object.values(resultados).filter((r) => r.elegivel)
    const melhor = elegiveis.length ? elegiveis.reduce((a, b) => (b.total < a.total ? b : a)).regime : null
    return { ano, receita, meses: mesesAno, resultados, melhor }
  })
}

/** Agrupa bases mensais por período (mês, semestre ou ano). */
export type Agrupamento = 'mes' | 'semestre' | 'ano'

export function chavePeriodo(comp: string, ag: Agrupamento) {
  const [a, m] = comp.split('-')
  if (ag === 'ano') return a
  if (ag === 'semestre') return `${a}-S${Number(m) <= 6 ? 1 : 2}`
  return comp
}

export function rotuloPeriodo(chave: string) {
  if (/^\d{4}$/.test(chave)) return chave
  if (/S\d$/.test(chave)) return `${chave.slice(-1)}º sem/${chave.slice(0, 4)}`
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(chave.slice(5, 7)) - 1]}/${chave.slice(0, 4)}`
}

export function agruparBases(bases: BaseMensal[], ag: Agrupamento): { chave: string; meses: BaseMensal[]; soma: BaseMensal }[] {
  const grupos = new Map<string, BaseMensal[]>()
  for (const b of bases) {
    const k = chavePeriodo(b.competencia, ag)
    grupos.set(k, [...(grupos.get(k) ?? []), b])
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, meses]) => ({ chave, meses, soma: meses.length ? somarBases(meses, chave) : BASE_VAZIA(chave) }))
}
