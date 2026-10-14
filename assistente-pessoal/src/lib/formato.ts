const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function moeda(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Valor curto para eixos e cartões: R$ 1,2 mil, R$ 3,4 mi. */
export function moedaCurta(v: number) {
  const a = Math.abs(v)
  const s = v < 0 ? '-' : ''
  if (a >= 1e6) return `${s}R$ ${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `${s}R$ ${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `${s}R$ ${a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

export function percentual(v: number, casas = 0) {
  return `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`
}

/** Aceita "1.234,56", "1234,56", "1234.56" ou "R$ 1.234". Devolve null se vazio/inválido. */
export function lerValor(texto: string): number | null {
  let t = texto.replace(/[R$\s]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Número para preencher um campo de valor: 1234.5 → "1.234,50". */
export function valorParaCampo(v: number | null | undefined) {
  if (v === null || v === undefined) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function dataBR(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Mês válido de 1 a 12 em "AAAA-MM..."; durante a digitação de uma data o valor pode vir incompleto. */
function partesMes(mes: string | null | undefined): [number, number] | null {
  const [a, m] = (mes ?? '').split('-').map(Number)
  return Number.isInteger(a) && a > 0 && Number.isInteger(m) && m >= 1 && m <= 12 ? [a, m] : null
}

/** "2026-09" → "setembro de 2026" */
export function mesPorExtenso(mes: string) {
  const p = partesMes(mes)
  return p ? `${MESES[p[1] - 1]} de ${p[0]}` : '—'
}

/** "2026-09" → "set/26" */
export function mesAbreviado(mes: string) {
  const p = partesMes(mes)
  return p ? `${MESES[p[1] - 1].slice(0, 3)}/${String(p[0]).slice(2)}` : '—'
}

/** "2026-09-28" → "seg, 28 de setembro" */
export function diaPorExtenso(iso: string) {
  if (!dataValida(iso)) return '—'
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  const semana = dt.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return `${semana}, ${d} de ${MESES[m - 1]}`
}

/** Data completa e plausível (AAAA-MM-DD, ano de 1900 a 2199) — o campo de data passa por valores incompletos enquanto se digita. */
export function dataValida(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const [a, m, d] = iso.split('-').map(Number)
  if (a < 1900 || a > 2199 || m < 1 || m > 12 || d < 1) return false
  return d <= new Date(a, m, 0).getDate()
}
