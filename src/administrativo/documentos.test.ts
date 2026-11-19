import { describe, expect, it } from 'vitest'
import { identificarCliente, tipoDocumento } from './documentos'

const CLIENTES = [
  { id: 'a', codigo: 222, razao_social: 'GARIMPE LTDA', cnpj: '69762361000171' },
  { id: 'b', codigo: 223, razao_social: 'MINUSCOLI & FREITAS LTDA', cnpj: '69777924000103' },
  { id: 'c', codigo: 29, razao_social: 'DELTA IMPORTS LTDA', cnpj: '66264239000187' },
  { id: 'd', codigo: 99, razao_social: 'DELTA IMPORTS LTDA', cnpj: '66264239000268' },
  { id: 'e', codigo: 12, razao_social: 'LT GROUP LTDA', cnpj: null },
]

describe('documentos em lote', () => {
  it('reconhece o Cartão CNPJ', () => {
    expect(tipoDocumento('REPÚBLICA FEDERATIVA DO BRASIL COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL')).toBe('cartao')
    expect(tipoDocumento('CONTRATO SOCIAL')).toBe('contrato')
  })

  it('identifica pelo CNPJ (inclusive filial)', () => {
    expect(identificarCliente('NÚMERO DE INSCRIÇÃO 66.264.239/0002-68 FILIAL', 'x.pdf', CLIENTES)).toEqual({ clienteId: 'd', como: 'CNPJ' })
  })

  it('identifica pela razão social do título', () => {
    expect(identificarCliente('INSTRUMENTO PARTICULAR DE CONSTITUIÇÃO DE MINUSCOLI & FREITAS LTDA', 'contrato.pdf', CLIENTES)).toEqual({
      clienteId: 'b',
      como: 'Razão social',
    })
    // Não confunde "LT GROUP" com palavras soltas
    expect(identificarCliente('ALTERAÇÃO CONTRATUAL DA SOCIEDADE GARIMPE LTDA', 'a.pdf', CLIENTES).clienteId).toBe('a')
  })

  it('usa o nome do arquivo quando o texto não ajuda', () => {
    expect(identificarCliente('texto sem nada', '222 - GARIMPE LTDA - Contrato.pdf', CLIENTES)).toEqual({ clienteId: 'a', como: 'Nome do arquivo' })
    expect(identificarCliente('texto sem nada', 'Contrato Minuscoli & Freitas Ltda.pdf', CLIENTES)).toEqual({ clienteId: 'b', como: 'Nome do arquivo' })
    expect(identificarCliente('texto sem nada', 'qualquer.pdf', CLIENTES)).toEqual({ clienteId: null, como: null })
  })
})
