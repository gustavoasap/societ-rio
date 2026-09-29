import type { Categoria, Conta, Lancamento, Natureza } from '../tipos'
import { somar } from './calculos'
import { diasNoMes, mesDe, somarMeses, somarMesesAoMes } from './datas'

const dois = (n: number) => String(n).padStart(2, '0')

// ---------------------------------------------------------------- classificação

/** Classificação efetiva: a do lançamento, senão a da categoria, senão "variável". */
export function naturezaDe(l: Lancamento, categorias: Map<string, Categoria>): Natureza {
  return l.natureza ?? (l.categoria_id ? categorias.get(l.categoria_id)?.natureza : undefined) ?? 'variavel'
}

/** É gasto/receita meu? (despesas lançadas em nome de outra pessoa ficam fora da minha DRE) */
export const ehMeu = (l: Lancamento) => !l.pessoa_id

// ---------------------------------------------------------------- parcelas

export interface Parcela {
  valor: number
  data: string
  parcela: number
  parcelas: number
}

/**
 * Parcelas de uma compra a partir da parcela atual.
 * Ex.: compra em 10x e hoje é a 4ª → gera 4/10 (na data informada), 5/10 no mês seguinte... até 10/10.
 * `valor` é o da parcela ou o total da compra (`valorEhTotal`); no total, a sobra de centavos vai na 1ª parcela.
 */
export function gerarParcelas(o: { valor: number; valorEhTotal: boolean; data: string; atual: number; total: number }): Parcela[] {
  const total = Math.max(1, Math.floor(o.total))
  const atual = Math.min(total, Math.max(1, Math.floor(o.atual)))
  const cent = Math.round(o.valor * 100)
  const base = o.valorEhTotal ? Math.floor(cent / total) : cent
  const sobra = o.valorEhTotal ? cent - base * total : 0
  const lista: Parcela[] = []
  for (let p = atual; p <= total; p++) {
    lista.push({ valor: (base + (p === 1 ? sobra : 0)) / 100, data: somarMeses(o.data, p - atual), parcela: p, parcelas: total })
  }
  return lista
}

// ---------------------------------------------------------------- cartão de crédito

const diaNoMes = (mes: string, dia: number) => {
  const [a, m] = mes.split('-').map(Number)
  return `${mes}-${dois(Math.min(dia, diasNoMes(a, m)))}`
}

/**
 * Mês ("AAAA-MM") da fatura em que a compra cai, identificado pelo mês do vencimento.
 * Compra a partir do dia do fechamento vai para a fatura seguinte.
 * Ex.: fecha dia 3, vence dia 10 → compra em 02/09 = fatura de set; compra em 03/09 = fatura de out.
 */
export function faturaDe(data: string, fechamento: number | null, vencimento: number | null) {
  if (!fechamento || !vencimento) return mesDe(data)
  const dia = Number(data.slice(8, 10))
  const [a, m] = mesDe(data).split('-').map(Number)
  const fechaEste = Math.min(fechamento, diasNoMes(a, m))
  const mesFechamento = dia >= fechaEste ? somarMesesAoMes(mesDe(data), 1) : mesDe(data)
  return vencimento > fechamento ? mesFechamento : somarMesesAoMes(mesFechamento, 1)
}

/** Datas de fechamento e vencimento da fatura do mês (mês = vencimento). */
export function datasDaFatura(mes: string, fechamento: number | null, vencimento: number | null) {
  if (!fechamento || !vencimento) return { fechamento: null, vencimento: null }
  const mesFech = vencimento > fechamento ? mes : somarMesesAoMes(mes, -1)
  return { fechamento: diaNoMes(mesFech, fechamento), vencimento: diaNoMes(mes, vencimento) }
}

export interface Fatura {
  mes: string
  total: number
  itens: Lancamento[]
  fechamento: string | null
  vencimento: string | null
  /** Pagamentos (transferências para o cartão) feitos entre o fechamento desta fatura e o da próxima */
  pago: number
}

/** Faturas de um cartão, por mês de vencimento, em ordem. */
export function faturasDoCartao(cartao: Conta, lancamentos: Lancamento[]): Fatura[] {
  const F = cartao.dia_fechamento
  const V = cartao.dia_vencimento
  const mapa = new Map<string, Lancamento[]>()
  for (const l of lancamentos) {
    if (l.conta_id !== cartao.id || l.tipo === 'transferencia') continue
    const m = faturaDe(l.data, F, V)
    mapa.set(m, [...(mapa.get(m) ?? []), l])
  }
  const pagamentos = lancamentos.filter((l) => l.tipo === 'transferencia' && l.conta_destino_id === cartao.id)
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, itens]) => {
      const d = datasDaFatura(mes, F, V)
      const proxima = datasDaFatura(somarMesesAoMes(mes, 1), F, V).fechamento
      const pago = d.fechamento
        ? somar(pagamentos.filter((p) => p.data >= d.fechamento! && (!proxima || p.data < proxima)).map((p) => p.valor))
        : 0
      return {
        mes,
        itens: itens.sort((a, b) => a.data.localeCompare(b.data)),
        total: somar(itens.map((l) => (l.tipo === 'receita' ? -l.valor : l.valor))),
        fechamento: d.fechamento,
        vencimento: d.vencimento,
        pago,
      }
    })
}

