import type { SocioCadastro } from './tipos'

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()

/** Confere os dígitos verificadores do CPF. */
export function cpfValido(cpf: string) {
  const c = digitos(cpf)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/** Sócio do cadastro com o mesmo nome (para mostrar o CPF ao lado do quadro da Receita). */
export function socioPorNome(socios: SocioCadastro[] | null | undefined, nome: string) {
  const n = semAcento(nome)
  return (socios ?? []).find((s) => semAcento(s.nome) === n)
}
