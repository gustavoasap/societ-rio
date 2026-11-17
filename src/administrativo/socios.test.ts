import { describe, expect, it } from 'vitest'
import { cpfValido, socioPorNome } from './socios'

describe('sócios do cadastro', () => {
  it('valida CPF pelos dígitos verificadores', () => {
    expect(cpfValido('957.568.170-34')).toBe(true)
    expect(cpfValido('957.568.170-35')).toBe(false)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('123')).toBe(false)
  })
  it('acha o sócio pelo nome sem diferenciar acento e maiúsculas', () => {
    const s = [{ nome: 'JOSÉ DA SILVA', cpf: '957.568.170-34', qualificacao: null }]
    expect(socioPorNome(s, 'Jose da Silva')?.cpf).toBe('957.568.170-34')
    expect(socioPorNome(s, 'MARIA')).toBeUndefined()
  })
})
