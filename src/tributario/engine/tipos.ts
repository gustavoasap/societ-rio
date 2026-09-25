import type { Natureza } from './cfop'
import { CENARIOS_ALIQUOTA, type Anexo } from './tabelas'

export type TipoMovimento = 'entrada' | 'saida' | 'servico_tomado' | 'servico_prestado'
export type RegimeAtual = 'simples' | 'presumido' | 'real'
export type RegimeId = 'simples' | 'simples_hibrido' | 'presumido' | 'real'
export type Atividade = 'comercio' | 'industria' | 'servicos' | 'misto'

export const REGIMES: { value: RegimeId; label: string; curto: string }[] = [
  { value: 'simples', label: 'Simples Nacional (IBS/CBS no DAS)', curto: 'Simples' },
  { value: 'simples_hibrido', label: 'Simples Nacional híbrido (IBS/CBS por fora)', curto: 'Simples híbrido' },
  { value: 'presumido', label: 'Lucro Presumido', curto: 'Presumido' },
  { value: 'real', label: 'Lucro Real', curto: 'Real' },
]

/** Linha agregada de movimento, como é gravada no banco (uma por competência × CFOP × NCM × UF × CST × serviço). */
export interface MovimentoLinha {
  estabelecimento_id: string | null
  competencia: string // AAAA-MM
  tipo: TipoMovimento
  cfop: string
  ncm: string
  uf: string
  cst: string
  servico: string // item da lista da LC 116 (serviços)
  destinatario: Destinatario // tipo do cliente/fornecedor da nota
  parceiro: string // CNPJ do cliente/fornecedor (vazio para pessoa física ou não informado)
  itens: number
  valor_contabil: number
  bc_icms: number
  icms: number
  icms_st: number
  ipi: number
  pis: number
  cofins: number
  iss: number
  difal: number
  retencoes: number
}

/** Cliente/fornecedor: pessoa física, PJ contribuinte do ICMS (com IE) ou PJ não contribuinte. '' = não informado. */
export type Destinatario = '' | 'PF' | 'PJ_C' | 'PJ_N'

/**
 * Regime do fornecedor/prestador — define o crédito:
 * - normal/real/presumido: ICMS destacado, PIS/COFINS (Real) e IBS/CBS integral;
 * - simples: IBS/CBS limitado ao valor do DAS (LC 214, art. 47, §9º), PIS/COFINS integral no Real;
 * - mei: sem crédito de IBS/CBS (valores fixos do SIMEI), PIS/COFINS no Real;
 * - pf: sem crédito (Lei 10.833, art. 3º, §3º, I; LC 214, art. 47).
 */
export type RegimeFornecedor = 'normal' | 'real' | 'presumido' | 'simples' | 'mei' | 'pf'

/** Tratamento de um NCM definido pelo contador para a empresa (campos ausentes = padrão do sistema). */
export interface ConfigNcm {
  monofasico?: boolean
  pisCofinsZero?: boolean // PIS/COFINS com alíquota zero, isenção, suspensão ou sem incidência na venda (Presumido/Real)
  st?: boolean
  reducao?: number // % de redução das alíquotas de IBS/CBS (0, 30, 40, 60, 100)
  aliquotaIcms?: number // alíquota interna de ICMS do NCM na UF da empresa (%)
  mva?: number // MVA original da substituição tributária (%)
}

export interface Estabelecimento {
  id: string
  cnpj: string
  nome: string
  matriz: boolean
  uf: string
  municipio: string | null
  aliquota_icms: number | null
}

