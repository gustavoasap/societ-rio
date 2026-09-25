// Tabelas legais usadas no motor de cálculo.
// Cada bloco cita a norma de origem — confira a legislação em LEGISLACAO (legislacao.ts).

export type Anexo = 'I' | 'II' | 'III' | 'IV' | 'V'

/** Tributos que compõem o DAS (partilha). */
export type TributoDas = 'IRPJ' | 'CSLL' | 'COFINS' | 'PIS' | 'CPP' | 'ICMS' | 'IPI' | 'ISS'

export interface FaixaSimples {
  ate: number
  nominal: number // alíquota nominal (fração)
  deduzir: number // parcela a deduzir (R$)
  partilha: Partial<Record<TributoDas, number>> // percentuais (fração) da alíquota efetiva
}

const p = (IRPJ: number, CSLL: number, COFINS: number, PIS: number, CPP: number, resto: Partial<Record<TributoDas, number>>) => ({
  IRPJ: IRPJ / 100,
  CSLL: CSLL / 100,
  COFINS: COFINS / 100,
  PIS: PIS / 100,
  CPP: CPP / 100,
  ...Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, (v as number) / 100])),
})

/**
 * Anexos I a V da LC 123/2006 (redação da LC 155/2016, vigente desde 2018).
 * Limites de faixa sobre a Receita Bruta dos 12 meses anteriores (RBT12).
 */
export const ANEXOS_SIMPLES: Record<Anexo, { nome: string; faixas: FaixaSimples[] }> = {
  I: {
    nome: 'Anexo I — Comércio',
    faixas: [
      { ate: 180_000, nominal: 0.04, deduzir: 0, partilha: p(5.5, 3.5, 12.74, 2.76, 41.5, { ICMS: 34 }) },
      { ate: 360_000, nominal: 0.073, deduzir: 5_940, partilha: p(5.5, 3.5, 12.74, 2.76, 41.5, { ICMS: 34 }) },
      { ate: 720_000, nominal: 0.095, deduzir: 13_860, partilha: p(5.5, 3.5, 12.74, 2.76, 42, { ICMS: 33.5 }) },
      { ate: 1_800_000, nominal: 0.107, deduzir: 22_500, partilha: p(5.5, 3.5, 12.74, 2.76, 42, { ICMS: 33.5 }) },
      { ate: 3_600_000, nominal: 0.143, deduzir: 87_300, partilha: p(5.5, 3.5, 12.74, 2.76, 42, { ICMS: 33.5 }) },
      { ate: 4_800_000, nominal: 0.19, deduzir: 378_000, partilha: p(13.5, 10, 28.27, 6.13, 42.1, { ICMS: 0 }) },
    ],
  },
  II: {
    nome: 'Anexo II — Indústria',
    faixas: [
      { ate: 180_000, nominal: 0.045, deduzir: 0, partilha: p(5.5, 3.5, 11.51, 2.49, 37.5, { IPI: 7.5, ICMS: 32 }) },
      { ate: 360_000, nominal: 0.078, deduzir: 5_940, partilha: p(5.5, 3.5, 11.51, 2.49, 37.5, { IPI: 7.5, ICMS: 32 }) },
      { ate: 720_000, nominal: 0.1, deduzir: 13_860, partilha: p(5.5, 3.5, 11.51, 2.49, 37.5, { IPI: 7.5, ICMS: 32 }) },
      { ate: 1_800_000, nominal: 0.112, deduzir: 22_500, partilha: p(5.5, 3.5, 11.51, 2.49, 37.5, { IPI: 7.5, ICMS: 32 }) },
      { ate: 3_600_000, nominal: 0.147, deduzir: 85_500, partilha: p(5.5, 3.5, 11.51, 2.49, 37.5, { IPI: 7.5, ICMS: 32 }) },
      { ate: 4_800_000, nominal: 0.3, deduzir: 720_000, partilha: p(8.5, 7.5, 20.96, 4.54, 23.5, { IPI: 35, ICMS: 0 }) },
    ],
  },
  III: {
    nome: 'Anexo III — Serviços',
    faixas: [
      { ate: 180_000, nominal: 0.06, deduzir: 0, partilha: p(4, 3.5, 12.82, 2.78, 43.4, { ISS: 33.5 }) },
      { ate: 360_000, nominal: 0.112, deduzir: 9_360, partilha: p(4, 3.5, 14.05, 3.05, 43.4, { ISS: 32 }) },
      { ate: 720_000, nominal: 0.135, deduzir: 17_640, partilha: p(4, 3.5, 13.64, 2.96, 43.4, { ISS: 32.5 }) },
      { ate: 1_800_000, nominal: 0.16, deduzir: 35_640, partilha: p(4, 3.5, 13.64, 2.96, 43.4, { ISS: 32.5 }) },
      { ate: 3_600_000, nominal: 0.21, deduzir: 125_640, partilha: p(4, 3.5, 12.82, 2.78, 43.4, { ISS: 33.5 }) },
      { ate: 4_800_000, nominal: 0.33, deduzir: 648_000, partilha: p(35, 15, 16.03, 3.47, 30.5, { ISS: 0 }) },
    ],
  },
  IV: {
    nome: 'Anexo IV — Serviços (CPP fora do DAS)',
    faixas: [
      { ate: 180_000, nominal: 0.045, deduzir: 0, partilha: p(18.8, 15.2, 17.67, 3.83, 0, { ISS: 44.5 }) },
      { ate: 360_000, nominal: 0.09, deduzir: 8_100, partilha: p(19.8, 15.2, 20.55, 4.45, 0, { ISS: 40 }) },
      { ate: 720_000, nominal: 0.102, deduzir: 12_420, partilha: p(20.8, 15.2, 19.73, 4.27, 0, { ISS: 40 }) },
      { ate: 1_800_000, nominal: 0.14, deduzir: 39_780, partilha: p(17.8, 19.2, 18.9, 4.1, 0, { ISS: 40 }) },
      { ate: 3_600_000, nominal: 0.22, deduzir: 183_780, partilha: p(18.8, 19.2, 18.08, 3.92, 0, { ISS: 40 }) },
      { ate: 4_800_000, nominal: 0.33, deduzir: 828_000, partilha: p(53.5, 21.5, 20.55, 4.45, 0, { ISS: 0 }) },
    ],
  },
  V: {
    nome: 'Anexo V — Serviços (fator R < 28%)',
    faixas: [
      { ate: 180_000, nominal: 0.155, deduzir: 0, partilha: p(25, 15, 14.1, 3.05, 28.85, { ISS: 14 }) },
      { ate: 360_000, nominal: 0.18, deduzir: 4_500, partilha: p(23, 15, 14.1, 3.05, 27.85, { ISS: 17 }) },
      { ate: 720_000, nominal: 0.195, deduzir: 9_900, partilha: p(24, 15, 14.92, 3.23, 23.85, { ISS: 19 }) },
      { ate: 1_800_000, nominal: 0.205, deduzir: 17_100, partilha: p(21, 15, 15.74, 3.41, 23.85, { ISS: 21 }) },
      { ate: 3_600_000, nominal: 0.23, deduzir: 62_100, partilha: p(23, 12.5, 14.1, 3.05, 23.85, { ISS: 23.5 }) },
      { ate: 4_800_000, nominal: 0.305, deduzir: 540_000, partilha: p(35, 15.5, 16.44, 3.56, 29.5, { ISS: 0 }) },
    ],
  },
}

