import { classificarCfop, destinoCfop, fornecedorDoSimples, vendaNaoContribuinte, type Natureza } from './cfop'
import { ncmMonofasico, reducaoIbsCbs } from './ncm'
import { BASE_VAZIA, receitaBruta, type BaseMensal, type MixProdutos, type MovimentoLinha, type Parametros } from './tipos'

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

/**
 * Consolida as linhas de movimento em bases mensais.
 * @param aliquotaInterna alíquota interna de ICMS (%) do estabelecimento que emitiu a nota
 */
export function montarBases(
  linhas: MovimentoLinha[],
  params: Parametros,
  aliquotaInterna: (estabelecimentoId: string | null) => number,
): BaseMensal[] {
  const meses = new Map<string, BaseMensal>()
  const prefixos = prefixosServico(params.servicosCreditaveisPisCofins)

  for (const l of linhas) {
    const b = meses.get(l.competencia) ?? BASE_VAZIA(l.competencia)
    meses.set(l.competencia, b)
    const v = l.valor_contabil
    const n = naturezaDe(l, params.cfopNatureza)

    switch (n) {
      case 'venda': {
        b.vendas += v
        b.icmsSaidas += l.icms
        const destino = destinoCfop(l.cfop)
        if (destino === 'interestadual') {
          b.vendasInterestaduais += v
          if (vendaNaoContribuinte(l.cfop)) b.vendasNaoContribuinte += v
        } else {
          b.vendasInternas += v
          b.icmsVendasInternas += (v * aliquotaInterna(l.estabelecimento_id)) / 100
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
        if (fornecedorDoSimples(l.cst)) b.comprasFornecedorSimples += v
        if (ncmMonofasico(l.ncm)) b.comprasMonofasico += v
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
        if (servicoCreditavel(l.servico, prefixos)) b.servicosTomadosCreditaveis += v
        break
      default:
        b.neutras += v
    }
  }
  return [...meses.values()].sort((a, b) => a.competencia.localeCompare(b.competencia))
}

/** Estima o mix de produtos (monofásico, redução de IBS/CBS, fornecedores do Simples) pelas entradas de mercadorias. */
export function estimarMix(linhas: MovimentoLinha[], params: Parametros): MixProdutos {
  let total = 0
  let mono = 0
  let reducao = 0
  let compras = 0
  let simples = 0
  const excluidas: Natureza[] = ['uso_consumo', 'ativo', 'energia', 'frete', 'comunicacao', 'servico_tomado']
  for (const l of linhas) {
    if (l.tipo !== 'entrada' || !l.ncm) continue
    const n = naturezaDe(l, params.cfopNatureza)
    if (excluidas.includes(n)) continue
    total += l.valor_contabil
    if (ncmMonofasico(l.ncm)) mono += l.valor_contabil
    reducao += l.valor_contabil * reducaoIbsCbs(l.ncm)
    if (n === 'compra_revenda' || n === 'compra_insumo') {
      compras += l.valor_contabil
      if (fornecedorDoSimples(l.cst)) simples += l.valor_contabil
    }
  }
  return {
    monofasico: params.percentualMonofasico !== null ? params.percentualMonofasico / 100 : total ? mono / total : 0,
    reducaoIbsCbs: params.percentualReducaoIbsCbs !== null ? params.percentualReducaoIbsCbs / 100 : total ? reducao / total : 0,
    fornecedoresSimples: compras ? simples / compras : 0,
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
