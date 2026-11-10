import { describe, expect, it } from 'vitest'
import { empresaNoMes, novoIdOpcao, obrigacaoNoMes, opcaoAtual, OPCOES_PADRAO } from './tipos'

describe('fechamento mensal', () => {
  it('empresa entra a partir do mês da abertura', () => {
    const e = { status: 'assinado' as const, data_abertura: '2026-06-15', data_encerramento: null }
    expect(empresaNoMes(e, '2026-05')).toBe(false)
    expect(empresaNoMes(e, '2026-06')).toBe(true)
    expect(empresaNoMes({ ...e, data_abertura: null }, '2020-01')).toBe(true)
  })
  it('encerrada aparece até o mês do encerramento', () => {
    const e = { status: 'encerrado' as const, data_abertura: '2026-01-10', data_encerramento: '2026-08-10' }
    expect(empresaNoMes(e, '2026-08')).toBe(true)
    expect(empresaNoMes(e, '2026-09')).toBe(false)
    expect(empresaNoMes({ ...e, data_encerramento: null }, '2026-03')).toBe(false)
  })
  it('obrigação vale entre início e fim', () => {
    const o = { inicio: '2026-03-01', fim: '2026-10-01' }
    expect(obrigacaoNoMes(o, '2026-02')).toBe(false)
    expect(obrigacaoNoMes(o, '2026-10')).toBe(true)
    expect(obrigacaoNoMes(o, '2026-11')).toBe(false)
    expect(obrigacaoNoMes({ ...o, fim: null }, '2030-01')).toBe(true)
  })
  it('opção atual e ids', () => {
    expect(opcaoAtual({ opcoes: OPCOES_PADRAO }, undefined).label).toBe('Pendente')
    expect(opcaoAtual({ opcoes: OPCOES_PADRAO }, 'concluido').label).toBe('Concluído')
    expect(opcaoAtual({ opcoes: OPCOES_PADRAO }, 'apagada').label).toBe('Pendente')
    expect(novoIdOpcao('Não se aplica', ['pendente'])).toBe('nao_se_aplica')
    expect(novoIdOpcao('Pendente', ['pendente', 'pendente_2'])).toBe('pendente_3')
  })
})

describe('opções padrão', () => {
  it('inclui N/A cinza, que conta como concluído', () => {
    expect(opcaoAtual({ opcoes: OPCOES_PADRAO }, 'na')).toMatchObject({ label: 'N/A', cor: 'cinza', concluido: true })
  })
})