/** Limite de receita bruta anual do Simples (LC 123, art. 3º, II) e sublimite de ICMS/ISS (art. 13-A). */
export const LIMITE_SIMPLES = 4_800_000
export const SUBLIMITE_ICMS_ISS = 3_600_000

/**
 * Alíquota modal interna de ICMS por UF — tabela de referência da ASAP para o planejamento (RJ: 18% + 2% de FECP).
 * Alíquotas específicas por produto são informadas por NCM na aba Produtos; a modal do estabelecimento é editável no cadastro.
 */
export const ICMS_INTERNO_UF: Record<string, number> = {
  AC: 19, AL: 19, AM: 20, AP: 18, BA: 20.5, CE: 20, DF: 20, ES: 17, GO: 19, MA: 22, MG: 18, MS: 17, MT: 17, PA: 19,
  PB: 20, PE: 20.5, PI: 21, PR: 19.5, RJ: 20, RN: 18, RO: 19.5, RR: 20, RS: 17, SC: 17, SE: 19, SP: 18, TO: 20,
}

export const UFS = Object.keys(ICMS_INTERNO_UF).sort()

// ---------------------------------------------------------------------------
// Reforma Tributária — cronograma de transição (EC 132/2023, ADCT arts. 125 a 133; LC 214/2025, arts. 343 a 348)
// ---------------------------------------------------------------------------

export const ANOS_TRANSICAO = [2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033] as const

export interface CenarioAliquotas {
  id: string
  nome: string
  cbs: number // alíquota de referência da CBS (%)
  ibs: number // alíquota de referência do IBS — estadual + municipal (%)
  fonte: string
}

/**
 * As alíquotas de referência definitivas ainda serão fixadas por Resolução do Senado
 * (LC 214/2025, arts. 18 e 353 a 359). Até lá usamos cenários de estimativa oficiais.
 */
export const CENARIOS_ALIQUOTA: CenarioAliquotas[] = [
  {
    id: 'cgibs_2026',
    nome: 'Estimativa CGIBS 2026 (27,91%)',
    cbs: 9.21,
    ibs: 18.7,
    fonte: 'Estimativa divulgada pelo Comitê Gestor do IBS em 2026 (alíquota combinada de 27,91%).',
  },
  {
    id: 'fazenda',
    nome: 'Ministério da Fazenda (26,5%)',
    cbs: 8.8,
    ibs: 17.7,
    fonte: 'Estudos da Secretaria Extraordinária da Reforma Tributária usados na tramitação do PLP 68/2024.',
  },
]

