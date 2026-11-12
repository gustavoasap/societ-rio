export type TipoReajuste = 'percentual' | 'fixo' | 'acrescimo'
export type Arredondamento = 'centavos' | 'inteiro' | 'cima'

export interface ParamsReajuste {
  tipo: TipoReajuste
  /** % do índice (ex.: IPCA) */
  indice: number
  /** % adicional somado ao índice */
  adicional: number
  fixo: number | null
  acrescimo: number
}

/** Percentual: índice + adicional somados (ex.: IPCA 4,5% + 2% = 6,5%). */
export function novoValor(atual: number, p: ParamsReajuste) {
  if (p.tipo === 'fixo') return p.fixo ?? atual
  if (p.tipo === 'acrescimo') return atual + p.acrescimo
  return atual * (1 + (p.indice + p.adicional) / 100)
}

export function arredondar(v: number, modo: Arredondamento) {
  if (modo === 'inteiro') return Math.round(v)
  if (modo === 'cima') return Math.ceil(v - 1e-9)
  return Math.round(v * 100) / 100
}
