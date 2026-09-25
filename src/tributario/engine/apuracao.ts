import { calcularRbt12, fracoesDoMes } from './base'
import {
  ANEXOS_SIMPLES,
  LC224_ACRESCIMO,
  LC224_LIMITE_ANUAL,
  LIMITE_SIMPLES,
  SUBLIMITE_ICMS_ISS,
  regrasDoAno,
  type Anexo,
  type RegrasAno,
  type TributoDas,
} from './tabelas'
import {
  DRE_VAZIA,
  TRIBUTOS_ZERO,
  receitaBruta,
  type BaseMensal,
  type CreditosResumo,
  type DreDados,
  type IcmsResumo,
  type LinhaMemoria,
  type MixProdutos,
  type Parametros,
  type RegimeId,
  type Resultado,
  type ResultadoMes,
  type Tributos,
} from './tipos'

export interface Contexto {
  params: Parametros
  mix: MixProdutos
  /** Receita bruta de um mês fora do período (histórico para o RBT12). */
  receitaHistorica: (competencia: string) => number | undefined
  /** RBT12 fixo (usado nas projeções anuais). */
  rbt12Fixo?: number
  /** Ano cujas regras serão aplicadas (padrão: ano de cada competência). */
  anoRegras?: number
  /**
   * PIS/COFINS embutidos "por dentro" no preço de venda atual (fração da receita bruta), apurados no regime em que a empresa está hoje.
   * Com a extinção em 2027, essa parcela sai do preço e não compõe a base da CBS/IBS, que é "por fora".
   */
  pisCofinsEmbutido?: number
}

const ano = (comp: string) => Number(comp.slice(0, 4))
const pct = (v: number, casas = 2) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function regrasPara(b: BaseMensal, ctx: Contexto): RegrasAno {
  const a = ctx.anoRegras ?? ano(b.competencia)
  return regrasDoAno(a, ctx.params.cbsReferencia, ctx.params.ibsReferencia, ctx.params.aliquotasAno[String(a)])
}

// ---------------------------------------------------------------------------
// Simples Nacional
// ---------------------------------------------------------------------------

export function faixaSimples(anexo: Anexo, rbt12: number) {
  const faixas = ANEXOS_SIMPLES[anexo].faixas
  const i = faixas.findIndex((f) => rbt12 <= f.ate)
  const idx = i === -1 ? faixas.length - 1 : i
  const f = faixas[idx]
  const efetiva = rbt12 > 0 ? (rbt12 * f.nominal - f.deduzir) / rbt12 : f.nominal
  return { faixa: idx + 1, nominal: f.nominal, deduzir: f.deduzir, efetiva, partilha: partilhaAjustada(f.partilha, efetiva) }
}

/** ISS limitado a 5% da receita; o excedente é redistribuído proporcionalmente aos tributos federais (LC 123, Anexos III a V, nota). */
function partilhaAjustada(partilha: Partial<Record<TributoDas, number>>, efetiva: number): Partial<Record<TributoDas, number>> {
  const iss = partilha.ISS ?? 0
  if (!iss || iss * efetiva <= 0.05) return partilha
  const novoIss = 0.05 / efetiva
  const excesso = iss - novoIss
  const federais = (['IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP'] as TributoDas[]).filter((t) => partilha[t])
  const soma = federais.reduce((a, t) => a + (partilha[t] ?? 0), 0)
  const r: Partial<Record<TributoDas, number>> = { ...partilha, ISS: novoIss }
  for (const t of federais) r[t] = (partilha[t] ?? 0) + (excesso * (partilha[t] ?? 0)) / soma
  return r
}

interface ParcelaDas {
  tributos: Tributos
  das: number
  cbsIbsNoDas: number
}

/** DAS de uma parcela de receita, com as segregações legais e a conversão da partilha na reforma. */
export function dasDaReceita(
  receita: number,
  anexo: Anexo,
  rbt12: number,
  regras: RegrasAno,
  seg: { monofasico: number; st: number; exportacao: boolean },
  hibrido: boolean,
  foraSublimite: boolean,
): ParcelaDas & { efetiva: number; faixa: number } {
  const f = faixaSimples(anexo, rbt12)
  const t = TRIBUTOS_ZERO()
  const bruto = receita * f.efetiva
  const parte = (tr: TributoDas) => bruto * (f.partilha[tr] ?? 0)

  t.IRPJ = parte('IRPJ')
  t.CSLL = parte('CSLL')
  t.CPP = parte('CPP')
  t.IPI = seg.exportacao ? 0 : parte('IPI')

  // PIS/COFINS (até 2026) ou CBS (a partir de 2027). Monofásico só se aplica a PIS/COFINS (LC 123, art. 18, §4º-A, I).
  const pisCofinsFator = seg.exportacao ? 0 : regras.pisCofins ? 1 - seg.monofasico : 1
  if (regras.pisCofins) {
    t.PIS = parte('PIS') * pisCofinsFator
    t.COFINS = parte('COFINS') * pisCofinsFator
  } else {
    t.CBS = (parte('PIS') + parte('COFINS')) * pisCofinsFator
  }

  // ICMS/ISS: parcela convertida em IBS na proporção da transição (2029-2033); ST exclui só o ICMS.
  const icmsCheio = foraSublimite || seg.exportacao ? 0 : parte('ICMS')
  const issCheio = foraSublimite || seg.exportacao ? 0 : parte('ISS')
  t.ICMS = icmsCheio * regras.icmsIssFator * (1 - seg.st)
  t.ISS = issCheio * regras.icmsIssFator
  t.IBS = (icmsCheio + issCheio) * (1 - regras.icmsIssFator)

  const cbsIbsNoDas = t.CBS + t.IBS
  if (hibrido) {
    t.CBS = 0
    t.IBS = 0
  }
  const das = Object.values(t).reduce((a, b) => a + b, 0)
  return { tributos: t, das, cbsIbsNoDas, efetiva: f.efetiva, faixa: f.faixa }
}

function somaTributos(a: Tributos, b: Tributos, fator = 1) {
  for (const k of Object.keys(a) as (keyof Tributos)[]) a[k] += b[k] * fator
}

const somaValores = (t: Tributos) => Object.values(t).reduce((a, v) => a + v, 0)

