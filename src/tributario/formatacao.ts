import { REGIMES, type RegimeId, type Resultado, type Tributo } from './engine/tipos'

/** Cor fixa por regime (paleta categórica validada — a cor acompanha o regime, nunca a posição). */
export const COR_REGIME: Record<RegimeId, string> = {
  simples: '#2a78d6',
  simples_hibrido: '#eb6834',
  presumido: '#1baf7a',
  real: '#eda100',
}

export const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const moedaCurta = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
export const pct = (v: number, casas = 2) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
export const nomeRegime = (r: RegimeId) => REGIMES.find((x) => x.value === r)?.curto ?? r

export const NOME_TRIBUTO: Record<Tributo, string> = {
  IRPJ: 'IRPJ',
  CSLL: 'CSLL',
  PIS: 'PIS',
  COFINS: 'COFINS',
  CPP: 'CPP / INSS patronal',
  ICMS: 'ICMS',
  IPI: 'IPI',
  ISS: 'ISS',
  CBS: 'CBS',
  IBS: 'IBS',
}

export const compacto = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export function recomendacao(resultados: Resultado[], atual: RegimeId, periodo: string) {
  const elegiveis = resultados.filter((r) => r.elegivel)
  if (!elegiveis.length) return null
  const melhor = elegiveis.reduce((a, b) => (b.total < a.total ? b : a))
  const doAtual = resultados.find((r) => r.regime === atual)
  const ordenados = [...elegiveis].sort((a, b) => a.total - b.total)
  const segundo = ordenados[1]
  let texto = `No período ${periodo}, o ${nomeRegime(melhor.regime)} apresenta a menor carga: ${moeda(melhor.total)} (${pct(melhor.carga)} da receita)`
  if (segundo) texto += `, ${moeda(segundo.total - melhor.total)} a menos que o ${nomeRegime(segundo.regime)}`
  texto += '.'
  if (doAtual && doAtual.regime !== melhor.regime) texto += ` Em relação ao regime atual (${nomeRegime(atual)}), a economia seria de ${moeda(doAtual.total - melhor.total)}.`
  if (doAtual && doAtual.regime === melhor.regime) texto += ' O regime atual já é o mais econômico.'
  const inelegiveis = resultados.filter((r) => !r.elegivel)
  for (const r of inelegiveis) texto += ` ${nomeRegime(r.regime)} indisponível: ${r.motivo}`
  return { melhor: melhor.regime, texto }
}

