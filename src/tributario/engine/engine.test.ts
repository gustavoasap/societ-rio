import { describe, expect, it } from 'vitest'
import { apurar, faixaSimples, type Contexto } from './apuracao'
import { calcularRbt12, estimarMix, montarBases } from './base'
import { classificarCfop, fornecedorDoSimples } from './cfop'
import { ncmMonofasico, reducaoIbsCbs } from './ncm'
import { montarAnoBase, projetar } from './projecao'
import { ANEXOS_SIMPLES, regrasDoAno } from './tabelas'
import { BASE_VAZIA, PARAMETROS_PADRAO, type BaseMensal, type MovimentoLinha, type Parametros } from './tipos'

const ctx = (p: Partial<Parametros> = {}, extra: Partial<Contexto> = {}): Contexto => ({
  params: { ...PARAMETROS_PADRAO, ...p },
  mix: { monofasico: 0, reducaoIbsCbs: 0, fornecedoresSimples: 0 },
  receitaHistorica: () => undefined,
  ...extra,
})

const mes = (competencia: string, v: Partial<BaseMensal>): BaseMensal => ({ ...BASE_VAZIA(competencia), ...v })

describe('tabelas do Simples', () => {
  it('partilha de cada faixa soma 100%', () => {
    for (const [anexo, { faixas }] of Object.entries(ANEXOS_SIMPLES)) {
      for (const f of faixas) {
        const soma = Object.values(f.partilha).reduce((a, b) => a + (b ?? 0), 0)
        expect(soma, `Anexo ${anexo} até ${f.ate}`).toBeCloseTo(1, 6)
      }
    }
  })

  it('alíquota efetiva pela fórmula do art. 18, §1º-A', () => {
    const f = faixaSimples('I', 1_416_707.88)
    expect(f.faixa).toBe(4)
    expect(f.efetiva).toBeCloseTo((1_416_707.88 * 0.107 - 22_500) / 1_416_707.88, 10)
    expect(faixaSimples('I', 0).efetiva).toBe(0.04)
    expect(faixaSimples('I', 180_000).faixa).toBe(1)
    expect(faixaSimples('I', 180_000.01).faixa).toBe(2)
  })

  it('limita o ISS a 5% e redistribui o excedente (Anexo III, faixa 5)', () => {
    const f = faixaSimples('III', 3_000_000)
    expect((f.partilha.ISS ?? 0) * f.efetiva).toBeCloseTo(0.05, 10)
    const soma = Object.values(f.partilha).reduce((a, b) => a + (b ?? 0), 0)
    expect(soma).toBeCloseTo(1, 10)
  })
})

describe('CFOP e CST', () => {
  it('classifica os CFOPs dos relatórios da Delta', () => {
    expect(classificarCfop('5106')).toBe('venda')
    expect(classificarCfop('6106')).toBe('venda')
    expect(classificarCfop('6108')).toBe('venda')
    expect(classificarCfop('6118')).toBe('venda')
    expect(classificarCfop('5202')).toBe('devolucao_compra')
    expect(classificarCfop('5949')).toBe('ignorar')
    expect(classificarCfop('6905')).toBe('remessa')
    expect(classificarCfop('1102')).toBe('compra_revenda')
    expect(classificarCfop('2102')).toBe('compra_revenda')
    expect(classificarCfop('1202')).toBe('devolucao_venda')
    expect(classificarCfop('2202')).toBe('devolucao_venda')
    expect(classificarCfop('2907')).toBe('retorno')
    expect(classificarCfop('2923')).toBe('remessa')
    expect(classificarCfop('1910')).toBe('bonificacao')
    expect(classificarCfop('2152')).toBe('transferencia')
    expect(classificarCfop('7102')).toBe('exportacao')
    expect(classificarCfop('3102')).toBe('compra_revenda')
    expect(classificarCfop('5933')).toBe('venda_servico')
  })

  it('identifica fornecedor do Simples pelo CSOSN', () => {
    expect(fornecedorDoSimples('102')).toBe(true)
    expect(fornecedorDoSimples('5102')).toBe(true)
    expect(fornecedorDoSimples('020')).toBe(false)
    expect(fornecedorDoSimples('000')).toBe(false)
    expect(fornecedorDoSimples('100')).toBe(false)
    expect(fornecedorDoSimples('')).toBe(null)
  })

  it('identifica NCM monofásico e reduções de IBS/CBS', () => {
    expect(ncmMonofasico('33059000')).toBe(true)
    expect(ncmMonofasico('96032900')).toBe(false)
    expect(ncmMonofasico('96032100')).toBe(true)
    expect(reducaoIbsCbs('33061000')).toBe(0.6)
    expect(reducaoIbsCbs('96190000')).toBe(1)
    expect(reducaoIbsCbs('73269090')).toBe(0)
  })
})

