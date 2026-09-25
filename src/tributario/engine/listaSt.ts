import { CEST_142, SEGMENTOS_ST } from './cest142'

export interface ItemListaSt {
  cest: string // 00.000.00
  segmento: string
  descricao: string
}

const formatarCest = (c: string) => `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 7)}`

// índice por posição/subposição/item do NCM (4 a 8 dígitos), como aparecem nos anexos do convênio
const indice = new Map<string, ItemListaSt[]>()
for (const [cest, ncms, descricao] of CEST_142) {
  const item = { cest: formatarCest(cest), segmento: SEGMENTOS_ST[cest.slice(0, 2)] ?? `Segmento ${cest.slice(0, 2)}`, descricao }
  for (const n of ncms) indice.set(n, [...(indice.get(n) ?? []), item])
}

/**
 * Itens do Convênio ICMS 142/2018 (Anexos II a XXVI) em que o NCM se enquadra — pela posição (4 dígitos),
 * subposição (5 e 6), item (7) ou código completo (8). Vazio = NCM fora da lista nacional de ST.
 */
export function itensStDoNcm(ncm: string): ItemListaSt[] {
  const n = ncm.replace(/\D/g, '')
  if (n.length < 4) return []
  const r: ItemListaSt[] = []
  for (let k = 4; k <= Math.min(8, n.length); k++) r.push(...(indice.get(n.slice(0, k)) ?? []))
  return r
}
