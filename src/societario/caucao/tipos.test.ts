import { describe, expect, it } from 'vitest'
import { unzipSync, strFromU8 } from 'fflate'
import { lerXlsx } from '../../tributario/importacao/xlsx'
import { gerarXlsx, serialData } from '../../lib/planilha'
import { resultado, totalizar, valorResponsavel, type Caucao } from './tipos'

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
