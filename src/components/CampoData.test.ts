import { describe, expect, it } from 'vitest'
import { brParaIso, isoParaBR, mascaraDataBR, mascaraHora } from './CampoData'

describe('datas DD/MM/AAAA', () => {
  it('converte', () => {
    expect(isoParaBR('2026-11-05')).toBe('05/11/2026')
    expect(isoParaBR('')).toBe('')
    expect(brParaIso('05/11/2026')).toBe('2026-11-05')
    expect(brParaIso('31/02/2026')).toBeNull()
    expect(brParaIso('5/11/2026')).toBeNull()
  })
  it('máscaras', () => {
    expect(mascaraDataBR('05112026')).toBe('05/11/2026')
    expect(mascaraDataBR('0511')).toBe('05/11')
    expect(mascaraDataBR('05/11/20261')).toBe('05/11/2026')
    expect(mascaraHora('1430')).toBe('14:30')
  })
})
