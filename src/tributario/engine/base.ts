import { classificarCfop, destinoCfop, fornecedorDoSimples, type Natureza } from './cfop'
import { icmsDaEntrada, icmsDaVenda, naoContribuinte } from './icms'
import { tratamentoNcm } from './ncm'
import { ICMS_INTERNO_UF } from './tabelas'
import { BASE_VAZIA, receitaBruta, type BaseMensal, type MixProdutos, type MovimentoLinha, type Parametros, type RegimeFornecedor } from './tipos'

export function naturezaDe(l: MovimentoLinha, ajustes: Record<string, Natureza>): Natureza {
  if (l.tipo === 'servico_tomado') return ajustes[`SERV-T:${l.servico}`] ?? 'servico_tomado'
  if (l.tipo === 'servico_prestado') return ajustes[`SERV-P:${l.servico}`] ?? 'venda_servico'
  return ajustes[l.cfop] ?? classificarCfop(l.cfop)
}

const prefixosServico = (lista: string) =>
  lista
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)

const servicoCreditavel = (codigo: string, prefixos: string[]) => {
  const c = codigo.replace(/[^\d.]/g, '')
  return prefixos.some((p) => c === p || c.startsWith(p + '.'))
}

/** Chave usada para incluir/excluir um CFOP ou código de serviço da análise. */
export const chaveCfop = (l: MovimentoLinha) =>
  l.tipo === 'servico_tomado' ? `SERV-T:${l.servico}` : l.tipo === 'servico_prestado' ? `SERV-P:${l.servico}` : l.cfop

/**
 * Regime do fornecedor/prestador da nota: o informado pelo contador (Clientes e fornecedores) ou, na falta,
 * pessoa física pelo CPF, Simples pelo CSOSN da nota de entrada (101 a 900) e "regime normal" nos demais casos.
 */
export function regimeDoFornecedor(l: MovimentoLinha, params: Parametros): RegimeFornecedor {
  const informado = l.parceiro ? params.regimeFornecedores[l.parceiro] : undefined
  if (informado) return informado
  if (l.destinatario === 'PF') return 'pf'
  if (l.tipo === 'entrada' && fornecedorDoSimples(l.cst)) return 'simples'
  return 'normal'
}

/** A linha entra na análise? (CFOP e cliente/fornecedor não excluídos pelo contador) */
export function linhaConsiderada(l: MovimentoLinha, params: Parametros) {
  if (params.cfopsExcluidos.length && params.cfopsExcluidos.includes(chaveCfop(l))) return false
  if (params.parceirosExcluidos.length) {
    if (l.parceiro && params.parceirosExcluidos.includes(l.parceiro)) return false
    if (l.destinatario === 'PF' && params.parceirosExcluidos.includes('PF')) return false
  }
  return true
}

/** UF e alíquota interna de ICMS (%) do estabelecimento que emitiu a nota. */
export type DadosEstab = (estabelecimentoId: string | null) => { uf: string; aliquota: number }