// ---------------------------------------------------------------- DRE

export interface LinhaDre {
  id: string
  rotulo: string
  valores: number[]
  total: number
}

export interface GrupoDre {
  natureza: Natureza
  rotulo: string
  linhas: LinhaDre[]
  valores: number[]
  total: number
}

export interface Dre {
  meses: string[]
  receitas: GrupoDre[]
  receitaTotal: number[]
  despesas: GrupoDre[]
  despesaTotal: number[]
  resultado: number[]
  /** Despesas lançadas em nome de outras pessoas (fora do resultado) */
  terceiros: LinhaDre[]
}

const ROTULO_RECEITA: Record<Natureza, string> = { fixa: 'Receitas fixas', variavel: 'Receitas variáveis', eventual: 'Receitas eventuais' }
const ROTULO_DESPESA: Record<Natureza, string> = { fixa: 'Custos fixos', variavel: 'Custos variáveis', eventual: 'Despesas eventuais' }
const ORDEM: Natureza[] = ['fixa', 'variavel', 'eventual']

/**
 * DRE pessoal por competência (data do lançamento; no cartão, a data da compra/parcela).
 * Só entra o que é meu; transferências não entram (não são ganho nem gasto).
 */
export function montarDre(lancamentos: Lancamento[], categorias: Categoria[], pessoas: { id: string; nome: string }[], meses: string[]): Dre {
  const cats = new Map(categorias.map((c) => [c.id, c]))
  const idx = new Map(meses.map((m, i) => [m, i]))
  const zeros = () => meses.map(() => 0)

  const grupos = (tipo: 'receita' | 'despesa', rotulos: Record<Natureza, string>) => {
    const porNat = new Map<Natureza, Map<string, number[]>>()
    for (const l of lancamentos) {
      if (l.tipo !== tipo || !ehMeu(l)) continue
      const i = idx.get(mesDe(l.data))
      if (i === undefined) continue
      const nat = naturezaDe(l, cats)
      const linhas = porNat.get(nat) ?? new Map<string, number[]>()
      const k = l.categoria_id ?? ''
      const v = linhas.get(k) ?? zeros()
      v[i] = somar([v[i], l.valor])
      linhas.set(k, v)
      porNat.set(nat, linhas)
    }
    return ORDEM.filter((n) => porNat.has(n)).map((n) => {
      const linhas = [...porNat.get(n)!.entries()]
        .map(([id, valores]) => ({ id, rotulo: cats.get(id)?.nome ?? 'Sem categoria', valores, total: somar(valores) }))
        .sort((a, b) => b.total - a.total)
      const valores = meses.map((_, i) => somar(linhas.map((x) => x.valores[i])))
      return { natureza: n, rotulo: rotulos[n], linhas, valores, total: somar(valores) }
    })
  }

  const receitas = grupos('receita', ROTULO_RECEITA)
  const despesas = grupos('despesa', ROTULO_DESPESA)
  const receitaTotal = meses.map((_, i) => somar(receitas.map((g) => g.valores[i])))
  const despesaTotal = meses.map((_, i) => somar(despesas.map((g) => g.valores[i])))
  const resultado = meses.map((_, i) => somar([receitaTotal[i], -despesaTotal[i]]))

  const nomes = new Map(pessoas.map((p) => [p.id, p.nome]))
  const porPessoa = new Map<string, number[]>()
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa' || ehMeu(l)) continue
    const i = idx.get(mesDe(l.data))
    if (i === undefined) continue
    const v = porPessoa.get(l.pessoa_id!) ?? zeros()
    v[i] = somar([v[i], l.valor])
    porPessoa.set(l.pessoa_id!, v)
  }
  const terceiros = [...porPessoa.entries()].map(([id, valores]) => ({ id, rotulo: nomes.get(id) ?? 'Outra pessoa', valores, total: somar(valores) }))

  return { meses, receitas, receitaTotal, despesas, despesaTotal, resultado, terceiros }
}

/** Soma das despesas minhas por classificação no período. */
export function despesasPorNatureza(lancamentos: Lancamento[], categorias: Categoria[]) {
  const cats = new Map(categorias.map((c) => [c.id, c]))
  const r: Record<Natureza, number> = { fixa: 0, variavel: 0, eventual: 0 }
  for (const l of lancamentos) if (l.tipo === 'despesa' && ehMeu(l)) r[naturezaDe(l, cats)] = somar([r[naturezaDe(l, cats)], l.valor])
  return r
}

/** Quanto cada pessoa me deve (despesas em nome dela ainda não reembolsadas). */
export function aReceberDeTerceiros(lancamentos: Lancamento[]) {
  const mapa = new Map<string, { total: number; itens: Lancamento[] }>()
  for (const l of lancamentos) {
    if (l.tipo !== 'despesa' || !l.pessoa_id || l.reembolsado) continue
    const x = mapa.get(l.pessoa_id) ?? { total: 0, itens: [] }
    x.total = somar([x.total, l.valor])
    x.itens.push(l)
    mapa.set(l.pessoa_id, x)
  }
  return mapa
}