function somarDre(a: DreDados, b: DreDados) {
  for (const k of Object.keys(a) as (keyof DreDados)[]) {
    if (k === 'deducoes') for (const [n, v] of Object.entries(b.deducoes)) a.deducoes[n] = (a.deducoes[n] ?? 0) + v
    else (a[k] as number) += b[k] as number
  }
}

function somar<T extends object>(a: T, b: T) {
  for (const k of Object.keys(a) as (keyof T)[]) (a[k] as number) += b[k] as number
}

const ICMS_ZERO = (): IcmsResumo => ({ proprio: 0, difal: 0, credito: 0, st: 0, antecipacao: 0, noDas: 0 })
const CREDITOS_ZERO = (): CreditosResumo => ({
  icms: 0,
  pisCofinsCompras: 0,
  pisCofinsDespesas: 0,
  ibsCbsFornecedorRegular: 0,
  ibsCbsFornecedorSimples: 0,
  ibsCbsDespesas: 0,
  ibsCbsPerdidoSimples: 0,
})

/** Parte comum da DRE: receita, custos e despesas pelo valor das notas e dos parâmetros. */
function dreBase(b: BaseMensal, p: Parametros, cppFora: number): DreDados {
  const d = DRE_VAZIA()
  d.receitaBruta = b.vendas + b.servicos + b.exportacao
  d.devolucoes = b.devolucoesVenda
  d.cmv = p.cmvPercentual !== null ? (receitaBruta(b) * p.cmvPercentual) / 100 : Math.max(0, b.compras - b.devolucoesCompra)
  d.servicosTomados = b.servicosTomados
  d.despesasOperacionais = b.fretes + b.energia + b.comunicacao + b.usoConsumo
  d.pessoal = p.folhaMensal * 1.08 + p.proLaboreMensal
  d.encargos = cppFora
  d.despesasGerais = p.despesasMensais
  d.receitasFinanceiras = p.receitasFinanceirasMensais
  return d
}

/** Lucro antes do IRPJ/CSLL a partir da DRE. */
export function lucroAntesIr(d: DreDados) {
  const deducoes = Object.values(d.deducoes).reduce((a, v) => a + v, 0)
  return (
    d.receitaBruta -
    d.devolucoes -
    deducoes -
    (d.cmv - d.creditosCompras + d.icmsEntradas) -
    (d.servicosTomados + d.despesasOperacionais + d.pessoal + d.encargos + d.despesasGerais - d.creditosDespesas) +
    d.receitasFinanceiras -
    d.tributosFinanceiros
  )
}

// ---------------------------------------------------------------------------
// ICMS
// ---------------------------------------------------------------------------

/** ICMS pelo regime de débito e crédito (LC 87/1996), com DIFAL (EC 87/2015) e cenário de benefício/mudança de UF. */
export function icmsRegular(b: BaseMensal, p: Parametros, regras: RegrasAno) {
  const cen = p.cenarioIcms
  // percentual de ST manual (quando informado) — com NCM a ST já é tratada nota a nota
  const stManual = p.percentualSt !== null ? p.percentualSt / 100 : 0
  let proprio: number
  let difal: number
  if (cen.ativo) {
    const resto = Math.max(0, b.vendas - b.cenVendasCalc)
    const inter = cen.cargaInterestadual ?? p.aliquotaIcmsInterestadual
    proprio = b.cenIcms + resto * (inter / 100)
    difal = b.cenDifal + ((resto * p.percentualNaoContribuinte) / 100) * Math.max(0, (p.aliquotaInternaDestino - p.aliquotaIcmsInterestadual) / 100)
  } else {
    // notas com UF de destino: alíquota e DIFAL nota a nota; as demais pelas médias dos parâmetros
    const resto = Math.max(0, b.vendasInterestaduais - b.vendasInterCalc)
    const naoContrib = Math.max(b.vendasNaoContribuinte, (resto * p.percentualNaoContribuinte) / 100)
    proprio = b.icmsVendasInternas * (1 - stManual) + b.icmsInterCalc + resto * (p.aliquotaIcmsInterestadual / 100)
    difal = b.difalCalc + naoContrib * Math.max(0, (p.aliquotaInternaDestino - p.aliquotaIcmsInterestadual) / 100)
  }
  const aliqMedia = b.vendas ? proprio / b.vendas : 0
  const creditoCompras = cen.ativo && !cen.manterCreditos ? 0 : Math.max(0, b.icmsCompras - b.icmsDevolucoesCompra)
  const credito = creditoCompras + b.devolucoesVenda * aliqMedia
  const f = regras.icmsIssFator
  const devidoProprio = Math.max(0, proprio - credito) * f
  return {
    proprio: proprio * f,
    difal: difal * f,
    credito: Math.min(credito, proprio) * f,
    creditoCompras: Math.min(creditoCompras, proprio) * f,
    st: b.stEntradas * f,
    antecipacao: b.antecipacao * f,
    devido: devidoProprio + difal * f + b.stEntradas * f,
    aliqMedia,
  }
}

// ---------------------------------------------------------------------------
// IBS / CBS
// ---------------------------------------------------------------------------

/** Crédito de IBS/CBS nas compras de optantes do Simples: valor de CBS/IBS embutido no DAS deles (LC 214, art. 47, §9º). */
export function aliquotaCreditoFornecedorSimples(p: Parametros, regras: RegrasAno) {
  const f = ANEXOS_SIMPLES.I.faixas[2].partilha
  const share = (f.PIS ?? 0) + (f.COFINS ?? 0) + (f.ICMS ?? 0) * (1 - regras.icmsIssFator)
  return (p.aliquotaFornecedoresSimples / 100) * share
}

/**
 * IBS/CBS pelo regime regular — débito sobre as vendas, crédito sobre as aquisições (LC 214, arts. 12, 28 e 47).
 * Premissa "preço mantido": o valor da nota passa a conter o IBS/CBS (base = valor ÷ (1 + alíquota)).
 * Premissa "repasse": o IBS/CBS é somado ao valor atual (base = valor da nota).
 */
