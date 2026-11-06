import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { lerXlsx } from '../../tributario/importacao/xlsx'
import { gerarXlsx, gerarXlsxAbas, serialData } from '../../lib/planilha'
import { conciliarMes, dataConclusao, resumirPeriodo, limitesMes, resultado, totalizar, valorResponsavel, type Caucao } from './tipos'

const c = (o: Partial<Caucao>) => ({ valor_caucao: null, taxa_junta: null, valor_certificado: null, ...o }) as Caucao

describe('caução', () => {
  it('resultado = caução − taxa − certificado', () => {
    expect(resultado(c({ valor_caucao: 1000, taxa_junta: 218.99, valor_certificado: 180 }))).toBe(601.01)
    expect(resultado(c({ valor_caucao: 300, taxa_junta: 281.08, valor_certificado: 180 }))).toBe(-161.08)
    expect(resultado(c({}))).toBe(0)
  })
  it('totais', () => {
    const t = totalizar([c({ valor_caucao: 1000, taxa_junta: 200 }), c({ valor_caucao: 100, valor_certificado: 150 }), c({})])
    expect(t).toMatchObject({ caucao: 1100, taxa: 200, certificado: 150, resultado: 750, comLucro: 1, comPrejuizo: 1 })
  })
  it('responsável', () => {
    expect(valorResponsavel({ responsavel_tipo: 'cliente', responsavel_parceiro_id: null })).toBe('cliente')
    expect(valorResponsavel({ responsavel_tipo: 'parceiro', responsavel_parceiro_id: 'p1' })).toBe('p1')
  })
})

