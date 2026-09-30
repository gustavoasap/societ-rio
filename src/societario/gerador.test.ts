import { describe, expect, it } from 'vitest'
import CNAES from './cnaes.json'
import { extrairCodigos, gerarObjetoSocial, OPCOES_PADRAO, type AtividadeCnae } from './gerador'

const tabela = new Map(CNAES as [string, string][])
const ativ = (...codigos: string[]): AtividadeCnae[] => codigos.map((codigo) => ({ codigo, descricao: tabela.get(codigo)! }))

describe('extrairCodigos', () => {
  it('reconhece os formatos usuais e ignora repetidos', () => {
    expect(extrairCodigos('4711-3/02, 4781400\n47.82-2-01; 4711302').codigos).toEqual(['4711302', '4781400', '4782201'])
  })
  it('aponta códigos incompletos', () => {
    expect(extrairCodigos('4711-3 5611201').invalidos).toEqual(['4711-3'])
  })
})

describe('gerarObjetoSocial', () => {
  const lista = ativ('4711302', '4781400', '4782201', '5611201')

  it('monta com caracteres especiais, agrupando atividades de mesmo início', () => {
    expect(gerarObjetoSocial(lista, OPCOES_PADRAO)).toBe(
      'A sociedade tem por objeto social o exercício das seguintes atividades: comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados; comércio varejista de artigos do vestuário e acessórios e de calçados; e restaurantes e similares.',
    )
  })

  it('sem caracteres especiais usa só vírgula e ponto', () => {
    const t = gerarObjetoSocial(ativ('4711302', '8512100', '6204000'), { ...OPCOES_PADRAO, caracteresEspeciais: false })
    expect(t).toMatch(/^[\p{L}\p{N}\s,.]+$/u)
    expect(t).toContain('supermercados')
    expect(t).toContain('educação infantil, pré escola')
    expect(t.endsWith('.')).toBe(true)
  })

  it('sem acentos tira acento, til e cedilha', () => {
    const t = gerarObjetoSocial(ativ('4711302', '4782201'), { ...OPCOES_PADRAO, acentos: false })
    expect(t).toBe(
      'A sociedade tem por objeto social o exercicio das seguintes atividades: comercio varejista de mercadorias em geral, com predominancia de produtos alimenticios - supermercados; e comercio varejista de calcados.',
    )
    expect(gerarObjetoSocial(ativ('6920601'), { ...OPCOES_PADRAO, acentos: false, caixaAlta: true, caracteresEspeciais: false })).toBe(
      'A SOCIEDADE TEM POR OBJETO SOCIAL O EXERCICIO DAS ATIVIDADES DE CONTABILIDADE.',
    )
  })

  it('alteração e caixa alta', () => {
    const t = gerarObjetoSocial(ativ('6920601'), { ...OPCOES_PADRAO, finalidade: 'alteracao', caixaAlta: true })
    expect(t).toBe('A SOCIEDADE PASSA A TER POR OBJETO SOCIAL O EXERCÍCIO DA SEGUINTE ATIVIDADE: ATIVIDADES DE CONTABILIDADE.')
  })

  it('sem especiais mantém siglas sem vírgula solta', () => {
    const t = gerarObjetoSocial(ativ('5250805', '4681802'), { ...OPCOES_PADRAO, caracteresEspeciais: false })
    expect(t).toContain('operador de transporte multimodal OTM')
    expect(t).toContain('transportador retalhista T.R.R.')
  })

  it('sem especiais não repete "atividades de"', () => {
    const t = gerarObjetoSocial(ativ('6920601', '8299799'), { ...OPCOES_PADRAO, caracteresEspeciais: false })
    expect(t).not.toMatch(/atividades de atividades|atividades de outras atividades/)
  })
})
