import { describe, expect, it } from 'vitest'
import { consultarCnpj, deBrasilApi, deCnpja, deSerpro, enderecoTexto } from './cnpj'

describe('consulta de CNPJ', () => {
  it('converte a resposta da BrasilAPI', () => {
    const d = deBrasilApi({
      cnpj: '64951291000186',
      razao_social: 'PRIMSELL LTDA',
      nome_fantasia: '',
      descricao_situacao_cadastral: 'ATIVA',
      data_inicio_atividade: '2026-02-05',
      descricao_tipo_de_logradouro: 'RUA',
      logradouro: 'DAS FLORES',
      numero: '100',
      complemento: 'SALA 2',
      bairro: 'CENTRO',
      municipio: 'SAO PAULO',
      uf: 'SP',
      cep: '01001000',
      ddd_telefone_1: '1133334444',
      ddd_telefone_2: '',
      email: 'CONTATO@PRIMSELL.COM',
      capital_social: 10000,
      opcao_pelo_simples: true,
      cnae_fiscal: 4789099,
      cnae_fiscal_descricao: 'Comércio varejista de outros produtos',
      cnaes_secundarios: [{ codigo: 0, descricao: '' }],
      qsa: [
        {
          nome_socio: 'LUCIANO ALMEIDA DE ANDRADE',
          cnpj_cpf_do_socio: '***123456**',
          qualificacao_socio: 'Sócio-Administrador',
          data_entrada_sociedade: '2026-02-05',
        },
      ],
    })
    expect(d.nomeFantasia).toBeNull()
    expect(d.telefones).toEqual(['(11) 3333-4444'])
    expect(d.email).toBe('contato@primsell.com')
    expect(d.atividadesSecundarias).toEqual([])
    expect(d.socios[0]).toMatchObject({ nome: 'LUCIANO ALMEIDA DE ANDRADE', qualificacao: 'Sócio-Administrador', desde: '2026-02-05' })
    expect(enderecoTexto(d.endereco)).toBe('RUA DAS FLORES, 100 - SALA 2 - CENTRO - SAO PAULO/SP - CEP 01001-000')
  })
  it('converte a resposta da CNPJá', () => {
    const d = deCnpja({
      taxId: '64951291000186',
      alias: 'PRIMSELL',
      founded: '2026-02-05',
      status: { text: 'Ativa' },
      address: { street: 'Rua das Flores', number: '100', district: 'Centro', city: 'São Paulo', state: 'SP', zip: '01001000' },
      phones: [{ area: '11', number: '999998888' }],
      emails: [{ address: 'contato@primsell.com' }],
      company: {
        name: 'PRIMSELL LTDA',
        equity: 10000,
        members: [{ since: '2026-02-05', person: { name: 'LUCIANO', taxId: '***' }, role: { text: 'Sócio-Administrador' } }],
      },
    })
    expect(d.razaoSocial).toBe('PRIMSELL LTDA')
    expect(d.telefones).toEqual(['(11) 99999-8888'])
    expect(d.socios).toHaveLength(1)
    expect(d.fonte).toBe('CNPJá')
  })
})

describe('campos do cartão CNPJ', () => {
  it('preenche abertura, endereço, situação, e-mail e telefone', async () => {
    const { camposDoCartao } = await import('./cnpj')
    const d = deBrasilApi(
      {
        cnpj: '64951291000186',
        razao_social: 'Primsell Ltda',
        nome_fantasia: '',
        descricao_situacao_cadastral: 'Ativa',
        data_inicio_atividade: '2026-02-05',
        logradouro: 'RUA A',
        numero: '1',
        municipio: 'SAO PAULO',
        uf: 'SP',
        cep: '01001000',
        email: 'X@Y.COM',
        ddd_telefone_1: '1133334444',
      },
      'Minha Receita',
    )
    expect(camposDoCartao(d)).toEqual({
      razao_social: 'PRIMSELL LTDA',
      nome_fantasia: null,
      data_abertura: '2026-02-05',
      endereco: 'RUA A, 1 - SAO PAULO/SP - CEP 01001-000',
      situacao_cadastral: 'ATIVA',
      email: 'x@y.com',
      telefone: '(11) 3333-4444',
    })
    expect(d.fonte).toBe('Minha Receita')
  })
  it('sem e-mail na Receita não apaga o e-mail', async () => {
    const { camposDoCartao } = await import('./cnpj')
    expect('email' in camposDoCartao(deBrasilApi({ cnpj: '1', razao_social: 'A' }))).toBe(false)
  })
})

describe('deSerpro', () => {
  const resposta = {
    ni: '34238864000168',
    nomeEmpresarial: 'EMPRESA TESTE LTDA',
    nomeFantasia: 'TESTE',
    situacaoCadastral: { codigo: '2', data: '2020-01-15', motivo: '' },
    naturezaJuridica: { codigo: '2062', descricao: 'Sociedade Empresária Limitada' },
    dataAbertura: '2019-07-01',
    cnaePrincipal: { codigo: '4781400', descricao: 'Comércio varejista de artigos do vestuário' },
    cnaeSecundarias: [{ codigo: '4782201', descricao: 'Comércio varejista de calçados' }],
    endereco: {
      tipoLogradouro: 'RUA',
      logradouro: 'DAS FLORES',
      numero: '100',
      complemento: 'SALA 2',
      cep: '20000000',
      bairro: 'CENTRO',
      municipio: { codigo: '6001', descricao: 'RIO DE JANEIRO' },
      uf: 'RJ',
    },
    telefones: [{ ddd: '21', numero: '999998888' }],
    correioEletronico: 'CONTATO@TESTE.COM.BR',
    capitalSocial: 10000,
    porte: '01',
    socios: [{ tipoSocio: '2', cpf: '12345678909', nome: 'FULANO DE TAL', qualificacao: '49', dataInclusao: '20190701' }],
  }

  it('converte os campos principais', () => {
    const d = deSerpro(resposta)
    expect(d.fonte).toBe('Serpro')
    expect(d.cnpj).toBe('34238864000168')
    expect(d.situacao).toBe('ATIVA')
    expect(d.dataSituacao).toBe('2020-01-15')
    expect(d.abertura).toBe('2019-07-01')
    expect(d.naturezaJuridica).toBe('2062 - Sociedade Empresária Limitada')
    expect(d.porte).toBe('MICRO EMPRESA')
    expect(d.capitalSocial).toBe(10000)
    expect(d.endereco.logradouro).toBe('RUA DAS FLORES')
    expect(d.endereco.municipio).toBe('RIO DE JANEIRO')
    expect(d.telefones).toEqual(['(21) 99999-8888'])
    expect(d.email).toBe('contato@teste.com.br')
    expect(d.atividadesSecundarias).toEqual(['4782201 - Comércio varejista de calçados'])
    expect(d.socios[0]).toMatchObject({ nome: 'FULANO DE TAL', documento: '12345678909', qualificacao: 'Sócio-Administrador', desde: '2019-07-01' })
  })

  it('tolera campos ausentes', () => {
    const d = deSerpro({ ni: '34238864000168', nomeEmpresarial: 'X' })
    expect(d.situacao).toBeNull()
    expect(d.capitalSocial).toBeNull()
    expect(d.socios).toEqual([])
  })
})

describe('consultarCnpj com Serpro', () => {
  it('usa o Serpro quando configurado', async () => {
    const r = await consultarCnpj('34238864000168', undefined, { serpro: async () => deSerpro({ ni: '34238864000168', nomeEmpresarial: 'X' }) })
    expect(r.fonte).toBe('Serpro')
  })
})