describe('planilha xlsx', () => {
  it('gera arquivo legível com moeda, data e destaque', () => {
    const arq = gerarXlsx({
      aba: 'Cauções',
      colunas: [{ titulo: 'Cliente' }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Data', tipo: 'data' }],
      linhas: [
        ['Padaria & Cia <Ltda>', { valor: 601.01, destaque: 'positivo' }, '2026-11-06'],
        ['Outra', { valor: -10, destaque: 'negativo' }, null],
      ],
      total: ['Total', 591.01, null],
    })
    const linhas = lerXlsx(arq)
    expect(linhas[0]).toEqual(['Cliente', 'Valor', 'Data'])
    expect(linhas[1][0]).toBe('Padaria & Cia <Ltda>')
    expect(linhas[1][1]).toBe(601.01)
    expect(linhas[1][2]).toBe(serialData('2026-11-06'))
    expect(linhas[3][0]).toBe('Total')
    const sheet = strFromU8(unzipSync(arq)['xl/worksheets/sheet1.xml'])
    expect(sheet).toContain('<c r="B2" s="4">')
    expect(sheet).toContain('<c r="B3" s="5">')
  })
  it('série de data do Excel', () => expect(serialData('1900-03-01')).toBe(61))
})

describe('conciliação mensal', () => {
  const base = { cliente: 'X', junta_uf: 'SP', data_recebimento: null, data_pagamento_taxa: null, data_pagamento_certificado: null, data_apropriacao: null }
  const a = c({
    ...base,
    id: 'a',
    cliente: 'Alfa',
    valor_caucao: 1000,
    data_recebimento: '2026-09-20',
    taxa_junta: 218.99,
    data_pagamento_taxa: '2026-10-02',
    valor_certificado: 180,
    data_pagamento_certificado: '2026-10-05',
  })
  const b = c({
    ...base,
    id: 'b',
    cliente: 'Beta',
    valor_caucao: 300,
    data_recebimento: '2026-10-10',
    taxa_junta: 281.08,
    data_pagamento_taxa: null,
    valor_certificado: 180,
    data_pagamento_certificado: '2026-11-03',
  })

  it('setembro: só o recebimento', () => {
    const r = conciliarMes([a, b], '2026-09')
    expect(r.linhas).toHaveLength(1)
    expect(r.totais).toMatchObject({ saldoAnterior: 0, creditos: 1000, saldoFinal: 1000 })
  })
  it('outubro: saldo anterior + recebimento − pagamentos', () => {
    const r = conciliarMes([a, b], '2026-10')
    expect(r.totais).toMatchObject({ saldoAnterior: 1000, creditos: 300, taxa: -218.99, certificado: -180, saldoFinal: 901.01 })
    expect(r.lancamentos.map((l) => l.tipo)).toEqual(['taxa', 'certificado', 'caucao'])
    expect(r.semData).toBe(1)
  })
  it('apropriação zera o saldo do cliente', () => {
    const fechado = { ...a, data_apropriacao: '2026-11-30' }
    const r = conciliarMes([fechado], '2026-11')
    expect(r.linhas[0]).toMatchObject({ saldoAnterior: 601.01, apropriacao: -601.01, saldoFinal: 0 })
    expect(conciliarMes([fechado], '2026-12').linhas).toHaveLength(0)
  })
  it('prejuízo apropriado entra a crédito', () => {
    const p = c({
      ...base,
      id: 'p',
      valor_caucao: 300,
      data_recebimento: '2026-10-01',
      taxa_junta: 281.08,
      data_pagamento_taxa: '2026-10-02',
      valor_certificado: 180,
      data_pagamento_certificado: '2026-10-03',
      data_apropriacao: '2026-10-31',
    })
    const r = conciliarMes([p], '2026-10')
    expect(r.totais).toMatchObject({ apropriacao: 161.08, saldoFinal: 0 })
  })
  it('limites do mês', () => expect(limitesMes('2028-02')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' }))
})

describe('planilha com várias abas', () => {
  it('gera duas abas com filtro próprio', () => {
    const arq = gerarXlsxAbas([
      { aba: 'Resumo 10/2026', colunas: [{ titulo: 'A' }], linhas: [['x']] },
      { aba: 'Lançamentos', colunas: [{ titulo: 'B', tipo: 'moeda' }], linhas: [[1], [2]] },
    ])
    const z = unzipSync(arq)
    expect(Object.keys(z)).toContain('xl/worksheets/sheet2.xml')
    const wb = strFromU8(z['xl/workbook.xml'])
    expect(wb).toContain('<sheet name="Resumo 10 2026" sheetId="1" r:id="rId1"/>')
    expect(wb).toContain("'Lançamentos'!$A$1:$A$3")
  })
})

describe('resumo do período (receita)', () => {
  const base = { junta_uf: 'SP', data_recebimento: null, data_pagamento_taxa: null, data_pagamento_certificado: null, data_apropriacao: null }
  const lucro = c({
    ...base,
    id: 'l',
    cliente: 'Lucro',
    valor_caucao: 1000,
    data_recebimento: '2026-10-01',
    taxa_junta: 218.99,
    data_pagamento_taxa: '2026-10-03',
    valor_certificado: 180,
    data_pagamento_certificado: '2026-11-04',
  })
  const prej = c({
    ...base,
    id: 'p',
    cliente: 'Prejuízo',
    valor_caucao: 300,
    data_recebimento: '2026-11-01',
    taxa_junta: 281.08,
    data_pagamento_taxa: '2026-11-02',
    valor_certificado: 180,
    data_pagamento_certificado: '2026-11-03',
  })
  const semCert = c({
    ...base,
    id: 's',
    cliente: 'Sem certificado',
    valor_caucao: 500,
    data_recebimento: '2026-11-01',
    taxa_junta: 218.99,
    data_pagamento_taxa: '2026-11-02',
    valor_certificado: 0,
  })
  const aguard = c({
    ...base,
    id: 'a',
    cliente: 'Aguardando',
    valor_caucao: 800,
    data_recebimento: '2026-11-01',
    taxa_junta: 218.99,
    data_pagamento_taxa: '2026-11-02',
    valor_certificado: null,
  })
  const antigo = c({ ...base, id: 'o', cliente: 'Antigo', valor_caucao: 400, data_recebimento: '2026-09-01', taxa_junta: 0, valor_certificado: 0 })
  const feito = { ...antigo, id: 'f', cliente: 'Já feito', data_apropriacao: '2026-09-30' }

  it('data de conclusão', () => {
    expect(dataConclusao(lucro)).toBe('2026-11-04')
    expect(dataConclusao(semCert)).toBe('2026-11-02')
    expect(dataConclusao(aguard)).toBeNull()
  })
  it('novembro', () => {
    const r = resumirPeriodo([lucro, prej, semCert, aguard, antigo, feito], '2026-11-01', '2026-11-30')
    expect(r.itens.map((i) => i.caucao.cliente)).toEqual(['Antigo', 'Lucro', 'Prejuízo', 'Sem certificado'])
    expect(r.aTransferir).toMatchObject({ lucro: 601.01 + 281.01 + 400, prejuizo: -161.08, qtd: 4, anteriores: 400 })
    expect(r.aTransferir.liquido).toBeCloseTo(1120.94)
    expect(r.aguardando).toMatchObject({ qtd: 1, saldo: 581.01 })
  })
  it('transferido no período sai do "a transferir"', () => {
    const r = resumirPeriodo([{ ...lucro, data_apropriacao: '2026-11-30' }], '2026-11-01', '2026-11-30')
    expect(r.aTransferir.qtd).toBe(0)
    expect(r.transferido).toMatchObject({ qtd: 1, liquido: 601.01 })
    expect(r.movimento.totais.saldoFinal).toBe(0)
  })
})