export function ibsCbsRegular(b: BaseMensal, ctx: Contexto, regras: RegrasAno, icmsOperacao: number, issOperacao: number) {
  const { params: p, mix } = ctx
  const fr = fracoesDoMes(b, p, mix)
  const memoria: LinhaMemoria[] = []
  const vazio = {
    b2b: fr.b2b,
    cbs: 0,
    ibs: 0,
    debito: 0,
    creditos: 0,
    credCompras: 0,
    credSimples: 0,
    credOutras: 0,
    perdidoSimples: 0,
    saldoCredor: 0,
    reducaoPrecoVenda: 0,
    reducaoPrecoCompras: 0,
    reducaoPrecoOutras: 0,
    memoria,
  }
  if (regras.pisCofins) {
    if (regras.teste)
      memoria.push({ grupo: 'IBS/CBS', descricao: 'Ano-teste 2026: CBS 0,9% e IBS 0,1% destacados, compensáveis/dispensados', valor: 0, formula: 'LC 214, arts. 343, 346 e 348' })
    return vazio
  }
  const aliq = regras.cbs + regras.ibs
  const aliqVenda = aliq * (1 - fr.reducao)
  const dentro = p.premissaPreco === 'preco_mantido'
  const div = (a: number) => (dentro ? 1 + a : 1)
  // Tributos "por dentro" (ICMS, ISS, PIS, COFINS) estão no valor da nota; a CBS/IBS é "por fora" e sua base exclui
  // ICMS, ISS, IPI, PIS e COFINS (LC 214, art. 12, §2º). Exportação é imune (art. 79).
  const vendasBrutas = Math.max(0, b.vendas - b.devolucoesVenda + b.servicos)
  // Repasse: o preço líquido perde o PIS/COFINS extinto e a CBS/IBS é somada por fora sobre esse valor menor.
  // Preço mantido: o preço total não muda — o espaço do PIS/COFINS extinto é ocupado pela CBS/IBS calculada "de dentro para fora".
  const pisCofinsVenda = dentro ? 0 : vendasBrutas * (ctx.pisCofinsEmbutido ?? 0)
  const valor = Math.max(0, vendasBrutas - icmsOperacao - issOperacao - pisCofinsVenda)
  const base = valor / div(aliqVenda)
  const debito = base * aliqVenda

  // Compras por regime do fornecedor: regime normal (Presumido/Real) = crédito integral; Simples = valor do DAS; MEI e PF = sem crédito
  const comprasLiquidas = Math.max(0, b.compras - b.devolucoesCompra)
  const fr_ = (v: number) => (b.compras ? v / b.compras : 0)
  const fatorSimples = fr_(b.comprasFornecedorSimples)
  const fatorSemCredito = fr_(b.comprasMei + b.comprasPF)
  const fatorRegular = Math.max(0, 1 - fatorSimples - fatorSemCredito)
  const fatorPresumido = fr_(b.comprasPresumido)
  const tributosCompra = b.icmsCompras + b.icmsComprasSemCredito + b.ipiCompras + b.stCompras // destacados pelos fornecedores do regime normal
  const comprasRegularBruto = Math.max(0, comprasLiquidas * fatorRegular - tributosCompra)
  // Repasse: o fornecedor do regime normal deixa de embutir PIS/COFINS — 3,65% (Presumido) ou o % dos parâmetros (Real/não informado)
  const pcNormal = p.pisCofinsFornecedores / 100
  const pcRegular = fatorRegular ? (fatorPresumido * 0.0365 + Math.max(0, fatorRegular - fatorPresumido) * pcNormal) / fatorRegular : pcNormal
  const pisCofinsCompra = dentro ? 0 : comprasRegularBruto * pcRegular
  const comprasRegular = comprasRegularBruto - pisCofinsCompra
  const aliqCompra = aliq * (1 - mix.reducaoIbsCbs)
  const credCompras = (comprasRegular / div(aliqCompra)) * aliqCompra
  const aliqSimples = aliquotaCreditoFornecedorSimples(p, regras)
  const comprasSimples = comprasLiquidas * fatorSimples
  const comprasSemCredito = comprasLiquidas * fatorSemCredito
  // Serviços tomados por regime do prestador (o relatório de serviços não traz CSOSN — ajuste o regime em Clientes e fornecedores)
  const servRegular = Math.max(0, b.servicosTomados - b.servicosSimples - b.servicosMei - b.servicosPF)
  const credServSimples = b.servicosSimples * aliqSimples
  const credSimples = comprasSimples * aliqSimples + credServSimples
  const perdidoSimples = Math.max(0, ((comprasSimples + comprasSemCredito + b.servicosSimples + b.servicosMei + b.servicosPF) / div(aliqCompra)) * aliqCompra - credSimples)
  const outrasBruto = servRegular + b.energia + b.fretes + b.comunicacao + b.usoConsumo + b.ativo + p.despesasCreditaveisMensais
  const pisCofinsOutras = dentro ? 0 : (outrasBruto - b.servicosPresumido) * pcNormal + b.servicosPresumido * 0.0365
  const outras = outrasBruto - pisCofinsOutras
  const credOutras = (outras / div(aliq)) * aliq
  const creditos = credCompras + credSimples + credOutras
  const liquido = debito - creditos
  const cbsShare = aliq ? regras.cbs / aliq : 0

  memoria.push(
    { grupo: 'IBS/CBS', descricao: 'Vendas e serviços (valor das notas, com tributos "por dentro")', valor: vendasBrutas },
    { grupo: 'IBS/CBS', descricao: '(−) ICMS/ISS "por dentro" (não integram a base)', valor: -(icmsOperacao + issOperacao), formula: 'LC 214, art. 12, §2º' },
    ...(dentro
      ? []
      : [
          {
            grupo: 'IBS/CBS',
            descricao: `(−) PIS/COFINS embutidos no preço atual, extintos em 2027 (${pct(ctx.pisCofinsEmbutido ?? 0)} da receita)`,
            valor: -pisCofinsVenda,
            formula: 'EC 132, ADCT art. 126, II',
          },
        ]),
    {
      grupo: 'IBS/CBS',
      descricao: dentro ? `Base de cálculo (preço mantido: valor ÷ (1 + ${pct(aliqVenda)}))` : 'Base de cálculo (IBS/CBS somados por fora)',
      valor: base,
      formula: dentro ? 'CBS/IBS calculados "por fora", extraídos do preço total' : 'LC 214, art. 12',
    },
    {
      grupo: 'IBS/CBS',
      descricao: `Débito (CBS ${pct(regras.cbs)} + IBS ${pct(regras.ibs, 3)}${fr.reducao ? `, redução média ${pct(fr.reducao, 1)}` : ''})`,
      valor: debito,
    },
    { grupo: 'IBS/CBS', descricao: 'Crédito — compras de fornecedores do regime regular', valor: -credCompras },
    { grupo: 'IBS/CBS', descricao: 'Crédito — compras e serviços de optantes do Simples (valor do DAS)', valor: -credSimples, formula: 'LC 214, art. 47, §9º' },
    { grupo: 'IBS/CBS', descricao: 'Sem crédito — compras e serviços de MEI e pessoa física', valor: 0, formula: `${moeda(comprasSemCredito + b.servicosMei + b.servicosPF)} sem crédito` },
    { grupo: 'IBS/CBS', descricao: 'Crédito — serviços, fretes, energia, uso/consumo, ativo e despesas', valor: -credOutras },
    { grupo: 'IBS/CBS', descricao: liquido >= 0 ? 'IBS/CBS a recolher' : 'Saldo credor de IBS/CBS (ressarcimento)', valor: liquido, destaque: true },
  )
  const devido = Math.max(0, liquido)
  return {
    b2b: fr.b2b,
    cbs: devido * cbsShare,
    ibs: devido * (1 - cbsShare),
    debito,
    creditos,
    credCompras,
    credSimples,
    credOutras,
    perdidoSimples,
    saldoCredor: Math.max(0, -liquido),
    reducaoPrecoVenda: pisCofinsVenda,
    reducaoPrecoCompras: pisCofinsCompra,
    reducaoPrecoOutras: pisCofinsOutras,
    memoria,
  }
}

