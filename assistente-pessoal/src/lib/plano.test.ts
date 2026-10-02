import { describe, expect, it } from 'vitest'
import type { Categoria, Lancamento, Recorrencia } from '../tipos'
import { disponivelNoMes, mensalizado, montarPlano, ocorreNoMes, projetar } from './plano'

const cat = (id: string, natureza: Categoria['natureza'], essencial: boolean, orcamento_mensal: number | null = null): Categoria => ({
  id,
  nome: id,
  tipo: 'despesa',
  cor: 'azul',
  icone: 'tag',
  natureza,
  essencial,
  orcamento_mensal,
  ativa: true,
})

const rec = (p: Partial<Recorrencia>): Recorrencia => ({
  id: Math.random().toString(),
  tipo: 'despesa',
  descricao: 'x',
  valor: 0,
  dia: 5,
  dia_util: null,
  intervalo_meses: 1,
  conta_id: 'c',
  categoria_id: null,
  pessoa_id: null,
  natureza: null,
  auto_pago: false,
  inicio: '2026-01-01',
  fim: null,
  ativa: true,
  gerado_ate: null,
  observacao: null,
  ...p,
})

const lanc = (p: Partial<Lancamento>): Lancamento => ({
  id: Math.random().toString(),
  tipo: 'despesa',
  descricao: 'x',
  valor: 0,
  data: '2026-09-10',
  pago: true,
  conta_id: 'c',
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

describe('periodicidade', () => {
  it('anual cai só no mês do início; semestral a cada 6 meses', () => {
    const ipva = rec({ inicio: '2026-03-15', intervalo_meses: 12 })
    expect(ocorreNoMes(ipva, '2026-03')).toBe(true)
    expect(ocorreNoMes(ipva, '2026-04')).toBe(false)
    expect(ocorreNoMes(ipva, '2027-03')).toBe(true)
    const seguro = rec({ inicio: '2026-05-10', intervalo_meses: 6 })
    expect(['2026-05', '2026-08', '2026-11', '2027-05'].map((m) => ocorreNoMes(seguro, m))).toEqual([true, false, true, true])
    expect(ocorreNoMes(rec({ inicio: '2026-05-01', fim: '2026-08-31' }), '2026-09')).toBe(false)
  })
  it('provisão mensal de uma despesa anual', () => {
    expect(mensalizado({ valor: 2400, intervalo_meses: 12 })).toBe(200)
    expect(mensalizado({ valor: 900, intervalo_meses: 6 })).toBe(150)
  })
})

describe('plano financeiro', () => {
  const categorias = [cat('moradia', 'fixa', true, 3200), cat('mercado', 'variavel', true, 1500), cat('lazer', 'variavel', false), cat('ipva', 'eventual', true)]
  const recorrencias = [
    rec({ tipo: 'receita', valor: 10000, descricao: 'Pró-labore' }),
    rec({ valor: 3000, categoria_id: 'moradia', descricao: 'Aluguel' }),
    rec({ valor: 2400, categoria_id: 'ipva', intervalo_meses: 12, inicio: '2026-03-15' }),
    rec({ valor: 500, categoria_id: 'lazer', pessoa_id: 'maria' }), // de terceiro: fora do plano
  ]
  const lancamentos = [
    // 3 meses de histórico fechado (jul, ago, set) com mercado e lazer avulsos
    ...['2026-07', '2026-08', '2026-09'].flatMap((m) => [lanc({ data: `${m}-12`, valor: 1200, categoria_id: 'mercado' }), lanc({ data: `${m}-20`, valor: 600, categoria_id: 'lazer' })]),
    // aluguel gerado pela recorrência: não pode contar em dobro na média
    lanc({ data: '2026-09-10', valor: 3000, categoria_id: 'moradia', recorrencia_id: 'r' }),
    // aluguel e pró-labore lançados à mão antes de virarem recorrência: também não contam em dobro
    lanc({ data: '2026-07-10', valor: 3000, categoria_id: 'moradia', descricao: 'Aluguel' }),
    lanc({ tipo: 'receita', data: '2026-07-05', valor: 10000, descricao: 'pró-labore' }),
    // parcela de compra já lançada para novembro
    lanc({ data: '2026-11-15', valor: 350, categoria_id: 'lazer', grupo: 'g', parcela: 3, parcelas: 10 }),
    // renda extra avulsa em agosto (média de 3 meses = 300)
    lanc({ tipo: 'receita', data: '2026-08-05', valor: 900 }),
  ]
  const plano = montarPlano({
    categorias,
    recorrencias,
    lancamentos,
    metas: [
      { id: 'r', nome: 'Reserva de emergência', descricao: null, valor_alvo: 30000, prazo: '2027-06-30', cor: 'verde', icone: 'piggy-bank', concluida: false, criado_em: '' },
      { id: 'm', nome: 'Viagem', descricao: null, valor_alvo: 12000, prazo: '2027-09-30', cor: 'azul', icone: 'plane', concluida: false, criado_em: '' },
    ],
    aportes: [],
    config: { meses_reserva: 6, pct_investimento: 20 },
    saldoReserva: 10000,
    hoje: '2026-10-02',
  })

  it('renda: recorrente + média das receitas avulsas', () => {
    expect(plano.renda).toEqual({ recorrente: 10000, variavelMedia: 300, total: 10300 })
  })
  it('custo de vida: recorrências mensalizadas + média, ou o limite do orçamento se for maior; + parcelas', () => {
    // moradia: aluguel 3.000 (recorrente) e limite 3.200 para a categoria inteira → 3.200, não 6.200
    const porCat = Object.fromEntries(plano.custos.map((x) => [x.categoriaId, x.estimativa]))
    expect(porCat).toEqual({ moradia: 3200, mercado: 1500, ipva: 200, lazer: 600 })
    expect(plano.parcelas).toBe(350) // parcela já lançada para o mês que vem (novembro)
    expect(plano.custoTotal).toBe(5850)
    expect(plano.custoEssencial).toBe(4900)
    expect(plano.rendaMinima).toBe(4900)
    expect(plano.provisaoAnuais).toBe(200)
  })
  it('reserva de emergência de 6 meses de gastos essenciais', () => {
    expect(plano.reserva.alvo).toBe(29400)
    expect(plano.reserva.falta).toBe(19400)
    // guardar 20% da renda (2.060); a reserva leva o necessário para completar em 12 meses
    expect(plano.guardar).toBe(2060)
    expect(plano.reserva.aporte).toBe(1616.67)
    expect(plano.investir).toBe(443.33)
    expect(plano.reserva.meses).toBe(12)
  })
  it('metas e o que sobra livre', () => {
    // a meta "Reserva de emergência" não entra de novo: a reserva já tem a sua caixinha
    expect(plano.metas.map((x) => x.meta.nome)).toEqual(['Viagem'])
    expect(plano.metas[0].porMes).toBe(1000) // 12.000 em 12 meses (out/26 a set/27)
    expect(plano.livre).toBe(10300 - 5850 - 2060 - 1000)
  })
  it('projeção: IPVA só em março; parcela de novembro entra em novembro', () => {
    const p = projetar({ plano, recorrencias, lancamentos, patrimonioAtual: 20000, hoje: '2026-10-02' })
    const nov = p.find((x) => x.mes === '2026-11')!
    const dez = p.find((x) => x.mes === '2026-12')!
    const mar = p.find((x) => x.mes === '2027-03')!
    // avulsos mensais: mercado 1.500 (orçamento) + lazer 600 + folga de 200 do limite de moradia = 2.300
    expect(dez.saidas).toBe(3000 + 2300)
    expect(nov.saidas).toBe(3000 + 2300 + 350)
    expect(mar.saidas).toBe(3000 + 2400 + 2300)
    expect(dez.entradas).toBe(10300)
    expect(p).toHaveLength(12)
    expect(p[0].patrimonio).toBe(20000 + p[0].resultado)
  })
  it('disponível para gastar no mês', () => {
    const d = disponivelNoMes({
      plano,
      lancamentos: [lanc({ tipo: 'receita', data: '2026-10-05', valor: 10000 }), lanc({ data: '2026-10-10', valor: 3000 }), lanc({ data: '2026-10-02', valor: 200, pessoa_id: 'maria' })],
      hoje: '2026-10-02',
    })
    expect(d.renda).toBe(10300)
    expect(d.gasto).toBe(3000)
    expect(d.separar).toBe(2060 + 1000 + 200)
    expect(d.disponivel).toBe(10300 - 3000 - 3260)
    expect(d.diasRestantes).toBe(30)
  })
})
