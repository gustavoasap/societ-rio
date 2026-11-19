import { describe, expect, it } from 'vitest'
import { identificarCliente, lerCartaoCnpj, lerCartaoPorPosicao, lerEmpresaDoContrato, tipoDocumento } from './documentos'

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

describe('dados da empresa no documento', () => {
  it('lê o Cartão CNPJ', () => {
    const t = `REPÚBLICA FEDERATIVA DO BRASIL CADASTRO NACIONAL DA PESSOA JURÍDICA NÚMERO DE INSCRIÇÃO 69.777.924/0001-03 MATRIZ COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL DATA DE ABERTURA 05/10/2026 NOME EMPRESARIAL MINUSCOLI & FREITAS LTDA TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA) ******** PORTE ME CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL 47.89-0-99 - Comércio varejista CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA 206-2 - Sociedade Empresária Limitada LOGRADOURO R SALDANHA DA GAMA NÚMERO 605 COMPLEMENTO SALA 2 CEP 92.310-630 BAIRRO/DISTRITO HARMONIA MUNICÍPIO CANOAS UF RS ENDEREÇO ELETRÔNICO MINUSCOLIFREITAS@GMAIL.COM TELEFONE (51) 3785-2385 ENTE FEDERATIVO RESPONSÁVEL (EFR) ***** SITUAÇÃO CADASTRAL ATIVA DATA DA SITUAÇÃO CADASTRAL 05/10/2026`
    expect(lerCartaoCnpj(t)).toEqual({
      cnpj: '69777924000103',
      razao_social: 'MINUSCOLI & FREITAS LTDA',
      nome_fantasia: null,
      data_abertura: '2026-10-05',
      endereco: 'R SALDANHA DA GAMA, 605 - SALA 2 - HARMONIA - CANOAS/RS - CEP 92310-630',
      situacao_cadastral: 'ATIVA',
      email: 'minuscolifreitas@gmail.com',
      telefone: '(51) 3785-2385',
    })
  })

  it('lê CNPJ e razão social do contrato', () => {
    expect(
      lerEmpresaDoContrato('INSTRUMENTO PARTICULAR DE CONSTITUIÇÃO DE SOCIEDADE EMPRESÁRIA LIMITADA MINUSCOLI & FREITAS LTDA GUILHERME MINUSCOLI, brasileiro'),
    ).toEqual({
      cnpj: null,
      razao_social: 'MINUSCOLI & FREITAS LTDA',
    })
    expect(lerEmpresaDoContrato('ALTERAÇÃO CONTRATUAL Nº 3 DA SOCIEDADE ABC COMERCIO LTDA, inscrita no CNPJ sob nº 12.345.678/0001-95, com sede')).toEqual({
      cnpj: '12345678000195',
      razao_social: 'ABC COMERCIO LTDA',
    })
  })
})

