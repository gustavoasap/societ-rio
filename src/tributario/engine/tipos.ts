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
  percentualMonofasico: number | null // % das vendas com PIS/COFINS monofásico (null = estimar pelo NCM das entradas)
  percentualSt: number // % das vendas com ICMS já retido por substituição tributária
  percentualReducaoIbsCbs: number | null // % médio de redução de IBS/CBS nas vendas (null = estimar pelo NCM)
  aliquotaIcmsInterestadual: number // alíquota média nas vendas interestaduais a contribuintes (4, 7 ou 12)
  percentualNaoContribuinte: number // % das vendas interestaduais destinadas a não contribuintes (DIFAL)
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
  cenarioAliquotas: string
  cbsReferencia: number
  ibsReferencia: number
  crescimentoAnual: number // % ao ano para a projeção
  percentualB2B: number // % das vendas para empresas que aproveitam crédito
  cfopNatureza: Record<string, Natureza> // ajustes do contador na classificação de CFOP
}

export const PARAMETROS_PADRAO: Parametros = {
  atividade: 'comercio',
  anexo: 'I',
  anexoServicos: 'III',
  inicioAtividade: '',
  receitasAnteriores: {},
  percentualMonofasico: null,
  percentualSt: 0,
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
  cenarioAliquotas: CENARIOS_ALIQUOTA[0].id,
  cbsReferencia: CENARIOS_ALIQUOTA[0].cbs,
  ibsReferencia: CENARIOS_ALIQUOTA[0].ibs,
  crescimentoAnual: 0,
  percentualB2B: 0,
  cfopNatureza: {},
}

export const comPadrao = (p: Partial<Parametros> | null | undefined): Parametros => ({ ...PARAMETROS_PADRAO, ...(p ?? {}) })

/** Totais de um mês (consolidado ou de um estabelecimento), já classificados. */
export interface BaseMensal {
  competencia: string
  vendas: number // mercadorias no mercado interno (bruto)
  vendasInternas: number
  vendasInterestaduais: number
  vendasNaoContribuinte: number // parte das interestaduais para não contribuintes (CFOP x107/x108)
  icmsVendasInternas: number // ICMS de débito simulado para regime regular (por alíquota do estabelecimento)
  servicos: number
  exportacao: number
  devolucoesVenda: number
  outrasReceitas: number
  icmsSaidas: number // ICMS efetivamente destacado nas saídas (informativo)
  compras: number // revenda + insumos (valor contábil)
  comprasFornecedorSimples: number
  comprasMonofasico: number
  icmsCompras: number
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
  servicos: 0,
  exportacao: 0,
  devolucoesVenda: 0,
  outrasReceitas: 0,
  icmsSaidas: 0,
  compras: 0,
  comprasFornecedorSimples: 0,
  comprasMonofasico: 0,
  icmsCompras: 0,
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
  issTomados: 0,
  retencoes: 0,
  neutras: 0,
})

export const receitaBruta = (b: BaseMensal) => b.vendas + b.servicos + b.exportacao - b.devolucoesVenda

/** Perfil do mix de produtos, estimado pelos NCM das entradas. */
export interface MixProdutos {
  monofasico: number // fração
  reducaoIbsCbs: number // fração média de redução
  fornecedoresSimples: number // fração das compras vindas de optantes do Simples
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
  memoria: LinhaMemoria[]
  alertas: string[]
  elegivel: boolean
  motivo?: string
}