describe('cronograma da reforma', () => {
  it('segue a EC 132 e a LC 214', () => {
    const r26 = regrasDoAno(2026, 8.8, 17.7)
    expect(r26.pisCofins).toBe(true)
    expect(r26.teste).toBe(true)
    const r27 = regrasDoAno(2027, 8.8, 17.7)
    expect(r27.pisCofins).toBe(false)
    expect(r27.cbs).toBeCloseTo(0.087, 10)
    expect(r27.ibs).toBeCloseTo(0.001, 10)
    expect(r27.icmsIssFator).toBe(1)
    expect(regrasDoAno(2029, 8.8, 17.7).icmsIssFator).toBeCloseTo(0.9)
    expect(regrasDoAno(2029, 8.8, 17.7).ibs).toBeCloseTo(0.0177)
    expect(regrasDoAno(2032, 8.8, 17.7).icmsIssFator).toBeCloseTo(0.6)
    const r33 = regrasDoAno(2033, 8.8, 17.7)
    expect(r33.icmsIssFator).toBe(0)
    expect(r33.ibs).toBeCloseTo(0.177)
  })
})

describe('RBT12', () => {
  const receitas: Record<string, number> = {}
  for (let m = 1; m <= 12; m++) receitas[`2025-${String(m).padStart(2, '0')}`] = 10_000
  it('soma os 12 meses anteriores', () => {
    expect(calcularRbt12('2026-01', (c) => receitas[c], '').rbt12).toBe(120_000)
  })
  it('proporcionaliza no início de atividade (art. 18, §2º)', () => {
    const r = calcularRbt12('2025-04', (c) => receitas[c], '2025-01')
    expect(r.proporcional).toBe(true)
    expect(r.rbt12).toBe(120_000)
    const primeiro = calcularRbt12('2025-01', () => 5_000, '2025-01')
    expect(primeiro.rbt12).toBe(60_000)
  })
})

