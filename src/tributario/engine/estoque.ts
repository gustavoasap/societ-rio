// Controle de estoque e CMV pelo custo médio ponderado mensal, a partir dos registros de entradas e saídas (item a item).
// Mesmo método da planilha de controle da ASAP: custo médio = (valor inicial + compras) ÷ (quantidade inicial + compras);
// CMV = estoque inicial + compras − estoque final (RIR/2018, art. 307; NBC TG 16 — Estoques, item 25).
import { classificarCfop, type Natureza } from './cfop'

/** Item de nota agregado por competência × tipo × CFOP × produto (gravado na importação dos relatórios detalhados). */
export interface ItemEstoque {
  estabelecimento_id?: string | null
  competencia: string
  tipo: 'entrada' | 'saida'
  cfop: string
  codigo: string
  ean: string
  descricao: string
  ncm: string
  unidade: string
  quantidade: number
  valor: number // entradas: custo (itens − desconto + frete + seguro + outras + IPI + ST); saídas: valor da nota
}

/** Configuração do produto definida pelo contador: estoque inicial e composição (kits vendidos → produtos comprados). */
export interface ConfigProduto {
  chave: string
  qtdInicial: number | null
  valorInicial: number | null
  /** produto vendido que baixa outros do estoque (DE.PARA): cada unidade vendida consome `fator` unidades de cada componente */
  componentes: { chave: string; fator: number }[] | null
}

export interface MesProduto {
  inicialQ: number
  inicialV: number
  compraQ: number
  compraV: number
  devCompraQ: number
  devCompraV: number
  devVendaQ: number
  vendaQ: number // quantidade baixada por vendas (inclusive como componente de kit)
  custoMedio: number
  cmv: number
  finalQ: number
  finalV: number
  negativo: boolean
}

export interface ProdutoEstoque {
  chave: string
  codigo: string
  ean: string
  descricao: string
  ncm: string
  meses: Record<string, MesProduto>
}

export interface VendaSemCusto {
  chave: string
  descricao: string
  ncm: string
  quantidade: number
  valor: number
}

export interface ResultadoEstoque {
  meses: string[]
  produtos: ProdutoEstoque[]
  /** produtos vendidos sem compra nem estoque inicial — precisam de DE.PARA ou estoque inicial */
  semCusto: VendaSemCusto[]
  porMes: Record<
    string,
    {
      cmv: number // custo médio das vendas cobertas
      cmvEstimado: number // CMV + estimativa das vendas sem custo (pela relação CMV/venda do mês)
      vendasCobertas: number
      vendasSemCusto: number
      compras: number
      estoqueInicial: number
      estoqueFinal: number
    }
  >
}

export type MovEstoque = 'compra' | 'dev_compra' | 'venda' | 'dev_venda' | 'neutro'
type Mov = Exclude<MovEstoque, 'neutro'> | null

export const NOME_MOV_ESTOQUE: Record<MovEstoque, string> = {
  compra: 'Entrada no estoque (compra)',
  dev_venda: 'Devolução de venda (volta pelo custo médio)',
  venda: 'Baixa por venda (CMV)',
  dev_compra: 'Devolução de compra (sai pelo valor da nota)',
  neutro: 'Não mexe no estoque',
}

/**
 * Movimento de estoque de um CFOP: o tratamento escolhido pelo contador para o estoque; senão, pela natureza do CFOP.
 * Remessas e retornos (depósito, Amazon FBA, conserto) não mexem no custo. A entrada física em venda à ordem (x923) conta como
 * compra quando a nota de faturamento não é escriturada como compra — ajuste por CFOP na aba Estoque e CMV.
 */
