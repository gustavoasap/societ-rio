// Datas sempre no fuso local, no formato AAAA-MM-DD. Evita toISOString(), que usa UTC
// e, à noite no Brasil, já devolveria o dia seguinte.

const dois = (n: number) => String(n).padStart(2, '0')

export function paraISO(d: Date) {
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

export function hoje() {
  return paraISO(new Date())
}

/** "2026-09" */
export function mesDe(iso: string) {
  return iso.slice(0, 7)
}

export function mesAtual() {
  return mesDe(hoje())
}

export function diasNoMes(ano: number, mes1a12: number) {
  return new Date(ano, mes1a12, 0).getDate()
}

export function primeiroDia(mes: string) {
  return `${mes}-01`
}

export function ultimoDia(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${dois(diasNoMes(a, m))}`
}

/** Soma meses a um mês "AAAA-MM". */
export function somarMesesAoMes(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const total = a * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${dois((total % 12) + 1)}`
}

/** Soma meses a uma data mantendo o dia; se o mês não tiver esse dia, usa o último (31/01 + 1 → 28/02). */
export function somarMeses(iso: string, n: number) {
  const dia = Number(iso.slice(8, 10))
  const mes = somarMesesAoMes(mesDe(iso), n)
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${dois(Math.min(dia, diasNoMes(a, m)))}`
}

export function somarDias(iso: string, n: number) {
  const [a, m, d] = iso.split('-').map(Number)
  return paraISO(new Date(a, m - 1, d + n))
}

/** Diferença em dias (b - a). */
export function diasEntre(a: string, b: string) {
  const [a1, m1, d1] = a.split('-').map(Number)
  const [a2, m2, d2] = b.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

/**
 * Quantos meses de aporte restam até o prazo, contando o mês atual.
 * Ex.: hoje em 28/09 e prazo em 15/12 → set, out, nov, dez = 4.
 */
export function mesesRestantes(hojeISO: string, prazoISO: string) {
  const [a1, m1] = hojeISO.split('-').map(Number)
  const [a2, m2] = prazoISO.split('-').map(Number)
  return Math.max(0, (a2 - a1) * 12 + (m2 - m1) + 1)
}