// ---------------------------------------------------------------------------
// Simples Nacional
// ---------------------------------------------------------------------------

function apurarSimples(bases: BaseMensal[], ctx: Contexto, hibrido: boolean): Resultado {
  const { params, mix } = ctx
  const tot = TRIBUTOS_ZERO()
  const porMes: ResultadoMes[] = []
  const memoria: LinhaMemoria[] = []
  const alertas = new Set<string>()
  const dre = DRE_VAZIA()
  const icmsTot = ICMS_ZERO()
  const cred = CREDITOS_ZERO()
  let das = 0
  let receitaTotal = 0
  let creditoTransferido = 0
  let creditos = 0
  let saldoCredor = 0
  let elegivel = true
  let motivo: string | undefined
  const receitas = new Map(bases.map((b) => [b.competencia, receitaBruta(b)]))
  const receitaDoMes = (c: string) => receitas.get(c) ?? params.receitasAnteriores[c] ?? ctx.receitaHistorica(c)

  for (const b of bases) {
    const regras = regrasPara(b, ctx)
    const hib = hibrido && !regras.pisCofins // o regime híbrido só existe a partir de 2027
    const rb = receitaBruta(b)
    const r = ctx.rbt12Fixo !== undefined ? { rbt12: ctx.rbt12Fixo, proporcional: false, meses: 12 } : calcularRbt12(b.competencia, receitaDoMes, params.inicioAtividade)
    if (r.proporcional) alertas.add('RBT12 proporcionalizado por início de atividade/histórico incompleto (LC 123, art. 18, §2º). Informe as receitas anteriores nos parâmetros para maior precisão.')
    if (r.rbt12 > LIMITE_SIMPLES) {
      elegivel = false
      motivo = `RBT12 de ${moeda(r.rbt12)} acima do limite de ${moeda(LIMITE_SIMPLES)} (LC 123, art. 3º, II).`
    }
    const foraSublimite = r.rbt12 > SUBLIMITE_ICMS_ISS
    if (foraSublimite) alertas.add('Receita acima do sublimite de R$ 3,6 milhões: ICMS/ISS passam a ser recolhidos fora do DAS (LC 123, art. 13-A).')

    const merc = Math.max(0, b.vendas - b.devolucoesVenda)
    const serv = Math.max(0, b.servicos - Math.max(0, b.devolucoesVenda - b.vendas))
    const fr = fracoesDoMes(b, params, mix)
    const seg = { monofasico: fr.monofasico, st: fr.st, exportacao: false }
    const partes = [
      dasDaReceita(merc, params.anexo, r.rbt12, regras, seg, hib, foraSublimite),
      dasDaReceita(serv, params.anexoServicos, r.rbt12, regras, { ...seg, monofasico: 0, st: 0 }, hib, foraSublimite),
      dasDaReceita(b.exportacao, params.anexo, r.rbt12, regras, { ...seg, exportacao: true }, hib, foraSublimite),
    ]
    const tMes = TRIBUTOS_ZERO()
    let dasMes = 0
    let cbsIbsDas = 0
    for (const p of partes) {
      somaTributos(tMes, p.tributos)
      dasMes += p.das
      cbsIbsDas += p.cbsIbsNoDas
    }
    const icmsMes = ICMS_ZERO()
    icmsMes.noDas = tMes.ICMS

    // Tributos fora do DAS
    const cppFora = params.anexo === 'IV' || params.anexoServicos === 'IV' ? cppFolha(params, 1, params.anexoServicos === 'IV' && params.anexo !== 'IV' ? serv / (rb || 1) : 1) : 0
    tMes.CPP += cppFora
    if (foraSublimite) {
      const icms = icmsRegular(b, params, regras)
      tMes.ICMS += icms.devido
      icmsMes.proprio += icms.proprio
      icmsMes.difal += icms.difal
      icmsMes.credito += icms.credito
      icmsMes.st += icms.st
    } else if (params.antecipacaoSimples) {
      // Antecipação e ICMS-ST nas entradas interestaduais: devidos fora do DAS (LC 123, art. 13, §1º, XIII, "a" e "g"; STF Tema 517)
      icmsMes.st = b.stEntradas * regras.icmsIssFator
      icmsMes.antecipacao = b.antecipacao * regras.icmsIssFator
      tMes.ICMS += icmsMes.st + icmsMes.antecipacao
    }
    // Simples não recolhe DIFAL nas vendas a não contribuinte (STF, ADI 5464)

    const d = dreBase(b, params, cppFora)
    d.deducoes['DAS — Simples Nacional'] = dasMes
    if (foraSublimite) d.deducoes['ICMS fora do DAS (sublimite)'] = tMes.ICMS - icmsMes.noDas
    d.icmsEntradas = icmsMes.st + icmsMes.antecipacao
    let ibsCbs: ReturnType<typeof ibsCbsRegular> | null = null
    if (hib) {
      ibsCbs = ibsCbsRegular(b, ctx, regras, tMes.ICMS, tMes.ISS)
      tMes.CBS += ibsCbs.cbs
      tMes.IBS += ibsCbs.ibs
      creditos += ibsCbs.creditos
      saldoCredor += ibsCbs.saldoCredor
      creditoTransferido += ibsCbs.debito * fr.b2b
      aplicarIbsCbsNaDre(d, ibsCbs, regras, params)
      cred.ibsCbsFornecedorRegular += ibsCbs.credCompras
      cred.ibsCbsFornecedorSimples += ibsCbs.credSimples
      cred.ibsCbsDespesas += ibsCbs.credOutras
      cred.ibsCbsPerdidoSimples += ibsCbs.perdidoSimples
    } else {
      creditoTransferido += cbsIbsDas * fr.b2b
    }

    const totalMes = somaValores(tMes)
    somaTributos(tot, tMes)
    somarDre(dre, d)
    somar(icmsTot, icmsMes)
    das += dasMes
    receitaTotal += rb
    const fx = faixaSimples(params.anexo, r.rbt12)
    porMes.push({
      competencia: b.competencia,
      receita: rb,
      tributos: tMes,
      total: totalMes,
      simples: { rbt12: r.rbt12, proporcional: r.proporcional, faixa: fx.faixa, aliquota: rb ? dasMes / rb : fx.efetiva, das: dasMes },
    })

    if (bases.length <= 12) {
      memoria.push(
        { grupo: b.competencia, descricao: 'Receita bruta do mês', valor: rb, destaque: true },
        { grupo: b.competencia, descricao: `RBT12${r.proporcional ? ' (proporcionalizado)' : ''}`, valor: r.rbt12 },
        {
          grupo: b.competencia,
          descricao: `Anexo ${params.anexo} — faixa ${fx.faixa}: nominal ${pct(fx.nominal)}, dedução ${moeda(fx.deduzir)}`,
          valor: fx.efetiva * 100,
          formula: `Alíquota efetiva = (RBT12 × ${pct(fx.nominal)} − ${moeda(fx.deduzir)}) ÷ RBT12 = ${pct(fx.efetiva, 4)}`,
        },
        { grupo: b.competencia, descricao: hib ? 'DAS (sem CBS/IBS)' : 'DAS', valor: dasMes, destaque: true },
      )
      if (icmsMes.st + icmsMes.antecipacao > 0)
        memoria.push({
          grupo: b.competencia,
          descricao: 'ICMS nas entradas interestaduais (ST com MVA + antecipação) — fora do DAS',
          valor: icmsMes.st + icmsMes.antecipacao,
          formula: 'LC 123, art. 13, §1º, XIII',
        })
      if (hib && ibsCbs) memoria.push(...ibsCbs.memoria.map((m) => ({ ...m, grupo: b.competencia })))
    }
    if (mix.monofasico > 0 && regras.pisCofins) alertas.add(`${pct(mix.monofasico, 1)} das vendas monofásicas: PIS/COFINS excluídos do DAS (LC 123, art. 18, §4º-A, I).`)
    if (mix.monofasico > 0 && !regras.pisCofins)
      alertas.add('A partir de 2027 o PIS/COFINS monofásico deixa de existir: a parcela de CBS do DAS incide sobre toda a receita (produtos antes monofásicos passam a pagar CBS).')
    if (b.stSemMva > 0) alertas.add('Há entradas de mercadorias com ST sem MVA informada — informe a MVA na aba Produtos (NCM) para o cálculo exato da ST.')
  }
  if (bases.some((b) => b.difalCalc > 0)) alertas.add('Optante do Simples não recolhe DIFAL nas vendas a consumidor final de outro estado (STF, ADI 5464).')

  const total = somaValores(tot)
  return {
    regime: hibrido ? 'simples_hibrido' : 'simples',
    ano: ctx.anoRegras ?? ano(bases[0]?.competencia ?? '2026'),
    receita: receitaTotal,
    tributos: tot,
    das,
    total,
    carga: receitaTotal ? total / receitaTotal : 0,
    creditosIbsCbs: creditos,
    saldoCredor,
    creditoTransferido,
    porMes,
    dre,
    icms: icmsTot,
    creditos: cred,
    memoria,
    alertas: [...alertas],
    elegivel,
    motivo,
  }
}