export function movimentoEstoque(tipo: 'entrada' | 'saida', cfop: string, ajustes: Record<string, Natureza> = {}, estoque: Record<string, MovEstoque> = {}): Mov {
  const escolhido = estoque[cfop]
  if (escolhido) return escolhido === 'neutro' ? null : escolhido
  if (tipo === 'entrada' && /^[12]923$/.test(cfop)) return 'compra'
  const n = ajustes[cfop] ?? classificarCfop(cfop)
  if (tipo === 'entrada') {
    if (n === 'compra_revenda' || n === 'compra_insumo' || n === 'bonificacao') return 'compra'
    if (n === 'devolucao_venda') return 'dev_venda'
    return null
  }
  if (n === 'venda' || n === 'exportacao' || n === 'bonificacao') return 'venda'
  if (n === 'devolucao_compra') return 'dev_compra'
  return null
}

/** GTIN válido (8, 12, 13 ou 14 dígitos com dígito verificador). */
export function gtinValido(v: string) {
  const d = v.replace(/\D/g, '')
  if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) return false
  const corpo = d.slice(0, -1)
  const soma = [...corpo].reverse().reduce((s, c, i) => s + Number(c) * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === Number(d.slice(-1))
}

/** Chave do produto: o EAN quando válido; senão o código do produto no sistema. */
export const chaveProduto = (ean: string, codigo: string) => (gtinValido(ean) ? ean.replace(/\D/g, '') : `COD:${codigo.trim() || 'sem código'}`)

const arred = (v: number) => Math.round(v * 100) / 100
const novoMes = (q: number, v: number): MesProduto => ({
  inicialQ: q,
  inicialV: v,
  compraQ: 0,
  compraV: 0,
  devCompraQ: 0,
  devCompraV: 0,
  devVendaQ: 0,
  vendaQ: 0,
  custoMedio: 0,
  cmv: 0,
  finalQ: q,
  finalV: v,
  negativo: false,
})

