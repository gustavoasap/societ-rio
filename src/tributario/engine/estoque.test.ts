import { describe, expect, it } from 'vitest'
import { apurar } from './apuracao'
import { montarBases, segregacaoPgdas } from './base'
import { calcularEstoque, chaveNota, chaveProduto, gtinValido, guardaNota, movimentoEstoque, vincularProdutos, type ItemEstoque } from './estoque'
import { PARAMETROS_PADRAO, type MovimentoLinha } from './tipos'

const EAN_A = '7898975193260'
const EAN_B = '7898975193307'
const EAN_KIT = '6012511074009'

const item = (i: Partial<ItemEstoque>): ItemEstoque => ({
  competencia: '2026-05',
  tipo: 'entrada',
  cfop: '1102',
  codigo: '1',
  ean: EAN_A,
  descricao: 'Produto A',
  ncm: '33051000',
  unidade: 'UN',
  quantidade: 1,
  valor: 10,
  ...i,
})

describe('estoque pelo custo médio ponderado', () => {
  it('chave pelo EAN válido; senão pelo código', () => {
    expect(gtinValido(EAN_A)).toBe(true)
    expect(gtinValido('7898975193261')).toBe(false)
    expect(chaveProduto('SEM GTIN', '2000')).toBe('COD:2000')
    expect(chaveProduto(EAN_A, '1')).toBe(EAN_A)
  })

  it('movimento do CFOP: venda à ordem (x923) entra como compra; remessa não mexe; o contador pode trocar', () => {
    expect(movimentoEstoque('entrada', '2923')).toBe('compra')
    expect(movimentoEstoque('entrada', '1202')).toBe('dev_venda')
    expect(movimentoEstoque('saida', '5202')).toBe('dev_compra')
    expect(movimentoEstoque('saida', '5949')).toBeNull()
    expect(movimentoEstoque('entrada', '2923', {}, { '2923': 'neutro' })).toBeNull()
  })

  it('custo médio = (inicial + compras) ÷ (qtd inicial + compras); CMV = inicial + compras − final', () => {
    const r = calcularEstoque(
      [
        item({ quantidade: 10, valor: 120 }), // compra 10 × 12
        item({ tipo: 'saida', cfop: '5102', quantidade: 8, valor: 400 }),
        item({ tipo: 'entrada', cfop: '1202', quantidade: 2, valor: 100 }), // devolução de venda: volta pelo custo médio
        item({ competencia: '2026-06', quantidade: 6, valor: 90 }),
        item({ competencia: '2026-06', tipo: 'saida', cfop: '5102', quantidade: 5, valor: 250 }),
      ],
      { [EAN_A]: { chave: EAN_A, qtdInicial: 10, valorInicial: 100, componentes: null } },
    )
    const maio = r.produtos[0].meses['2026-05']
    expect(maio.custoMedio).toBeCloseTo(11, 6) // (100 + 120) ÷ 20
    expect(maio.cmv).toBeCloseTo(66, 6) // (8 − 2) × 11
    expect(maio.finalQ).toBe(14)
    expect(maio.finalV).toBeCloseTo(154, 6)
    expect(r.porMes['2026-05']).toMatchObject({ cmv: 66, estoqueInicial: 100, compras: 120, estoqueFinal: 154 })
    const jun = r.produtos[0].meses['2026-06']
    expect(jun.custoMedio).toBeCloseTo((154 + 90) / 20, 6)
    expect(r.porMes['2026-06'].cmv).toBeCloseTo(5 * 12.2, 2)
    // conferência: inicial + compras − final
    const p = r.porMes['2026-06']
    expect(p.estoqueInicial + p.compras - p.estoqueFinal).toBeCloseTo(p.cmv, 2)
  })

  it('devolução de compra sai pelo valor da nota', () => {
    const r = calcularEstoque([item({ quantidade: 10, valor: 100 }), item({ tipo: 'saida', cfop: '5202', quantidade: 2, valor: 30 })], {})
    expect(r.produtos[0].meses['2026-05']).toMatchObject({ finalQ: 8, finalV: 70 })
  })

  it('DE.PARA: o kit vendido baixa os componentes comprados; venda sem custo é estimada pela margem do mês', () => {
    const itens = [
      item({ quantidade: 10, valor: 100 }),
      item({ ean: EAN_B, codigo: '2', descricao: 'Produto B', quantidade: 10, valor: 50 }),
      item({ tipo: 'saida', cfop: '5102', ean: EAN_KIT, codigo: '9', descricao: 'Kit', quantidade: 3, valor: 90 }),
      item({ tipo: 'saida', cfop: '5102', ean: 'SEM GTIN', codigo: '777', descricao: 'Sem cadastro', quantidade: 1, valor: 45 }),
    ]
    const sem = calcularEstoque(itens, {})
    expect(sem.semCusto.map((s) => s.chave)).toEqual([EAN_KIT, 'COD:777'])
    expect(sem.porMes['2026-05'].cmv).toBe(0)

    const kit = { chave: EAN_KIT, qtdInicial: null, valorInicial: null, componentes: [{ chave: EAN_A, fator: 1 }, { chave: EAN_B, fator: 2 }] }
    const r = calcularEstoque(itens, { [EAN_KIT]: kit })
    expect(r.semCusto.map((s) => s.chave)).toEqual(['COD:777'])
    expect(r.porMes['2026-05'].cmv).toBeCloseTo(3 * 10 + 6 * 5, 2) // 60
    expect(r.porMes['2026-05'].cmvEstimado).toBeCloseTo(60 + 45 * (60 / 90), 2)
  })
})

