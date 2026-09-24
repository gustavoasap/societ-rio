import { aliquotaCreditoFornecedorSimples, dasDaReceita } from './apuracao'
import { SUBLIMITE_ICMS_ISS, regrasDoAno, type RegrasAno } from './tabelas'
import type { Parametros, RegimeFornecedor, RegimeId } from './tipos'

/**
 * Formação de preço de venda por regime e por ano da transição (valores unitários).
 *
 * Preço "de nota" (P) = valor com os tributos "por dentro" (ICMS, ISS, PIS/COFINS, DAS).
 * A partir de 2027 a CBS/IBS do regime regular (e do Simples híbrido) é "por fora": o cliente paga P + CBS/IBS
 * (LC 214/2025, art. 12, §2º — base sem ICMS, ISS, PIS, COFINS e IPI).
 * Margem desejada = lucro líquido (depois de IRPJ/CSLL) sobre P.
 */
export interface EntradaPreco {
  custo: number // valor da nota de compra (com os tributos "por dentro" do fornecedor)
  fornecedor: RegimeFornecedor
  icmsCompra: number // % de ICMS destacado na compra
  stCompra: number // % do custo pago de ICMS-ST/antecipação na entrada (custo definitivo)
  icmsVenda: number // % de ICMS na venda (interna ou interestadual)
  st: boolean // venda com ICMS já retido por ST (sem débito próprio)
  monofasico: boolean // PIS/COFINS monofásico (sem débito na revenda)
  reducao: number // % de redução de IBS/CBS do produto (0, 30, 40, 60, 100)
  despesasVariaveis: number // % sobre o preço (comissão, cartão, frete de venda)
  despesasFixas: number // % sobre o preço (rateio das despesas fixas)
  margem: number // % de lucro líquido desejado sobre o preço
}

/** Dados da empresa usados na formação de preço (vêm da projeção do ano). */
export interface ContextoPreco {
  params: Parametros
  ano: number
  rbt12: number // para a alíquota efetiva do Simples
  irCsllPresumido: number // IRPJ + CSLL do Presumido em fração da receita (com adicional, quando houver)
  irCsllReal: number // IRPJ + CSLL do Real em fração do lucro (0,24 a 0,34)
}

export interface ComposicaoPreco {
  regime: RegimeId
  preco: number // preço de nota (P), com tributos "por dentro"
  ibsCbsFora: number // CBS/IBS destacados por fora
  precoFinal: number // o que o cliente paga
  markup: number // P ÷ custo
  // compra
  desembolsoCompra: number // valor pago ao fornecedor (+ CBS/IBS por fora, + ST)
  creditoIcms: number
  creditoPisCofins: number
  creditoIbsCbs: number
  custoLiquido: number
  // venda (valores a recolher)
  das: number
  icms: number
  pisCofins: number
  ibsCbs: number // CBS/IBS a recolher (débito − crédito)
  irCsll: number
  despesas: number
  lucro: number
  margem: number // lucro ÷ P
  cargaTributaria: number // tributos recolhidos ÷ preço final
  creditoCliente: number // CBS/IBS que um cliente contribuinte aproveita
  custoCliente: number // preço final − crédito do cliente contribuinte
  viavel: boolean
  observacoes: string[]
}

const regimesSimples = (r: RegimeId) => r === 'simples' || r === 'simples_hibrido'

function regrasPreco(ctx: ContextoPreco): RegrasAno {
  const p = ctx.params
  return regrasDoAno(ctx.ano, p.cbsReferencia, p.ibsReferencia, p.aliquotasAno[String(ctx.ano)])
}