/** Parâmetros do planejamento, guardados por empresa. */
export interface Parametros {
  atividade: Atividade
  anexo: Anexo // anexo das receitas de mercadorias (I comércio, II indústria)
  anexoServicos: Anexo // anexo das receitas de serviços (III, IV ou V)
  inicioAtividade: string // AAAA-MM ('' = anterior aos dados)
  receitasAnteriores: Record<string, number> // AAAA-MM -> receita bruta (para o RBT12)
  percentualMonofasico: number | null // % das vendas com PIS/COFINS monofásico (null = pelo NCM)
  percentualSt: number | null // % das vendas com ICMS já retido por substituição tributária (null = pelo NCM)
  percentualReducaoIbsCbs: number | null // % médio de redução de IBS/CBS nas vendas (null = pelo NCM)
  aliquotaIcmsInterestadual: number // alíquota média nas vendas interestaduais a contribuintes (4, 7 ou 12)
  percentualNaoContribuinte: number // % das vendas interestaduais a não contribuintes (DIFAL) — só para notas sem destinatário identificado
  aliquotaInternaDestino: number // alíquota interna média das UFs de destino (DIFAL)
  aliquotaIpi: number // IPI médio nas saídas (0 se não for contribuinte/equiparado)
  aliquotaIss: number // ISS próprio sobre serviços prestados (fora do Simples)
  excluirIcmsBasePisCofins: boolean // Tema 69 do STF
  presuncaoIrpj: number
  presuncaoCsll: number
  presuncaoIrpjServicos: number
  presuncaoCsllServicos: number
  folhaMensal: number
  proLaboreMensal: number
  ratFap: number // RAT ajustado pelo FAP (%)
  terceiros: number // outras entidades (%)
  despesasMensais: number // outras despesas dedutíveis (aluguel, contador, sistemas...) — Lucro Real
  despesasCreditaveisMensais: number // parte dessas despesas que gera crédito (aluguel PJ, energia...) — PIS/COFINS e IBS/CBS
  cmvPercentual: number | null // CMV em % da receita (null = compras líquidas do período)
  receitasFinanceirasMensais: number
  servicosCreditaveisPisCofins: string // itens da LC 116 que geram crédito de PIS/COFINS no Real (armazenagem, frete)
  aliquotaFornecedoresSimples: number // alíquota efetiva média do DAS dos fornecedores do Simples (crédito de IBS/CBS)
  pisCofinsFornecedores: number // PIS/COFINS embutidos no preço dos fornecedores do regime regular (%) — saem do preço em 2027 (repasse)
  cenarioAliquotas: string
  cbsReferencia: number
  ibsReferencia: number
  crescimentoAnual: number // % ao ano para a projeção
  percentualB2B: number | null // % das vendas para empresas que aproveitam crédito (null = pelo destinatário das notas)
  /** Expectativas de alíquota por ano (%), sobrepõem o cenário: { '2027': { cbs: 8.5, ibs: 0.1 } } */
  aliquotasAno: Record<string, { cbs?: number; ibs?: number }>
  /** Tratamento por NCM (carregado da tabela trib_ncms — não é gravado no JSON de parâmetros). */
  ncms: Record<string, ConfigNcm>
  /** Regime informado para cada fornecedor (CNPJ) — carregado da tabela trib_parceiros */
  regimeFornecedores: Record<string, RegimeFornecedor>
  /** Lucro Real com receitas no regime cumulativo de PIS/COFINS (Lei 10.833/2003, art. 10) */
  realPisCofinsCumulativo: boolean
  cfopNatureza: Record<string, Natureza> // ajustes do contador na classificação de CFOP
  /** CFOPs (ou SERV-T:/SERV-P: + código de serviço) desconsiderados na análise */
  cfopsExcluidos: string[]
  /** CNPJs de clientes/fornecedores desconsiderados; 'PF' = todas as pessoas físicas */
  parceirosExcluidos: string[]
  /** Premissa de preço na reforma: preço ao cliente mantido (IBS/CBS "sai" da margem) ou IBS/CBS repassado por fora */
  premissaPreco: 'preco_mantido' | 'repasse'
  /** Simples: cobrar antecipação/ST nas entradas interestaduais (LC 123, art. 13, §1º, XIII, "g") */
  antecipacaoSimples: boolean
  /** Simulação de ICMS: benefício fiscal ou mudança de UF do estabelecimento */
  cenarioIcms: CenarioIcms
  /**
   * Papel da empresa na ST: substituída (revenda — o ICMS da cadeia já foi retido: sem débito na venda interna e sem crédito do
   * ICMS próprio da compra) ou substituta (indústria/importador — mantém o ICMS próprio e retém a ST do cliente, cobrada por fora).
   */
  papelSt: 'substituido' | 'substituto'
  /** UF a que se referem as alíquotas internas por NCM (a da matriz); em outra UF (cenário ou filial) vale a modal. Calculado no painel. */
  ufAliquotasNcm?: string
  /** Observações do contador impressas no relatório ao cliente */
  observacoesRelatorio: string
}