/** Consolida as linhas de movimento em bases mensais. */
export function montarBases(linhas: MovimentoLinha[], params: Parametros, estab: DadosEstab): BaseMensal[] {
  const meses = new Map<string, BaseMensal>()
  const prefixos = prefixosServico(params.servicosCreditaveisPisCofins)

  const cen = params.cenarioIcms
  for (const l of linhas) {
    if (!linhaConsiderada(l, params)) continue
    const b = meses.get(l.competencia) ?? BASE_VAZIA(l.competencia)
    meses.set(l.competencia, b)
    const v = l.valor_contabil
    const n = naturezaDe(l, params.cfopNatureza)

    switch (n) {
      case 'venda': {
        b.vendas += v
        b.icmsSaidas += l.icms
        const e = estab(l.estabelecimento_id)
        const icms = icmsDaVenda(l, params, { uf: e.uf, aliquotaInterna: e.aliquota }, 'cfop')
        if (destinoCfop(l.cfop) === 'interestadual') {
          b.vendasInterestaduais += v
          if (icms) {
            // alíquota nota a nota: origem da mercadoria + UF de origem e destino; DIFAL para não contribuinte (EC 87/2015)
            b.vendasInterCalc += v
            b.icmsInterCalc += icms.proprio
            b.difalCalc += icms.difal
          } else if (naoContribuinte(l)) b.vendasNaoContribuinte += v
        } else {
          b.vendasInternas += v
          b.icmsVendasInternas += icms?.proprio ?? 0
        }
        if (cen.ativo) {
          const c = icmsDaVenda(
            l,
            params,
            { uf: cen.uf, aliquotaInterna: ICMS_INTERNO_UF[cen.uf] ?? 18, cargaInterna: cen.aliquotaInterna, cargaInterestadual: cen.cargaInterestadual },
            'destino',
          )
          if (c) {
            b.cenVendasCalc += v
            b.cenIcms += c.proprio
            b.cenDifal += c.difal
          }
        }
        if (l.ncm) {
          const t = tratamentoNcm(l.ncm, params.ncms)
          b.vendasComNcm += v
          if (t.monofasico) b.vendasMonofasico += v
          if (t.st) b.vendasSt += v
          b.vendasReducao += v * t.reducao
        }
        if (l.destinatario) {
          b.vendasComDestinatario += v
          if (l.destinatario === 'PJ_C') b.vendasB2B += v
          if (l.destinatario === 'PF') b.vendasPF += v
        }
        break
      }
      case 'venda_servico':
        b.servicos += v
        break
      case 'exportacao':
        b.exportacao += v
        break
      case 'devolucao_venda':
        b.devolucoesVenda += v
        break
      case 'outras_receitas':
        b.outrasReceitas += v
        break
      case 'compra_revenda':
      case 'compra_insumo':
        b.compras += v
        b.icmsCompras += l.icms
        b.ipiCompras += l.ipi
        b.stCompras += l.icms_st
        {
          const rf = regimeDoFornecedor(l, params)
          if (rf === 'simples') b.comprasFornecedorSimples += v
          else if (rf === 'mei') b.comprasMei += v
          else if (rf === 'pf') b.comprasPF += v
          else if (rf === 'presumido') b.comprasPresumido += v
        }
        if (l.ncm && tratamentoNcm(l.ncm, params.ncms).monofasico) b.comprasMonofasico += v
        {
          const e = estab(l.estabelecimento_id)
          const ent = icmsDaEntrada(l, params, e.uf, e.aliquota)
          if (ent) {
            b.stEntradas += ent.st
            b.antecipacao += ent.antecipacao
            if (ent.semMva) b.stSemMva += v
          }
        }
        break
      case 'devolucao_compra':
        b.devolucoesCompra += v
        b.icmsDevolucoesCompra += l.icms
        break
      case 'uso_consumo':
        b.usoConsumo += v
        break
      case 'ativo':
        b.ativo += v
        break
      case 'energia':
        b.energia += v
        break
      case 'frete':
        b.fretes += v
        break
      case 'comunicacao':
        b.comunicacao += v
        break
      case 'servico_tomado':
        b.servicosTomados += v
        b.issTomados += l.iss
        b.retencoes += l.retencoes
        {
          const rf = regimeDoFornecedor(l, params)
          if (rf === 'simples') b.servicosSimples += v
          else if (rf === 'mei') b.servicosMei += v
          else if (rf === 'pf') b.servicosPF += v
          else if (rf === 'presumido') b.servicosPresumido += v
          // PIS/COFINS no Real: só serviços de PJ (Lei 10.833, art. 3º, §3º, I) e dos itens creditáveis
          if (rf !== 'pf' && servicoCreditavel(l.servico, prefixos)) b.servicosTomadosCreditaveis += v
        }
        break
      default:
        b.neutras += v
    }
  }
  return [...meses.values()].sort((a, b) => a.competencia.localeCompare(b.competencia))
}

/**
 * Perfil médio do período. Usa as vendas com NCM/destinatário (saídas detalhadas); sem elas, o NCM das entradas de mercadorias.
 * Os percentuais informados nos parâmetros têm prioridade.
 */
