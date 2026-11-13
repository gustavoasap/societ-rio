import { describe, expect, it } from 'vitest'
import { linhaContaAzul, separarEndereco } from './contaAzul'
import { lerXlsx, gerarXlsxTexto } from '../lib/planilhaSimples'

describe('Conta Azul', () => {
  it('separa o endereço do Cartão CNPJ', () => {
    expect(separarEndereco('RUA CAMACAM, 249 - BOX 809 - VILA ANASTACIO - SAO PAULO/SP - CEP 05095-000')).toEqual({
      logradouro: 'RUA CAMACAM',
      numero: '249',
      complemento: 'BOX 809',
      bairro: 'VILA ANASTACIO',
      cidade: 'SAO PAULO',
      uf: 'SP',
      cep: '05095000',
    })
    expect(separarEndereco('RUA X, 10 - CENTRO - VESPASIANO/MG - CEP 33200-338')).toMatchObject({
      bairro: 'CENTRO',
      complemento: '',
      cidade: 'VESPASIANO',
      uf: 'MG',
    })
    expect(separarEndereco('ENDERECO SEM PADRAO').logradouro).toBe('ENDERECO SEM PADRAO')
  })
  it('monta a linha da planilha', () => {
    const l = linhaContaAzul(
      {
        codigo: 236,
        razao_social: 'MAP LTDA',
        cnpj: '12345678000190',
        email: 'a@b.com',
        telefone: '(31) 3382-1334',
        endereco: 'RUA A, 1 - CENTRO - BH/MG - CEP 30000-000',
        inscricao: '123.456',
        tipo_inscricao: 'estadual',
        data_abertura: '2026-02-09',
      },
      '2026-11-13',
    )
    expect(l).toHaveLength(20)
    expect(l.slice(0, 13)).toEqual([
      'MAP LTDA',
      'MAP LTDA',
      '',
      '12345678000190',
      '',
      '13/11/2026',
      '',
      'ativado',
      '236',
      '123456',
      'a@b.com',
      '3133821334',
      '09/02/2026',
    ])
    expect(l.slice(13)).toEqual(['30000000', 'MG', 'BH', 'RUA A', '1', 'CENTRO', ''])
  })
  it('gera e lê de volta a planilha em texto', () => {
    const arq = gerarXlsxTexto('pessoas-clientes', ['Nome', 'CNPJ'], [['A & B', '00012345000190']], [10, 10])
    const linhas = lerXlsx(arq.buffer as ArrayBuffer)
    expect(linhas).toEqual([
      ['Nome', 'CNPJ'],
      ['A & B', '00012345000190'],
    ])
  })
})