/** Compra: o que se paga ao fornecedor e os créditos que o regime do comprador aproveita. */
function compra(regime: RegimeId, e: EntradaPreco, ctx: ContextoPreco, regras: RegrasAno) {
  const p = ctx.params
  const reforma = !regras.pisCofins // CBS/IBS efetivos a partir de 2027 (2026 é ano-teste compensável)
  const a = (regras.cbs + regras.ibs) * (1 - e.reducao / 100)
  const icmsDestacado = (e.custo * e.icmsCompra) / 100
  const regular = e.fornecedor === 'normal' || e.fornecedor === 'real' || e.fornecedor === 'presumido'
  let desembolso = e.custo
  let ibsCbsCreditavel = 0
  if (reforma && regular) {
    if (p.premissaPreco === 'preco_mantido') {
      // o fornecedor mantém o preço total: a CBS/IBS passa a estar contida no valor pago
      ibsCbsCreditavel = ((e.custo - icmsDestacado) * a) / (1 + a)
    } else {
      // o fornecedor tira o PIS/COFINS extinto e soma a CBS/IBS por fora
      const pc = e.fornecedor === 'presumido' ? 0.0365 : p.pisCofinsFornecedores / 100
      const base = Math.max(0, e.custo - icmsDestacado - e.custo * pc)
      ibsCbsCreditavel = base * a
      desembolso = e.custo - e.custo * pc + ibsCbsCreditavel
    }
  } else if (reforma && e.fornecedor === 'simples') {
    // crédito limitado ao IBS/CBS pago no DAS do fornecedor (LC 214, art. 47, §9º)
    ibsCbsCreditavel = e.custo * aliquotaCreditoFornecedorSimples(p, regras) * (1 - e.reducao / 100)
  }
  // MEI e pessoa física: sem crédito de IBS/CBS
  const st = (e.custo * e.stCompra) / 100
  desembolso += st

  const simples = regimesSimples(regime)
  const foraSublimite = simples && ctx.rbt12 > SUBLIMITE_ICMS_ISS
  // Crédito de ICMS: regime normal (não cumulatividade — LC 87/1996, art. 20); Simples não credita (LC 123, art. 23), salvo fora do sublimite
  const creditoIcms = (!simples || foraSublimite) && !e.st ? icmsDestacado * regras.icmsIssFator : 0
  // PIS/COFINS não cumulativo: 9,25% sobre a compra sem o ICMS destacado (Lei 10.833, art. 3º; Lei 14.592/2023); PF não gera crédito
  const creditoPisCofins =
    regime === 'real' && regras.pisCofins && !p.realPisCofinsCumulativo && !e.monofasico && e.fornecedor !== 'pf' ? (e.custo - icmsDestacado) * 0.0925 : 0
  const creditoIbsCbs = regime === 'simples' ? 0 : ibsCbsCreditavel
  return { desembolso, creditoIcms, creditoPisCofins, creditoIbsCbs, custoLiquido: desembolso - creditoIcms - creditoPisCofins - creditoIbsCbs }
}