export function calcularEstoque(
  itens: ItemEstoque[],
  config: Record<string, ConfigProduto>,
  ajustes: Record<string, Natureza> = {},
  estoqueCfop: Record<string, MovEstoque> = {},
): ResultadoEstoque {
  const meses = [...new Set(itens.map((i) => i.competencia))].sort()
  const produtos = new Map<string, ProdutoEstoque>()
  const garantir = (chave: string, i?: ItemEstoque) => {
    let p = produtos.get(chave)
    if (!p) {
      p = { chave, codigo: i?.codigo ?? '', ean: i?.ean ?? '', descricao: i?.descricao ?? chave, ncm: i?.ncm ?? '', meses: {} }
      produtos.set(chave, p)
    }
    return p
  }
  // movimentos por mês e chave
  type Acum = { compraQ: number; compraV: number; devCompraQ: number; devCompraV: number; devVendaQ: number; vendaQ: number }
  const mov = new Map<string, Map<string, Acum>>()
  const acum = (mes: string, chave: string) => {
    const m = mov.get(mes) ?? new Map<string, Acum>()
    mov.set(mes, m)
    const a = m.get(chave) ?? { compraQ: 0, compraV: 0, devCompraQ: 0, devCompraV: 0, devVendaQ: 0, vendaQ: 0 }
    m.set(chave, a)
    return a
  }
  const vendasItem: { mes: string; chave: string; item: ItemEstoque }[] = []
  // produtos "de estoque": comprados, com estoque inicial ou componentes de kit
  for (const i of itens) {
    const t = movimentoEstoque(i.tipo, i.cfop, ajustes, estoqueCfop)
    if (!t || i.quantidade <= 0) continue
    const chave = chaveProduto(i.ean, i.codigo)
    if (t === 'compra' || t === 'dev_compra') {
      garantir(chave, i)
      const a = acum(i.competencia, chave)
      if (t === 'compra') {
        a.compraQ += i.quantidade
        a.compraV += i.valor
      } else {
        a.devCompraQ += i.quantidade
        a.devCompraV += i.valor
      }
    } else vendasItem.push({ mes: i.competencia, chave, item: i })
  }
  for (const c of Object.values(config)) {
    if ((c.qtdInicial ?? 0) > 0) garantir(c.chave)
    for (const k of c.componentes ?? []) garantir(k.chave)
  }
  // vendas e devoluções de venda: baixam o próprio produto ou os componentes do kit (DE.PARA)
  const semCusto = new Map<string, VendaSemCusto>()
  const vendasCobertas = new Map<string, number>()
  const vendasSem = new Map<string, number>()
  for (const { mes, chave, item } of vendasItem) {
    const t = movimentoEstoque(item.tipo, item.cfop, ajustes, estoqueCfop)
    const comp = config[chave]?.componentes?.filter((c) => c.chave && c.fator > 0)
    const alvos = comp?.length ? comp : produtos.has(chave) ? [{ chave, fator: 1 }] : null
    if (!alvos) {
      if (t === 'venda') {
        const s = semCusto.get(chave) ?? { chave, descricao: item.descricao, ncm: item.ncm, quantidade: 0, valor: 0 }
        s.quantidade += item.quantidade
        s.valor += item.valor
        semCusto.set(chave, s)
        vendasSem.set(mes, (vendasSem.get(mes) ?? 0) + item.valor)
      }
      continue
    }
    if (t === 'venda') vendasCobertas.set(mes, (vendasCobertas.get(mes) ?? 0) + item.valor)
    for (const a of alvos) {
      const x = acum(mes, a.chave)
      if (t === 'venda') x.vendaQ += item.quantidade * a.fator
      else x.devVendaQ += item.quantidade * a.fator
    }
  }

  const porMes: ResultadoEstoque['porMes'] = {}
  const estado = new Map<string, { q: number; v: number; ultimoCusto: number }>()
  for (const p of produtos.values()) {
    const c = config[p.chave]
    const q = c?.qtdInicial ?? 0
    const v = c?.valorInicial ?? 0
    estado.set(p.chave, { q, v, ultimoCusto: q > 0 ? v / q : 0 })
  }
  for (const mes of meses) {
    let cmvMes = 0
    let compras = 0
    let inicial = 0
    let final = 0
    for (const p of produtos.values()) {
      const e = estado.get(p.chave)!
      const a = mov.get(mes)?.get(p.chave)
      const m = novoMes(e.q, e.v)
      inicial += e.v
      if (a) {
        m.compraQ = a.compraQ
        m.compraV = a.compraV
        m.devCompraQ = a.devCompraQ
        m.devCompraV = a.devCompraV
        m.devVendaQ = a.devVendaQ
        m.vendaQ = a.vendaQ
      }
      let q = e.q + m.compraQ - m.devCompraQ
      let v = e.v + m.compraV - m.devCompraV
      if (m.compraQ > 0) e.ultimoCusto = m.compraV / m.compraQ
      const medio = q > 0 ? v / q : e.ultimoCusto
      m.custoMedio = medio
      // devolução de venda volta pelo custo médio (estorna CMV); venda baixa pelo custo médio
      const cmv = (m.vendaQ - m.devVendaQ) * medio
      q += m.devVendaQ - m.vendaQ
      v += (m.devVendaQ - m.vendaQ) * medio
      if (Math.abs(q) < 1e-9) {
        q = 0
        v = 0
      }
      m.negativo = q < 0
      m.cmv = cmv
      m.finalQ = q
      m.finalV = v
      e.q = q
      e.v = v
      if (a || m.inicialQ || m.finalQ) p.meses[mes] = m
      cmvMes += cmv
      compras += m.compraV - m.devCompraV
      final += v
    }
    const cobertas = vendasCobertas.get(mes) ?? 0
    const sem = vendasSem.get(mes) ?? 0
    porMes[mes] = {
      cmv: arred(cmvMes),
      cmvEstimado: arred(cmvMes + (cobertas > 0 ? sem * (cmvMes / cobertas) : 0)),
      vendasCobertas: arred(cobertas),
      vendasSemCusto: arred(sem),
      compras: arred(compras),
      estoqueInicial: arred(inicial),
      estoqueFinal: arred(final),
    }
  }
  return {
    meses,
    produtos: [...produtos.values()].sort((a, b) => a.descricao.localeCompare(b.descricao)),
    semCusto: [...semCusto.values()].sort((a, b) => b.valor - a.valor),
    porMes,
  }
}
