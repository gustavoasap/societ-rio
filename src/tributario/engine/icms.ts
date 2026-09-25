// ICMS nota a nota: vendas (interna, interestadual, DIFAL) e entradas (ICMS-ST com MVA e antecipação).
import { destinoCfop, vendaNaoContribuinte } from './cfop'
import { tratamentoNcm } from './ncm'
import { ICMS_INTERNO_UF, aliquotaInterestadual, origemDoCst } from './tabelas'
import type { MovimentoLinha, Parametros } from './tipos'

export interface IcmsVenda {
  destino: string
  interna: boolean
  aliquota: number // % aplicada no ICMS próprio
  proprio: number
  difal: number
  aliquotaDestino: number // % interna da UF de destino (DIFAL)
}

export const naoContribuinte = (l: MovimentoLinha) => (l.destinatario ? l.destinatario !== 'PJ_C' : vendaNaoContribuinte(l.cfop))

/**
 * ICMS de uma linha de venda.
 * - modo 'cfop': interna/interestadual pelo CFOP (situação real da nota);
 * - modo 'destino': compara a UF de origem simulada com a UF do cliente (cenário de mudança de estado).
 * Devolve null quando a UF de destino de uma venda interestadual não é conhecida (resumo por CFOP).
 */
export function icmsDaVenda(
  l: MovimentoLinha,
  params: Parametros,
  origem: { uf: string; aliquotaInterna: number; cargaInterestadual?: number | null; cargaInterna?: number | null },
  modo: 'cfop' | 'destino',
): IcmsVenda | null {
  const v = l.valor_contabil
  const t = l.ncm ? tratamentoNcm(l.ncm, params.ncms) : null
  const ufCliente = l.uf && ICMS_INTERNO_UF[l.uf] ? l.uf : ''
  let interna: boolean
  let destino: string
  if (modo === 'cfop') {
    interna = destinoCfop(l.cfop) !== 'interestadual'
    destino = interna ? origem.uf : ufCliente
  } else {
    destino = ufCliente || (destinoCfop(l.cfop) !== 'interestadual' ? origem.uf : '')
    interna = destino === origem.uf
  }
  if (!destino) return null
  if (interna) {
    const aliquotaNcm = !params.ufAliquotasNcm || params.ufAliquotasNcm === origem.uf ? t?.aliquotaIcms : null
    // mercadoria sujeita a ST: o ICMS da cadeia já foi recolhido na entrada — sem débito na venda interna
    const aliquota = t?.st && params.papelSt !== 'substituto' ? 0 : (origem.cargaInterna ?? aliquotaNcm ?? origem.aliquotaInterna)
    return { destino, interna, aliquota, proprio: (v * aliquota) / 100, difal: 0, aliquotaDestino: aliquota }
  }
  const inter = aliquotaInterestadual(origemDoCst(l.cst), origem.uf, destino)
  const aliquota = origem.cargaInterestadual ?? inter
  const aliquotaDestino = ICMS_INTERNO_UF[destino] ?? 18
  // DIFAL (EC 87/2015; LC 190/2022): alíquota interna do destino − interestadual nominal
  const difal = naoContribuinte(l) ? (v * Math.max(0, aliquotaDestino - inter)) / 100 : 0
  return { destino, interna, aliquota, proprio: (v * aliquota) / 100, difal, aliquotaDestino }
}

export interface IcmsEntrada {
  aliquotaInterna: number
  aliquotaInterestadual: number
  mvaAjustada: number | null
  st: number // ICMS-ST devido na entrada (não retido pelo fornecedor)
  antecipacao: number // diferencial de alíquota (sem ST)
  semMva: boolean
}

/**
 * ICMS devido na entrada interestadual de mercadoria para revenda, quando o fornecedor não reteve a ST:
 * - com ST: [valor × (1 + MVA ajustada)] × alíquota interna − ICMS destacado; MVA ajustada = (1+MVA)×(1−inter)/(1−interna) − 1
 *   (Convênio ICMS 142/2018, cláusula nona);
 * - sem ST: antecipação = valor × (alíquota interna do NCM − alíquota interestadual).
 */
export function icmsDaEntrada(l: MovimentoLinha, params: Parametros, ufEstab: string, aliquotaModal: number): IcmsEntrada | null {
  if (!l.cfop.startsWith('2') || l.icms_st > 0) return null
  const v = l.valor_contabil
  const t = l.ncm ? tratamentoNcm(l.ncm, params.ncms) : null
  const interna = (!params.ufAliquotasNcm || params.ufAliquotasNcm === ufEstab ? t?.aliquotaIcms : null) ?? aliquotaModal
  const inter = l.bc_icms > 0 && l.icms > 0 ? (l.icms / l.bc_icms) * 100 : aliquotaInterestadual(origemDoCst(l.cst), l.uf, ufEstab)
  const icmsProprio = l.icms > 0 ? l.icms : (v * inter) / 100
  if (t?.st) {
    const mva = (t.mva ?? 0) / 100
    const mvaAjustada = interna < 100 ? ((1 + mva) * (1 - inter / 100)) / (1 - interna / 100) - 1 : mva
    const st = Math.max(0, v * (1 + mvaAjustada) * (interna / 100) - icmsProprio)
    return { aliquotaInterna: interna, aliquotaInterestadual: inter, mvaAjustada, st, antecipacao: 0, semMva: t.mva === null }
  }
  return { aliquotaInterna: interna, aliquotaInterestadual: inter, mvaAjustada: null, st: 0, antecipacao: Math.max(0, (v * (interna - inter)) / 100), semMva: false }
}

