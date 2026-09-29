import { describe, expect, it } from 'vitest'
import type { ItemEstoque } from './estoque'
import { aplicarAjustesItens, aplicarAjustesLinhas, resumoNotas, type AjusteNota, type NotaDetalhe } from './notas'
import type { MovimentoLinha } from './tipos'

const linha = (l: Partial<MovimentoLinha>): MovimentoLinha => ({
  estabelecimento_id: 'e1',
  competencia: '2026-05',
  tipo: 'entrada',
  cfop: '2102',
  ncm: '48189090',
  uf: 'SC',
  cst: '000',
  cst_pis: '',
  servico: '',
  destinatario: 'PJ_C',
  parceiro: '123',
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
const item = (i: Partial<ItemEstoque>): ItemEstoque => ({
  estabelecimento_id: 'e1',
  competencia: '2026-05',
  tipo: 'entrada',
  cfop: '2102',
  codigo: '297N',
  ean: '7898590070991',
  descricao: 'Tapete',
  ncm: '48189090',
  unidade: 'UN',
  quantidade: 0,
  valor: 0,
  nota: '39633',
  parceiro: 'ENTRERIOS',
  ...i,
})

// agregado do mês: duas notas de 1.000 (a 39633 e outra)
const linhas = [linha({ valor_contabil: 2000, icms: 240, itens: 2 })]
const nota: NotaDetalhe = {
  chave: 'entrada|39633|123',
  tipo: 'entrada',
  nota: '39633',
  documento: '123',
  parceiro_nome: 'ENTRERIOS',
  data: '2026-05-29',
  competencia: '2026-05',
  cfops: '2102',
  valor: 1000,
  itens: 1,
  estabelecimento_id: 'e1',
  linhas: [
    {
      ...linha({ valor_contabil: 1000, icms: 120 }),
      estabelecimento_id: undefined,
    } as unknown as NotaDetalhe['linhas'][number],
  ],
  estoque: [item({ quantidade: 30, valor: 1000 })],
}
const ajuste = (a: Partial<AjusteNota>): Record<string, AjusteNota> => ({
  [nota.chave]: {
    chave: nota.chave,
    data: null,
    cfop: null,
    excluir: false,
    observacao: '',
    ...a,
  },
})

describe('ajustes por nota', () => {
  it('nota fora da análise sai do movimento e do estoque', () => {
    const r = aplicarAjustesLinhas(linhas, [nota], ajuste({ excluir: true }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ valor_contabil: 1000, icms: 120, itens: 1 })
    expect(aplicarAjustesItens([item({ quantidade: 50, valor: 1700 })], [nota], ajuste({ excluir: true }))).toMatchObject([{ quantidade: 20, valor: 700 }])
  })

  it('nova data leva a nota para o mês dela; novo CFOP muda a natureza', () => {
    const r = aplicarAjustesLinhas(linhas, [nota], ajuste({ data: '2026-06-02', cfop: '2949' }))
    expect(r.map((l) => [l.competencia, l.cfop, l.valor_contabil])).toEqual([
      ['2026-05', '2102', 1000],
      ['2026-06', '2949', 1000],
    ])
    const it = aplicarAjustesItens([item({ quantidade: 30, valor: 1000 })], [nota], ajuste({ data: '2026-06-02' }))
    expect(it).toMatchObject([{ competencia: '2026-06', quantidade: 30 }])
  })

  it('só observação ou data no mesmo mês não mexe no cálculo', () => {
    expect(aplicarAjustesLinhas(linhas, [nota], ajuste({ observacao: 'conferida', data: '2026-05-10' }))).toBe(linhas)
  })

  it('resumo mensal antes e depois dos ajustes', () => {
    const r = resumoNotas([nota], ajuste({ data: '2026-06-02' }))
    expect(r.map((x) => [x.competencia, x.original.entradas, x.ajustado.entradas, x.ajustado.ajustadas])).toEqual([
      ['2026-05', 1, 0, 0],
      ['2026-06', 0, 1, 1],
    ])
  })
})
