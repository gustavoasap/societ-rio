import { describe, expect, it } from 'vitest'
import { faixaSimples } from './apuracao'
import { composicaoAoPreco, precoParaMargem, type ContextoPreco, type EntradaPreco } from './preco'
import { PARAMETROS_PADRAO, type Parametros } from './tipos'

const entrada = (e: Partial<EntradaPreco> = {}): EntradaPreco => ({
  custo: 100,
  fornecedor: 'normal',
  icmsCompra: 12,
  stCompra: 0,
  icmsVenda: 18,
  st: false,
  monofasico: false,
  reducao: 0,
  despesasVariaveis: 5,
  despesasFixas: 10,
  margem: 10,
  ...e,
})

const contexto = (ano: number, p: Partial<Parametros> = {}): ContextoPreco => ({
  params: { ...PARAMETROS_PADRAO, ...p },
  ano,
  rbt12: 1_200_000,
  irCsllPresumido: 0.0228,
  irCsllReal: 0.34,
})

describe('formação de preço', () => {
  it('Presumido 2026: preço fecha a margem pedida com a conta manual', () => {
    const e = entrada()
    const r = precoParaMargem('presumido', e, contexto(2026))
    expect(r.viavel).toBe(true)
    expect(r.margem).toBeCloseTo(0.1, 6)
    // P − 18% ICMS − 3,65% × (P − ICMS) − (100 − 12) − 15% P − 2,28% P = 10% P
    const k = 1 - 0.18 - 0.0365 * 0.82 - 0.15 - 0.0228 - 0.1
    expect(r.preco).toBeCloseTo(88 / k, 6)
    expect(r.ibsCbsFora).toBe(0) // 2026: CBS/IBS de teste, compensável
  })

  it('Real 2026 não cumulativo: crédito de 9,25% sobre a compra sem ICMS e IR/CSLL sobre o lucro', () => {
    const r = composicaoAoPreco('real', 200, entrada(), contexto(2026))
    expect(r.creditoPisCofins).toBeCloseTo(88 * 0.0925, 6)
    expect(r.pisCofins).toBeCloseTo((200 - 36) * 0.0925 - 88 * 0.0925, 6)
    const lair = 200 - 36 - (200 - 36) * 0.0925 - (100 - 12 - 88 * 0.0925) - 30
    expect(r.irCsll).toBeCloseTo(lair * 0.34, 6)
  })

  it('Simples 2026: DAS pela alíquota efetiva, sem crédito de ICMS', () => {
    const r = composicaoAoPreco('simples', 200, entrada(), contexto(2026))
    const fx = faixaSimples('I', 1_200_000)
    expect(r.das).toBeCloseTo(200 * fx.efetiva, 6)
    expect(r.creditoIcms).toBe(0)
    expect(r.custoLiquido).toBe(100)
  })

  it('2033 regime regular: CBS/IBS por fora, integralmente creditável pelo cliente', () => {
    const ctx = contexto(2033)
    const r = composicaoAoPreco('presumido', 200, entrada(), ctx)
    const a = (PARAMETROS_PADRAO.cbsReferencia + PARAMETROS_PADRAO.ibsReferencia) / 100
    expect(r.icms).toBe(0) // ICMS extinto
    expect(r.ibsCbsFora).toBeCloseTo(200 * a, 6)
    expect(r.precoFinal).toBeCloseTo(200 * (1 + a), 6)
    expect(r.custoCliente).toBeCloseTo(200, 6)
    // preço mantido: o fornecedor embute a CBS/IBS no valor pago e o crédito é (100 − ICMS) × a ÷ (1 + a)
    expect(r.creditoIbsCbs).toBeCloseTo((100 - 12) * a / (1 + a), 6)
  })

  it('Simples tradicional em 2033: CBS/IBS no DAS, sem crédito nas compras e crédito limitado ao cliente', () => {
    const ctx = contexto(2033)
    const s = composicaoAoPreco('simples', 200, entrada(), ctx)
    const h = composicaoAoPreco('simples_hibrido', 200, entrada(), ctx)
    expect(s.creditoIbsCbs).toBe(0)
    expect(h.creditoIbsCbs).toBeGreaterThan(0)
    expect(h.das).toBeLessThan(s.das) // híbrido tira a CBS/IBS do DAS
    expect(h.creditoCliente).toBeGreaterThan(s.creditoCliente)
  })

  it('fornecedor MEI e PF não geram crédito de IBS/CBS; PF também não gera PIS/COFINS no Real', () => {
    const mei = composicaoAoPreco('real', 200, entrada({ fornecedor: 'mei', icmsCompra: 0 }), contexto(2033))
    expect(mei.creditoIbsCbs).toBe(0)
    const pf = composicaoAoPreco('real', 200, entrada({ fornecedor: 'pf', icmsCompra: 0 }), contexto(2026))
    expect(pf.creditoPisCofins).toBe(0)
    const meiHoje = composicaoAoPreco('real', 200, entrada({ fornecedor: 'mei', icmsCompra: 0 }), contexto(2026))
    expect(meiHoje.creditoPisCofins).toBeCloseTo(9.25, 6)
  })

  it('repasse: o fornecedor tira o PIS/COFINS extinto e soma CBS/IBS por fora', () => {
    const ctx = contexto(2027, { premissaPreco: 'repasse' })
    const r = composicaoAoPreco('real', 200, entrada({ fornecedor: 'presumido' }), ctx)
    const a = ctx.params.cbsReferencia / 100 - 0.001 + 0.001
    const base = 100 - 12 - 3.65
    expect(r.creditoIbsCbs).toBeCloseTo(base * a, 6)
    expect(r.desembolsoCompra).toBeCloseTo(100 - 3.65 + base * a, 6)
  })

  it('margem inviável é sinalizada', () => {
    const r = precoParaMargem('presumido', entrada({ despesasFixas: 60, margem: 30 }), contexto(2026))
    expect(r.viavel).toBe(false)
  })

  it('todos os regimes e anos fecham a margem pedida', () => {
    for (const ano of [2026, 2027, 2029, 2033])
      for (const regime of ['simples', 'simples_hibrido', 'presumido', 'real'] as const) {
        const r = precoParaMargem(regime, entrada({ margem: 8 }), contexto(ano))
        expect(r.viavel, `${regime} ${ano}`).toBe(true)
        expect(r.margem, `${regime} ${ano}`).toBeCloseTo(0.08, 6)
      }
  })
})
