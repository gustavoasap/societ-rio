// Notas fiscais importadas e os ajustes do contador sobre elas (data/competência, CFOP, considerar ou não).
// O movimento é gravado agregado (competência × CFOP × NCM…); cada nota guarda a sua parte nesse agregado. Um ajuste tira a parte
// da nota de onde ela estava e a devolve com a nova data/CFOP — ou não devolve, quando a nota fica fora da análise.
import type { ItemEstoque } from './estoque'
import type { MovimentoLinha, TipoMovimento } from './tipos'

/** Parte de uma nota no movimento agregado (mesmas dimensões e valores de MovimentoLinha, sem o estabelecimento). */
export type ParteMovimento = Omit<MovimentoLinha, 'estabelecimento_id'>

export interface NotaResumo {
  chave: string // tipo|número|documento (ou nome, sem documento)
  tipo: TipoMovimento
  nota: string
  documento: string
  parceiro_nome: string
  data: string // AAAA-MM-DD
  competencia: string
  cfops: string
  valor: number
  itens: number
  estabelecimento_id?: string | null
  importacao_id?: string
}

export interface NotaDetalhe extends NotaResumo {
  linhas: ParteMovimento[]
  estoque: ItemEstoque[]
}

export interface AjusteNota {
  chave: string
  /** nova data (AAAA-MM-DD); a competência passa a ser o mês dela */
  data: string | null
  /** novo CFOP para todos os itens da nota */
  cfop: string | null
  /** nota fora da análise (tributos, DRE e estoque) */
  excluir: boolean
  observacao: string
}

export const chaveDaNota = (tipo: TipoMovimento, nota: string, documento: string, nome: string) => `${tipo}|${nota}|${documento || nome.trim().toUpperCase()}`

export const ajusteVazio = (a: AjusteNota) => !a.excluir && !a.data && !a.cfop && !a.observacao.trim()

/** Ajuste que muda o cálculo (a observação sozinha não muda). */
const mudaCalculo = (a: AjusteNota, n: NotaResumo) => a.excluir || (!!a.data && a.data.slice(0, 7) !== n.competencia) || (!!a.cfop && a.cfop !== n.cfops)

const CAMPOS = ['itens', 'valor_contabil', 'bc_icms', 'icms', 'icms_st', 'ipi', 'pis', 'cofins', 'iss', 'difal', 'retencoes'] as const
const chaveLinha = (l: MovimentoLinha) =>
  [l.estabelecimento_id ?? '', l.competencia, l.tipo, l.cfop, l.ncm, l.uf, l.cst, l.cst_pis ?? '', l.servico, l.destinatario, l.parceiro].join('|')

/** Movimento com os ajustes das notas aplicados. */
export function aplicarAjustesLinhas(linhas: MovimentoLinha[], notas: NotaDetalhe[], ajustes: Record<string, AjusteNota>): MovimentoLinha[] {
  const ativos = notas.filter((n) => ajustes[n.chave] && mudaCalculo(ajustes[n.chave], n))
  if (!ativos.length) return linhas
  const mapa = new Map<string, MovimentoLinha>()
  const somar = (l: MovimentoLinha, sinal: 1 | -1) => {
    const k = chaveLinha(l)
    const atual = mapa.get(k) ?? {
      ...l,
      ...Object.fromEntries(CAMPOS.map((c) => [c, 0])),
    }
    for (const c of CAMPOS) atual[c] += sinal * (l[c] ?? 0)
    mapa.set(k, atual)
  }
  for (const l of linhas) somar(l, 1)
  for (const n of ativos) {
    const a = ajustes[n.chave]
    for (const p of n.linhas) {
      const l = {
        ...p,
        estabelecimento_id: n.estabelecimento_id ?? null,
      } as MovimentoLinha
      somar(l, -1)
      if (!a.excluir)
        somar(
          {
            ...l,
            competencia: a.data ? a.data.slice(0, 7) : l.competencia,
            cfop: a.cfop || l.cfop,
          },
          1,
        )
    }
  }
  const arred = (v: number) => Math.round(v * 100) / 100
  return [...mapa.values()]
    .map(
      (l) =>
        ({
          ...l,
          ...Object.fromEntries(CAMPOS.map((c) => [c, arred(l[c])])),
        }) as MovimentoLinha,
    )
    .filter((l) => CAMPOS.some((c) => c !== 'itens' && Math.abs(l[c]) >= 0.01))
}

