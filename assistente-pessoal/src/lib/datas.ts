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

// ---------------------------------------------------------------- dias úteis

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number) {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return paraISO(new Date(ano, mes - 1, dia))
}

/**
 * Feriados nacionais: 01/01, 21/04, 01/05, 07/09, 12/10, 02/11, 15/11, 20/11, 25/12
 * (Leis 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023) e a Sexta-feira Santa (Lei 9.093/1995).
 */
export function feriadoNacional(iso: string) {
  const md = iso.slice(5)
  if (['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].includes(md)) return true
  return iso === somarDias(pascoa(Number(iso.slice(0, 4))), -2)
}

export type ModoDiaUtil = 'seg_sab' | 'seg_sex'

/**
 * N-ésimo dia útil do mês. Para salário, o sábado conta como dia útil (CLT art. 459 §1º e
 * Instrução Normativa MTb/SNT nº 1/1989): modo 'seg_sab'. Domingos e feriados nacionais nunca contam.
 * Se o mês não tiver tantos dias úteis, devolve o último dia do mês.
 */
export function enesimoDiaUtil(mes: string, n: number, modo: ModoDiaUtil = 'seg_sab') {
  const [a, m] = mes.split('-').map(Number)
  let cont = 0
  for (let d = 1; d <= diasNoMes(a, m); d++) {
    const iso = `${mes}-${String(d).padStart(2, '0')}`
    const semana = new Date(a, m - 1, d).getDay() // 0 = domingo, 6 = sábado
    if (semana === 0 || (semana === 6 && modo === 'seg_sex') || feriadoNacional(iso)) continue
    if (++cont === n) return iso
  }
  return ultimoDia(mes)
}

/** Data de uma recorrência no mês: dia fixo (limitado ao fim do mês) ou N-ésimo dia útil. */
export function dataDaRecorrencia(mes: string, dia: number, modo: ModoDiaUtil | null) {
  if (modo) return enesimoDiaUtil(mes, dia, modo)
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${String(Math.min(dia, diasNoMes(a, m))).padStart(2, '0')}`
}
