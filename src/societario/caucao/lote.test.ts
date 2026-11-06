import { describe, expect, it } from 'vitest'
import { NOVO_CLIENTE, lerData, lerPlanilhaLote, lerTextoLote, normalizarNome, temErro, validarLote } from './lote'
import type { Caucao } from './tipos'

const c = (o: Partial<Caucao>) =>
  ({
    id: o.cliente,
    valor_caucao: null,
    data_recebimento: null,
    data_apropriacao: null,
    data_pagamento_taxa: null,
    responsavel_tipo: 'cliente',
    responsavel_parceiro_id: null,
    ...o,
  }) as Caucao
const base = [
  c({ cliente: 'Padaria Pão Quente Ltda', valor_caucao: 1200 }),
  c({ cliente: 'TechSoft Sistemas ME', valor_caucao: 2500, responsavel_tipo: 'parceiro', responsavel_parceiro_id: 'p1' }),
  c({ cliente: 'Clínica Odonto Sorriso', valor_caucao: null }),
  c({ cliente: 'Auto Peças Rio', valor_caucao: 900, data_recebimento: '2026-10-01' }),
  c({ cliente: 'Mercado Bom Preço Centro' }),
  c({ cliente: 'Mercado Bom Preço Barra' }),
]
const opc = { dataPadrao: '2026-11-05', hoje: '2026-11-06' }

describe('leitura da lista', () => {
  it('normaliza nomes', () => expect(normalizarNome('Padaria PÃO Quente LTDA - ME')).toBe('padaria pao quente'))
  it('datas', () => {
    expect(lerData('5/11/26')).toBe('2026-11-05')
    expect(lerData('31/02/2026')).toBeNull()
    expect(lerData(46331)).toBe('2026-11-05')
  })
  it('texto colado do Excel e do WhatsApp', () => {
    const e = lerTextoLote('Cliente\tValor\tData\nPadaria Pão Quente\t1.200,00\t05/11/2026\nTechSoft - R$ 2.500,00\n\nClinica Odonto Sorriso; 350')
    expect(e).toEqual([
      { linha: 2, nome: 'Padaria Pão Quente', valor: '1.200,00', data: '05/11/2026' },
      { linha: 3, nome: 'TechSoft', valor: 'R$ 2.500,00', data: null },
      { linha: 5, nome: 'Clinica Odonto Sorriso', valor: '350', data: null },
    ])
  })
  it('planilha com cabeçalho', () => {
    const e = lerPlanilhaLote([['Relatório'], ['Data pagamento', 'Nome do cliente', 'Valor'], [46331, 'Padaria', 1200], [null, '', null]])
    expect(e).toEqual([{ linha: 3, nome: 'Padaria', valor: 1200, data: 46331 }])
  })
})

describe('validação', () => {
  it('encontra e usa o valor do cadastro', () => {
    const [l] = validarLote([{ linha: 1, nome: 'padaria pao quente', valor: null, data: null }], base, opc)
    expect(l.caucao?.cliente).toBe('Padaria Pão Quente Ltda')
    expect(l).toMatchObject({ valor: 1200, data: '2026-11-05' })
    expect(l.problemas).toEqual([])
  })
  it('aponta erros e alertas', () => {
    const r = validarLote(
      [
        { linha: 1, nome: 'TechSoft', valor: '2.400,00', data: null },
        { linha: 2, nome: 'Clínica Odonto Sorriso', valor: null, data: null },
        { linha: 3, nome: 'Auto Peças Rio', valor: null, data: '07/11/2026' },
        { linha: 4, nome: 'Mercado Bom Preço', valor: null, data: null },
        { linha: 5, nome: 'Empresa Fantasma', valor: '100', data: null },
        { linha: 6, nome: 'Techsoft sistemas', valor: null, data: null },
      ],
      base,
      { ...opc, pagador: { tipo: 'cliente' }, nomeParceiro: () => 'Imobiliária' },
    )
    const t = r.map((l) => l.problemas.map((p) => p.texto).join(' | '))
    expect(t[0]).toContain('Valor diferente do cadastrado')
    expect(t[0]).toContain('o parceiro Imobiliária')
    expect(temErro(r[0])).toBe(false)
    expect(t[1]).toContain('Sem valor')
    expect(t[2]).toContain('no futuro')
    expect(t[2]).toContain('Já consta recebido')
    expect(t[3]).toContain('2 clientes')
    expect(r[3].candidatos).toHaveLength(2)
    expect(t[4]).toContain('não encontrado')
    expect(t[5]).toContain('repetido')
  })
  it('escolha manual resolve nome ambíguo', () => {
    const [l] = validarLote([{ linha: 4, nome: 'Mercado Bom Preço', valor: '500', data: null }], base, {
      ...opc,
      escolhas: new Map([[4, 'Mercado Bom Preço Barra']]),
    })
    expect(l.caucao?.cliente).toBe('Mercado Bom Preço Barra')
    expect(temErro(l)).toBe(false)
  })
  it('cliente novo exige valor', () => {
    const r = validarLote(
      [
        { linha: 1, nome: 'Empresa Nova', valor: '500', data: null },
        { linha: 2, nome: 'Outra Nova', valor: null, data: null },
      ],
      base,
      {
        ...opc,
        escolhas: new Map([
          [1, NOVO_CLIENTE],
          [2, NOVO_CLIENTE],
        ]),
      },
    )
    expect(r[0].novo).toBe(true)
    expect(temErro(r[0])).toBe(false)
    expect(r[1].problemas.map((p) => p.texto).join()).toContain('precisa do valor')
  })
})
