import { describe, expect, it } from 'vitest'
import { icmsDaVenda, icmsVendasInternasPorAliquota } from './icms'
import { cstComSt, perfilIcmsPorNcm } from './perfilNcm'
import { PARAMETROS_PADRAO, type MovimentoLinha } from './tipos'

const linha = (l: Partial<MovimentoLinha>): MovimentoLinha => ({
  estabelecimento_id: 'sp',
  competencia: '2026-05',
  tipo: 'saida',
  cfop: '5102',
  ncm: '33030010',
  uf: 'SP',
  cst: '000',
  servico: '',
  destinatario: 'PF',
  parceiro: '',
  itens: 1,
  valor_contabil: 1000,
  bc_icms: 1000,
  icms: 250,
  icms_st: 0,
  ipi: 0,
  pis: 0,
  cofins: 0,
  iss: 0,
  difal: 0,
  retencoes: 0,
  ...l,
})

const uf = (id: string | null) => (id === 'mg' ? 'MG' : 'SP')

describe('ICMS por produto (NCM) pelas notas', () => {
  it('reconhece ST pela CST (regime normal) e pelo CSOSN (Simples)', () => {
    expect(cstComSt('060')).toBe(true)
    expect(cstComSt('010')).toBe(true)
    expect(cstComSt('000')).toBe(false)
    expect(cstComSt('0500')).toBe(true) // origem 0 + CSOSN 500
    expect(cstComSt('5102')).toBe(false)
    expect(cstComSt('')).toBeNull()
  })

  it('usa as vendas internas da empresa antes das compras', () => {
    const p = perfilIcmsPorNcm(
      [linha({}), linha({ tipo: 'entrada', cfop: '1102', icms: 180, bc_icms: 1000 })],
      uf,
      'SP',
    )
    expect(p.get('33030010')).toMatchObject({ aliquota: 25, nominal: 25, fonteAliquota: 'saidas', st: false })
  })

  it('sem venda com ICMS (Simples), usa as compras internas de fornecedor do regime normal, com a redução de base', () => {
    const p = perfilIcmsPorNcm(
      [
        linha({ cst: '0102', icms: 0, bc_icms: 0 }), // venda do Simples: sem ICMS destacado
        linha({ tipo: 'entrada', cfop: '1102', ncm: '33030010', cst: '020', valor_contabil: 1000, bc_icms: 480, icms: 120 }),
        linha({ tipo: 'entrada', cfop: '1102', ncm: '33030010', cst: '0101', icms: 30, bc_icms: 1000 }), // fornecedor do Simples: ignorado
        linha({ tipo: 'entrada', cfop: '2102', ncm: '33030010', cst: '000', icms: 120, bc_icms: 1000 }), // interestadual: ignorado
      ],
      uf,
      'SP',
    )
    expect(p.get('33030010')).toMatchObject({ aliquota: 12, nominal: 25, fonteAliquota: 'entradas' })
  })

  it('detecta ST na maioria das vendas e ignora outra UF', () => {
    const p = perfilIcmsPorNcm(
      [
        linha({ ncm: '22021000', cst: '060', icms: 0, bc_icms: 0, valor_contabil: 800 }),
        linha({ ncm: '22021000', cst: '000', valor_contabil: 200 }),
        linha({ ncm: '94049000', estabelecimento_id: 'mg', icms: 180 }),
      ],
      uf,
      'SP',
    )
    expect(p.get('22021000')?.st).toBe(true)
    expect(p.has('94049000')).toBe(false)
  })

  it('a venda interna usa a alíquota do produto só na UF de referência', () => {
    const params = { ...PARAMETROS_PADRAO, ncms: { '33030010': { aliquotaIcms: 25 } }, ufAliquotasNcm: 'SP' }
    const l = linha({})
    expect(icmsDaVenda(l, params, { uf: 'SP', aliquotaInterna: 18 }, 'cfop')?.aliquota).toBe(25)
    expect(icmsDaVenda(l, params, { uf: 'MG', aliquotaInterna: 18 }, 'cfop')?.aliquota).toBe(18)
    const faixas = icmsVendasInternasPorAliquota([l, linha({ ncm: '94049000' })], params, () => ({ uf: 'SP', aliquotaInterna: 18 }), () => true)
    expect(faixas.map((f) => [f.aliquota, f.ncms])).toEqual([
      [25, ['33030010']],
      [18, ['94049000']],
    ])
  })
})

describe('substituição tributária', () => {
  it('lista nacional de ST (Conv. ICMS 142/2018) por posição ou código do NCM', async () => {
    const { itensStDoNcm } = await import('./listaSt')
    const perfume = itensStDoNcm('33030010')
    expect(perfume.map((i) => i.segmento)).toContain('Produtos de perfumaria, higiene pessoal e cosméticos')
    expect(perfume).toContainEqual(expect.objectContaining({ cest: '28.001.00', segmento: 'Venda de mercadorias pelo sistema porta a porta' }))
    expect(itensStDoNcm('39171010').some((i) => i.segmento === 'Autopeças')).toBe(true) // posição 3917
    expect(itensStDoNcm('48189090')[0]).toMatchObject({ cest: '20.047.00' }) // papel toalha: lista pelo NCM
    expect(itensStDoNcm('94049000')).toEqual([])
  })

  it('substituída: sem débito na venda interna e sem crédito do ICMS da compra; substituta mantém os dois', async () => {
    const { montarBases } = await import('./base')
    const estab = () => ({ uf: 'SP', aliquota: 18 })
    const linhas = [linha({ ncm: '22021000', icms: 0, bc_icms: 0 }), linha({ tipo: 'entrada', cfop: '1403', ncm: '22021000', icms: 120, cst: '060', valor_contabil: 600 })]
    const base = { ...PARAMETROS_PADRAO, ncms: { '22021000': { st: true } } }
    const [sub] = montarBases(linhas, base, estab)
    expect(sub.icmsVendasInternas).toBe(0)
    expect(sub.icmsCompras).toBe(0)
    expect(sub.icmsComprasSemCredito).toBe(120)
    expect(sub.vendasSt).toBe(1000)
    const [tto] = montarBases(linhas, { ...base, papelSt: 'substituto' }, estab)
    expect(tto.icmsVendasInternas).toBe(180)
    expect(tto.icmsCompras).toBe(120)
    expect(tto.vendasSt).toBe(0)
  })
})