describe('vínculo e operações fora do estoque', () => {
  const compra = (i: Partial<ItemEstoque>) => item({ nota: '100', parceiro: 'FORNECEDOR', ...i })

  it('liga devolução sem EAN à compra pela descrição e pelo SKU', () => {
    const { chaves, apelidos } = vincularProdutos([
      compra({ codigo: '3116', descricao: 'Alfaparf Semi di Lino' }),
      item({ tipo: 'saida', cfop: '5202', codigo: '2000000000001', ean: '', descricao: 'ALFAPARF SEMI DI LINO' }),
      item({ tipo: 'saida', cfop: '6106', codigo: '3116', ean: 'SEM GTIN', descricao: 'Anúncio' }),
    ])
    expect(chaves).toEqual([EAN_A, EAN_A, EAN_A])
    expect(apelidos['COD:2000000000001']).toBe(EAN_A)
  })

  it('compra devolvida no mesmo valor (5202 ou 6949 ao fornecedor) não compõe o estoque', () => {
    for (const cfop of ['5202', '6949']) {
      const r = calcularEstoque(
        [
          compra({ quantidade: 10, valor: 120, valor_produto: 100 }),
          compra({ nota: '101', quantidade: 10, valor: 100 }),
          item({ competencia: '2026-06', tipo: 'saida', cfop, nota: '9', parceiro: 'FORNECEDOR', ean: '', codigo: 'X', descricao: 'Produto A', quantidade: 10, valor: 100 }),
        ],
        {},
      )
      expect(r.pares).toHaveLength(1)
      expect(r.pares[0].entrada.nota).toBe('100') // a de mesmo valor dos produtos, não a de mesmo custo
      expect(r.porMes['2026-05'].compras).toBe(100)
      expect(r.produtos[0].meses['2026-06']).toMatchObject({ finalQ: 10, finalV: 100 })
    }
  })

  it('remessa de mesmo valor para outro parceiro (marketplace) não é pareada', () => {
    const r = calcularEstoque([compra({ quantidade: 10, valor: 100 }), item({ tipo: 'saida', cfop: '5949', nota: '7', parceiro: 'AMAZON', quantidade: 10, valor: 100 })], {})
    expect(r.pares).toHaveLength(0)
    expect(r.porMes['2026-05'].compras).toBe(100)
  })

  it('venda à ordem: 6118 pareada com a entrada 2923 do mesmo fornecedor não é venda', () => {
    const r = calcularEstoque(
      [
        compra({ quantidade: 10, valor: 100 }),
        compra({ competencia: '2026-06', cfop: '2923', nota: '200', quantidade: 5, valor: 60 }),
        item({ competencia: '2026-06', tipo: 'saida', cfop: '6118', nota: '300', parceiro: 'FORNECEDOR', quantidade: 5, valor: 60 }),
      ],
      {},
      {},
      { '2923': 'neutro' },
    )
    expect(r.pares.map((p) => [p.entrada.cfop, p.saida.cfop])).toEqual([['2923', '6118']])
    expect(r.porMes['2026-06'].cmv).toBe(0)
  })

  it('devolução de parte da compra pelo mesmo preço é estornada da compra', () => {
    const r = calcularEstoque([compra({ quantidade: 10, valor: 100 }), item({ competencia: '2026-06', tipo: 'saida', cfop: '5202', nota: '5', parceiro: 'FORNECEDOR', quantidade: 4, valor: 40 })], {})
    expect(r.pares[0]).toMatchObject({ tipo: 'parcial', quantidade: 4 })
    expect(r.porMes['2026-05'].compras).toBe(60)
  })

  it('nota fora do estoque e pareamento desligado', () => {
    const itens = [compra({ quantidade: 10, valor: 100 }), compra({ nota: '101', quantidade: 5, valor: 60 })]
    expect(calcularEstoque(itens, {}, {}, {}, { notasFora: [chaveNota(itens[1])] }).porMes['2026-05'].compras).toBe(100)
    const dev = [...itens, item({ tipo: 'saida', cfop: '5202', nota: '5', parceiro: 'FORNECEDOR', quantidade: 5, valor: 60 })]
    expect(calcularEstoque(dev, {}, {}, {}, { parear: false }).pares).toHaveLength(0)
  })

  it('produto sem estoque: venda vai para a receita sem CMV e sem pendência', () => {
    const itens = [compra({ quantidade: 10, valor: 100 }), item({ tipo: 'saida', cfop: '6106', ean: EAN_KIT, codigo: '9', descricao: 'Kit', quantidade: 2, valor: 80 })]
    const r = calcularEstoque(itens, { [EAN_KIT]: { chave: EAN_KIT, qtdInicial: null, valorInicial: null, componentes: null, semEstoque: true } })
    expect(r.semCusto).toHaveLength(0)
    expect(r.porMes['2026-05']).toMatchObject({ cmv: 0, cmvEstimado: 0, vendasSemEstoque: 80 })
  })

  it('guarda a nota nas compras e devoluções; vendas e remessas de depósito somam por mês', () => {
    expect(guardaNota('entrada', '2102')).toBe(true)
    expect(guardaNota('saida', '6949')).toBe(true)
    expect(guardaNota('saida', '6106')).toBe(false)
    expect(guardaNota('entrada', '1949')).toBe(false)
    expect(guardaNota('saida', '6905')).toBe(false)
  })
})

