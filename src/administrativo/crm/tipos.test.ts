import { describe, expect, it } from 'vitest'
import { diasDesdeInstante, prazoDe, resumir, valorPonderado, type Oportunidade } from './tipos'

const agora = new Date(2026, 10, 5, 14, 0) // 05/11/2026 14:00 local
const local = (d: number, h = 0, m = 0) => new Date(2026, 10, d, h, m).toISOString()

describe('prazoDe', () => {
  it('sem data', () => expect(prazoDe(null, agora)).toBe('sem_data'))
  it('ontem é atrasada', () => expect(prazoDe(local(4), agora)).toBe('atrasada'))
  it('hoje sem horário é hoje', () => expect(prazoDe(local(5), agora)).toBe('hoje'))
  it('hoje com horário passado é atrasada', () => expect(prazoDe(local(5, 9), agora)).toBe('atrasada'))
  it('hoje com horário futuro é hoje', () => expect(prazoDe(local(5, 16), agora)).toBe('hoje'))
  it('em 7 dias é semana', () => expect(prazoDe(local(12), agora)).toBe('semana'))
  it('em 8 dias é depois', () => expect(prazoDe(local(13), agora)).toBe('depois'))
})

const op = (o: Partial<Oportunidade>) => ({ etapa: 'lead', valor_mensal: null, created_at: local(1), fechado_em: null, ...o }) as Oportunidade

describe('indicadores', () => {
  it('valor ponderado usa a probabilidade da etapa', () => {
    expect(valorPonderado({ etapa: 'proposta', valor_mensal: 1000 })).toBeCloseTo(550)
    expect(valorPonderado({ etapa: 'perdido', valor_mensal: 1000 })).toBe(0)
  })
  it('dias desde', () => expect(diasDesdeInstante(local(1, 23), agora)).toBe(4))
  it('resumo do período', () => {
    const r = resumir(
      [
        op({ etapa: 'lead', valor_mensal: 500 }),
        op({ etapa: 'negociacao', valor_mensal: 1000 }),
        op({ etapa: 'ganho', valor_mensal: 800, fechado_em: local(3) }),
        op({ etapa: 'ganho', valor_mensal: 1200, fechado_em: local(4) }),
        op({ etapa: 'perdido', valor_mensal: 900, fechado_em: local(4) }),
        op({ etapa: 'ganho', valor_mensal: 5000, fechado_em: new Date(2026, 9, 10).toISOString() }),
      ],
      new Date(2026, 10, 1),
    )
    expect(r.abertas).toBe(2)
    expect(r.mrrFunil).toBe(1500)
    expect(r.ponderado).toBeCloseTo(50 + 750)
    expect(r.ganhasPeriodo).toBe(2)
    expect(r.mrrGanho).toBe(2000)
    expect(r.conversao).toBeCloseTo(2 / 3)
    expect(r.ticket).toBe(1000)
    expect(r.cicloMedio).toBe(2.5)
  })
})
