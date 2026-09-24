// Tratamentos tributários identificados pelo NCM do produto.
// As listas abaixo cobrem os casos mais comuns; o contador pode ajustar o percentual nos parâmetros da empresa.

const limpar = (ncm: string) => ncm.replace(/\D/g, '')

/**
 * PIS/COFINS monofásico — a revenda tem alíquota zero (e no Simples os percentuais de PIS/COFINS são excluídos do DAS,
 * LC 123, art. 18, §4º-A, I).
 * - Lei 10.147/2000: farmacêuticos (3001, 3003, 3004, 3002.10, 3005, 3006.30...), perfumaria, higiene pessoal e cosméticos
 *   (3303 a 3307, 3401.11.90 ex, 3401.20.10, 9603.21.00).
 * - Lei 10.485/2002: pneus e câmaras de ar (4011, 4013) — autopeças constam de anexos próprios (verificar caso a caso).
 * - Lei 13.097/2015: bebidas frias (2106.90.10 ex 02, 2201, 2202, 2203, 2204...).
 * - Lei 9.718/1998 e 10.865/2004: combustíveis (2710, 2711, 2207.10, 2207.20).
 */
const MONOFASICO: string[] = [
  '3001', '3002', '3003', '3004', '3005', '3006',
  '3303', '3304', '3305', '3306', '3307', '34011190', '34012010', '96032100',
  '4011', '4013',
  '2201', '2202', '2203', '2204', '2205', '2206', '2208',
  '2710', '2711', '220710', '220720',
]

export function ncmMonofasico(ncm: string): boolean {
  const n = limpar(ncm)
  return n.length >= 4 && MONOFASICO.some((pref) => n.startsWith(pref))
}

/**
 * Redução de 60% das alíquotas de IBS/CBS — Anexo VIII da LC 214/2025
 * (produtos de higiene pessoal e limpeza majoritariamente consumidos por famílias de baixa renda).
 * Absorventes e itens de saúde menstrual têm alíquota zero (LC 214, art. 147).
 */
const REDUCAO_60: string[] = ['34011190', '330610', '96032100', '48181000', '28289011', '34011900']
const ALIQUOTA_ZERO: string[] = ['96190000']

/** Percentual de redução das alíquotas de IBS/CBS aplicável ao NCM (0, 0,6 ou 1). */
export function reducaoIbsCbs(ncm: string): number {
  const n = limpar(ncm)
  if (!n) return 0
  if (ALIQUOTA_ZERO.some((pref) => n.startsWith(pref))) return 1
  if (REDUCAO_60.some((pref) => n.startsWith(pref))) return 0.6
  return 0
}

/** Tratamento efetivo do NCM na empresa: o que o contador definiu, senão o padrão do sistema. */
export function tratamentoNcm(ncm: string, config: Record<string, { monofasico?: boolean; st?: boolean; reducao?: number }>) {
  const c = config[limpar(ncm)] ?? {}
  return {
    monofasico: c.monofasico ?? ncmMonofasico(ncm),
    st: c.st ?? false,
    reducao: c.reducao !== undefined ? c.reducao / 100 : reducaoIbsCbs(ncm),
  }
}