/** IBS/CBS na DRE: débito como dedução da receita; créditos reduzem o custo e as despesas. No repasse, o IBS/CBS também entra na receita e nas compras. */
function aplicarIbsCbsNaDre(d: DreDados, x: ReturnType<typeof ibsCbsRegular>, regras: RegrasAno, p: Parametros) {
  if (!x.debito && !x.creditos) return
  const cbsShare = regras.cbs + regras.ibs ? regras.cbs / (regras.cbs + regras.ibs) : 0
  d.deducoes['CBS'] = (d.deducoes['CBS'] ?? 0) + x.debito * cbsShare
  d.deducoes['IBS'] = (d.deducoes['IBS'] ?? 0) + x.debito * (1 - cbsShare)
  d.creditosCompras += x.credCompras + x.credSimples
  d.creditosDespesas += x.credOutras
  if (p.premissaPreco === 'repasse') {
    // preço de venda = valor atual − PIS/COFINS extintos + IBS/CBS por fora; compras idem do lado do fornecedor
    d.receitaBruta += x.debito - x.reducaoPrecoVenda
    d.cmv += x.credCompras + x.credSimples - x.reducaoPrecoCompras
    d.servicosTomados += x.credOutras - x.reducaoPrecoOutras
  }
}

// ---------------------------------------------------------------------------
// Tributos do regime regular
// ---------------------------------------------------------------------------

/** Contribuição previdenciária patronal sobre folha e pró-labore (Lei 8.212/1991, art. 22). */
export function cppFolha(p: Parametros, meses: number, fator = 1) {
  return (p.folhaMensal * (0.2 + p.ratFap / 100 + p.terceiros / 100) + p.proLaboreMensal * 0.2) * meses * fator
}

function pisCofinsCumulativo(b: BaseMensal, p: Parametros, mono: number, icmsDebito: number) {
  const merc = Math.max(0, b.vendas - b.devolucoesVenda)
  const exclusaoIcms = p.excluirIcmsBasePisCofins ? icmsDebito : 0
  const base = Math.max(0, merc * (1 - mono) + b.servicos - exclusaoIcms * (1 - mono))
  return { base, pis: base * 0.0065, cofins: base * 0.03 }
}