export interface CenarioIcms {
  ativo: boolean
  descricao: string
  uf: string // UF de onde as mercadorias passariam a sair
  aliquotaInterna: number | null // alíquota/carga efetiva nas vendas internas (null = modal da UF)
  cargaInterestadual: number | null // carga efetiva nas vendas interestaduais com benefício (null = 4/7/12%)
  manterCreditos: boolean // benefício com ou sem manutenção dos créditos de entrada
}

export const PARAMETROS_PADRAO: Parametros = {
  atividade: 'comercio',
  anexo: 'I',
  anexoServicos: 'III',
  inicioAtividade: '',
  receitasAnteriores: {},
  percentualMonofasico: null,
  percentualSt: null,
  percentualReducaoIbsCbs: null,
  aliquotaIcmsInterestadual: 12,
  percentualNaoContribuinte: 0,
  aliquotaInternaDestino: 19,
  aliquotaIpi: 0,
  aliquotaIss: 5,
  excluirIcmsBasePisCofins: true,
  presuncaoIrpj: 8,
  presuncaoCsll: 12,
  presuncaoIrpjServicos: 32,
  presuncaoCsllServicos: 32,
  folhaMensal: 0,
  proLaboreMensal: 0,
  ratFap: 2,
  terceiros: 5.8,
  despesasMensais: 0,
  despesasCreditaveisMensais: 0,
  cmvPercentual: null,
  receitasFinanceirasMensais: 0,
  servicosCreditaveisPisCofins: '11.04, 16.01, 16.02, 26.01',
  aliquotaFornecedoresSimples: 8,
  pisCofinsFornecedores: 9.25,
  cenarioAliquotas: CENARIOS_ALIQUOTA[0].id,
  cbsReferencia: CENARIOS_ALIQUOTA[0].cbs,
  ibsReferencia: CENARIOS_ALIQUOTA[0].ibs,
  crescimentoAnual: 0,
  percentualB2B: null,
  aliquotasAno: {},
  ncms: {},
  regimeFornecedores: {},
  realPisCofinsCumulativo: false,
  cfopNatureza: {},
  cfopsExcluidos: [],
  parceirosExcluidos: [],
  premissaPreco: 'preco_mantido',
  antecipacaoSimples: true,
  cenarioIcms: { ativo: false, descricao: '', uf: 'SC', aliquotaInterna: null, cargaInterestadual: null, manterCreditos: true },
  observacoesRelatorio: '',
  papelSt: 'substituido',
}

export const comPadrao = (p: Partial<Parametros> | null | undefined): Parametros => ({ ...PARAMETROS_PADRAO, ...(p ?? {}) })