describe('Simples Nacional', () => {
  const base = mes('2026-06', { vendas: 100_000, vendasInternas: 100_000 })
  const hist = (c: string) => (c < '2026-06' ? 100_000 : undefined)

  it('calcula o DAS com partilha e segrega monofásico', () => {
    const r = apurar('simples', [base], ctx({}, { receitaHistorica: hist }))
    const f = faixaSimples('I', 1_200_000)
    expect(r.das).toBeCloseTo(100_000 * f.efetiva, 6)
    const mono = apurar('simples', [base], { ...ctx({}, { receitaHistorica: hist }), mix: { monofasico: 0.5, reducaoIbsCbs: 0, fornecedoresSimples: 0 } })
    const pisCofins = 100_000 * f.efetiva * (0.1274 + 0.0276)
    expect(mono.das).toBeCloseTo(r.das - pisCofins * 0.5, 6)
  })

  it('em 2027 troca PIS/COFINS por CBS sem mudar o total (Simples tradicional)', () => {
    const b27 = { ...base, competencia: '2027-06' }
    const h27 = (c: string) => (c < '2027-06' ? 100_000 : undefined)
    const r26 = apurar('simples', [base], ctx({}, { receitaHistorica: hist }))
    const r27 = apurar('simples', [b27], ctx({}, { receitaHistorica: h27 }))
    expect(r27.total).toBeCloseTo(r26.total, 6)
    expect(r27.tributos.CBS).toBeCloseTo(r26.tributos.PIS + r26.tributos.COFINS, 6)
    expect(r27.tributos.PIS).toBe(0)
  })

  it('em 2029 converte 10% da parcela de ICMS em IBS', () => {
    const b = { ...base, competencia: '2029-06' }
    const r = apurar('simples', [b], ctx({}, { rbt12Fixo: 1_200_000 }))
    expect(r.tributos.IBS / (r.tributos.ICMS + r.tributos.IBS)).toBeCloseTo(0.1, 6)
  })

  it('híbrido: DAS sem CBS/IBS + IBS/CBS por fora com créditos', () => {
    const b = mes('2027-06', { vendas: 100_000, vendasInternas: 100_000, compras: 60_000, icmsCompras: 7_200 })
    const trad = apurar('simples', [b], ctx({}, { rbt12Fixo: 1_200_000 }))
    const hib = apurar('simples_hibrido', [b], ctx({}, { rbt12Fixo: 1_200_000 }))
    expect(hib.das).toBeCloseTo(trad.das - trad.tributos.CBS, 6)
    const aliq = regrasDoAno(2027, PARAMETROS_PADRAO.cbsReferencia, PARAMETROS_PADRAO.ibsReferencia)
    const esperado = (100_000 - trad.tributos.ICMS) * (aliq.cbs + aliq.ibs) - (60_000 - 7_200) * (aliq.cbs + aliq.ibs)
    expect(hib.tributos.CBS + hib.tributos.IBS).toBeCloseTo(esperado, 4)
  })

  it('marca inelegível acima de R$ 4,8 milhões', () => {
    const r = apurar('simples', [base], ctx({}, { rbt12Fixo: 5_000_000 }))
    expect(r.elegivel).toBe(false)
  })
})

describe('Lucro Presumido', () => {
  it('IRPJ, CSLL, PIS/COFINS e ICMS de um trimestre de comércio', () => {
    const meses = ['2026-01', '2026-02', '2026-03'].map((c) => mes(c, { vendas: 300_000, vendasInternas: 300_000, icmsVendasInternas: 54_000, compras: 150_000, icmsCompras: 18_000 }))
    const r = apurar('presumido', meses, ctx())
    const baseIrpj = 900_000 * 0.08
    expect(r.tributos.IRPJ).toBeCloseTo(baseIrpj * 0.15 + (baseIrpj - 60_000) * 0.1, 6)
    expect(r.tributos.CSLL).toBeCloseTo(900_000 * 0.12 * 0.09, 6)
    expect(r.tributos.ICMS).toBeCloseTo((54_000 - 18_000) * 3, 6)
    const basePc = 900_000 - 54_000 * 3
    expect(r.tributos.PIS).toBeCloseTo(basePc * 0.0065, 6)
    expect(r.tributos.COFINS).toBeCloseTo(basePc * 0.03, 6)
  })

  it('aplica o acréscimo da LC 224/2025 sobre o excedente de R$ 5 milhões', () => {
    const meses = Array.from({ length: 12 }, (_, i) => mes(`2026-${String(i + 1).padStart(2, '0')}`, { vendas: 500_000 }))
    const r = apurar('presumido', meses, ctx())
    const sem = 6_000_000 * 0.08
    const com = sem + 1_000_000 * 0.08 * 0.1
    const irpj = com * 0.15 + (com - 240_000) * 0.1
    expect(r.tributos.IRPJ).toBeCloseTo(irpj, 4)
  })
})