const chaveItem = (i: ItemEstoque) => [i.estabelecimento_id ?? '', i.competencia, i.tipo, i.cfop, i.codigo, i.ean, i.nota ?? '', i.parceiro ?? ''].join('|')

/** Itens do estoque com os ajustes das notas aplicados. */
export function aplicarAjustesItens(itens: ItemEstoque[], notas: NotaDetalhe[], ajustes: Record<string, AjusteNota>): ItemEstoque[] {
  const ativos = notas.filter((n) => ajustes[n.chave] && mudaCalculo(ajustes[n.chave], n))
  if (!ativos.length) return itens
  const mapa = new Map<string, ItemEstoque>()
  const somar = (i: ItemEstoque, sinal: 1 | -1) => {
    const k = chaveItem(i)
    const atual = mapa.get(k) ?? {
      ...i,
      quantidade: 0,
      valor: 0,
      valor_produto: i.valor_produto === undefined ? undefined : 0,
    }
    atual.quantidade += sinal * i.quantidade
    atual.valor += sinal * i.valor
    if (atual.valor_produto !== undefined) atual.valor_produto += sinal * (i.valor_produto ?? i.valor)
    mapa.set(k, atual)
  }
  for (const i of itens) somar(i, 1)
  for (const n of ativos) {
    const a = ajustes[n.chave]
    for (const p of n.estoque) {
      const i = { ...p, estabelecimento_id: n.estabelecimento_id ?? null }
      somar(i, -1)
      if (!a.excluir)
        somar(
          {
            ...i,
            competencia: a.data ? a.data.slice(0, 7) : i.competencia,
            cfop: a.cfop || i.cfop,
          },
          1,
        )
    }
  }
  return [...mapa.values()].filter((i) => i.quantidade > 1e-9)
}

/** Resumo mensal (notas e valor) antes e depois dos ajustes. */
export function resumoNotas(notas: NotaResumo[], ajustes: Record<string, AjusteNota>) {
  type Linha = {
    competencia: string
    entradas: number
    valorEntradas: number
    saidas: number
    valorSaidas: number
    ajustadas: number
    excluidas: number
  }
  const nova = (c: string): Linha => ({
    competencia: c,
    entradas: 0,
    valorEntradas: 0,
    saidas: 0,
    valorSaidas: 0,
    ajustadas: 0,
    excluidas: 0,
  })
  const original = new Map<string, Linha>()
  const ajustado = new Map<string, Linha>()
  const add = (m: Map<string, Linha>, c: string, n: NotaResumo) => {
    const x = m.get(c) ?? nova(c)
    if (n.tipo === 'entrada' || n.tipo === 'servico_tomado') {
      x.entradas++
      x.valorEntradas += n.valor
    } else {
      x.saidas++
      x.valorSaidas += n.valor
    }
    m.set(c, x)
    return x
  }
  for (const n of notas) {
    add(original, n.competencia, n)
    const a = ajustes[n.chave]
    if (a?.excluir) {
      const x = ajustado.get(n.competencia) ?? nova(n.competencia)
      x.excluidas++
      ajustado.set(n.competencia, x)
      continue
    }
    const c = a?.data ? a.data.slice(0, 7) : n.competencia
    const x = add(ajustado, c, n)
    if (a && mudaCalculo(a, n)) x.ajustadas++
  }
  const meses = [...new Set([...original.keys(), ...ajustado.keys()])].sort()
  return meses.map((m) => ({
    competencia: m,
    original: original.get(m) ?? nova(m),
    ajustado: ajustado.get(m) ?? nova(m),
  }))
}
