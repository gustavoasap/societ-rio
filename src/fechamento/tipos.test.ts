import { describe, expect, it } from 'vitest'
import {
  competenciaAtual,
  competenciaStatus,
  empresaNoAno,
  empresaNoMes,
  novoIdOpcao,
  obrigacaoNaGeral,
  obrigacaoNoMes,
  opcaoAtual,
  OPCOES_PADRAO,
  textoMeses,
} from './tipos'

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
    const o = { inicio: '2026-03-01' as string | null, fim: '2026-10-01', periodicidade: 'mensal' as const, meses_entrega: null }
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

describe('periodicidade', () => {
  const base = { inicio: null, fim: null, meses_entrega: null }
  it('sem início vale desde sempre (abertura de cada empresa)', () => {
    expect(obrigacaoNoMes({ ...base, periodicidade: 'mensal' }, '2001-01')).toBe(true)
  })
  it('anual só aparece nos meses de entrega', () => {
    const o = { ...base, periodicidade: 'anual' as const, meses_entrega: [3, 4, 5] }
    expect(obrigacaoNoMes(o, '2026-02')).toBe(false)
    expect(obrigacaoNoMes(o, '2026-04')).toBe(true)
    expect(obrigacaoNaGeral(o, '2026')).toBe(true)
  })
  it('única fica na visão geral', () => {
    const o = { ...base, periodicidade: 'unica' as const }
    expect(obrigacaoNoMes(o, '2026-04')).toBe(false)
    expect(obrigacaoNaGeral(o, '2026')).toBe(true)
    expect(obrigacaoNaGeral({ ...base, periodicidade: 'mensal' }, '2026')).toBe(false)
  })
  it('competência da marcação', () => {
    expect(competenciaStatus({ periodicidade: 'mensal' }, '2026-10')).toBe('2026-10-01')
    expect(competenciaStatus({ periodicidade: 'anual' }, '2026-10')).toBe('2026-01-01')
    expect(competenciaStatus({ periodicidade: 'unica' }, '2026-10')).toBe('1900-01-01')
  })
  it('competência atual é o mês anterior', () => {
    expect(competenciaAtual(new Date(2026, 10, 12))).toBe('2026-10')
    expect(competenciaAtual(new Date(2026, 0, 5))).toBe('2025-12')
  })
  it('empresa encerrada sai na competência seguinte à baixa', () => {
    const e = { status: 'encerrado' as const, data_abertura: '2020-01-10', data_encerramento: '2026-06-15' }
    expect(empresaNoMes(e, '2026-06')).toBe(true)
    expect(empresaNoMes(e, '2026-07')).toBe(false)
    expect(empresaNoAno(e, '2026')).toBe(true)
    expect(empresaNoAno(e, '2027')).toBe(false)
  })
  it('texto dos meses', () => {
    expect(textoMeses([5, 3, 4])).toBe('mar a mai')
    expect(textoMeses([3, 12])).toBe('mar e dez')
  })
})
