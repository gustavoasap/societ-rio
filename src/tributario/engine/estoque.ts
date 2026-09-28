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
  /** número da nota (guardado nas compras, devoluções e operações fora da venda comum — base do pareamento e da exclusão por nota) */
  nota?: string
  parceiro?: string
  /** valor dos produtos na nota (sem frete, IPI e ST) — compara a compra com a devolução/saída do mesmo valor */
  valor_produto?: number
}

/** Configuração do produto definida pelo contador: estoque inicial e composição (kits vendidos → produtos comprados). */
export interface ConfigProduto {
  chave: string
  qtdInicial: number | null
  valorInicial: number | null
  /** produto vendido que baixa outros do estoque (DE.PARA): cada unidade vendida consome `fator` unidades de cada componente */
  componentes: { chave: string; fator: number }[] | null
  /** produto que não passa pelo estoque: as vendas vão direto para a receita, sem CMV e sem pendência */
  semEstoque?: boolean
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

/** Entrada e saída do mesmo produto com a mesma quantidade e o mesmo valor (compra devolvida, venda à ordem): fora do estoque. */
export interface ParOperacao {
  chave: string
  descricao: string
  quantidade: number
  valor: number
  entrada: { competencia: string; cfop: string; nota: string; parceiro: string }
  saida: { competencia: string; cfop: string; nota: string; parceiro: string }
  /** 'total': a operação inteira sai do estoque; 'parcial': devolução de parte da compra, estornada da própria compra */
  tipo: 'total' | 'parcial'
}

export interface OpcoesEstoque {
  /** exclui do estoque as compras devolvidas / operações de entrada e saída no mesmo valor (padrão: sim) */
  parear?: boolean
  /** notas fora do estoque, no formato tipo|nota|parceiro (ver `chaveNota`) */
  notasFora?: string[]
}

export interface ResultadoEstoque {
  meses: string[]
  produtos: ProdutoEstoque[]
  /** produtos vendidos sem compra nem estoque inicial — precisam de DE.PARA ou estoque inicial */
  semCusto: VendaSemCusto[]
  /** pares de entrada × saída tirados do estoque */
  pares: ParOperacao[]
  /** chave de cada item (depois do vínculo por EAN, SKU e descrição), na ordem dos itens */
  chaves: string[]
  /** chave antiga (EAN ou COD:código) → chave vinculada */
  apelidos: Record<string, string>
  porMes: Record<
    string,
    {
      cmv: number // custo médio das vendas cobertas
      cmvEstimado: number // CMV + estimativa das vendas sem custo (pela relação CMV/venda do mês)
      vendasCobertas: number
      vendasSemCusto: number
      vendasSemEstoque: number // produtos marcados como "sem estoque": receita sem CMV
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

/** Identificação da nota para excluí-la do estoque. */
export const chaveNota = (i: Pick<ItemEstoque, 'tipo' | 'nota' | 'parceiro'>) => `${i.tipo}|${i.nota ?? ''}|${i.parceiro ?? ''}`

/**
 * Guarda o número da nota no item? Nas vendas comuns, devoluções de venda e remessas (milhares de notas de marketplace) o item
 * é somado por mês; nas compras, devoluções de compra e demais operações fica por nota, para o pareamento e a exclusão por nota.
 */
export function guardaNota(tipo: 'entrada' | 'saida', cfop: string) {
  const r = Number(cfop.slice(1))
  if (r >= 904 && r <= 907) return false // depósito/armazém
  if (tipo === 'saida') return !(r >= 101 && r <= 108)
  return !(r >= 201 && r <= 202) && r !== 949 // retornos de marketplace (x949) somados por mês
}

const normalizarDescricao = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

/**
 * Vínculo dos produtos entre entradas e saídas: EAN válido; sem EAN, o SKU (código) de um item que tenha EAN; senão a mesma
 * descrição de um item com EAN (ex.: devolução de compra emitida com código interno e sem EAN). Sem nada disso, fica pelo código.
 */
export function vincularProdutos(itens: ItemEstoque[]) {
  const unico = (m: Map<string, Set<string>>, k: string) => {
    const v = m.get(k)
    return v && v.size === 1 ? [...v][0] : null
  }
  const porCodigo = new Map<string, Set<string>>()
  const porDescricao = new Map<string, Set<string>>()
  for (const i of itens) {
    if (!gtinValido(i.ean)) continue
    const ean = i.ean.replace(/\D/g, '')
    const cod = i.codigo.trim()
    if (cod) porCodigo.set(cod, (porCodigo.get(cod) ?? new Set()).add(ean))
    const d = normalizarDescricao(i.descricao)
    if (d) porDescricao.set(d, (porDescricao.get(d) ?? new Set()).add(ean))
  }
  // sem EAN: a mesma descrição de outro item sem EAN também une (os dois códigos viram um produto)
  const descSemEan = new Map<string, string>()
  const apelidos: Record<string, string> = {}
  const chaves = itens.map((i) => {
    if (gtinValido(i.ean)) return i.ean.replace(/\D/g, '')
    const original = chaveProduto(i.ean, i.codigo)
    const d = normalizarDescricao(i.descricao)
    let k = unico(porCodigo, i.codigo.trim()) ?? (d ? unico(porDescricao, d) : null)
    if (!k && d) {
      k = descSemEan.get(d) ?? original
      descSemEan.set(d, k)
    }
    k ??= original
    if (k !== original) apelidos[original] = k
    return k
  })
  return { chaves, apelidos }
}

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

type Linha = { item: ItemEstoque; chave: string; desc: string; mov: Mov; q: number; v: number; vp: number }

/**
 * Pareamento de entradas e saídas que não passam pelo estoque:
 * - mesmo produto, mesma quantidade e mesmo valor (compra devolvida no mesmo valor, venda à ordem): as duas saem do estoque;
 * - devolução de compra de parte da nota, pelo mesmo preço unitário: estornada da própria compra (não compõe o estoque).
 * Remessas (depósito, marketplace) e devoluções de venda não entram no pareamento.
 */
function parear(linhas: Linha[]): ParOperacao[] {
  const pares: ParOperacao[] = []
  const igual = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
  // saídas: devolução de compra, venda (ex.: venda à ordem) e outras saídas por nota (ex.: 6949 devolvendo a compra ao fornecedor)
  const saidas = linhas.filter((l) => l.item.tipo === 'saida' && l.mov !== 'dev_venda' && l.q > 0)
  const mesmoParceiro = (e: Linha, s: Linha) => {
    const a = e.item.parceiro?.trim().toUpperCase() ?? ''
    const b = s.item.parceiro?.trim().toUpperCase() ?? ''
    // operação sem natureza de estoque só pareia com o mesmo fornecedor; com o parceiro nos dois lados, ele precisa ser o mesmo
    return a && b ? a === b : s.mov === 'dev_compra'
  }
  const entradas = linhas.filter((l) => l.item.tipo === 'entrada' && l.mov !== 'dev_venda' && l.q > 0)
  const porChave = new Map<string, Linha[]>()
  const porDesc = new Map<string, Linha[]>()
  for (const e of entradas) {
    porChave.set(e.chave, [...(porChave.get(e.chave) ?? []), e])
    if (e.desc) porDesc.set(e.desc, [...(porDesc.get(e.desc) ?? []), e])
  }
  const ref = (l: Linha) => ({ competencia: l.item.competencia, cfop: l.item.cfop, nota: l.item.nota ?? '', parceiro: l.item.parceiro ?? '' })
  // as compras primeiro; depois a entrada mais próxima antes da saída
  const ordem = (a: Linha, b: Linha) => Number(b.mov === 'compra') - Number(a.mov === 'compra') || b.item.competencia.localeCompare(a.item.competencia)
  for (const s of saidas) {
    // sem EAN (ex.: devolução emitida com código interno), a descrição também identifica a compra
    const base = [...(porChave.get(s.chave) ?? []), ...(gtinValido(s.item.ean) ? [] : (porDesc.get(s.desc) ?? []).filter((e) => e.chave !== s.chave))]
    // ao menos um dos lados mexe no estoque (compra, venda ou devolução de compra)
    const cands = base.filter((e) => e.q > 0 && (e.mov || s.mov) && e.item.competencia <= s.item.competencia && mesmoParceiro(e, s)).sort(ordem)
    const total = cands.find((e) => igual(e.q, s.q, 1e-6) && (igual(e.vp, s.vp, 0.05) || igual(e.v, s.v, 0.05)))
    if (total) {
      pares.push({ chave: total.chave, descricao: total.item.descricao, quantidade: s.q, valor: arred(total.v), entrada: ref(total), saida: ref(s), tipo: 'total' })
      total.q = total.v = s.q = s.v = 0
      continue
    }
    if (s.mov !== 'dev_compra') continue
    const unit = s.vp / s.q
    const parcial = cands.find((e) => e.mov === 'compra' && e.q > s.q && igual(e.vp / e.q, unit, Math.max(0.01, unit * 0.005)))
    if (parcial) {
      const custo = (parcial.v / parcial.q) * s.q
      pares.push({ chave: parcial.chave, descricao: parcial.item.descricao, quantidade: s.q, valor: arred(custo), entrada: ref(parcial), saida: ref(s), tipo: 'parcial' })
      parcial.q -= s.q
      parcial.v -= custo
      parcial.vp -= s.vp
      s.q = s.v = 0
    }
  }
  return pares
}

export function calcularEstoque(
  itens: ItemEstoque[],
  configBruta: Record<string, ConfigProduto>,
  ajustes: Record<string, Natureza> = {},
  estoqueCfop: Record<string, MovEstoque> = {},
  opcoes: OpcoesEstoque = {},
): ResultadoEstoque {
  const meses = [...new Set(itens.map((i) => i.competencia))].sort()
  const { chaves, apelidos } = vincularProdutos(itens)
  const alias = (k: string) => apelidos[k] ?? k
  // configuração gravada com a chave antiga (antes do vínculo) continua valendo
  const config: Record<string, ConfigProduto> = {}
  for (const c of Object.values(configBruta)) {
    const k = alias(c.chave)
    const comp = c.componentes?.map((x) => ({ ...x, chave: alias(x.chave) })) ?? null
    config[k] = { ...config[k], ...c, chave: k, componentes: comp?.length ? comp : (config[k]?.componentes ?? null) }
  }
  const fora = new Set(opcoes.notasFora ?? [])
  const linhas: Linha[] = []
  itens.forEach((item, ix) => {
    const mov = movimentoEstoque(item.tipo, item.cfop, ajustes, estoqueCfop)
    if (item.quantidade <= 0) return
    // operações que não mexem no estoque (ex.: x923, x949) entram só no pareamento, quando identificadas pela nota
    if (!mov && !item.nota) return
    if (item.nota && fora.has(chaveNota(item))) return
    const vp = item.valor_produto ?? item.valor
    linhas.push({ item, chave: chaves[ix], desc: normalizarDescricao(item.descricao), mov, q: item.quantidade, v: item.valor, vp })
  })
  const pares = opcoes.parear === false ? [] : parear(linhas)

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
  const vendasItem: Linha[] = []
  // produtos "de estoque": comprados, com estoque inicial ou componentes de kit
  for (const l of linhas) {
    if (l.q <= 0 || !l.mov) continue
    if (l.mov === 'compra' || l.mov === 'dev_compra') {
      garantir(l.chave, l.item)
      const a = acum(l.item.competencia, l.chave)
      if (l.mov === 'compra') {
        a.compraQ += l.q
        a.compraV += l.v
      } else {
        a.devCompraQ += l.q
        a.devCompraV += l.v
      }
    } else vendasItem.push(l)
  }
  for (const c of Object.values(config)) {
    if ((c.qtdInicial ?? 0) > 0) garantir(c.chave)
    for (const k of c.componentes ?? []) garantir(k.chave)
  }
  // vendas e devoluções de venda: baixam o próprio produto ou os componentes do kit (DE.PARA)
  const semCusto = new Map<string, VendaSemCusto>()
  const vendasCobertas = new Map<string, number>()
  const vendasSem = new Map<string, number>()
  const vendasSemEstoque = new Map<string, number>()
  for (const { chave, item, mov: t, q, v } of vendasItem) {
    const mes = item.competencia
    const cfg = config[chave]
    if (cfg?.semEstoque) {
      if (t === 'venda') vendasSemEstoque.set(mes, (vendasSemEstoque.get(mes) ?? 0) + v)
      else vendasSemEstoque.set(mes, (vendasSemEstoque.get(mes) ?? 0) - v)
      continue
    }
    const comp = cfg?.componentes?.filter((c) => c.chave && c.fator > 0)
    const alvos = comp?.length ? comp : produtos.has(chave) ? [{ chave, fator: 1 }] : null
    if (!alvos) {
      if (t === 'venda') {
        const s = semCusto.get(chave) ?? { chave, descricao: item.descricao, ncm: item.ncm, quantidade: 0, valor: 0 }
        s.quantidade += q
        s.valor += v
        semCusto.set(chave, s)
        vendasSem.set(mes, (vendasSem.get(mes) ?? 0) + v)
      }
      continue
    }
    if (t === 'venda') vendasCobertas.set(mes, (vendasCobertas.get(mes) ?? 0) + v)
    for (const a of alvos) {
      const x = acum(mes, a.chave)
      if (t === 'venda') x.vendaQ += q * a.fator
      else x.devVendaQ += q * a.fator
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
      vendasSemEstoque: arred(vendasSemEstoque.get(mes) ?? 0),
      compras: arred(compras),
      estoqueInicial: arred(inicial),
      estoqueFinal: arred(final),
    }
  }
  return {
    meses,
    produtos: [...produtos.values()].sort((a, b) => a.descricao.localeCompare(b.descricao)),
    semCusto: [...semCusto.values()].sort((a, b) => b.valor - a.valor),
    pares,
    chaves,
    apelidos,
    porMes,
  }
}
