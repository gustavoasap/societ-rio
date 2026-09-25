import { afterEach, describe, expect, it, vi } from 'vitest'
import { anexoSugerido, cnpjValido, consultarCnpj, deBrasilApi, deCnpjWs, formatarCnae, regimeSugerido } from './receita'

const BRASILAPI = {
  cnpj: '66264239000187',
  identificador_matriz_filial: 1,
  razao_social: 'DELTA IMPORTS LTDA',
  nome_fantasia: 'DELTA',
  descricao_situacao_cadastral: 'ATIVA',
  data_inicio_atividade: '2026-04-02',
  cnae_fiscal: 4789099,
  cnae_fiscal_descricao: 'Comércio varejista de outros produtos não especificados anteriormente',
  uf: 'SP',
  municipio: 'SAO PAULO',
  natureza_juridica: 'Sociedade Empresária Limitada',
  porte: 'MICRO EMPRESA',
  opcao_pelo_simples: true,
  data_opcao_pelo_simples: '2026-04-02',
  data_exclusao_do_simples: null,
  opcao_pelo_mei: false,
  regime_tributario: [],
}

const CNPJWS = {
  razao_social: 'INDUSTRIA X LTDA',
  natureza_juridica: { descricao: 'Sociedade Empresária Limitada' },
  porte: { descricao: 'Demais' },
  simples: null,
  estabelecimento: {
    cnpj: '11222333000262',
    tipo: 'Filial',
    nome_fantasia: '',
    situacao_cadastral: 'Ativa',
    data_inicio_atividade: '2015-03-10',
    atividade_principal: { subclasse: '2222600', descricao: 'Fabricação de embalagens de material plástico' },
    estado: { sigla: 'MG' },
    cidade: { nome: 'Extrema' },
  },
}

afterEach(() => vi.unstubAllGlobals())

describe('consulta de CNPJ na Receita', () => {
  it('valida os dígitos verificadores', () => {
    expect(cnpjValido('66.264.239/0001-87')).toBe(true)
    expect(cnpjValido('11.222.333/0001-81')).toBe(true)
    expect(cnpjValido('11.222.333/0001-82')).toBe(false)
    expect(cnpjValido('11111111111111')).toBe(false)
    expect(cnpjValido('123')).toBe(false)
  })

  it('formata o CNAE', () => {
    expect(formatarCnae(4789099)).toBe('4789-0/99')
    expect(formatarCnae('0111301')).toBe('0111-3/01')
    expect(formatarCnae(null)).toBe('')
  })

  it('lê a resposta da BrasilAPI e sugere Simples', () => {
    const d = deBrasilApi(BRASILAPI)
    expect(d).toMatchObject({ razaoSocial: 'DELTA IMPORTS LTDA', matriz: true, uf: 'SP', cnae: '4789-0/99', situacao: 'ATIVA', abertura: '2026-04-02' })
    expect(d.simples).toEqual({ optante: true, desde: '2026-04-02', excluidoEm: null })
    expect(regimeSugerido(d)).toBe('simples')
    expect(anexoSugerido(d.cnae)).toBe('I')
  })

  it('usa a forma de tributação declarada quando não é do Simples', () => {
    const d = deBrasilApi({
      ...BRASILAPI,
      opcao_pelo_simples: false,
      regime_tributario: [
        { ano: 2023, forma_de_tributacao: 'LUCRO REAL' },
        { ano: 2024, forma_de_tributacao: 'LUCRO PRESUMIDO' },
      ],
    })
    expect(regimeSugerido(d)).toBe('presumido')
    expect(regimeSugerido({ ...d, regimes: [] })).toBeNull()
  })

  it('lê a resposta da CNPJ.ws (filial, indústria)', () => {
    const d = deCnpjWs(CNPJWS)
    expect(d).toMatchObject({ cnpj: '11222333000262', matriz: false, uf: 'MG', municipio: 'EXTREMA', cnae: '2222-6/00', situacao: 'ATIVA' })
    expect(d.simples?.optante).toBe(false)
    expect(anexoSugerido(d.cnae)).toBe('II')
    expect(regimeSugerido(d)).toBeNull()
  })

  it('cai para a CNPJ.ws quando a BrasilAPI falha', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes('brasilapi') ? new Response('erro', { status: 502 }) : new Response(JSON.stringify(CNPJWS), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetch)
    const d = await consultarCnpj('11.222.333/0002-62')
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(d.fonte).toMatch(/CNPJ\.ws/)
  })

  it('CNPJ inexistente e CNPJ inválido', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    await expect(consultarCnpj('66264239000187')).rejects.toThrow(/não encontrado/)
    await expect(consultarCnpj('66264239000188')).rejects.toThrow(/inválido/)
  })
})
