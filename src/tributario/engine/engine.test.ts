import { describe, expect, it } from 'vitest'
import { apurar, faixaSimples, type Contexto } from './apuracao'
import { calcularRbt12, estimarMix, montarBases } from './base'
import { classificarCfop, fornecedorDoSimples } from './cfop'
import { ncmMonofasico, reducaoIbsCbs } from './ncm'
import { montarAnoBase, projetar } from './projecao'
import { ANEXOS_SIMPLES, aliquotaInterestadual, regrasDoAno } from './tabelas'
import { tipoDestinatario } from '../importacao/relatorios'
import { BASE_VAZIA, PARAMETROS_PADRAO, type BaseMensal, type MovimentoLinha, type Parametros } from './tipos'

const ctx = (p: Partial<Parametros> = {}, extra: Partial<Contexto> = {}): Contexto => ({
  params: { ...PARAMETROS_PADRAO, ...p },
  mix: { monofasico: 0, st: 0, reducaoIbsCbs: 0, b2b: 0, fornecedoresSimples: 0 },
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
    const mono = apurar('simples', [base], { ...ctx({}, { receitaHistorica: hist }), mix: { monofasico: 0.5, st: 0, reducaoIbsCbs: 0, b2b: 0, fornecedoresSimples: 0 } })
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
    const trad = apurar('simples', [b], ctx({ premissaPreco: 'repasse' }, { rbt12Fixo: 1_200_000 }))
    const hib = apurar('simples_hibrido', [b], ctx({ premissaPreco: 'repasse' }, { rbt12Fixo: 1_200_000 }))
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
    destinatario: '',
    parceiro: '',
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
    const [b] = montarBases(linhas, PARAMETROS_PADRAO, () => ({ uf: 'SP', aliquota: 18 }))
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
    const ajustado = montarBases(linhas, { ...PARAMETROS_PADRAO, cfopNatureza: { '6905': 'venda' } }, () => ({ uf: 'SP', aliquota: 18 }))[0]
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

describe('saídas detalhadas: destinatário, UF e NCM', () => {
  const l = (x: Partial<MovimentoLinha>): MovimentoLinha => ({
    estabelecimento_id: null, competencia: '2026-06', tipo: 'saida', cfop: '6106', ncm: '', uf: '', cst: '', servico: '', destinatario: '', parceiro: '',
    itens: 1, valor_contabil: 0, bc_icms: 0, icms: 0, icms_st: 0, ipi: 0, pis: 0, cofins: 0, iss: 0, difal: 0, retencoes: 0, ...x,
  })
  const estab = () => ({ uf: 'SP', aliquota: 18 })

  it('alíquota interestadual pela origem e pelas UFs (Res. SF 22/1989 e 13/2012)', () => {
    expect(aliquotaInterestadual('1', 'SP', 'MG')).toBe(4)
    expect(aliquotaInterestadual('0', 'SP', 'BA')).toBe(7)
    expect(aliquotaInterestadual('0', 'SP', 'ES')).toBe(7)
    expect(aliquotaInterestadual('0', 'SP', 'RJ')).toBe(12)
    expect(aliquotaInterestadual('0', 'BA', 'SP')).toBe(12)
  })

  it('calcula ICMS interestadual e DIFAL nota a nota', () => {
    const [b] = montarBases(
      [
        l({ uf: 'BA', cst: '0102', destinatario: 'PF', valor_contabil: 1000 }), // 7% + DIFAL até 20,5%
        l({ uf: 'MG', cst: '1102', destinatario: 'PJ_C', valor_contabil: 1000 }), // importado 4%, contribuinte sem DIFAL
      ],
      PARAMETROS_PADRAO,
      estab,
    )
    expect(b.icmsInterCalc).toBeCloseTo(70 + 40, 6)
    expect(b.difalCalc).toBeCloseTo(1000 * (0.205 - 0.07), 6)
    expect(b.vendasB2B).toBe(1000)
    expect(b.vendasPF).toBe(1000)
  })

  it('usa o tratamento de NCM definido pelo contador', () => {
    const linhas = [l({ ncm: '48189090', valor_contabil: 800, uf: 'SP', cfop: '5106' }), l({ ncm: '33049990', valor_contabil: 200, uf: 'SP', cfop: '5106' })]
    const padrao = montarBases(linhas, PARAMETROS_PADRAO, estab)[0]
    expect(padrao.vendasMonofasico).toBe(200)
    const cfg = { ...PARAMETROS_PADRAO, ncms: { '48189090': { st: true, reducao: 60 }, '33049990': { monofasico: false } } }
    const b = montarBases(linhas, cfg, estab)[0]
    expect(b.vendasMonofasico).toBe(0)
    expect(b.vendasSt).toBe(800)
    expect(b.vendasReducao).toBeCloseTo(480, 6)
  })

  it('aplica as alíquotas de CBS/IBS informadas para o ano', () => {
    const r = regrasDoAno(2030, 8.8, 17.7, { cbs: 9.5, ibs: 4 })
    expect(r.cbs).toBeCloseTo(0.095)
    expect(r.ibs).toBeCloseTo(0.04)
    expect(r.icmsIssFator).toBeCloseTo(0.8)
    expect(regrasDoAno(2026, 8.8, 17.7, { cbs: 5 }).pisCofins).toBe(true)
  })

  it('identifica pessoa física e PJ contribuinte pelo documento e IE', () => {
    expect(tipoDestinatario('00024015318668', 'ISENTO')).toBe('PF')
    expect(tipoDestinatario('11222333000181', '123456789')).toBe('PJ_C')
    expect(tipoDestinatario('11222333000181', 'ISENTO')).toBe('PJ_N')
    expect(tipoDestinatario('', '')).toBe('')
  })
})

describe('ICMS nas entradas, cenário de ICMS, premissa de preço, filtros e DRE', () => {
  const l = (x: Partial<MovimentoLinha>): MovimentoLinha => ({
    estabelecimento_id: null, competencia: '2026-06', tipo: 'entrada', cfop: '2102', ncm: '', uf: 'MG', cst: '000', servico: '', destinatario: 'PJ_C', parceiro: '',
    itens: 1, valor_contabil: 0, bc_icms: 0, icms: 0, icms_st: 0, ipi: 0, pis: 0, cofins: 0, iss: 0, difal: 0, retencoes: 0, ...x,
  })
  const estab = () => ({ uf: 'SP', aliquota: 18 })

  it('antecipação sem ST: valor × (interna do NCM − interestadual)', () => {
    const [b] = montarBases([l({ valor_contabil: 1000, bc_icms: 1000, icms: 120, ncm: '73269090' })], PARAMETROS_PADRAO, estab)
    expect(b.antecipacao).toBeCloseTo(1000 * 0.06, 6)
    const cfg = { ...PARAMETROS_PADRAO, ncms: { '73269090': { aliquotaIcms: 25 } } }
    expect(montarBases([l({ valor_contabil: 1000, bc_icms: 1000, icms: 120, ncm: '73269090' })], cfg, estab)[0].antecipacao).toBeCloseTo(130, 6)
  })

  it('ICMS-ST na entrada com MVA ajustada (Conv. ICMS 142/2018)', () => {
    const cfg = { ...PARAMETROS_PADRAO, ncms: { '33059000': { st: true, mva: 40 } } }
    const [b] = montarBases([l({ valor_contabil: 1000, bc_icms: 1000, icms: 70, ncm: '33059000' })], cfg, estab)
    const mvaAj = (1.4 * (1 - 0.07)) / (1 - 0.18) - 1
    expect(b.stEntradas).toBeCloseTo(1000 * (1 + mvaAj) * 0.18 - 70, 6)
    expect(b.antecipacao).toBe(0)
  })

  it('Simples: antecipação entra como ICMS fora do DAS', () => {
    const b = mes('2026-06', { vendas: 100_000, vendasInternas: 100_000, antecipacao: 3_000 })
    const com = apurar('simples', [b], ctx({}, { rbt12Fixo: 1_200_000 }))
    const sem = apurar('simples', [b], ctx({ antecipacaoSimples: false }, { rbt12Fixo: 1_200_000 }))
    expect(com.total - sem.total).toBeCloseTo(3_000, 6)
    expect(com.dre.icmsEntradas).toBeCloseTo(3_000, 6)
  })

  it('cenário: mudança de UF com carga efetiva e sem créditos', () => {
    const venda = (uf: string, dest: MovimentoLinha['destinatario']) =>
      l({ tipo: 'saida', cfop: uf === 'SP' ? '5102' : '6102', uf, destinatario: dest, valor_contabil: 1000 })
    const p = { ...PARAMETROS_PADRAO, cenarioIcms: { ativo: true, descricao: 'SC', uf: 'SC', aliquotaInterna: null, cargaInterestadual: 1, manterCreditos: false } }
    const [b] = montarBases([venda('SP', 'PJ_C'), venda('BA', 'PF')], p, estab)
    // SP e BA passam a ser interestaduais a partir de SC: carga de 1%; DIFAL BA = 20,5% − 7%
    expect(b.cenIcms).toBeCloseTo(20, 6)
    expect(b.cenDifal).toBeCloseTo(1000 * (0.205 - 0.07), 6)
  })

  it('preço mantido: IBS/CBS calculado "por dentro" do valor da nota', () => {
    const b = mes('2033-06', { vendas: 100_000, vendasInternas: 100_000 })
    const repasse = apurar('presumido', [b], ctx({ premissaPreco: 'repasse' }))
    const mantido = apurar('presumido', [b], ctx({ premissaPreco: 'preco_mantido' }))
    const a = (PARAMETROS_PADRAO.cbsReferencia + PARAMETROS_PADRAO.ibsReferencia) / 100
    expect(repasse.tributos.CBS + repasse.tributos.IBS).toBeCloseTo(100_000 * a, 4)
    expect(mantido.tributos.CBS + mantido.tributos.IBS).toBeCloseTo((100_000 / (1 + a)) * a, 4)
  })

  it('exclui CFOPs e clientes/fornecedores escolhidos', () => {
    const linhas = [
      l({ tipo: 'saida', cfop: '5102', uf: 'SP', parceiro: '11222333000181', valor_contabil: 500 }),
      l({ tipo: 'saida', cfop: '5102', uf: 'SP', destinatario: 'PF', valor_contabil: 300 }),
      l({ tipo: 'saida', cfop: '5106', uf: 'SP', valor_contabil: 200 }),
    ]
    const soma = (p: Partial<Parametros>) => montarBases(linhas, { ...PARAMETROS_PADRAO, ...p }, estab)[0]?.vendas ?? 0
    expect(soma({})).toBe(1000)
    expect(soma({ parceirosExcluidos: ['11222333000181'] })).toBe(500)
    expect(soma({ parceirosExcluidos: ['PF'] })).toBe(700)
    expect(soma({ cfopsExcluidos: ['5106'] })).toBe(800)
  })

  it('DRE do Presumido fecha com os tributos apurados', () => {
    const b = mes('2026-01', { vendas: 300_000, vendasInternas: 300_000, icmsVendasInternas: 54_000, compras: 150_000, icmsCompras: 18_000 })
    const r = apurar('presumido', [b], ctx())
    const ded = Object.values(r.dre.deducoes).reduce((a, v) => a + v, 0)
    // deduções − créditos de compras = ICMS + PIS + COFINS devidos
    expect(ded - r.dre.creditosCompras).toBeCloseTo(r.tributos.ICMS + r.tributos.PIS + r.tributos.COFINS, 4)
    expect(r.dre.irpj).toBeCloseTo(r.tributos.IRPJ, 6)
  })
})
