import { describe, expect, it } from 'vitest'
import { analisarInadimplencia, lerData, lerValor } from './inadImport'

const clientes = [
  {
    id: 'a',
    codigo: 10,
    razao_social: 'MARIA STORE COMERCIO LTDA',
    nome_fantasia: 'MARIA STORE',
    cnpj: '65013172000145',
    status: 'assinado',
    sem_honorario: false,
  },
  { id: 'b', codigo: 20, razao_social: 'VELHA EMPRESA LTDA', nome_fantasia: null, cnpj: '11111111000111', status: 'encerrado', sem_honorario: false },
]

describe('importação da inadimplência do sistema', () => {
  it('lê datas e valores', () => {
    expect(lerData('10/10/2026')).toBe('2026-10-10')
    expect(lerData('46305')).toBe('2026-10-10')
    expect(lerData('10/2026')).toBe('2026-10-01')
    expect(lerValor('R$ 1.234,56')).toBe(1234.56)
  })
  it('classifica as linhas', () => {
    const linhas = [
      ['Cliente', 'CNPJ', 'Vencimento', 'Valor em aberto', 'Situação'],
      ['MARIA STORE COMERCIO LTDA', '65.013.172/0001-45', '10/10/2026', '500,00', 'Em aberto'],
      ['MARIA STORE COMERCIO LTDA', '65013172000145', '10/09/2026', '450,00', 'Vencido'],
      ['VELHA EMPRESA LTDA', '11111111000111', '10/08/2026', '300,00', 'Em aberto'],
      ['DESCONHECIDA LTDA', '22222222000122', '10/08/2026', '100,00', 'Em aberto'],
      ['MARIA STORE COMERCIO LTDA', '65013172000145', '10/11/2026', '500,00', 'Em aberto'],
      ['MARIA STORE COMERCIO LTDA', '65013172000145', '10/07/2026', '500,00', 'Pago'],
    ]
    const { itens, colunas } = analisarInadimplencia(linhas, clientes, '2026-11-01', () => 500)
    expect(colunas.Valor).toBe('Valor em aberto')
    expect(itens.map((i) => i.nivel)).toEqual(['ok', 'advertencia', 'advertencia', 'erro', 'ignorado', 'ignorado'])
    expect(itens[0]).toMatchObject({ competencia: '2026-10-01', valor: 500 })
    expect(itens[1].motivos[0]).toMatch(/Valor diferente/)
    expect(itens[2].motivos[0]).toMatch(/inativo/)
  })
})
