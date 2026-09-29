import { describe, expect, it } from 'vitest'
import type { Aporte, Lancamento, Meta } from '../tipos'
import { contasEmAberto, despesasPorCategoria, gerarRepeticao, progressoMeta, resumo, somar } from './calculos'
import { mesesRestantes, somarMeses, ultimoDia } from './datas'
import { lerValor } from './formato'

const lanc = (p: Partial<Lancamento>): Lancamento => ({
  id: Math.random().toString(),
  tipo: 'despesa',
  descricao: 'x',
  valor: 0,
  data: '2026-09-10',
  pago: true,
  conta_id: 'c1',
  conta_destino_id: null,
  categoria_id: null,
  observacao: null,
  grupo: null,
  parcela: null,
  parcelas: null,
  natureza: null,
  pessoa_id: null,
  reembolsado: false,
  recorrencia_id: null,
  ...p,
})

describe('datas', () => {
  it('soma meses mantendo o dia ou usando o último dia do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-11-15', 3)).toBe('2027-02-15')
  })
  it('último dia do mês', () => {
    expect(ultimoDia('2026-02')).toBe('2026-02-28')
    expect(ultimoDia('2026-12')).toBe('2026-12-31')
  })
  it('meses restantes contam o mês atual', () => {
    expect(mesesRestantes('2026-09-28', '2026-12-15')).toBe(4)
    expect(mesesRestantes('2026-09-28', '2026-09-30')).toBe(1)
    expect(mesesRestantes('2026-09-28', '2026-08-01')).toBe(0)
  })
})

describe('valores', () => {
  it('lê valores no formato brasileiro', () => {
    expect(lerValor('1.234,56')).toBe(1234.56)
    expect(lerValor('R$ 1.234')).toBe(1234)
    expect(lerValor('1234.5')).toBe(1234.5)
    expect(lerValor('')).toBeNull()
    expect(lerValor('abc')).toBeNull()
  })
  it('soma sem erro de ponto flutuante', () => {
    expect(somar([0.1, 0.2])).toBe(0.3)
  })
})

describe('resumo', () => {
  it('ignora transferências e separa o que está em aberto', () => {
    const r = resumo([
      lanc({ tipo: 'receita', valor: 5000 }),
      lanc({ tipo: 'despesa', valor: 1200.5 }),
      lanc({ tipo: 'despesa', valor: 300, pago: false }),
      lanc({ tipo: 'transferencia', valor: 999, conta_destino_id: 'c2' }),
    ])
    expect(r).toEqual({ receitas: 5000, despesas: 1500.5, resultado: 3499.5, aReceber: 0, aPagar: 300 })
  })
  it('agrupa despesas por categoria', () => {
    const g = despesasPorCategoria([
      lanc({ valor: 10, categoria_id: 'a' }),
      lanc({ valor: 30, categoria_id: 'b' }),
      lanc({ valor: 5, categoria_id: 'a' }),
      lanc({ tipo: 'receita', valor: 100, categoria_id: 'a' }),
    ])
    expect(g).toEqual([
      { categoriaId: 'b', total: 30 },
      { categoriaId: 'a', total: 15 },
    ])
  })
  it('contas em aberto: vencidas e próximas, sem as pagas', () => {
    const lista = contasEmAberto(
      [
        lanc({ id: 'vencida', data: '2026-09-01', pago: false }),
        lanc({ id: 'proxima', data: '2026-10-05', pago: false }),
        lanc({ id: 'longe', data: '2026-11-30', pago: false }),
        lanc({ id: 'paga', data: '2026-09-20', pago: true }),
      ],
      '2026-09-28',
    )
    expect(lista.map((l) => l.id)).toEqual(['vencida', 'proxima'])
  })
})

describe('repetição', () => {
  it('parcelado divide o total e joga a sobra de centavos na 1ª parcela', () => {
    const p = gerarRepeticao({ descricao: 'TV', valor: 1000, data: '2026-01-31' }, 3, 'parcelado')
    expect(p.map((x) => x.valor)).toEqual([333.34, 333.33, 333.33])
    expect(somar(p.map((x) => x.valor))).toBe(1000)
    expect(p.map((x) => x.data)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
    expect(p.map((x) => `${x.parcela}/${x.parcelas}`)).toEqual(['1/3', '2/3', '3/3'])
  })
  it('fixo repete o mesmo valor', () => {
    const p = gerarRepeticao({ descricao: 'Aluguel', valor: 2500, data: '2026-09-05' }, 12, 'fixo')
    expect(p).toHaveLength(12)
    expect(p.every((x) => x.valor === 2500 && x.parcela === null)).toBe(true)
    expect(p[11].data).toBe('2027-08-05')
  })
})

describe('metas', () => {
  const meta: Meta = { id: 'm', nome: 'Reserva', descricao: null, valor_alvo: 12000, prazo: '2026-12-31', cor: 'azul', icone: 'target', concluida: false, criado_em: '' }
  const ap = (valor: number): Aporte => ({ id: Math.random().toString(), meta_id: 'm', valor, data: '2026-09-01', observacao: null })

  it('calcula quanto falta e o aporte mensal até o prazo', () => {
    const p = progressoMeta(meta, [ap(3000), ap(1000), ap(-500)], '2026-09-28')
    expect(p.acumulado).toBe(3500)
    expect(p.falta).toBe(8500)
    expect(p.mesesRestantes).toBe(4)
    expect(p.porMes).toBe(2125)
    expect(p.atrasada).toBe(false)
  })
  it('meta com prazo vencido fica atrasada', () => {
    const p = progressoMeta({ ...meta, prazo: '2026-08-31' }, [ap(1000)], '2026-09-28')
    expect(p.atrasada).toBe(true)
    expect(p.porMes).toBeNull()
  })
  it('meta atingida não pede aporte', () => {
    const p = progressoMeta(meta, [ap(15000)], '2026-09-28')
    expect(p.fracao).toBe(1)
    expect(p.falta).toBe(0)
    expect(p.porMes).toBeNull()
  })
})