const linha = (l: Partial<MovimentoLinha>): MovimentoLinha => ({
  estabelecimento_id: 'filial',
  competencia: '2026-05',
  tipo: 'saida',
  cfop: '5102',
  ncm: '94049000',
  uf: 'SP',
  cst: '000',
  servico: '',
  destinatario: 'PJ_C',
  parceiro: '',
  itens: 1,
  valor_contabil: 1000,
  bc_icms: 1000,
  icms: 180,
  icms_st: 0,
  ipi: 0,
  pis: 0,
  cofins: 0,
  iss: 0,
  difal: 0,
  retencoes: 0,
  ...l,
})

describe('regime especial de ICMS do estabelecimento', () => {
  const benef = { ativo: true, descricao: 'TTD crédito presumido', cargaInterna: 2, cargaInterestadual: 2, aproveitaCreditos: false }
  const linhas = [linha({}), linha({ cfop: '6102', uf: 'RJ' }), linha({ tipo: 'entrada', cfop: '1102', icms: 120, valor_contabil: 600 })]

  it('sai pela carga efetiva e não credita o ICMS da compra', () => {
    const [b] = montarBases(linhas, PARAMETROS_PADRAO, () => ({ uf: 'SP', aliquota: 18, beneficio: benef }))
    expect(b.icmsVendasInternas).toBeCloseTo(20, 6)
    expect(b.icmsInterCalc).toBeCloseTo(20, 6)
    expect(b.icmsCompras).toBe(0)
    expect(b.icmsComprasSemCredito).toBe(120)
  })

  it('sem o regime, alíquota normal e crédito da compra', () => {
    const [b] = montarBases(linhas, PARAMETROS_PADRAO, () => ({ uf: 'SP', aliquota: 18 }))
    expect(b.icmsVendasInternas).toBeCloseTo(180, 6)
    expect(b.icmsCompras).toBe(120)
  })
})

describe('PGDAS', () => {
  const mix = { monofasico: 0, st: 0, reducaoIbsCbs: 0, b2b: 0, fornecedoresSimples: 0 }
  const linhas = [linha({ ncm: '33051000', cst: '0102', cst_pis: '99', icms: 0 }), linha({ ncm: '94049000', cst: '0500', cst_pis: '04', icms: 0 })]
  const estab = () => ({ uf: 'SP', aliquota: 18 })

  it('segregação pelo NCM, pelas notas ou sem segregar', () => {
    const p = { ...PARAMETROS_PADRAO, percentualMonofasico: null, percentualSt: null }
    const [b] = montarBases(linhas, p, estab)
    expect(segregacaoPgdas(b, { ...p, pgdasMonofasico: 'ncm' }, mix).monofasico).toBeCloseTo(0.5, 6) // xampu 3305: monofásico pela tabela
    expect(segregacaoPgdas(b, { ...p, pgdasMonofasico: 'notas' }, mix).monofasico).toBeCloseTo(0.5, 6) // CST PIS 04 na outra nota
    expect(segregacaoPgdas(b, { ...p, pgdasMonofasico: 'nao' }, mix).monofasico).toBe(0)
    expect(segregacaoPgdas(b, { ...p, pgdasSt: 'notas' }, mix).st).toBeCloseTo(0.5, 6) // CSOSN 500
    expect(segregacaoPgdas(b, { ...p, pgdasSt: 'nao' }, mix).st).toBe(0)
  })

  it('usa o RBT12 declarado no PGDAS quando informado', () => {
    const p = { ...PARAMETROS_PADRAO, pgdasMonofasico: 'nao' as const, pgdasSt: 'nao' as const, pgdas: { '2026-05': { rbt12: 900_000 } } }
    const r = apurar('simples', montarBases(linhas, p, estab), { params: p, mix, receitaHistorica: () => undefined })
    expect(r.porMes[0].simples?.rbt12).toBe(900_000)
    expect(r.porMes[0].simples?.rbt12Declarado).toBe(true)
  })
})