describe('Cartão CNPJ pela posição', () => {
  // Layout do comprovante: rótulo em cima, valor embaixo; caixas lado a lado na mesma linha
  const it_ = (str: string, x: number, y: number, h = 6) => ({ str, x, y, h, pagina: 1 })
  const itens = [
    it_('NÚMERO DE INSCRIÇÃO', 30, 760),
    it_('64.096.587/0001-67', 30, 750, 8),
    it_('MATRIZ', 30, 742, 8),
    it_('COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL', 150, 760, 9),
    it_('DATA DE ABERTURA', 470, 760),
    it_('16/12/2025', 470, 750, 8),
    it_('NOME EMPRESARIAL', 30, 725),
    it_('LT GROUP LTDA', 30, 715, 8),
    it_('TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)', 30, 700),
    it_('LT GROUP', 30, 690, 8),
    it_('PORTE', 470, 700),
    it_('ME', 470, 690, 8),
    it_('LOGRADOURO', 30, 600),
    it_('NÚMERO', 330, 600),
    it_('COMPLEMENTO', 420, 600),
    it_('R CAMACAM', 30, 590, 8),
    it_('249', 330, 590, 8),
    it_('BOX 803', 420, 590, 8),
    it_('CEP', 30, 575),
    it_('BAIRRO/DISTRITO', 120, 575),
    it_('MUNICÍPIO', 330, 575),
    it_('UF', 520, 575),
    it_('05.095-000', 30, 565, 8),
    it_('VILA ANASTACIO', 120, 565, 8),
    it_('SAO PAULO', 330, 565, 8),
    it_('SP', 520, 565, 8),
    it_('ENDEREÇO ELETRÔNICO', 30, 550),
    it_('TELEFONE', 330, 550),
    it_('THIAGOTFR.RIBEIRO@GMAIL.COM', 30, 540, 8),
    it_('(31) 8493-8068', 330, 540, 8),
    it_('SITUAÇÃO CADASTRAL', 30, 500),
    it_('DATA DA SITUAÇÃO CADASTRAL', 330, 500),
    it_('ATIVA', 30, 490, 8),
    it_('16/12/2025', 330, 490, 8),
  ]
  it('separa as caixas lado a lado', () => {
    expect(lerCartaoPorPosicao(itens)).toEqual({
      cnpj: '64096587000167',
      razao_social: 'LT GROUP LTDA',
      nome_fantasia: 'LT GROUP',
      data_abertura: '2025-12-16',
      endereco: 'R CAMACAM, 249 - BOX 803 - VILA ANASTACIO - SAO PAULO/SP - CEP 05095-000',
      situacao_cadastral: 'ATIVA',
      email: 'thiagotfr.ribeiro@gmail.com',
      telefone: '(31) 8493-8068',
    })
  })
})

describe('ordem de leitura dos contratos do Drive', () => {
  it('prefere consolidação e a alteração mais recente', async () => {
    const { prioridadeContrato } = await import('./lerContratosDrive')
    const nomes = ['Certidão de Inteiro Teor.pdf', 'Contrato Social.pdf', '1ª Alteração Contratual.pdf', '3ª Alteração Contratual.pdf', 'Consolidação.pdf']
    expect([...nomes].sort((a, b) => prioridadeContrato(b) - prioridadeContrato(a))).toEqual([
      'Consolidação.pdf',
      '3ª Alteração Contratual.pdf',
      '1ª Alteração Contratual.pdf',
      'Contrato Social.pdf',
      'Certidão de Inteiro Teor.pdf',
    ])
  })
})

describe('identificação pelo nome curto do arquivo e pela certidão', () => {
  const CLI = [
    { id: 'n', codigo: 177, razao_social: 'NOVA ERA ECOMMERCE LTDA', cnpj: null },
    { id: 'a', codigo: 137, razao_social: 'ADIJU REPRESENTACOES LTDA', cnpj: null },
    { id: 'b', codigo: 138, razao_social: 'ATLAS VENDAS ONLINE LTDA', cnpj: null },
    { id: 'c', codigo: 139, razao_social: 'ATLAS GLOBAL LTDA', cnpj: null },
  ]
  it('nome curto vale quando é o começo da razão social de um único cliente', () => {
    expect(identificarCliente('', 'Contrato - NOva Era.pdf', CLI).clienteId).toBe('n')
    expect(identificarCliente('', 'Contrato Social - Adiju.pdf', CLI).clienteId).toBe('a')
    expect(identificarCliente('', 'Contrato Social - Atlas Vendas.pdf', CLI).clienteId).toBe('b')
    // "Atlas" sozinho é ambíguo (dois clientes): não identifica
    expect(identificarCliente('', 'Contrato Social - Atlas.pdf', CLI).clienteId).toBeNull()
  })
  it('razão social pelo campo NOME EMPRESARIAL da certidão', () => {
    expect(
      lerEmpresaDoContrato(
        'DOCUMENTO EMITIDO PELA INTERNET DADOS DA EMPRESA NOME EMPRESARIAL NOVA ERA ECOMMERCE LTDA TITULO DE ESTABELECIMENTO NOVA ERA SHOP CNPJ 69.036.546/0001-07',
      ),
    ).toEqual({
      cnpj: '69036546000107',
      razao_social: 'NOVA ERA ECOMMERCE LTDA',
    })
  })
})