function pisCofinsNaoCumulativo(b: BaseMensal, p: Parametros, mono: number, icmsDebito: number) {
  const merc = Math.max(0, b.vendas - b.devolucoesVenda)
  const exclusaoIcms = p.excluirIcmsBasePisCofins ? icmsDebito : 0
  const base = Math.max(0, merc * (1 - mono) + b.servicos - exclusaoIcms * (1 - mono))
  // Crédito: bens para revenda (exceto monofásicos, Lei 10.833, art. 3º, I, "b"), sem o ICMS destacado (Lei 14.592/2023),
  // energia, fretes e armazenagem na venda (art. 3º, III e IX) e despesas creditáveis (aluguéis PJ etc.).
  // pessoa física não gera crédito (Lei 10.833, art. 3º, §3º, I); optante do Simples e MEI geram crédito integral
  // compras de monofásicos e de produtos com alíquota zero/isenção/suspensão não geram crédito (art. 3º, §2º, II)
  const comprasNaoMono = Math.max(0, b.compras - b.comprasMonofasico - b.comprasPisCofinsZero - b.devolucoesCompra - b.comprasPF)
  const icmsProp = b.compras ? (b.icmsCompras + b.icmsComprasSemCredito) * (comprasNaoMono / b.compras) : 0
  const baseCreditoCompras = Math.max(0, comprasNaoMono - icmsProp)
  const baseCreditoDespesas = b.energia + b.fretes + b.servicosTomadosCreditaveis + p.despesasCreditaveisMensais
  const debito = base * 0.0925
  const credCompras = baseCreditoCompras * 0.0925
  const credDespesas = baseCreditoDespesas * 0.0925
  const devido = Math.max(0, debito - credCompras - credDespesas)
  const usados = debito ? Math.min(1, (credCompras + credDespesas) / debito) : 0
  const escala = credCompras + credDespesas ? Math.min(credCompras + credDespesas, debito) / (credCompras + credDespesas) : 0
  // Receitas financeiras: 0,65% e 4% (Decreto 8.426/2015)
  const finPis = p.receitasFinanceirasMensais * 0.0065
  const finCofins = p.receitasFinanceirasMensais * 0.04
  return {
    base,
    baseCredito: baseCreditoCompras + baseCreditoDespesas,
    debito,
    pis: (devido * 1.65) / 9.25,
    cofins: (devido * 7.6) / 9.25,
    fin: finPis + finCofins,
    creditos: credCompras + credDespesas,
    credCompras: credCompras * escala,
    credDespesas: credDespesas * escala,
    usados,
  }
}

function issProprio(b: BaseMensal, p: Parametros, regras: RegrasAno) {
  return b.servicos * (p.aliquotaIss / 100) * regras.icmsIssFator
}

function ipiSaidas(b: BaseMensal, p: Parametros, regras: RegrasAno) {
  if (!regras.ipi || !p.aliquotaIpi) return { debito: 0, devido: 0 }
  const debito = (b.vendas - b.devolucoesVenda) * (p.aliquotaIpi / 100)
  return { debito, devido: Math.max(0, debito - b.ipiCompras) }
}

interface ApuracaoMensalRegular {
  b: BaseMensal
  regras: RegrasAno
  t: Tributos
  dre: DreDados
  icms: IcmsResumo
  cred: CreditosResumo
  memoria: LinhaMemoria[]
  creditos: number
  saldoCredor: number
  creditoTransferido: number
}