export function estimarMix(linhas: MovimentoLinha[], params: Parametros): MixProdutos {
  const pesos = { total: 0, mono: 0, st: 0, reducao: 0, comDest: 0, b2b: 0, compras: 0, simples: 0 }
  const excluidas: Natureza[] = ['uso_consumo', 'ativo', 'energia', 'frete', 'comunicacao', 'servico_tomado']
  const temSaidasComNcm = linhas.some((l) => l.tipo === 'saida' && l.ncm && naturezaDe(l, params.cfopNatureza) === 'venda')
  for (const l of linhas) {
    if (!linhaConsiderada(l, params)) continue
    const n = naturezaDe(l, params.cfopNatureza)
    if (l.tipo === 'entrada' && (n === 'compra_revenda' || n === 'compra_insumo')) {
      pesos.compras += l.valor_contabil
      if (regimeDoFornecedor(l, params) === 'simples') pesos.simples += l.valor_contabil
    }
    if (l.tipo === 'saida' && n === 'venda' && l.destinatario) {
      pesos.comDest += l.valor_contabil
      if (l.destinatario === 'PJ_C') pesos.b2b += l.valor_contabil
    }
    const conta = temSaidasComNcm ? l.tipo === 'saida' && n === 'venda' : l.tipo === 'entrada' && !excluidas.includes(n)
    if (!conta || !l.ncm) continue
    const t = tratamentoNcm(l.ncm, params.ncms)
    pesos.total += l.valor_contabil
    if (t.monofasico) pesos.mono += l.valor_contabil
    if (t.st) pesos.st += l.valor_contabil
    pesos.reducao += l.valor_contabil * t.reducao
  }
  const fr = (manual: number | null, parte: number, total: number) => (manual !== null ? manual / 100 : total ? parte / total : 0)
  return {
    monofasico: fr(params.percentualMonofasico, pesos.mono, pesos.total),
    st: fr(params.percentualSt, pesos.st, pesos.total),
    reducaoIbsCbs: fr(params.percentualReducaoIbsCbs, pesos.reducao, pesos.total),
    b2b: fr(params.percentualB2B, pesos.b2b, pesos.comDest),
    fornecedoresSimples: pesos.compras ? pesos.simples / pesos.compras : 0,
  }
}

/** Frações do mês: parâmetro manual > saídas do próprio mês com NCM/destinatário > perfil médio do período. */
export function fracoesDoMes(b: BaseMensal, params: Parametros, mix: MixProdutos) {
  const fr = (manual: number | null, parte: number, total: number, media: number) => (manual !== null ? manual / 100 : total > 0 ? parte / total : media)
  return {
    monofasico: fr(params.percentualMonofasico, b.vendasMonofasico, b.vendasComNcm, mix.monofasico),
    st: fr(params.percentualSt, b.vendasSt, b.vendasComNcm, mix.st),
    reducao: fr(params.percentualReducaoIbsCbs, b.vendasReducao, b.vendasComNcm, mix.reducaoIbsCbs),
    b2b: fr(params.percentualB2B, b.vendasB2B, b.vendasComDestinatario, mix.b2b),
  }
}

export function somarBases(bases: BaseMensal[], competencia = 'total'): BaseMensal {
  const s = BASE_VAZIA(competencia)
  for (const b of bases) {
    for (const k of Object.keys(s) as (keyof BaseMensal)[]) {
      if (k !== 'competencia') (s[k] as number) += b[k] as number
    }
  }
  return s
}

export function escalarBase(b: BaseMensal, fator: number, competencia = b.competencia): BaseMensal {
  const s = { ...b, competencia }
  for (const k of Object.keys(s) as (keyof BaseMensal)[]) {
    if (k !== 'competencia') (s[k] as number) = (b[k] as number) * fator
  }
  return s
}

// ---------------------------------------------------------------------------
// Competências
// ---------------------------------------------------------------------------

export function somarMeses(comp: string, n: number): string {
  const [a, m] = comp.split('-').map(Number)
  const t = a * 12 + (m - 1) + n
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`
}

export const nomeMes = (comp: string) => {
  const [a, m] = comp.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${nomes[Number(m) - 1]}/${a.slice(2)}`
}

/**
 * RBT12 do mês (LC 123, art. 18, §1º): receita bruta dos 12 meses anteriores ao do período de apuração.
 * Início de atividade (§2º): no 1º mês, receita do próprio mês × 12; nos demais, média dos meses anteriores × 12.
 */
export function calcularRbt12(
  comp: string,
  receitaDoMes: (c: string) => number | undefined,
  inicioAtividade: string,
): { rbt12: number; proporcional: boolean; meses: number } {
  const anteriores: number[] = []
  for (let i = 1; i <= 12; i++) {
    const c = somarMeses(comp, -i)
    if (inicioAtividade && c < inicioAtividade) break
    const r = receitaDoMes(c)
    if (r === undefined && !inicioAtividade) break
    anteriores.push(r ?? 0)
  }
  if (anteriores.length >= 12) return { rbt12: anteriores.reduce((a, b) => a + b, 0), proporcional: false, meses: 12 }
  if (anteriores.length === 0) return { rbt12: (receitaDoMes(comp) ?? 0) * 12, proporcional: true, meses: 0 }
  const media = anteriores.reduce((a, b) => a + b, 0) / anteriores.length
  return { rbt12: media * 12, proporcional: true, meses: anteriores.length }
}

export const receitaDaBase = receitaBruta
