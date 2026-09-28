import type { Aporte, Etapa, Lancamento, Meta } from '../tipos'
import { diasEntre, mesDe, mesesRestantes, somarMeses } from './datas'

const centavos = (v: number) => Math.round(v * 100)
const reais = (c: number) => c / 100

/** Soma em centavos para não acumular erro de ponto flutuante. */
export function somar(valores: number[]) {
  return reais(valores.reduce((s, v) => s + centavos(v), 0))
}

export interface ResumoMes {
  receitas: number
  despesas: number
  resultado: number
  /** Parte das receitas/despesas ainda não recebida/paga */
  aReceber: number
  aPagar: number
}

/** Receitas e despesas do período. Transferências entre contas não entram (não são ganho nem gasto). */
export function resumo(lancamentos: Lancamento[]): ResumoMes {
  const rec = lancamentos.filter((l) => l.tipo === 'receita')
  const desp = lancamentos.filter((l) => l.tipo === 'despesa')
  const receitas = somar(rec.map((l) => l.valor))
  const despesas = somar(desp.map((l) => l.valor))
  return {
    receitas,
    despesas,
    resultado: somar([receitas, -despesas]),
    aReceber: somar(rec.filter((l) => !l.pago).map((l) => l.valor)),
    aPagar: somar(desp.filter((l) => !l.pago).map((l) => l.valor)),
  }
}

/** Resumo mês a mês ("AAAA-MM") para os meses pedidos, na ordem dada. */
export function resumoPorMes(lancamentos: Lancamento[], meses: string[]) {
  return meses.map((mes) => ({ mes, ...resumo(lancamentos.filter((l) => mesDe(l.data) === mes)) }))
}

/** Total de despesas por categoria (id ou "" para sem categoria), do maior para o menor. */
export function despesasPorCategoria(lancamentos: Lancamento[]) {
  const mapa = new Map<string, number>()
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa') continue
    const k = l.categoria_id ?? ''
    mapa.set(k, somar([mapa.get(k) ?? 0, l.valor]))
  }
  return [...mapa.entries()].map(([categoriaId, total]) => ({ categoriaId, total })).sort((a, b) => b.total - a.total)
}

/** Lançamentos em aberto vencidos ou que vencem até `dias` à frente, do mais antigo para o mais novo. */
export function contasEmAberto(lancamentos: Lancamento[], hojeISO: string, dias = 10) {
  return lancamentos
    .filter((l) => !l.pago && l.tipo !== 'transferencia' && diasEntre(hojeISO, l.data) <= dias)
    .sort((a, b) => a.data.localeCompare(b.data))
}

export interface NovoLancamento {
  descricao: string
  valor: number
  data: string
  parcela: number | null
  parcelas: number | null
}

/**
 * Gera os lançamentos de uma repetição mensal.
 * - `fixo`: o mesmo valor se repete `vezes` meses (aluguel, assinatura).
 * - `parcelado`: o valor total é dividido em `vezes` parcelas; a diferença de centavos vai na 1ª parcela.
 */
export function gerarRepeticao(base: { descricao: string; valor: number; data: string }, vezes: number, modo: 'fixo' | 'parcelado'): NovoLancamento[] {
  if (vezes <= 1) return [{ ...base, parcela: null, parcelas: null }]
  const total = centavos(base.valor)
  const parcela = modo === 'parcelado' ? Math.floor(total / vezes) : total
  const sobra = modo === 'parcelado' ? total - parcela * vezes : 0
  return Array.from({ length: vezes }, (_, i) => ({
    descricao: base.descricao,
    valor: reais(parcela + (i === 0 ? sobra : 0)),
    data: somarMeses(base.data, i),
    parcela: modo === 'parcelado' ? i + 1 : null,
    parcelas: modo === 'parcelado' ? vezes : null,
  }))
}

export interface ProgressoMeta {
  acumulado: number
  falta: number
  /** 0 a 1 */
  fracao: number
  /** Quanto guardar por mês (contando o atual) para chegar no prazo; null sem prazo ou já atingida */
  porMes: number | null
  mesesRestantes: number | null
  atrasada: boolean
}

export function progressoMeta(meta: Meta, aportes: Aporte[], hojeISO: string): ProgressoMeta {
  const acumulado = somar(aportes.filter((a) => a.meta_id === meta.id).map((a) => a.valor))
  const falta = Math.max(0, somar([meta.valor_alvo, -acumulado]))
  const fracao = meta.valor_alvo > 0 ? Math.min(1, Math.max(0, acumulado / meta.valor_alvo)) : 0
  let porMes: number | null = null
  let restantes: number | null = null
  let atrasada = false
  if (meta.prazo && falta > 0) {
    restantes = mesesRestantes(hojeISO, meta.prazo)
    if (meta.prazo < hojeISO) atrasada = true
    else porMes = reais(Math.ceil(centavos(falta) / Math.max(1, restantes)))
  }
  return { acumulado, falta, fracao, porMes, mesesRestantes: restantes, atrasada }
}

export function progressoEtapas(etapas: Etapa[]) {
  const total = etapas.length
  const feitas = etapas.filter((e) => e.feita).length
  return { total, feitas, fracao: total ? feitas / total : 0 }
}
