import { TABELAS_PIS_COFINS } from './tabelasPisCofins'

export type TabelaPisCofins = '4.3.10' | '4.3.11' | '4.3.12' | '4.3.13' | '4.3.14' | '4.3.15' | '4.3.16'

export interface RegraPisCofins {
  tabela: TabelaPisCofins
  cst: string
  ncm: string
  natureza: string
  aliquota: string
  inicio: string | null
  fim: string | null
  descricao: string
  /** NCM citado só no texto da regra (capítulo ou posição que localiza o produto, sem defini-lo) */
  soDescricao: boolean
}

export const NOME_TABELA_PC: Record<TabelaPisCofins, string> = {
  '4.3.10': 'Monofásico (alíquotas diferenciadas)',
  '4.3.11': 'Monofásico (por unidade de medida)',
  '4.3.12': 'Substituição tributária de PIS/COFINS',
  '4.3.13': 'Alíquota zero',
  '4.3.14': 'Isenção',
  '4.3.15': 'Sem incidência',
  '4.3.16': 'Suspensão',
}

/** Tabelas em que a revenda não tem PIS/COFINS porque a tributação ficou concentrada no fabricante/importador. */
export const TABELAS_MONOFASICAS: TabelaPisCofins[] = ['4.3.10', '4.3.11', '4.3.12']

/** Exceções expressas da Lei 10.147/2000, art. 1º, I, "a": 3003.90.56 e 3004.90.46 ficam fora do monofásico. */
const EXCECOES_MONOFASICO = ['30039056', '30049046']

const REGRAS: RegraPisCofins[] = TABELAS_PIS_COFINS.map(([tabela, cst, ncm, natureza, aliquota, inicio, fim, descricao, soDescricao]) => ({
  tabela: tabela as TabelaPisCofins,
  cst,
  ncm,
  natureza,
  aliquota,
  inicio,
  fim,
  descricao,
  soDescricao: soDescricao === 1,
}))

const hoje = () => new Date().toISOString().slice(0, 10)

/** Regras das tabelas 4.3.10 a 4.3.16 que alcançam o NCM na data (capítulo, posição, subposição ou código). */
export function regrasPisCofinsDoNcm(ncm: string, data = hoje()): RegraPisCofins[] {
  const n = ncm.replace(/\D/g, '')
  if (n.length < 2) return []
  return REGRAS.filter((r) => {
    if (!n.startsWith(r.ncm) || (r.inicio && r.inicio > data) || (r.fim && r.fim < data)) return false
    if (TABELAS_MONOFASICAS.includes(r.tabela) && EXCECOES_MONOFASICO.some((e) => n.startsWith(e))) return false
    return true
  })
}

/** Monofásico pela tabela oficial vigente (4.3.10, 4.3.11 ou 4.3.12), sem as exceções da lei. */
export function monofasicoPelaTabela(ncm: string, data = hoje()): RegraPisCofins | null {
  return regrasPisCofinsDoNcm(ncm, data).find((r) => TABELAS_MONOFASICAS.includes(r.tabela) && !r.soDescricao) ?? null
}

/** Alíquota zero, isenção, não incidência ou suspensão (4.3.13 a 4.3.16) — informativo: muitas regras têm condições. */
export function beneficiosPisCofins(ncm: string, data = hoje()): RegraPisCofins[] {
  return regrasPisCofinsDoNcm(ncm, data).filter((r) => !TABELAS_MONOFASICAS.includes(r.tabela))
}
export { VERSAO_TABELAS_SPED as VERSAO_PC } from './tabelasPisCofins'