/** Totais de um mês (consolidado ou de um estabelecimento), já classificados. */
export interface BaseMensal {
  competencia: string
  vendas: number // mercadorias no mercado interno (bruto)
  vendasInternas: number
  vendasInterestaduais: number
  vendasNaoContribuinte: number // interestaduais sem destinatário identificado, com CFOP x107/x108
  icmsVendasInternas: number // ICMS de débito simulado para regime regular (por alíquota do estabelecimento)
  vendasInterCalc: number // interestaduais com UF de destino conhecida (alíquota calculada nota a nota)
  icmsInterCalc: number // ICMS interestadual calculado (4%, 7% ou 12% conforme origem e UFs)
  difalCalc: number // DIFAL calculado para não contribuintes (alíquota interna da UF de destino − interestadual)
  vendasComNcm: number // vendas com NCM informado (base das frações abaixo)
  vendasMonofasico: number
  vendasPisCofinsZero: number // alíquota zero/isenção/suspensão de PIS/COFINS (não afeta o DAS)
  vendasSt: number
  vendasReducao: number // Σ valor × fração de redução de IBS/CBS
  vendasComDestinatario: number
  vendasB2B: number // vendas a PJ contribuinte (aproveitam crédito)
  vendasPF: number
  cenVendasCalc: number // cenário de ICMS: vendas com destino conhecido
  cenIcms: number // cenário de ICMS: ICMS próprio nas vendas
  cenDifal: number // cenário de ICMS: DIFAL
  stEntradas: number // ICMS-ST devido nas entradas interestaduais sem retenção (MVA)
  stSemMva: number // valor de entradas com ST sem MVA informada (alerta)
  antecipacao: number // antecipação de ICMS nas entradas interestaduais sem ST (alíquota interna − interestadual)
  servicos: number
  exportacao: number
  devolucoesVenda: number
  outrasReceitas: number
  icmsSaidas: number // ICMS efetivamente destacado nas saídas (informativo)
  compras: number // revenda + insumos (valor contábil)
  comprasFornecedorSimples: number
  comprasMei: number
  comprasPF: number
  comprasPresumido: number
  comprasMonofasico: number
  comprasPisCofinsZero: number
  icmsCompras: number // ICMS destacado nas compras que gera crédito
  icmsComprasSemCredito: number // ICMS próprio destacado nas compras de mercadoria com ST (substituída): custo, sem crédito
  ipiCompras: number
  stCompras: number
  devolucoesCompra: number
  icmsDevolucoesCompra: number
  usoConsumo: number
  ativo: number
  energia: number
  fretes: number
  comunicacao: number
  servicosTomados: number
  servicosTomadosCreditaveis: number // PIS/COFINS no Lucro Real
  servicosSimples: number // prestadores do Simples
  servicosMei: number
  servicosPF: number
  servicosPresumido: number
  issTomados: number
  retencoes: number
  neutras: number // remessas, retornos, transferências, bonificações (informativo)
}

export const BASE_VAZIA = (competencia: string): BaseMensal => ({
  competencia,
  vendas: 0,
  vendasInternas: 0,
  vendasInterestaduais: 0,
  vendasNaoContribuinte: 0,
  icmsVendasInternas: 0,
  vendasInterCalc: 0,
  icmsInterCalc: 0,
  difalCalc: 0,
  vendasComNcm: 0,
  vendasMonofasico: 0,
  vendasPisCofinsZero: 0,
  vendasSt: 0,
  vendasReducao: 0,
  vendasComDestinatario: 0,
  vendasB2B: 0,
  vendasPF: 0,
  cenVendasCalc: 0,
  cenIcms: 0,
  cenDifal: 0,
  stEntradas: 0,
  stSemMva: 0,
  antecipacao: 0,
  servicos: 0,
  exportacao: 0,
  devolucoesVenda: 0,
  outrasReceitas: 0,
  icmsSaidas: 0,
  compras: 0,
  comprasFornecedorSimples: 0,
  comprasMei: 0,
  comprasPF: 0,
  comprasPresumido: 0,
  comprasMonofasico: 0,
  comprasPisCofinsZero: 0,
  icmsCompras: 0,
  icmsComprasSemCredito: 0,
  ipiCompras: 0,
  stCompras: 0,
  devolucoesCompra: 0,
  icmsDevolucoesCompra: 0,
  usoConsumo: 0,
  ativo: 0,
  energia: 0,
  fretes: 0,
  comunicacao: 0,
  servicosTomados: 0,
  servicosTomadosCreditaveis: 0,
  servicosSimples: 0,
  servicosMei: 0,
  servicosPF: 0,
  servicosPresumido: 0,
  issTomados: 0,
  retencoes: 0,
  neutras: 0,
})

export const receitaBruta = (b: BaseMensal) => b.vendas + b.servicos + b.exportacao - b.devolucoesVenda

/** Perfil médio do período (usado quando o mês não tem saídas detalhadas): pelos NCM das saídas, ou das entradas. */
export interface MixProdutos {
  monofasico: number // fração
  st: number // fração
  reducaoIbsCbs: number // fração média de redução
  b2b: number // fração das vendas a PJ contribuinte
  fornecedoresSimples: number // fração das compras vindas de optantes do Simples
  pisCofinsZero?: number // fração das vendas com PIS/COFINS a alíquota zero, isentas ou suspensas
}