export interface RegrasAno {
  ano: number
  /** PIS/COFINS ainda cobrados (extintos a partir de 2027 — EC 132, art. 126, II ADCT). */
  pisCofins: boolean
  /** IPI ainda cobrado (alíquota zero a partir de 2027, exceto produtos com industrialização incentivada na ZFM — ADCT art. 126, III). */
  ipi: boolean
  /** Ano de teste: CBS 0,9% e IBS 0,1% destacados e compensáveis/dispensados (LC 214, arts. 343, 346 e 348). */
  teste: boolean
  cbs: number // fração
  ibs: number // fração
  /** Proporção das alíquotas de ICMS/ISS mantida (ADCT art. 128): 1 até 2028; 0,9 / 0,8 / 0,7 / 0,6 de 2029 a 2032; 0 em 2033. */
  icmsIssFator: number
  /** Fração do IBS "cheio" em vigor (0 até 2028 — exceto 0,1% fixo; 0,1 a 0,4 de 2029 a 2032; 1 em 2033). */
  ibsFator: number
}

/** Regras do ano, com as expectativas de alíquota informadas pelo contador (em %) sobrepondo o cronograma legal. */
export function regrasDoAno(ano: number, cbsRef: number, ibsRef: number, ajuste?: { cbs?: number; ibs?: number }): RegrasAno {
  const r = regrasLegais(ano, cbsRef, ibsRef)
  if (!ajuste || r.pisCofins) return r
  return { ...r, cbs: ajuste.cbs !== undefined ? ajuste.cbs / 100 : r.cbs, ibs: ajuste.ibs !== undefined ? ajuste.ibs / 100 : r.ibs }
}

function regrasLegais(ano: number, cbsRef: number, ibsRef: number): RegrasAno {
  const cbs = cbsRef / 100
  const ibs = ibsRef / 100
  if (ano <= 2026) return { ano, pisCofins: true, ipi: true, teste: ano === 2026, cbs: ano === 2026 ? 0.009 : 0, ibs: ano === 2026 ? 0.001 : 0, icmsIssFator: 1, ibsFator: 0 }
  // 2027-2028: CBS de referência reduzida em 0,1 p.p.; IBS 0,05% estadual + 0,05% municipal (LC 214, arts. 344 e 347)
  if (ano <= 2028) return { ano, pisCofins: false, ipi: false, teste: false, cbs: Math.max(0, cbs - 0.001), ibs: 0.001, icmsIssFator: 1, ibsFator: 0 }
  if (ano >= 2033) return { ano, pisCofins: false, ipi: false, teste: false, cbs, ibs, icmsIssFator: 0, ibsFator: 1 }
  const reducao = (ano - 2028) / 10 // 2029: 10% ... 2032: 40%
  return { ano, pisCofins: false, ipi: false, teste: false, cbs, ibs: ibs * reducao, icmsIssFator: 1 - reducao, ibsFator: reducao }
}

/** Presunção de lucro (Lei 9.249/1995, art. 15 e 20). */
export const PRESUNCAO = {
  comercio: { irpj: 8, csll: 12 },
  servicos: { irpj: 32, csll: 32 },
  transporte_carga: { irpj: 8, csll: 12 },
  transporte_passageiros: { irpj: 16, csll: 12 },
  revenda_combustiveis: { irpj: 1.6, csll: 12 },
}

/** LC 224/2025: percentuais de presunção acrescidos de 10% sobre a parcela da receita bruta anual que exceder R$ 5 milhões. */
export const LC224_LIMITE_ANUAL = 5_000_000
export const LC224_ACRESCIMO = 0.1

/**
 * Alíquota interestadual do ICMS (Resolução do Senado 22/1989 e 13/2012):
 * 4% para mercadoria importada (origem 1, 2, 3 ou 8); 7% das regiões Sul/Sudeste (exceto ES) para Norte, Nordeste,
 * Centro-Oeste e ES; 12% nos demais casos.
 */
const SUL_SUDESTE = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS']
export function aliquotaInterestadual(origem: string, ufOrigem: string, ufDestino: string): number {
  if (['1', '2', '3', '8'].includes(origem)) return 4
  if (SUL_SUDESTE.includes(ufOrigem) && !SUL_SUDESTE.includes(ufDestino)) return 7
  return 12
}

/** Dígito de origem da mercadoria (tabela A do CST), quando o CST/CSOSN vem com 4 dígitos (ex.: 1102, 5400) ou 3 (020). */
export function origemDoCst(cst: string): string {
  const c = cst.replace(/\D/g, '')
  if (c.length === 4) return c[0]
  if (c.length === 3 && ['00', '10', '20', '30', '40', '41', '50', '51', '60', '61', '70', '90'].includes(c.slice(1))) return c[0]
  return '0'
}
