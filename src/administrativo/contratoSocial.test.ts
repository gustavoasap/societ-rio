import { describe, expect, it } from 'vitest'
import { extrairSocios } from './contratoSocial'
import { deProcesso, mesclarSocios, separarEnderecoSocio } from './socios'

const CONTRATO = `INSTRUMENTO PARTICULAR DE CONSTITUIÇÃO DE SOCIEDADE EMPRESÁRIA LIMITADA
MINUSCOLI & FREITAS LTDA
GUILHERME MINUSCOLI, brasileiro, solteiro, nascido em 03/01/1980, empresário, portador da Cédula de Identidade RG nº 1234567890, expedida pela SSP/RS, inscrito no CPF sob o nº 957.568.170-34, residente e domiciliado na Rua Saldanha da Gama, nº 605, Apto 302, Bairro Harmonia, Canoas/RS, CEP 92310-630; e
MARIA DA SILVA FREITAS, brasileira, casada sob o regime de comunhão parcial de bens, empresária, portadora da CNH nº 01234567890 DETRAN/SP, inscrita no CPF/MF sob nº 529.982.247-25, residente e domiciliada na Avenida Paulista, 1000, Bela Vista, São Paulo - SP, CEP: 01310- 100;
resolvem constituir uma sociedade empresária limitada, mediante as seguintes cláusulas:
CLÁUSULA PRIMEIRA - A sociedade girará sob o nome empresarial MINUSCOLI & FREITAS LTDA. Administrador: GUILHERME MINUSCOLI, CPF 957.568.170-34.`

describe('contrato social', () => {
  it('extrai nome, CPF, documento e endereço de cada sócio', () => {
    const s = extrairSocios(CONTRATO)
    expect(s).toHaveLength(2)
    expect(s[0]).toMatchObject({
      nome: 'GUILHERME MINUSCOLI',
      cpf: '957.568.170-34',
      doc_tipo: 'RG',
      doc_numero: '1234567890',
      doc_orgao: 'SSP/RS',
      rua: 'Rua Saldanha da Gama',
      numero: '605',
      complemento: 'Apto 302',
      bairro: 'Harmonia',
      cidade: 'Canoas',
      uf: 'RS',
      cep: '92310-630',
    })
    expect(s[1]).toMatchObject({
      nome: 'MARIA DA SILVA FREITAS',
      cpf: '529.982.247-25',
      doc_tipo: 'CNH',
      doc_numero: '01234567890',
      doc_orgao: 'DETRAN/SP',
      rua: 'Avenida Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      uf: 'SP',
      cep: '01310-100',
    })
  })

  it('lê outro formato (RG com dígito, órgão expedidor, endereço com traços)', () => {
    const t = `ALTERAÇÃO CONTRATUAL Nº 3 DA SOCIEDADE ABC COMERCIO LTDA
JOÃO PEDRO DE OLIVEIRA SANTOS, nacionalidade brasileira, divorciado, comerciante, portador da carteira de identidade n° 12.345.678-9, órgão
expedidor SSP/SP, CPF nº 390.533.447-05, residente e domiciliado à Rua das Flores, 45 - Casa 2 - Jardim América - Ribeirão Preto/SP - CEP 14020-260, e ANA BEATRIZ COSTA, brasileira, solteira, empresária, RG 22.333.444-5 SSP-SP, CPF 452.178.966-80, residente na Alameda Santos, nº 200, apto 11, Cerqueira César, São Paulo/SP, CEP 01418-000. Únicos sócios.`
    const s = extrairSocios(t)
    expect(s.map((x) => x.nome)).toEqual(['JOÃO PEDRO DE OLIVEIRA SANTOS', 'ANA BEATRIZ COSTA'])
    expect(s[0]).toMatchObject({
      doc_numero: '12.345.678-9',
      doc_orgao: 'SSP/SP',
      rua: 'Rua das Flores',
      numero: '45',
      complemento: 'Casa 2',
      bairro: 'Jardim América',
      cidade: 'Ribeirão Preto',
      uf: 'SP',
      cep: '14020-260',
    })
    expect(s[1]).toMatchObject({
      doc_numero: '22.333.444-5',
      doc_orgao: 'SSP/SP',
      rua: 'Alameda Santos',
      numero: '200',
      complemento: 'apto 11',
      bairro: 'Cerqueira César',
      cidade: 'São Paulo',
    })
  })

  it('ignora números que não são CPF válido', () => {
    expect(extrairSocios('FULANO DE TAL, brasileiro, inscrito no CPF sob nº 111.111.111-11')).toHaveLength(0)
  })
})

describe('sócios', () => {
  it('separa o endereço em uma linha', () => {
    expect(separarEnderecoSocio('Rua Saldanha da Gama, Harmonia, Canoas/RS')).toMatchObject({
      rua: 'Rua Saldanha da Gama',
      bairro: 'Harmonia',
      cidade: 'Canoas',
      uf: 'RS',
    })
  })

  it('converte o sócio do processo societário', () => {
    const s = deProcesso({
      nome: 'Guilherme Minuscoli',
      cpf: '95756817034',
      endereco: 'Rua Saldanha da Gama, Harmonia, Canoas/RS',
      numero: '605',
      cep: '92310630',
      rg: '123',
      rg_orgao_emissor: 'SSP/RS',
      cor_raca: 'Branca',
    })
    expect(s).toMatchObject({
      nome: 'GUILHERME MINUSCOLI',
      cpf: '957.568.170-34',
      cep: '92310-630',
      rua: 'Rua Saldanha da Gama',
      numero: '605',
      bairro: 'Harmonia',
      cidade: 'Canoas',
      uf: 'RS',
      doc_tipo: 'RG',
      doc_numero: '123',
      doc_orgao: 'SSP/RS',
      cor_raca: 'Branca',
    })
  })

  it('completa só os campos vazios ao mesclar', () => {
    const r = mesclarSocios(
      [{ nome: 'GUILHERME MINUSCOLI', cpf: '', qualificacao: 'Sócio-Administrador', cor_raca: 'Parda' }],
      [
        { nome: 'GUILHERME MINUSCOLI', cpf: '957.568.170-34', qualificacao: 'Sócio', cor_raca: 'Branca' },
        { nome: 'OUTRO SOCIO', cpf: '', qualificacao: null },
      ],
    )
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ cpf: '957.568.170-34', qualificacao: 'Sócio-Administrador', cor_raca: 'Parda' })
  })
})