function tributosIndiretos(b: BaseMensal, ctx: Contexto, real: boolean): ApuracaoMensalRegular {
  const { params: p, mix } = ctx
  const fr = fracoesDoMes(b, p, mix)
  const regras = regrasPara(b, ctx)
  const t = TRIBUTOS_ZERO()
  const memoria: LinhaMemoria[] = []
  const cpp = cppFolha(p, 1)
  const d = dreBase(b, p, cpp)
  const cred = CREDITOS_ZERO()
  const icms = icmsRegular(b, p, regras)
  const iss = issProprio(b, p, regras)
  const ipi = ipiSaidas(b, p, regras)
  t.ICMS = icms.devido
  t.ISS = iss
  t.IPI = ipi.devido
  t.CPP = cpp
  d.deducoes['ICMS próprio'] = icms.proprio
  if (icms.difal) d.deducoes['DIFAL'] = icms.difal
  if (iss) d.deducoes['ISS'] = iss
  if (ipi.debito) d.deducoes['IPI'] = ipi.debito
  d.creditosCompras += icms.creditoCompras + Math.min(b.ipiCompras, ipi.debito)
  // crédito de ICMS sobre devoluções de venda reduz a própria dedução
  d.deducoes['ICMS próprio'] -= icms.credito - icms.creditoCompras
  d.icmsEntradas = icms.st
  cred.icms = icms.creditoCompras
  memoria.push(
    {
      grupo: 'ICMS',
      descricao: p.cenarioIcms.ativo ? `Débito nas vendas — cenário ${p.cenarioIcms.descricao || p.cenarioIcms.uf}` : 'Débito nas vendas (internas e interestaduais)',
      valor: icms.proprio,
      formula: `alíquota média ${pct(icms.aliqMedia)}`,
    },
    { grupo: 'ICMS', descricao: 'DIFAL — vendas interestaduais a não contribuintes', valor: icms.difal, formula: 'EC 87/2015; LC 190/2022' },
    { grupo: 'ICMS', descricao: 'Crédito (compras e devoluções de venda)', valor: -icms.credito, formula: 'LC 87/1996, art. 20' },
    { grupo: 'ICMS', descricao: 'ICMS-ST nas entradas sem retenção (custo)', valor: icms.st },
    { grupo: 'ICMS', descricao: 'ICMS a recolher', valor: icms.devido, destaque: true },
  )
  // vendas sem PIS/COFINS no regime regular: monofásicas (revenda) e com alíquota zero, isenção ou suspensão
  const semPisCofins = Math.min(1, fr.monofasico + fr.pisCofinsZero)
  if (regras.pisCofins) {
    // ICMS "a ser excluído" é o destacado na nota (STF, Tema 69 — RE 574.706)
    // Lucro Real é não cumulativo, salvo receitas do art. 10 da Lei 10.833/2003 (opção nos parâmetros)
    if (real && !p.realPisCofinsCumulativo) {
      const pc = pisCofinsNaoCumulativo(b, p, semPisCofins, icms.proprio)
      t.PIS = pc.pis + (p.receitasFinanceirasMensais * 0.0065)
      t.COFINS = pc.cofins + p.receitasFinanceirasMensais * 0.04
      d.deducoes['PIS'] = (pc.debito * 1.65) / 9.25
      d.deducoes['COFINS'] = (pc.debito * 7.6) / 9.25
      d.tributosFinanceiros = pc.fin
      d.creditosCompras += pc.credCompras
      d.creditosDespesas += pc.credDespesas
      cred.pisCofinsCompras = pc.credCompras
      cred.pisCofinsDespesas = pc.credDespesas
      memoria.push(
        { grupo: 'PIS/COFINS', descricao: 'Base de débito (receita − ICMS − monofásicos)', valor: pc.base, formula: 'Leis 10.637/2002 e 10.833/2003' },
        { grupo: 'PIS/COFINS', descricao: 'Base de crédito (compras, energia, fretes, armazenagem)', valor: pc.baseCredito },
        { grupo: 'PIS/COFINS', descricao: 'Créditos (9,25%)', valor: -pc.creditos },
        { grupo: 'PIS/COFINS', descricao: 'PIS + COFINS a recolher', valor: t.PIS + t.COFINS, destaque: true },
      )
    } else {
      const pc = pisCofinsCumulativo(b, p, semPisCofins, icms.proprio)
      t.PIS = pc.pis
      t.COFINS = pc.cofins
      d.deducoes['PIS'] = pc.pis
      d.deducoes['COFINS'] = pc.cofins
      memoria.push(
        {
          grupo: 'PIS/COFINS',
          descricao: real ? 'Base cumulativa no Lucro Real (receita − ICMS − monofásicos)' : 'Base (receita − ICMS − monofásicos)',
          valor: pc.base,
          formula: real ? 'Lei 10.833/2003, art. 10 — 0,65% + 3%' : 'Lei 9.718/1998 — 0,65% + 3%',
        },
        { grupo: 'PIS/COFINS', descricao: 'PIS + COFINS a recolher', valor: pc.pis + pc.cofins, destaque: true },
      )
    }
  }
  const ibsCbs = ibsCbsRegular(b, ctx, regras, icms.proprio, t.ISS)
  t.CBS = ibsCbs.cbs
  t.IBS = ibsCbs.ibs
  aplicarIbsCbsNaDre(d, ibsCbs, regras, p)
  cred.ibsCbsFornecedorRegular = ibsCbs.credCompras
  cred.ibsCbsFornecedorSimples = ibsCbs.credSimples
  cred.ibsCbsDespesas = ibsCbs.credOutras
  cred.ibsCbsPerdidoSimples = ibsCbs.perdidoSimples
  memoria.push(...ibsCbs.memoria)
  const icmsResumo: IcmsResumo = { proprio: icms.proprio, difal: icms.difal, credito: icms.credito, st: icms.st, antecipacao: 0, noDas: 0 }
  return {
    b,
    regras,
    t,
    dre: d,
    icms: icmsResumo,
    cred,
    memoria,
    creditos: ibsCbs.creditos,
    saldoCredor: ibsCbs.saldoCredor,
    creditoTransferido: ibsCbs.debito * fr.b2b,
  }
}

// ---------------------------------------------------------------------------
// Lucro Presumido
// ---------------------------------------------------------------------------

function apurarPresumido(bases: BaseMensal[], ctx: Contexto): Resultado {
  const p = ctx.params
  const meses = bases.map((b) => tributosIndiretos(b, ctx, false))
  const memoria: LinhaMemoria[] = []
  const alertas: string[] = []

  // IRPJ/CSLL trimestrais (Lei 9.430/1996, art. 1º); presunção pela Lei 9.249/1995, arts. 15 e 20; LC 224/2025
  const trimestres = new Map<string, ApuracaoMensalRegular[]>()
  for (const m of meses) {
    const [a, mm] = m.b.competencia.split('-').map(Number)
    const chave = `${a}-T${Math.ceil(mm / 3)}`
    trimestres.set(chave, [...(trimestres.get(chave) ?? []), m])
  }
  const acumuladoAno = new Map<number, number>()
  let lc224 = false
  for (const [chave, ms] of trimestres) {
    const a = Number(chave.slice(0, 4))
    const merc = ms.reduce((s, m) => s + Math.max(0, m.b.vendas - m.b.devolucoesVenda) + m.b.exportacao, 0)
    const serv = ms.reduce((s, m) => s + m.b.servicos, 0)
    const receita = merc + serv
    const antes = acumuladoAno.get(a) ?? 0
    const depois = antes + receita
    acumuladoAno.set(a, depois)
    const excedente = Math.max(0, depois - Math.max(LC224_LIMITE_ANUAL, antes))
    const pesoMerc = receita ? merc / receita : 1
    const presIrpj = (pesoMerc * p.presuncaoIrpj + (1 - pesoMerc) * p.presuncaoIrpjServicos) / 100
    const presCsll = (pesoMerc * p.presuncaoCsll + (1 - pesoMerc) * p.presuncaoCsllServicos) / 100
    const fin = p.receitasFinanceirasMensais * ms.length
    const baseIrpj = merc * (p.presuncaoIrpj / 100) + serv * (p.presuncaoIrpjServicos / 100) + excedente * presIrpj * LC224_ACRESCIMO + fin
    const baseCsll = merc * (p.presuncaoCsll / 100) + serv * (p.presuncaoCsllServicos / 100) + excedente * presCsll * LC224_ACRESCIMO + fin
    if (excedente > 0) lc224 = true
    const irpj = baseIrpj * 0.15 + Math.max(0, baseIrpj - 20_000 * ms.length) * 0.1
    const csll = baseCsll * 0.09
    for (const m of ms) {
      const peso = receita ? receitaBruta(m.b) / receita : 1 / ms.length
      m.t.IRPJ = irpj * peso
      m.t.CSLL = csll * peso
      m.dre.irpj = irpj * peso
      m.dre.csll = csll * peso
    }
    memoria.push(
      { grupo: `IRPJ/CSLL ${chave}`, descricao: 'Receita bruta do trimestre', valor: receita },
      { grupo: `IRPJ/CSLL ${chave}`, descricao: `Base IRPJ (${pct(presIrpj)} de presunção${excedente ? ' + LC 224' : ''})`, valor: baseIrpj },
      { grupo: `IRPJ/CSLL ${chave}`, descricao: 'IRPJ (15% + adicional 10% acima de R$ 20 mil/mês)', valor: irpj, destaque: true },
      { grupo: `IRPJ/CSLL ${chave}`, descricao: `Base CSLL (${pct(presCsll)} de presunção)`, valor: baseCsll },
      { grupo: `IRPJ/CSLL ${chave}`, descricao: 'CSLL (9%)', valor: csll, destaque: true },
    )
  }
  if (lc224) alertas.push('Receita anual acima de R$ 5 milhões: presunção acrescida de 10% sobre o excedente (LC 224/2025).')
  return fecharRegular('presumido', bases, meses, memoria, alertas, ctx)
}

