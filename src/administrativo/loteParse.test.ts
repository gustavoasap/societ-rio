import { describe, expect, it } from 'vitest'
import { lerLote } from './loteParse'

describe('cadastro em lote', () => {
  it('lê código e CNPJ em qualquer ordem e separador', () => {
    const l = lerLote('225  12.345.678/0001-90\n98765432000110;226\n\n12345678000199\nabc')
    expect(l).toHaveLength(4)
    expect(l[0]).toMatchObject({ codigo: 225, cnpj: '12345678000190', erro: null })
    expect(l[1]).toMatchObject({ codigo: 226, cnpj: '98765432000110' })
    expect(l[2]).toMatchObject({ codigo: null, cnpj: '12345678000199' })
    expect(l[3].erro).toMatch(/CNPJ/)
  })
})
