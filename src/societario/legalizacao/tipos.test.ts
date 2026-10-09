import { describe, expect, it } from 'vitest'
import { anosTfe, situacaoValidade } from './tipos'

const hoje = new Date(2026, 9, 8) // 08/10/2026

describe('situacaoValidade', () => {
  it('classifica vencida, vencendo em até 30 dias e válida', () => {
    expect(situacaoValidade(null, hoje)).toBe('sem_data')
    expect(situacaoValidade('2026-10-07', hoje)).toBe('vencida')
    expect(situacaoValidade('2026-10-08', hoje)).toBe('vence_em_breve')
    expect(situacaoValidade('2026-11-07', hoje)).toBe('vence_em_breve')
    expect(situacaoValidade('2026-11-08', hoje)).toBe('valida')
  })
})

describe('anosTfe', () => {
  it('vai do ano de abertura até o ano atual, do mais recente para o mais antigo', () => {
    expect(anosTfe('2023-05-10', [], hoje)).toEqual([2026, 2025, 2024, 2023])
  })
  it('sem data de abertura, mostra só o ano atual', () => {
    expect(anosTfe(null, [], hoje)).toEqual([2026])
  })
  it('inclui anos já salvos fora do intervalo', () => {
    expect(anosTfe('2025-01-01', [2027, 2022], hoje)).toEqual([2027, 2026, 2025, 2024, 2023, 2022])
  })
})