export type Tributo = 'IRPJ' | 'CSLL' | 'PIS' | 'COFINS' | 'CPP' | 'ICMS' | 'IPI' | 'ISS' | 'CBS' | 'IBS'
export const TRIBUTOS: Tributo[] = ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'CPP', 'ICMS', 'IPI', 'ISS', 'CBS', 'IBS']

export type Tributos = Record<Tributo, number>
export const TRIBUTOS_ZERO = (): Tributos => ({ IRPJ: 0, CSLL: 0, PIS: 0, COFINS: 0, CPP: 0, ICMS: 0, IPI: 0, ISS: 0, CBS: 0, IBS: 0 })

export interface LinhaMemoria {
  grupo: string
  descricao: string
  valor: number
  formula?: string
  destaque?: boolean
}

export interface ResultadoMes {
  competencia: string
  receita: number
  tributos: Tributos
  total: number
  /** Simples: dados do PGDAS do mês */
  simples?: { rbt12: number; proporcional: boolean; faixa: number; aliquota: number; das: number }
}

/** Valores para montar a DRE de cada regime (tudo em R$ no período). */
export interface DreDados {
  receitaBruta: number // vendas + serviços + exportação (com IBS/CBS quando repassado por fora)
  devolucoes: number
  deducoes: Record<string, number> // tributos sobre a receita (débitos): DAS, ICMS próprio, DIFAL, PIS, COFINS, ISS, IPI, CBS, IBS
  cmv: number // custo das mercadorias pelo valor das notas
  creditosCompras: number // créditos recuperáveis sobre as compras (ICMS, PIS/COFINS, IBS/CBS)
  icmsEntradas: number // ICMS-ST e antecipação nas entradas (custo)
  servicosTomados: number
  despesasOperacionais: number // fretes, energia, comunicação, uso e consumo
  pessoal: number // folha + FGTS + pró-labore
  encargos: number // CPP fora do DAS (INSS patronal, RAT, terceiros)
  despesasGerais: number
  creditosDespesas: number // créditos sobre serviços e despesas (PIS/COFINS no Real, IBS/CBS)
  receitasFinanceiras: number
  tributosFinanceiros: number
  irpj: number
  csll: number
}

export const DRE_VAZIA = (): DreDados => ({
  receitaBruta: 0,
  devolucoes: 0,
  deducoes: {},
  cmv: 0,
  creditosCompras: 0,
  icmsEntradas: 0,
  servicosTomados: 0,
  despesasOperacionais: 0,
  pessoal: 0,
  encargos: 0,
  despesasGerais: 0,
  creditosDespesas: 0,
  receitasFinanceiras: 0,
  tributosFinanceiros: 0,
  irpj: 0,
  csll: 0,
})

/** Composição do ICMS no período. */
export interface IcmsResumo {
  proprio: number // débito das vendas (interna + interestadual)
  difal: number // DIFAL das vendas a não contribuinte
  credito: number // créditos das entradas e devoluções
  st: number // ICMS-ST nas entradas sem retenção
  antecipacao: number // antecipação nas entradas interestaduais
  noDas: number // parcela de ICMS dentro do DAS
}

/** Créditos aproveitados por origem. */
export interface CreditosResumo {
  icms: number
  pisCofinsCompras: number
  pisCofinsDespesas: number
  ibsCbsFornecedorRegular: number
  ibsCbsFornecedorSimples: number
  ibsCbsDespesas: number
  /** crédito de IBS/CBS que se perde por comprar de optante do Simples (diferença para o crédito integral) */
  ibsCbsPerdidoSimples: number
}

export interface Resultado {
  regime: RegimeId
  ano: number
  receita: number
  tributos: Tributos
  das: number // valor pago via DAS (Simples)
  total: number
  carga: number // total / receita
  creditosIbsCbs: number // créditos de IBS/CBS aproveitados
  saldoCredor: number // créditos de IBS/CBS acima dos débitos (a ressarcir/compensar)
  creditoTransferido: number // IBS/CBS que os clientes podem se creditar
  porMes: ResultadoMes[]
  dre: DreDados
  icms: IcmsResumo
  creditos: CreditosResumo
  memoria: LinhaMemoria[]
  alertas: string[]
  elegivel: boolean
  motivo?: string
}