describe('Lucro Real', () => {
  it('apura PIS/COFINS não cumulativos e IRPJ/CSLL sobre o lucro', () => {
    const b = mes('2026-01', { vendas: 100_000, vendasInternas: 100_000, icmsVendasInternas: 18_000, compras: 50_000, icmsCompras: 6_000 })
    const r = apurar('real', [b], ctx())
    const basePc = 100_000 - 18_000
    const credito = (50_000 - 6_000) * 0.0925
    expect(r.tributos.PIS + r.tributos.COFINS).toBeCloseTo(basePc * 0.0925 - credito, 6)
    const lucro = 100_000 - (r.tributos.ICMS + r.tributos.PIS + r.tributos.COFINS) - 50_000
    expect(r.tributos.IRPJ).toBeCloseTo(lucro * 0.15 + (lucro - 20_000) * 0.1, 6)
    expect(r.tributos.CSLL).toBeCloseTo(lucro * 0.09, 6)
  })
})

describe('agregação e projeção', () => {
  const linha = (l: Partial<MovimentoLinha>): MovimentoLinha => ({
    estabelecimento_id: null,
    competencia: '2026-06',
    tipo: 'entrada',
    cfop: '',
    ncm: '',
    uf: '',
    cst: '',
    servico: '',
    itens: 1,
    valor_contabil: 0,
    bc_icms: 0,
    icms: 0,
    icms_st: 0,
    ipi: 0,
    pis: 0,
    cofins: 0,
    iss: 0,
    difal: 0,
    retencoes: 0,
    ...l,
  })

  it('separa receita, compras e operações neutras', () => {
    const linhas = [
      linha({ tipo: 'saida', cfop: '5106', valor_contabil: 1000 }),
      linha({ tipo: 'saida', cfop: '6106', valor_contabil: 500 }),
      linha({ tipo: 'saida', cfop: '6905', valor_contabil: 9999 }),
      linha({ tipo: 'entrada', cfop: '1102', valor_contabil: 400, icms: 72, ncm: '33059000', cst: '020' }),
      linha({ tipo: 'entrada', cfop: '1949', valor_contabil: 7777, ncm: '96032900' }),
      linha({ tipo: 'entrada', cfop: '2202', valor_contabil: 50 }),
      linha({ tipo: 'servico_tomado', servico: '11.04.01', valor_contabil: 100 }),
      linha({ tipo: 'servico_tomado', servico: '10.05.01', valor_contabil: 30 }),
    ]
    const [b] = montarBases(linhas, PARAMETROS_PADRAO, () => 18)
    expect(b.vendas).toBe(1500)
    expect(b.vendasInternas).toBe(1000)
    expect(b.icmsVendasInternas).toBe(180)
    expect(b.devolucoesVenda).toBe(50)
    expect(b.compras).toBe(400)
    expect(b.icmsCompras).toBe(72)
    expect(b.comprasMonofasico).toBe(400)
    expect(b.servicosTomados).toBe(130)
    expect(b.servicosTomadosCreditaveis).toBe(100)
    const mix = estimarMix(linhas, PARAMETROS_PADRAO)
    expect(mix.monofasico).toBeCloseTo(400 / (400 + 7777), 10)
    const ajustado = montarBases(linhas, { ...PARAMETROS_PADRAO, cfopNatureza: { '6905': 'venda' } }, () => 18)[0]
    expect(ajustado.vendas).toBe(1500 + 9999)
  })

  it('anualiza meses faltantes pela média e projeta 2026-2033', () => {
    const bases = ['2026-04', '2026-05', '2026-06'].map((c) => mes(c, { vendas: 100_000, vendasInternas: 100_000, icmsVendasInternas: 18_000 }))
    const ano = montarAnoBase(bases)
    expect(ano.meses).toHaveLength(12)
    expect(ano.anualizado).toBe(true)
    const proj = projetar(bases, ctx())
    expect(proj.map((p) => p.ano)).toEqual([2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033])
    expect(proj[0].receita).toBeCloseTo(1_200_000, 6)
    expect(proj[0].resultados.simples_hibrido).toBeUndefined()
    expect(proj[1].resultados.simples_hibrido).toBeDefined()
    // Simples tradicional sem monofásico: carga constante ao longo da transição
    expect(proj[7].resultados.simples!.total).toBeCloseTo(proj[0].resultados.simples!.total, 4)
  })
})
