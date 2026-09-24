import { calcularRbt12, somarBases } from './base'
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
  TRIBUTOS_ZERO,
  receitaBruta,
  type BaseMensal,
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
}

const ano = (comp: string) => Number(comp.slice(0, 4))
const pct = (v: number, casas = 2) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`
const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function regrasPara(b: BaseMensal, ctx: Contexto): RegrasAno {
  return regrasDoAno(ctx.anoRegras ?? ano(b.competencia), ctx.params.cbsReferencia, ctx.params.ibsReferencia)
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
function dasDaReceita(
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

function apurarSimples(bases: BaseMensal[], ctx: Contexto, hibrido: boolean): Resultado {
  const { params, mix } = ctx
  const tot = TRIBUTOS_ZERO()
  const porMes: ResultadoMes[] = []
  const memoria: LinhaMemoria[] = []
  const alertas = new Set<string>()
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
    const seg = { monofasico: mix.monofasico, st: params.percentualSt / 100, exportacao: false }
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

    // Tributos fora do DAS
    if (params.anexo === 'IV' || params.anexoServicos === 'IV') tMes.CPP += cppFolha(params, 1, params.anexoServicos === 'IV' && params.anexo !== 'IV' ? serv / (rb || 1) : 1)
    if (foraSublimite) {
      const icms = icmsRegular(b, params, regras)
      tMes.ICMS += icms.devido
    }
    let ibsCbs: ReturnType<typeof ibsCbsRegular> | null = null
    if (hib) {
      ibsCbs = ibsCbsRegular(b, ctx, regras, tMes.ICMS, tMes.ISS)
      tMes.CBS += ibsCbs.cbs
      tMes.IBS += ibsCbs.ibs
      creditos += ibsCbs.creditos
      saldoCredor += ibsCbs.saldoCredor
      creditoTransferido += ibsCbs.debito * (params.percentualB2B / 100)
    } else {
      creditoTransferido += cbsIbsDas * (params.percentualB2B / 100)
    }

    const totalMes = Object.values(tMes).reduce((a, v) => a + v, 0)
    somaTributos(tot, tMes)
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
      const f = faixaSimples(params.anexo, r.rbt12)
      memoria.push(
        { grupo: b.competencia, descricao: 'Receita bruta do mês', valor: rb, destaque: true },
        { grupo: b.competencia, descricao: `RBT12${r.proporcional ? ' (proporcionalizado)' : ''}`, valor: r.rbt12 },
        {
          grupo: b.competencia,
          descricao: `Anexo ${params.anexo} — faixa ${f.faixa}: nominal ${pct(f.nominal)}, dedução ${moeda(f.deduzir)}`,
          valor: f.efetiva * 100,
          formula: `Alíquota efetiva = (RBT12 × ${pct(f.nominal)} − ${moeda(f.deduzir)}) ÷ RBT12 = ${pct(f.efetiva, 4)}`,
        },
        { grupo: b.competencia, descricao: hib ? 'DAS (sem CBS/IBS)' : 'DAS', valor: dasMes, destaque: true },
      )
      if (hib && ibsCbs) memoria.push(...ibsCbs.memoria.map((m) => ({ ...m, grupo: b.competencia })))
    }
    if (mix.monofasico > 0 && regras.pisCofins) alertas.add(`${pct(mix.monofasico, 1)} das vendas estimadas como monofásicas: PIS/COFINS excluídos do DAS (LC 123, art. 18, §4º-A, I).`)
    if (mix.monofasico > 0 && !regras.pisCofins)
      alertas.add('A partir de 2027 o PIS/COFINS monofásico deixa de existir: a parcela de CBS do DAS incide sobre toda a receita (produtos antes monofásicos passam a pagar CBS).')
  }

  const total = Object.values(tot).reduce((a, v) => a + v, 0)
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
    memoria,
    alertas: [...alertas],
    elegivel,
    motivo,
  }
}

// ---------------------------------------------------------------------------
// Tributos do regime regular
// ---------------------------------------------------------------------------

/** Contribuição previdenciária patronal sobre folha e pró-labore (Lei 8.212/1991, art. 22). */
export function cppFolha(p: Parametros, meses: number, fator = 1) {
  return (p.folhaMensal * (0.2 + p.ratFap / 100 + p.terceiros / 100) + p.proLaboreMensal * 0.2) * meses * fator
}

/** ICMS pelo regime de débito e crédito (LC 87/1996), com DIFAL (EC 87/2015). */
export function icmsRegular(b: BaseMensal, p: Parametros, regras: RegrasAno) {
  const st = p.percentualSt / 100
  const debInternas = b.icmsVendasInternas * (1 - st)
  const inter = b.vendasInterestaduais
  const naoContrib = Math.max(b.vendasNaoContribuinte, (inter * p.percentualNaoContribuinte) / 100)
  const debInter = inter * (p.aliquotaIcmsInterestadual / 100)
  const difal = naoContrib * Math.max(0, (p.aliquotaInternaDestino - p.aliquotaIcmsInterestadual) / 100)
  const debitoBruto = debInternas + debInter + difal
  const aliqMedia = b.vendas ? debitoBruto / b.vendas : 0
  const creditoDevolucao = b.devolucoesVenda * aliqMedia
  const credito = Math.max(0, b.icmsCompras - b.icmsDevolucoesCompra) + creditoDevolucao
  const fator = regras.icmsIssFator
  const devido = Math.max(0, debitoBruto - credito) * fator
  return { debito: debitoBruto * fator, credito: credito * fator, devido, difal: difal * fator, aliqMedia }
}

/** Crédito presumido de IBS/CBS nas compras de fornecedores do Simples: valor de CBS/IBS embutido no DAS deles (LC 214, art. 47, §9º). */
function aliquotaCreditoFornecedorSimples(p: Parametros, regras: RegrasAno) {
  const f = ANEXOS_SIMPLES.I.faixas[2].partilha
  const share = (f.PIS ?? 0) + (f.COFINS ?? 0) + (f.ICMS ?? 0) * (1 - regras.icmsIssFator)
  return (p.aliquotaFornecedoresSimples / 100) * share
}

/** IBS/CBS pelo regime regular — débito sobre as vendas, crédito sobre as aquisições (LC 214, arts. 12, 28 e 47). */
export function ibsCbsRegular(b: BaseMensal, ctx: Contexto, regras: RegrasAno, icmsOperacao: number, issOperacao: number) {
  const { params: p, mix } = ctx
  const memoria: LinhaMemoria[] = []
  const vazio = { cbs: 0, ibs: 0, debito: 0, creditos: 0, saldoCredor: 0, memoria }
  if (regras.pisCofins) {
    if (regras.teste)
      memoria.push({ grupo: 'IBS/CBS', descricao: 'Ano-teste 2026: CBS 0,9% e IBS 0,1% destacados, compensáveis/dispensados', valor: 0, formula: 'LC 214, arts. 343, 346 e 348' })
    return vazio
  }
  const aliq = regras.cbs + regras.ibs
  const reducao = 1 - mix.reducaoIbsCbs
  // Base: valor da operação sem ICMS/ISS/IPI/PIS/COFINS (LC 214, art. 12, §2º); exportação imune (art. 79)
  const base = Math.max(0, b.vendas - b.devolucoesVenda + b.servicos - icmsOperacao - issOperacao)
  const debito = base * aliq * reducao

  const comprasLiquidas = Math.max(0, b.compras - b.devolucoesCompra)
  const fatorSimples = b.compras ? b.comprasFornecedorSimples / b.compras : 0
  const comprasRegular = Math.max(0, comprasLiquidas * (1 - fatorSimples) - (b.icmsCompras + b.ipiCompras + b.stCompras) * (1 - fatorSimples))
  const credCompras = comprasRegular * aliq * reducao
  const credSimples = comprasLiquidas * fatorSimples * aliquotaCreditoFornecedorSimples(p, regras)
  const outras = b.servicosTomados + b.energia + b.fretes + b.comunicacao + b.usoConsumo + b.ativo + p.despesasCreditaveisMensais
  const credOutras = outras * aliq
  const creditos = credCompras + credSimples + credOutras
  const liquido = debito - creditos
  const cbsShare = aliq ? regras.cbs / aliq : 0

  memoria.push(
    { grupo: 'IBS/CBS', descricao: 'Base de cálculo (vendas líquidas − ICMS/ISS)', valor: base, formula: 'LC 214, art. 12, §2º' },
    {
      grupo: 'IBS/CBS',
      descricao: `Débito (CBS ${pct(regras.cbs)} + IBS ${pct(regras.ibs, 3)}${mix.reducaoIbsCbs ? `, redução média ${pct(mix.reducaoIbsCbs, 1)}` : ''})`,
      valor: debito,
    },
    { grupo: 'IBS/CBS', descricao: 'Crédito — compras de fornecedores do regime regular', valor: -credCompras },
    { grupo: 'IBS/CBS', descricao: 'Crédito — compras de fornecedores do Simples (valor do DAS)', valor: -credSimples },
    { grupo: 'IBS/CBS', descricao: 'Crédito — serviços, fretes, energia, uso/consumo, ativo e despesas', valor: -credOutras },
    { grupo: 'IBS/CBS', descricao: liquido >= 0 ? 'IBS/CBS a recolher' : 'Saldo credor de IBS/CBS (ressarcimento)', valor: liquido, destaque: true },
  )
  const devido = Math.max(0, liquido)
  return {
    cbs: devido * cbsShare,
    ibs: devido * (1 - cbsShare),
    debito,
    creditos: Math.min(creditos, debito),
    saldoCredor: Math.max(0, -liquido),
    memoria,
  }
}

function pisCofinsCumulativo(b: BaseMensal, p: Parametros, mix: MixProdutos, icmsDebito: number) {
  const merc = Math.max(0, b.vendas - b.devolucoesVenda)
  const exclusaoIcms = p.excluirIcmsBasePisCofins ? icmsDebito : 0
  const base = Math.max(0, merc * (1 - mix.monofasico) + b.servicos - exclusaoIcms * (1 - mix.monofasico))
  return { base, pis: base * 0.0065, cofins: base * 0.03 }
}

function pisCofinsNaoCumulativo(b: BaseMensal, p: Parametros, mix: MixProdutos, icmsDebito: number) {
  const merc = Math.max(0, b.vendas - b.devolucoesVenda)
  const exclusaoIcms = p.excluirIcmsBasePisCofins ? icmsDebito : 0
  const base = Math.max(0, merc * (1 - mix.monofasico) + b.servicos - exclusaoIcms * (1 - mix.monofasico))
  // Crédito: bens para revenda (exceto monofásicos, Lei 10.833, art. 3º, I, "b"), sem o ICMS destacado (Lei 14.592/2023),
  // energia, fretes e armazenagem na venda (art. 3º, III e IX) e despesas creditáveis (aluguéis PJ etc.).
  const comprasNaoMono = Math.max(0, b.compras - b.comprasMonofasico - b.devolucoesCompra)
  const icmsProp = b.compras ? b.icmsCompras * (comprasNaoMono / b.compras) : 0
  const baseCredito = Math.max(0, comprasNaoMono - icmsProp) + b.energia + b.fretes + b.servicosTomadosCreditaveis + p.despesasCreditaveisMensais
  const debPis = base * 0.0165
  const debCofins = base * 0.076
  const credPis = baseCredito * 0.0165
  const credCofins = baseCredito * 0.076
  // Receitas financeiras: 0,65% e 4% (Decreto 8.426/2015)
  const finPis = p.receitasFinanceirasMensais * 0.0065
  const finCofins = p.receitasFinanceirasMensais * 0.04
  return {
    base,
    baseCredito,
    pis: Math.max(0, debPis - credPis) + finPis,
    cofins: Math.max(0, debCofins - credCofins) + finCofins,
    creditos: credPis + credCofins,
  }
}

function issProprio(b: BaseMensal, p: Parametros, regras: RegrasAno) {
  return b.servicos * (p.aliquotaIss / 100) * regras.icmsIssFator
}

function ipiSaidas(b: BaseMensal, p: Parametros, regras: RegrasAno) {
  if (!regras.ipi || !p.aliquotaIpi) return 0
  return Math.max(0, (b.vendas - b.devolucoesVenda) * (p.aliquotaIpi / 100) - b.ipiCompras)
}

interface ApuracaoMensalRegular {
  b: BaseMensal
  regras: RegrasAno
  t: Tributos
  memoria: LinhaMemoria[]
  creditos: number
  saldoCredor: number
  debitoIbsCbs: number
}

function tributosIndiretos(b: BaseMensal, ctx: Contexto, real: boolean): ApuracaoMensalRegular {
  const { params: p, mix } = ctx
  const regras = regrasPara(b, ctx)
  const t = TRIBUTOS_ZERO()
  const memoria: LinhaMemoria[] = []
  const icms = icmsRegular(b, p, regras)
  t.ICMS = icms.devido
  t.ISS = issProprio(b, p, regras)
  t.IPI = ipiSaidas(b, p, regras)
  memoria.push(
    { grupo: 'ICMS', descricao: 'Débito (vendas internas, interestaduais e DIFAL)', valor: icms.debito, formula: `alíquota média ${pct(icms.aliqMedia)}` },
    { grupo: 'ICMS', descricao: 'Crédito (compras e devoluções de venda)', valor: -icms.credito },
    { grupo: 'ICMS', descricao: 'ICMS a recolher', valor: icms.devido, destaque: true },
  )
  if (regras.pisCofins) {
    // ICMS "a ser excluído" é o destacado na nota (STF, Tema 69 — RE 574.706)
    const icmsDestacado = icms.debito
    if (real) {
      const pc = pisCofinsNaoCumulativo(b, p, mix, icmsDestacado)
      t.PIS = pc.pis
      t.COFINS = pc.cofins
      memoria.push(
        { grupo: 'PIS/COFINS', descricao: 'Base de débito (receita − ICMS − monofásicos)', valor: pc.base, formula: 'Leis 10.637/2002 e 10.833/2003' },
        { grupo: 'PIS/COFINS', descricao: 'Base de crédito (compras, energia, fretes, armazenagem)', valor: pc.baseCredito },
        { grupo: 'PIS/COFINS', descricao: 'Créditos (9,25%)', valor: -pc.creditos },
        { grupo: 'PIS/COFINS', descricao: 'PIS + COFINS a recolher', valor: pc.pis + pc.cofins, destaque: true },
      )
    } else {
      const pc = pisCofinsCumulativo(b, p, mix, icmsDestacado)
      t.PIS = pc.pis
      t.COFINS = pc.cofins
      memoria.push(
        { grupo: 'PIS/COFINS', descricao: 'Base (receita − ICMS − monofásicos)', valor: pc.base, formula: 'Lei 9.718/1998 — 0,65% + 3%' },
        { grupo: 'PIS/COFINS', descricao: 'PIS + COFINS a recolher', valor: pc.pis + pc.cofins, destaque: true },
      )
    }
  }
  const ibsCbs = ibsCbsRegular(b, ctx, regras, icms.debito, t.ISS)
  t.CBS = ibsCbs.cbs
  t.IBS = ibsCbs.ibs
  memoria.push(...ibsCbs.memoria)
  return { b, regras, t, memoria, creditos: ibsCbs.creditos, saldoCredor: ibsCbs.saldoCredor, debitoIbsCbs: ibsCbs.debito }
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
  for (const m of meses) m.t.CPP = cppFolha(p, 1)
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
  for (const m of meses) m.t.CPP = cppFolha(p, 1)

  // Lucro real anual estimado: receita − tributos sobre vendas (líquidos de créditos) − CMV − despesas (RIR/2018, arts. 258 e seguintes)
  const s = somarBases(bases)
  const n = bases.length
  const receita = receitaBruta(s)
  const tributosVendas = meses.reduce((a, m) => a + m.t.ICMS + m.t.PIS + m.t.COFINS + m.t.ISS + m.t.IPI, 0)
  const cmv = p.cmvPercentual !== null ? (receita * p.cmvPercentual) / 100 : Math.max(0, s.compras - s.devolucoesCompra)
  const cpp = meses.reduce((a, m) => a + m.t.CPP, 0)
  const folha = (p.folhaMensal * 1.08 + p.proLaboreMensal) * n // folha + FGTS (8%) + pró-labore
  const despesas = s.servicosTomados + s.usoConsumo + s.energia + s.fretes + s.comunicacao + p.despesasMensais * n + folha + cpp
  const lucro = receita + p.receitasFinanceirasMensais * n - tributosVendas - cmv - despesas
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
  })
  memoria.push(
    { grupo: 'Lucro Real', descricao: 'Receita bruta', valor: receita },
    { grupo: 'Lucro Real', descricao: '(−) Tributos sobre vendas (ICMS, PIS, COFINS, ISS, IPI líquidos)', valor: -tributosVendas },
    { grupo: 'Lucro Real', descricao: p.cmvPercentual !== null ? `(−) CMV (${p.cmvPercentual}% da receita)` : '(−) CMV (compras líquidas)', valor: -cmv },
    { grupo: 'Lucro Real', descricao: '(−) Despesas (serviços, folha, encargos, fretes, energia, outras)', valor: -despesas },
    { grupo: 'Lucro Real', descricao: '(+) Receitas financeiras', valor: p.receitasFinanceirasMensais * n },
    { grupo: 'Lucro Real', descricao: 'Lucro real estimado', valor: lucro, destaque: true },
    { grupo: 'Lucro Real', descricao: 'IRPJ (15% + adicional de 10% acima de R$ 20 mil/mês)', valor: irpj, destaque: true },
    { grupo: 'Lucro Real', descricao: 'CSLL (9%)', valor: csll, destaque: true },
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
  let creditos = 0
  let saldoCredor = 0
  let debitoIbsCbs = 0
  const memoria: LinhaMemoria[] = []
  // Memória dos tributos indiretos consolidada (soma dos meses por descrição)
  const acumulado = new Map<string, LinhaMemoria>()
  for (const m of meses) {
    somaTributos(tot, m.t)
    creditos += m.creditos
    saldoCredor += m.saldoCredor
    debitoIbsCbs += m.debitoIbsCbs
    const total = Object.values(m.t).reduce((a, v) => a + v, 0)
    porMes.push({ competencia: m.b.competencia, receita: receitaBruta(m.b), tributos: { ...m.t }, total })
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
  const total = Object.values(tot).reduce((a, v) => a + v, 0)
  const p = ctx.params
  if (!p.folhaMensal && !p.proLaboreMensal) alertas.push('Folha e pró-labore não informados: a CPP fora do Simples ficou zerada. Preencha nos parâmetros.')
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
    creditoTransferido: debitoIbsCbs * (p.percentualB2B / 100),
    porMes,
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