export interface LinhaIcmsUf {
  uf: string
  vendas: number
  naoContribuinte: number
  proprio: number
  difal: number
  aliquotaMedia: number // % média do ICMS próprio
  aliquotaDestino: number // % interna da UF
}

/**
 * ICMS das vendas agrupado pela UF do cliente — situação atual (pelo CFOP) ou cenário (a partir da UF simulada).
 * Vendas interestaduais sem UF (resumo por CFOP) ficam em "—".
 */
export function icmsVendasPorUf(
  linhas: MovimentoLinha[],
  params: Parametros,
  origem: (estabId: string | null) => { uf: string; aliquotaInterna: number; cargaInterna?: number | null; cargaInterestadual?: number | null },
  modo: 'cfop' | 'destino',
  eVenda: (l: MovimentoLinha) => boolean,
): LinhaIcmsUf[] {
  const m = new Map<string, LinhaIcmsUf>()
  for (const l of linhas) {
    if (l.tipo !== 'saida' || !eVenda(l)) continue
    const x = icmsDaVenda(l, params, origem(l.estabelecimento_id), modo)
    const uf = x?.destino || '—'
    const r = m.get(uf) ?? { uf, vendas: 0, naoContribuinte: 0, proprio: 0, difal: 0, aliquotaMedia: 0, aliquotaDestino: ICMS_INTERNO_UF[uf] ?? 0 }
    r.vendas += l.valor_contabil
    if (naoContribuinte(l)) r.naoContribuinte += l.valor_contabil
    r.proprio += x?.proprio ?? 0
    r.difal += x?.difal ?? 0
    m.set(uf, r)
  }
  return [...m.values()].map((r) => ({ ...r, aliquotaMedia: r.vendas ? (r.proprio / r.vendas) * 100 : 0 })).sort((a, b) => b.vendas - a.vendas)
}

export interface LinhaIcmsEntrada {
  chave: string // NCM
  ufs: string
  valor: number
  icmsDestacado: number
  st: number
  antecipacao: number
  aliquotaInterna: number
  aliquotaInterestadual: number
  mvaAjustada: number | null
  semMva: boolean
}

/** ICMS-ST e antecipação nas entradas interestaduais, por NCM. */
export function icmsEntradasPorNcm(
  linhas: MovimentoLinha[],
  params: Parametros,
  estab: (id: string | null) => { uf: string; aliquota: number },
  eCompra: (l: MovimentoLinha) => boolean,
): LinhaIcmsEntrada[] {
  const m = new Map<string, LinhaIcmsEntrada & { _ufs: Set<string> }>()
  for (const l of linhas) {
    if (l.tipo !== 'entrada' || !eCompra(l)) continue
    const e = estab(l.estabelecimento_id)
    const x = icmsDaEntrada(l, params, e.uf, e.aliquota)
    if (!x) continue
    const k = l.ncm || '(sem NCM)'
    const r = m.get(k) ?? { chave: k, ufs: '', _ufs: new Set<string>(), valor: 0, icmsDestacado: 0, st: 0, antecipacao: 0, aliquotaInterna: x.aliquotaInterna, aliquotaInterestadual: 0, mvaAjustada: x.mvaAjustada, semMva: x.semMva }
    r.valor += l.valor_contabil
    r.icmsDestacado += l.icms
    r.st += x.st
    r.antecipacao += x.antecipacao
    r.aliquotaInterestadual += x.aliquotaInterestadual * l.valor_contabil
    if (l.uf) r._ufs.add(l.uf)
    m.set(k, r)
  }
  return [...m.values()]
    .map(({ _ufs, ...r }) => ({ ...r, ufs: [..._ufs].sort().join(', '), aliquotaInterestadual: r.valor ? r.aliquotaInterestadual / r.valor : 0 }))
    .sort((a, b) => b.st + b.antecipacao - (a.st + a.antecipacao))
}

export interface FaixaAliquotaInterna {
  aliquota: number // % aplicada (0 = mercadoria com ST, sem débito na venda)
  st: boolean
  vendas: number
  icms: number
  ncms: string[] // do maior para o menor valor vendido
}

/** Vendas internas agrupadas pela alíquota de ICMS aplicada a cada produto (NCM). */
export function icmsVendasInternasPorAliquota(
  linhas: MovimentoLinha[],
  params: Parametros,
  origem: (estabId: string | null) => { uf: string; aliquotaInterna: number },
  eVenda: (l: MovimentoLinha) => boolean,
): FaixaAliquotaInterna[] {
  const m = new Map<string, FaixaAliquotaInterna & { _ncm: Map<string, number> }>()
  for (const l of linhas) {
    if (l.tipo !== 'saida' || !eVenda(l) || destinoCfop(l.cfop) === 'interestadual') continue
    const x = icmsDaVenda(l, params, origem(l.estabelecimento_id), 'cfop')
    if (!x) continue
    const st = !!(l.ncm && tratamentoNcm(l.ncm, params.ncms).st)
    const k = st ? 'st' : String(Math.round(x.aliquota * 100) / 100)
    const r = m.get(k) ?? { aliquota: x.aliquota, st, vendas: 0, icms: 0, ncms: [], _ncm: new Map<string, number>() }
    r.vendas += l.valor_contabil
    r.icms += x.proprio
    const n = l.ncm || '(sem NCM)'
    r._ncm.set(n, (r._ncm.get(n) ?? 0) + l.valor_contabil)
    m.set(k, r)
  }
  return [...m.values()]
    .map(({ _ncm, ...r }) => ({ ...r, ncms: [..._ncm.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n) }))
    .sort((a, b) => b.vendas - a.vendas)
}