/** Composição completa a um preço de nota P. */
export function composicaoAoPreco(regime: RegimeId, P: number, e: EntradaPreco, ctx: ContextoPreco): ComposicaoPreco {
  const p = ctx.params
  const regras = regrasPreco(ctx)
  const reforma = !regras.pisCofins
  const obs: string[] = []
  const c = compra(regime, e, ctx, regras)
  const a = (regras.cbs + regras.ibs) * (1 - e.reducao / 100)
  let das = 0
  let debitoIcms = 0
  let debitoPisCofins = 0
  let debitoIbsCbs = 0
  let irCsll = 0
  let creditoCliente = 0

  if (regimesSimples(regime)) {
    const hibrido = regime === 'simples_hibrido' && reforma
    const foraSublimite = ctx.rbt12 > SUBLIMITE_ICMS_ISS
    const parcela = dasDaReceita(P, p.anexo, ctx.rbt12, regras, { monofasico: e.monofasico ? 1 : 0, st: e.st ? 1 : 0, exportacao: false }, hibrido, foraSublimite)
    das = parcela.das
    // acima do sublimite o ICMS sai do DAS e é apurado por débito e crédito (LC 123, art. 13-A)
    if (foraSublimite && !e.st) debitoIcms = (P * e.icmsVenda * regras.icmsIssFator) / 100
    if (hibrido) {
      debitoIbsCbs = Math.max(0, P - parcela.tributos.ICMS - debitoIcms) * a
      creditoCliente = debitoIbsCbs
    } else {
      // no DAS, o cliente contribuinte credita o IBS/CBS efetivamente pago pelo optante (LC 214, art. 47, §9º)
      creditoCliente = reforma ? parcela.cbsIbsNoDas * (1 - e.reducao / 100) : 0
    }
    if (regime === 'simples' && reforma && ['normal', 'real', 'presumido'].includes(e.fornecedor))
      obs.push('No Simples (IBS/CBS no DAS) não há crédito nas compras: a CBS/IBS paga ao fornecedor fica no custo.')
  } else {
    debitoIcms = e.st ? 0 : (P * e.icmsVenda * regras.icmsIssFator) / 100
    if (regras.pisCofins && !e.monofasico) {
      const base = P - (p.excluirIcmsBasePisCofins ? debitoIcms : 0) // STF, Tema 69
      const naoCumulativo = regime === 'real' && !p.realPisCofinsCumulativo
      debitoPisCofins = base * (naoCumulativo ? 0.0925 : 0.0365)
    }
    if (reforma) {
      debitoIbsCbs = Math.max(0, P - debitoIcms) * a
      creditoCliente = debitoIbsCbs
    }
  }
  const icms = debitoIcms - c.creditoIcms
  const pisCofins = debitoPisCofins - c.creditoPisCofins
  const ibsCbs = debitoIbsCbs - c.creditoIbsCbs
  const despesas = (P * (e.despesasVariaveis + e.despesasFixas)) / 100
  // Resultado: débitos "por dentro" saem do preço; os créditos já reduziram o custo. A CBS/IBS por fora é cobrada do cliente
  // e repassada ao fisco — só o crédito das compras afeta o resultado (via custo líquido).
  const lair = P - das - debitoIcms - debitoPisCofins - c.custoLiquido - despesas
  if (regime === 'presumido') irCsll = P * ctx.irCsllPresumido
  if (regime === 'real') irCsll = Math.max(0, lair) * ctx.irCsllReal
  const lucro = lair - irCsll
  const precoFinal = P + debitoIbsCbs
  const recolhidos = das + icms + pisCofins + ibsCbs + irCsll + (e.custo * e.stCompra) / 100
  if (icms < 0) obs.push('Crédito de ICMS maior que o débito: saldo credor acumulado (considerado recuperável).')
  if (ibsCbs < 0) obs.push('Crédito de IBS/CBS maior que o débito: saldo credor (ressarcimento — LC 214, art. 39).')
  return {
    regime,
    preco: P,
    ibsCbsFora: debitoIbsCbs,
    precoFinal,
    markup: e.custo ? P / e.custo : 0,
    desembolsoCompra: c.desembolso,
    creditoIcms: c.creditoIcms,
    creditoPisCofins: c.creditoPisCofins,
    creditoIbsCbs: c.creditoIbsCbs,
    custoLiquido: c.custoLiquido,
    das,
    icms,
    pisCofins,
    ibsCbs,
    irCsll,
    despesas,
    lucro,
    margem: P ? lucro / P : 0,
    cargaTributaria: precoFinal ? recolhidos / precoFinal : 0,
    creditoCliente,
    custoCliente: precoFinal - creditoCliente,
    viavel: P > 0 && Number.isFinite(P),
    observacoes: obs,
  }
}

/**
 * Preço de nota que entrega a margem líquida desejada. A relação lucro × preço é linear por trechos
 * (IRPJ/CSLL do Real só incide com lucro), então o método da secante converge em poucas iterações.
 */
export function precoParaMargem(regime: RegimeId, e: EntradaPreco, ctx: ContextoPreco): ComposicaoPreco {
  const f = (P: number) => {
    const r = composicaoAoPreco(regime, P, e, ctx)
    return r.lucro - (P * e.margem) / 100
  }
  let x0 = Math.max(1e-6, e.custo)
  let x1 = Math.max(1e-6, e.custo * 2)
  let f0 = f(x0)
  let f1 = f(x1)
  for (let i = 0; i < 30 && Math.abs(f1) > 1e-7; i++) {
    if (f1 === f0) break
    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0)
    x0 = x1
    f0 = f1
    x1 = x2
    f1 = f(x1)
  }
  const r = composicaoAoPreco(regime, x1, e, ctx)
  // f cresce com P enquanto tributos + despesas + margem < 100% do preço; do contrário não existe preço viável
  const viavel = r.viavel && Math.abs(f1) < 0.01 && f(x1 * 1.01) > f(x1)
  return { ...r, viavel, observacoes: viavel ? r.observacoes : ['Margem inviável: tributos, despesas e margem somam 100% ou mais do preço.'] }
}