// ---------------------------------------------------------------------------
// Lucro Real
// ---------------------------------------------------------------------------

function apurarReal(bases: BaseMensal[], ctx: Contexto): Resultado {
  const p = ctx.params
  const meses = bases.map((b) => tributosIndiretos(b, ctx, true))
  const memoria: LinhaMemoria[] = []
  const alertas: string[] = []

  // Lucro real anual estimado pela DRE (RIR/2018, arts. 258 e seguintes): mesma base contábil do relatório de DRE
  const dre = DRE_VAZIA()
  for (const m of meses) somarDre(dre, m.dre)
  const n = bases.length
  const lucro = lucroAntesIr(dre)
  const irpj = Math.max(0, lucro) * 0.15 + Math.max(0, lucro - 20_000 * n) * 0.1
  const csll = Math.max(0, lucro) * 0.09
  if (lucro < 0) alertas.push('Lucro real estimado negativo (prejuízo fiscal): sem IRPJ/CSLL no período. O prejuízo pode compensar até 30% do lucro futuro (Lei 9.065/1995, art. 15).')
  if (p.cmvPercentual === null)
    alertas.push('CMV estimado pelas compras líquidas do período (estoque constante). Informe o CMV em % da receita nos parâmetros se houver variação relevante de estoque.')
  const receitas = meses.map((m) => Math.max(0, receitaBruta(m.b)))
  const somaReceitas = receitas.reduce((a, v) => a + v, 0)
  meses.forEach((m, i) => {
    const peso = somaReceitas ? receitas[i] / somaReceitas : 1 / n
    m.t.IRPJ = irpj * peso
    m.t.CSLL = csll * peso
    m.dre.irpj = irpj * peso
    m.dre.csll = csll * peso
  })
  memoria.push(
    { grupo: 'Lucro Real', descricao: 'Lucro antes do IRPJ/CSLL (ver DRE)', valor: lucro, destaque: true, formula: 'receita − deduções − CMV líquido − despesas + financeiras' },
    { grupo: 'Lucro Real', descricao: 'IRPJ (15% + adicional de 10% acima de R$ 20 mil/mês)', valor: irpj, destaque: true, formula: 'Lei 9.249/1995, art. 3º' },
    { grupo: 'Lucro Real', descricao: 'CSLL (9%)', valor: csll, destaque: true, formula: 'Lei 7.689/1988' },
  )
  return fecharRegular('real', bases, meses, memoria, alertas, ctx)
}

function fecharRegular(
  regime: RegimeId,
  bases: BaseMensal[],
  meses: ApuracaoMensalRegular[],
  memoriaIr: LinhaMemoria[],
  alertas: string[],
  ctx: Contexto,
): Resultado {
  const tot = TRIBUTOS_ZERO()
  const porMes: ResultadoMes[] = []
  const dre = DRE_VAZIA()
  const icms = ICMS_ZERO()
  const cred = CREDITOS_ZERO()
  let creditos = 0
  let saldoCredor = 0
  let creditoTransferido = 0
  const memoria: LinhaMemoria[] = []
  // Memória dos tributos indiretos consolidada (soma dos meses por descrição)
  const acumulado = new Map<string, LinhaMemoria>()
  for (const m of meses) {
    somaTributos(tot, m.t)
    somarDre(dre, m.dre)
    somar(icms, m.icms)
    somar(cred, m.cred)
    creditos += m.creditos
    saldoCredor += m.saldoCredor
    creditoTransferido += m.creditoTransferido
    porMes.push({ competencia: m.b.competencia, receita: receitaBruta(m.b), tributos: { ...m.t }, total: somaValores(m.t) })
    for (const l of m.memoria) {
      const k = `${l.grupo}|${l.descricao}`
      const atual = acumulado.get(k)
      if (atual) atual.valor += l.valor
      else acumulado.set(k, { ...l })
    }
  }
  memoria.push(...acumulado.values(), ...memoriaIr)
  memoria.push({ grupo: 'CPP', descricao: 'INSS patronal, RAT/FAP e terceiros sobre folha e pró-labore', valor: tot.CPP, formula: 'Lei 8.212/1991, art. 22' })
  const receita = porMes.reduce((a, m) => a + m.receita, 0)
  const total = somaValores(tot)
  const p = ctx.params
  if (!p.folhaMensal && !p.proLaboreMensal) alertas.push('Folha e pró-labore não informados: a CPP fora do Simples ficou zerada. Preencha nos parâmetros.')
  if (p.cenarioIcms.ativo) alertas.push(`Cenário de ICMS ativo: ${p.cenarioIcms.descricao || `saídas a partir de ${p.cenarioIcms.uf}`}.`)
  if (bases.some((b) => b.stSemMva > 0)) alertas.push('Há entradas de mercadorias com ST sem MVA informada — informe a MVA na aba Produtos (NCM).')
  return {
    regime,
    ano: ctx.anoRegras ?? ano(bases[0]?.competencia ?? '2026'),
    receita,
    tributos: tot,
    das: 0,
    total,
    carga: receita ? total / receita : 0,
    creditosIbsCbs: creditos,
    saldoCredor,
    creditoTransferido,
    porMes,
    dre,
    icms,
    creditos: cred,
    memoria,
    alertas,
    elegivel: true,
  }
}

// ---------------------------------------------------------------------------

export function apurar(regime: RegimeId, bases: BaseMensal[], ctx: Contexto): Resultado {
  switch (regime) {
    case 'simples':
      return apurarSimples(bases, ctx, false)
    case 'simples_hibrido':
      return apurarSimples(bases, ctx, true)
    case 'presumido':
      return apurarPresumido(bases, ctx)
    case 'real':
      return apurarReal(bases, ctx)
  }
}
