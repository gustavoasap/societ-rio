import { describe, expect, it } from 'vitest'
import { lerNumeroBR, moedaDigitada } from './format'

const limpar = (s: string) => s.replace(/\s/g, ' ')

describe('lerNumeroBR', () => {
  it.each([
    ['10000', 10000],
    ['10.000', 10000],
    ['1.000.000', 1000000],
    ['10000,5', 10000.5],
    ['10.000,00', 10000],
    ['R$ 10.000,00', 10000],
    ['R$ 1.234,56', 1234.56],
    ['1500.50', 1500.5],
    ['1500.5', 1500.5],
    ['', null],
    ['abc', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(lerNumeroBR(entrada)).toBe(esperado)
  })
})

describe('moedaDigitada', () => {
  it('sempre R$, ponto nos milhares e 2 casas', () => {
    expect(limpar(moedaDigitada('10000'))).toBe('R$ 10.000,00')
    expect(limpar(moedaDigitada('1000000,5'))).toBe('R$ 1.000.000,50')
    expect(limpar(moedaDigitada('500'))).toBe('R$ 500,00')
    expect(moedaDigitada('')).toBe('')
  })
})
