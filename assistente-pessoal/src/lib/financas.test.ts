import { describe, expect, it } from 'vitest'
import type { Categoria, Conta, Lancamento } from '../tipos'
import { somar } from './calculos'
import { aReceberDeTerceiros, datasDaFatura, despesasPorNatureza, faturaDe, faturasDoCartao, gerarParcelas, montarDre } from './financas'

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

const cat = (id: string, tipo: 'receita' | 'despesa', natureza: Categoria['natureza']): Categoria => ({
  id,
  nome: id,
  tipo,
  natureza,
  cor: 'azul',
  icone: 'tag',
  orcamento_mensal: null,
  ativa: true,
})

describe('parcelas a partir da parcela atual', () => {
  it('parcela 4 de 10: gera da 4ª à 10ª, uma por mês', () => {
    const p = gerarParcelas({ valor: 150, valorEhTotal: false, data: '2026-09-15', atual: 4, total: 10 })
    expect(p).toHaveLength(7)
    expect(p[0]).toEqual({ valor: 150, data: '2026-09-15', parcela: 4, parcelas: 10 })
    expect(p[6]).toEqual({ valor: 150, data: '2027-03-15', parcela: 10, parcelas: 10 })
  })
  it('valor total da compra: divide e a sobra de centavos fica na 1ª parcela', () => {
    const p = gerarParcelas({ valor: 1000, valorEhTotal: true, data: '2026-01-31', atual: 1, total: 3 })
    expect(p.map((x) => x.valor)).toEqual([333.34, 333.33, 333.33])
    expect(p.map((x) => x.data)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
  it('valor total começando na 2ª parcela não repete a sobra', () => {
    const p = gerarParcelas({ valor: 1000, valorEhTotal: true, data: '2026-09-01', atual: 2, total: 3 })
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33])
  })
})

describe('fatura do cartão', () => {
  it('fecha dia 3 e vence dia 10: compra no dia do fechamento vai para a próxima', () => {
    expect(faturaDe('2026-09-02', 3, 10)).toBe('2026-09')
    expect(faturaDe('2026-09-03', 3, 10)).toBe('2026-10')
  })
  it('fecha dia 25 e vence dia 5 do mês seguinte', () => {
    expect(faturaDe('2026-09-20', 25, 5)).toBe('2026-10')
    expect(faturaDe('2026-09-26', 25, 5)).toBe('2026-11')
    expect(datasDaFatura('2026-10', 25, 5)).toEqual({ fechamento: '2026-09-25', vencimento: '2026-10-05' })
  })
  it('sem dias cadastrados, usa o mês da compra', () => {
    expect(faturaDe('2026-09-26', null, null)).toBe('2026-09')
  })
  it('soma a fatura, desconta estornos e reconhece o pagamento', () => {
    const cartao: Conta = { id: 'k', nome: 'Nubank', tipo: 'cartao', instituicao: null, saldo_inicial: 0, limite: 5000, cor: 'roxo', ativa: true, ordem: 0, dia_fechamento: 3, dia_vencimento: 10 }
    const f = faturasDoCartao(cartao, [
      lanc({ conta_id: 'k', valor: 100, data: '2026-08-20' }),
      lanc({ conta_id: 'k', valor: 50, data: '2026-09-01', pessoa_id: 'maria' }),
      lanc({ conta_id: 'k', tipo: 'receita', valor: 30, data: '2026-08-25' }),
      lanc({ conta_id: 'k', valor: 999, data: '2026-09-05' }),
      lanc({ tipo: 'transferencia', conta_id: 'banco', conta_destino_id: 'k', valor: 120, data: '2026-09-08' }),
    ])
    expect(f.map((x) => x.mes)).toEqual(['2026-09', '2026-10'])
    expect(f[0].total).toBe(120)
    expect(f[0].pago).toBe(120)
    expect(f[0].vencimento).toBe('2026-09-10')
    expect(f[1].total).toBe(999)
  })
})

describe('DRE', () => {
  const categorias = [cat('salario', 'receita', 'fixa'), cat('aluguel', 'despesa', 'fixa'), cat('mercado', 'despesa', 'variavel'), cat('viagem', 'despesa', 'eventual')]
  const meses = ['2026-08', '2026-09']
  const lancs = [
    lanc({ tipo: 'receita', valor: 10000, categoria_id: 'salario', data: '2026-08-05' }),
    lanc({ tipo: 'receita', valor: 10000, categoria_id: 'salario', data: '2026-09-05' }),
    lanc({ valor: 3000, categoria_id: 'aluguel', data: '2026-08-10' }),
    lanc({ valor: 3000, categoria_id: 'aluguel', data: '2026-09-10' }),
    lanc({ valor: 800, categoria_id: 'mercado', data: '2026-09-12' }),
    // plano de saúde lançado em "mercado" mas classificado como fixo no próprio lançamento
    lanc({ valor: 200, categoria_id: 'mercado', natureza: 'fixa', data: '2026-09-12' }),
    lanc({ valor: 1500, categoria_id: 'viagem', data: '2026-09-20' }),
    // gasto da Maria no meu cartão: fora do meu resultado
    lanc({ valor: 400, categoria_id: 'mercado', pessoa_id: 'maria', data: '2026-09-15' }),
    lanc({ tipo: 'transferencia', valor: 5000, conta_destino_id: 'inv', data: '2026-09-15' }),
  ]
  const dre = montarDre(lancs, categorias, [{ id: 'maria', nome: 'Maria' }], meses)

  it('agrupa por classificação e calcula o resultado de cada mês', () => {
    expect(dre.receitaTotal).toEqual([10000, 10000])
    expect(dre.despesas.map((g) => [g.rotulo, g.valores])).toEqual([
      ['Custos fixos', [3000, 3200]],
      ['Custos variáveis', [0, 800]],
      ['Despesas eventuais', [0, 1500]],
    ])
    expect(dre.resultado).toEqual([7000, 4500])
  })
  it('separa as despesas de terceiros', () => {
    expect(dre.terceiros).toEqual([{ id: 'maria', rotulo: 'Maria', valores: [0, 400], total: 400 }])
  })
  it('total por classificação e a receber de terceiros', () => {
    expect(despesasPorNatureza(lancs, categorias)).toEqual({ fixa: 6200, variavel: 800, eventual: 1500 })
    const t = aReceberDeTerceiros([...lancs, lanc({ valor: 100, pessoa_id: 'maria', reembolsado: true })])
    expect(t.get('maria')?.total).toBe(400)
    expect(somar(dre.despesaTotal)).toBe(8500)
  })
})
