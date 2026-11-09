import type { Lancamento } from '../tipos'
import { lerValor } from './formato'

/** Uma linha do extrato do banco: valor com sinal (+ entrou, − saiu). */
export interface LinhaExtrato {
  id: string
  conta_id: string
  data: string
  descricao: string
  valor: number
  fitid: string | null
  lancamento_id: string | null
  ignorada: boolean
  /** Despesa compartilhada: a saída e as entradas (reembolsos) do mesmo grupo */
  compartilhado_id?: string | null
  /** Estorno: linha do extrato que esta desfaz, lançamento afetado e como (para desfazer) */
  estorno_de?: string | null
  estorno_lancamento?: string | null
  estorno_modo?: 'pendente' | 'novo' | 'reduziu' | 'apagou' | null
  /** Operações para desfazer o estorno (lista gravada ao registrar) */
  estorno_desfazer?: unknown[] | null
}

export type LinhaLida = Pick<LinhaExtrato, 'data' | 'descricao' | 'valor' | 'fitid'>

/** Banco, agência e conta informados no arquivo (OFX traz em BANKACCTFROM). */
export interface ContaDoArquivo {
  banco: string
  agencia: string
  numero: string
}

export interface ExtratoLido {
  linhas: LinhaLida[]
  /** Saldo final informado no arquivo (OFX traz; CSV normalmente não) */
  saldo: { data: string; valor: number } | null
  conta?: ContaDoArquivo | null
}

const dois = (n: number) => String(n).padStart(2, '0')

/** "20261005", "2026-10-05", "05/10/2026" ou "05/10/26" → "2026-10-05" (null se não for data). */
export function lerData(t: string): string | null {
  const s = t.trim()
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s)
  if (m) return valida(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s)
  if (m) return valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return null
}

function valida(a: number, m: number, d: number) {
  if (a < 1900 || a > 2199 || m < 1 || m > 12 || d < 1 || d > new Date(a, m, 0).getDate()) return null
  return `${a}-${dois(m)}-${dois(d)}`
}

const semSaldo = (descricao: string) => !/^\s*(saldo|sdo\b|s\s*a\s*l\s*d\s*o)/i.test(descricao)

// ---------------------------------------------------------------- OFX (Itaú, Bradesco, BB, Santander, Inter, Nubank...)

export function lerOfx(texto: string): ExtratoLido {
  const tag = (bloco: string, nome: string) => new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco)?.[1]?.trim() ?? ''
  const numero = (t: string) => {
    const s = t.replace(/\s/g, '')
    // OFX usa ponto; alguns bancos mandam vírgula
    const n = Number(s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, ''))
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
  }
  const linhas: LinhaLida[] = []
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const b = m[1]
    const data = lerData(tag(b, 'DTPOSTED').slice(0, 8))
    const valor = numero(tag(b, 'TRNAMT'))
    const descricao = (tag(b, 'MEMO') || tag(b, 'NAME') || 'Sem descrição').replace(/\s+/g, ' ')
    if (!data || !Number.isFinite(valor) || valor === 0 || !semSaldo(descricao)) continue
    linhas.push({ data, valor, descricao, fitid: tag(b, 'FITID') || null })
  }
  const bal = /<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|$)/i.exec(texto)?.[1] ?? ''
  const saldoValor = numero(tag(bal, 'BALAMT'))
  const saldoData = lerData(tag(bal, 'DTASOF').slice(0, 8))
  const acct = /<(?:BANKACCTFROM|CCACCTFROM)>([\s\S]*?)(?:<\/(?:BANKACCTFROM|CCACCTFROM)>|<BANKTRANLIST>|$)/i.exec(texto)?.[1] ?? ''
  const conta = acct && tag(acct, 'ACCTID') ? { banco: tag(acct, 'BANKID'), agencia: tag(acct, 'BRANCHID'), numero: tag(acct, 'ACCTID') } : null
  return { linhas, saldo: bal && Number.isFinite(saldoValor) && saldoData ? { data: saldoData, valor: saldoValor } : null, conta }
}

const soDigitos = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '').replace(/^0+/, '')

/**
 * O arquivo é desta conta? Compara banco e agência (quando os dois lados têm) e o número da conta,
 * aceitando com ou sem dígito e número com a agência na frente (cada banco monta o OFX de um jeito).
 */
export function contaBate(cadastro: { banco_codigo?: string | null; agencia?: string | null; numero_conta?: string | null }, arq: ContaDoArquivo): 'bate' | 'nao_bate' | 'sem_dados' {
  const num = soDigitos(cadastro.numero_conta)
  if (!num) return 'sem_dados'
  const banco = soDigitos(cadastro.banco_codigo)
  if (banco && soDigitos(arq.banco) && banco !== soDigitos(arq.banco)) return 'nao_bate'
  const ag = soDigitos(cadastro.agencia)
  const agArq = soDigitos(arq.agencia)
  if (ag && agArq && !ag.startsWith(agArq) && !agArq.startsWith(ag)) return 'nao_bate'
  const n = soDigitos(arq.numero)
  const iguais = (a: string, b: string) => a === b || a === b.slice(0, -1) || (b.length >= 5 && a.endsWith(b))
  return n && (iguais(n, num) || iguais(num, n)) ? 'bate' : 'nao_bate'
}

// ---------------------------------------------------------------- CSV / planilha salva como CSV

function separarCsv(linha: string, sep: string) {
  const campos: string[] = []
  let atual = ''
  let aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else aspas = !aspas
    } else if (c === sep && !aspas) {
      campos.push(atual.trim())
      atual = ''
    } else atual += c
  }
  campos.push(atual.trim())
  return campos
}

const sem = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/**
 * CSV de extrato. Reconhece o cabeçalho pelos nomes (data, descrição/histórico, valor ou crédito/débito);
 * sem cabeçalho, usa a 1ª coluna com data, a última com número e o texto mais longo.
 */
export function lerCsv(texto: string): ExtratoLido {
  const brutas = texto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!brutas.length) return { linhas: [], saldo: null }
  const contar = (c: string) => brutas.slice(0, 10).reduce((n, l) => n + l.split(c).length - 1, 0)
  const sep = [';', '\t', ','].sort((a, b) => contar(b) - contar(a))[0]
  const tabela = brutas.map((l) => separarCsv(l, sep))

  // procura o cabeçalho nas primeiras linhas (alguns bancos põem título antes)
  let col: { data: number; desc: number; valor: number; credito: number; debito: number; id: number } | null = null
  let inicio = 0
  for (let i = 0; i < Math.min(tabela.length, 10) && !col; i++) {
    const h = tabela[i].map(sem)
    const achar = (re: RegExp) => h.findIndex((x) => re.test(x))
    const data = achar(/^data|^date|^dt\b/)
    const valor = achar(/^valor|^amount|^value|^quantia/)
    const credito = achar(/credito|entrada/)
    const debito = achar(/debito|saida/)
    if (data >= 0 && (valor >= 0 || (credito >= 0 && debito >= 0))) {
      col = { data, valor, credito, debito, desc: achar(/descri|histor|lancamento|memo|title|estabelecimento|detalhe/), id: achar(/^identificador|^id$|^fitid|documento/) }
      inicio = i + 1
    }
  }

  const linhas: LinhaLida[] = []
  for (const campos of tabela.slice(inicio)) {
    let data: string | null
    let valor: number | null
    let descricao: string
    let fitid: string | null = null
    if (col) {
      data = lerData(campos[col.data] ?? '')
      if (col.valor >= 0) valor = lerValor(campos[col.valor] ?? '')
      else {
        const c = lerValor(campos[col.credito] ?? '') ?? 0
        const d = lerValor(campos[col.debito] ?? '') ?? 0
        valor = Math.round((Math.abs(c) - Math.abs(d)) * 100) / 100
      }
      descricao = col.desc >= 0 ? (campos[col.desc] ?? '') : ''
      fitid = col.id >= 0 ? campos[col.id] || null : null
    } else {
      const iData = campos.findIndex((c) => lerData(c))
      if (iData < 0) continue
      data = lerData(campos[iData])
      const numeros = campos.map((c, i) => (i !== iData && /\d/.test(c) && /^[\s"R$+\-()\d.,]+$/.test(c) ? i : -1)).filter((i) => i >= 0)
      // o valor é o 1º número com centavos (ignora nº de documento); a coluna seguinte costuma ser o saldo
      const iValor = numeros.find((i) => /[.,]\d{2}\)?$/.test(campos[i])) ?? numeros[0] ?? -1
      valor = iValor >= 0 ? lerValor(campos[iValor].replace(/^\((.*)\)$/, '-$1')) : null
      descricao = campos.filter((_, i) => i !== iData && !numeros.includes(i)).sort((a, b) => b.length - a.length)[0] ?? ''
    }
    descricao = descricao.replace(/\s+/g, ' ').trim() || 'Sem descrição'
    if (!data || valor === null || valor === 0 || !semSaldo(descricao)) continue
    linhas.push({ data, valor, descricao, fitid })
  }
  return { linhas, saldo: null }
}

/** Escolhe o leitor pelo conteúdo do arquivo. */
export function lerExtrato(texto: string): ExtratoLido {
  return /<OFX>|<STMTTRN>|OFXHEADER/i.test(texto) ? lerOfx(texto) : lerCsv(texto)
}

/** Chave para não importar a mesma linha duas vezes quando o arquivo não traz identificador. */
export const chaveLinha = (l: Pick<LinhaLida, 'data' | 'valor' | 'descricao'>) => `${l.data}|${l.valor.toFixed(2)}|${sem(l.descricao).replace(/\s+/g, ' ')}`

// ---------------------------------------------------------------- conciliação

/** Efeito do lançamento no saldo desta conta (+ entra, − sai). */
export function valorNaConta(l: Lancamento, contaId: string) {
  if (l.tipo === 'transferencia') return l.conta_destino_id === contaId ? l.valor : -l.valor
  return l.tipo === 'receita' ? l.valor : -l.valor
}

const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000

export interface Par {
  linha: LinhaExtrato
  lanc: Lancamento
  /** true = achado agora pelo valor/data (ainda não confirmado) */
  sugerido: boolean
}

export interface Conciliacao {
  pares: Par[]
  /** Está no extrato, não está no app */
  soExtrato: LinhaExtrato[]
  /** Está no app, não apareceu no extrato */
  soApp: Lancamento[]
  ignoradas: LinhaExtrato[]
  /** Linhas de estorno e as linhas que ficaram totalmente estornadas */
  estornos: LinhaExtrato[]
}

/**
 * Casa as linhas do extrato com os lançamentos da conta.
 * Primeiro os vínculos já confirmados; depois, mesmo valor com data até `tolerancia` dias de diferença
 * (a mais próxima; empate desfeito pela descrição parecida).
 */
export function conciliar(linhas: LinhaExtrato[], lancamentos: Lancamento[], contaId: string, tolerancia = 5): Conciliacao {
  const lancs = lancamentos.filter((l) => l.conta_id === contaId || l.conta_destino_id === contaId)
  const porId = new Map(lancs.map((l) => [l.id, l]))
  const usados = new Set<string>()
  const pares: Par[] = []
  const soExtrato: LinhaExtrato[] = []
  const ignoradas = linhas.filter((l) => l.ignorada)
  const pendentes: LinhaExtrato[] = []
  // estorno: a própria linha do estorno e a original que ficou sem lançamento (estorno total)
  const estornadas = new Set(linhas.filter((l) => l.estorno_modo && l.estorno_de).map((l) => l.estorno_de!))
  const ehEstorno = (l: LinhaExtrato) => !!l.estorno_modo || (estornadas.has(l.id) && !l.lancamento_id)
  const estornos = linhas.filter((l) => !l.ignorada && ehEstorno(l))

  for (const linha of linhas) {
    if (linha.ignorada || ehEstorno(linha)) continue
    const l = linha.lancamento_id ? porId.get(linha.lancamento_id) : undefined
    if (l && !usados.has(l.id)) {
      usados.add(l.id)
      pares.push({ linha, lanc: l, sugerido: false })
    } else pendentes.push(linha)
  }

  const parecida = (a: string, b: string) => {
    const pa = new Set(sem(a).split(/\W+/).filter((p) => p.length > 2))
    return sem(b)
      .split(/\W+/)
      .some((p) => pa.has(p))
  }
  for (const linha of [...pendentes].sort((a, b) => a.data.localeCompare(b.data))) {
    const cent = Math.round(linha.valor * 100)
    const candidato = lancs
      .filter((l) => !usados.has(l.id) && Math.round(valorNaConta(l, contaId) * 100) === cent && dias(l.data, linha.data) <= tolerancia)
      .sort((a, b) => dias(a.data, linha.data) - dias(b.data, linha.data) || Number(parecida(b.descricao, linha.descricao)) - Number(parecida(a.descricao, linha.descricao)))[0]
    if (candidato) {
      usados.add(candidato.id)
      pares.push({ linha, lanc: candidato, sugerido: true })
    } else soExtrato.push(linha)
  }

  pares.sort((a, b) => a.linha.data.localeCompare(b.linha.data))
  soExtrato.sort((a, b) => a.data.localeCompare(b.data))
  // a "parte dos outros" de uma despesa compartilhada não tem linha própria no extrato
  const grupos = new Set(linhas.map((l) => l.compartilhado_id).filter(Boolean))
  const soApp = lancs.filter((l) => !usados.has(l.id) && !(l.compartilhado_id && grupos.has(l.compartilhado_id)))
  return { pares, soExtrato, soApp: soApp.sort((a, b) => a.data.localeCompare(b.data)), ignoradas, estornos }
}

/**
 * O que foi feito da última vez com uma linha de mesmo histórico: a descrição que você deu e a categoria
 * (ou a conta de destino, se virou transferência). Serve para já preencher a classificação.
 */
export function sugestaoPorHistorico(
  descricao: string,
  historico: Pick<LinhaExtrato, 'descricao' | 'lancamento_id'>[],
  lancamentos: Lancamento[],
  contaId: string,
): { descricao: string; categoria_id: string | null; transferir_para: string | null } | null {
  const alvo = sem(descricao).replace(/\s+/g, ' ').trim()
  const porId = new Map(lancamentos.map((l) => [l.id, l]))
  const achados = historico
    .filter((h) => h.lancamento_id && sem(h.descricao).replace(/\s+/g, ' ').trim() === alvo)
    .map((h) => porId.get(h.lancamento_id!))
    .filter((l): l is Lancamento => !!l)
    .sort((a, b) => b.data.localeCompare(a.data))
  const l = achados[0]
  if (!l) {
    const cat = categoriaPorDescricao(descricao, lancamentos)
    return cat ? { descricao, categoria_id: cat, transferir_para: null } : null
  }
  // transferência: a "outra" conta é o destino (se saiu daqui) ou a origem (se entrou aqui)
  if (l.tipo === 'transferencia') return { descricao: l.descricao, categoria_id: null, transferir_para: l.conta_id === contaId ? l.conta_destino_id : l.conta_id }
  return { descricao: l.descricao, categoria_id: l.categoria_id, transferir_para: null }
}

/** Categoria usada da última vez num lançamento com a mesma descrição (para já sugerir). */
export function categoriaPorDescricao(descricao: string, lancamentos: Lancamento[]): string | null {
  const alvo = sem(descricao).replace(/\s+/g, ' ').trim()
  const achado = [...lancamentos]
    .sort((a, b) => b.data.localeCompare(a.data))
    .find((l) => l.categoria_id && sem(l.descricao).replace(/\s+/g, ' ').trim() === alvo)
  return achado?.categoria_id ?? null
}

// ---------------------------------------------------------------- despesa compartilhada

export interface NovoLancamento {
  tipo: 'receita' | 'despesa'
  descricao: string
  valor: number
  data: string
  conta_id: string
  categoria_id: string | null
  pessoa_id: string | null
  reembolsado: boolean
  pago: true
  compartilhado_id: string
}

/**
 * Paguei o total (uma saída do extrato) e recebi a parte dos outros (entradas, ex.: vários PIX).
 * Gera os lançamentos para o saldo bater com o banco e a DRE mostrar só a minha parte:
 *  - minha parte (despesa, na categoria) → ligada à saída;
 *  - parte dos outros (despesa em nome da pessoa, já reembolsada) → fora da minha DRE;
 *  - cada reembolso (receita em nome da pessoa) → ligado à sua entrada, também fora da minha DRE.
 */
export function planoCompartilhada(o: {
  saida: LinhaExtrato
  entradas: LinhaExtrato[]
  contaId: string
  categoriaId: string | null
  descricao: string
  pessoaId: string
  grupo: string
}): { linhaId: string | null; lanc: NovoLancamento }[] {
  const cent = (v: number) => Math.round(v * 100)
  const pago = Math.abs(cent(o.saida.valor))
  const recebido = o.entradas.reduce((t, e) => t + cent(e.valor), 0)
  const minha = pago - recebido
  if (o.saida.valor >= 0) throw new Error('A despesa compartilhada parte de uma saída (valor pago).')
  if (o.entradas.some((e) => e.valor <= 0)) throw new Error('Os reembolsos precisam ser entradas.')
  if (minha < 0) throw new Error('Você recebeu mais do que pagou. Confira as entradas marcadas.')
  const base = { conta_id: o.contaId, pago: true as const, compartilhado_id: o.grupo }
  const itens: { linhaId: string | null; lanc: NovoLancamento }[] = []
  if (minha > 0)
    itens.push({ linhaId: o.saida.id, lanc: { ...base, tipo: 'despesa', descricao: o.descricao, valor: minha / 100, data: o.saida.data, categoria_id: o.categoriaId, pessoa_id: null, reembolsado: false } })
  if (recebido > 0)
    itens.push({
      linhaId: minha > 0 ? null : o.saida.id,
      lanc: { ...base, tipo: 'despesa', descricao: `${o.descricao} (parte dos outros)`, valor: recebido / 100, data: o.saida.data, categoria_id: o.categoriaId, pessoa_id: o.pessoaId, reembolsado: true },
    })
  for (const e of o.entradas)
    itens.push({ linhaId: e.id, lanc: { ...base, tipo: 'receita', descricao: `Reembolso – ${o.descricao}`, valor: e.valor, data: e.data, categoria_id: null, pessoa_id: o.pessoaId, reembolsado: false } })
  return itens
}

// ---------------------------------------------------------------- estorno

export type OriginalEstorno = { linha: LinhaExtrato; lanc?: Lancamento } | { linha?: undefined; lanc: Lancamento }

type NovoLanc = Omit<NovoLancamento, 'compartilhado_id' | 'pessoa_id' | 'reembolsado'> & { compartilhado_id?: string | null; pessoa_id?: string | null; reembolsado?: boolean }

/** Uma mudança nos lançamentos. `ligar`/`desligar` mexem no vínculo da linha do extrato. */
export type OpEstorno =
  | { op: 'criar'; lanc: NovoLanc; ligar?: string }
  | { op: 'valor'; id: string; de: number; para: number }
  | { op: 'apagar'; lanc: Lancamento; desligar?: string }
  | { op: 'religar'; linha: string; de: string; para: string }

export interface PlanoEstorno {
  modo: 'pendente' | 'novo' | 'reduziu' | 'apagou'
  /** linha do extrato estornada (se a original veio do extrato) */
  estorno_de: string | null
  /** quanto sobra do original depois do estorno */
  liquido: number
  ops: OpEstorno[]
}

const cent = (v: number) => Math.round(v * 100)
const real = (c: number) => c / 100

/**
 * Um estorno desfaz, no todo ou em parte, um pagamento (saída) ou recebimento (entrada) anterior.
 *  - original ainda não lançado: lança só o líquido (ou nada, se o estorno foi total);
 *  - original já lançado: reduz o lançamento para o líquido (ou o apaga, se o estorno foi total);
 *  - reembolso de despesa compartilhada: o reembolso e a parte dos outros diminuem e a MINHA parte aumenta
 *    (devolvi dinheiro a quem tinha pago, então a conta ficou mais cara para mim);
 *  - a própria compra compartilhada: o estorno abate primeiro da minha parte, depois da dos outros.
 * O saldo continua batendo com o banco. `grupo` são os lançamentos da mesma despesa compartilhada e
 * `vinculos` diz a qual linha do extrato cada lançamento está ligado.
 */
export function planoEstorno(o: {
  estorno: LinhaExtrato
  original: OriginalEstorno
  contaId: string
  descricao: string
  categoriaId: string | null
  grupo?: Lancamento[]
  vinculos?: Map<string, string>
}): PlanoEstorno {
  const e = Math.abs(cent(o.estorno.valor))
  const { linha, lanc } = o.original
  const sinalOriginal = linha ? Math.sign(linha.valor) : lanc!.tipo === 'receita' ? 1 : lanc!.conta_destino_id === o.contaId ? 1 : -1
  if (sinalOriginal === Math.sign(o.estorno.valor)) throw new Error('O estorno precisa ter o sinal contrário: entrada estorna um pagamento, saída estorna um recebimento.')
  const estorno_de = linha?.id ?? null
  const maior = (base: number) => {
    if (e > base) throw new Error(`O estorno (${real(e).toFixed(2)}) é maior que o valor original (${real(base).toFixed(2)}).`)
  }

  // original ainda não lançado: lança o líquido
  if (!lanc) {
    const base = Math.abs(cent(linha!.valor))
    maior(base)
    const liquido = real(base - e)
    if (liquido === 0) return { modo: 'pendente', estorno_de, liquido, ops: [] }
    return {
      modo: 'novo',
      estorno_de,
      liquido,
      ops: [{ op: 'criar', ligar: linha!.id, lanc: { tipo: linha!.valor > 0 ? 'receita' : 'despesa', descricao: o.descricao, valor: liquido, data: linha!.data, conta_id: o.contaId, categoria_id: o.categoriaId, pago: true } }],
    }
  }

  // mexe num lançamento: novo valor ou apaga (e solta a linha ligada a ele)
  const ajustar = (l: Lancamento, novo: number): OpEstorno => (novo > 0 ? { op: 'valor', id: l.id, de: l.valor, para: real(novo) } : { op: 'apagar', lanc: l, desligar: o.vinculos?.get(l.id) })
  const grupo = lanc.compartilhado_id ? (o.grupo ?? []).filter((g) => g.compartilhado_id === lanc.compartilhado_id && g.id !== lanc.id) : []
  const doGrupo = [lanc, ...grupo]
  const minha = doGrupo.find((g) => g.tipo === 'despesa' && !g.pessoa_id)
  const outros = doGrupo.find((g) => g.tipo === 'despesa' && !!g.pessoa_id)

  // reembolso de despesa compartilhada estornado (devolvi parte do PIX que recebi)
  if (lanc.compartilhado_id && lanc.tipo === 'receita' && lanc.pessoa_id) {
    const base = cent(lanc.valor)
    maior(base)
    const ops: OpEstorno[] = [ajustar(lanc, base - e)]
    let saidaSolta: string | undefined
    if (outros) {
      const op = ajustar(outros, cent(outros.valor) - e)
      if (op.op === 'apagar') saidaSolta = op.desligar
      ops.push(op)
    }
    if (minha) ops.push({ op: 'valor', id: minha.id, de: minha.valor, para: real(cent(minha.valor) + e) })
    else {
      const modelo = outros ?? lanc
      ops.push({
        op: 'criar',
        ligar: saidaSolta,
        lanc: {
          tipo: 'despesa',
          descricao: modelo.descricao.replace(/ \(parte dos outros\)$/, ''),
          valor: real(e),
          data: modelo.data,
          conta_id: modelo.conta_id,
          categoria_id: modelo.categoria_id,
          pago: true,
          compartilhado_id: lanc.compartilhado_id,
        },
      })
      // a saída fica ligada à minha parte nova (o "apagar" acima já a soltou)
      if (saidaSolta) {
        const i = ops.findIndex((x) => x.op === 'apagar' && x.lanc.id === outros!.id)
        if (i >= 0) ops[i] = { ...(ops[i] as Extract<OpEstorno, { op: 'apagar' }>), desligar: undefined }
      }
    }
    const liquido = real(base - e)
    return { modo: liquido === 0 ? 'apagou' : 'reduziu', estorno_de, liquido, ops }
  }

  // a própria compra compartilhada estornada: abate da minha parte, depois da dos outros
  if (lanc.compartilhado_id && lanc.tipo === 'despesa' && (minha || outros)) {
    const cm = minha ? cent(minha.valor) : 0
    const co = outros ? cent(outros.valor) : 0
    maior(cm + co)
    const daMinha = Math.min(e, cm)
    const dosOutros = e - daMinha
    const ops: OpEstorno[] = []
    if (minha && daMinha > 0) ops.push(ajustar(minha, cm - daMinha))
    if (outros && dosOutros > 0) ops.push(ajustar(outros, co - dosOutros))
    // se a minha parte sumiu e a saída estava ligada a ela, passa a ligar na parte dos outros que sobrou
    const apagouMinha = ops.find((x) => x.op === 'apagar' && x.lanc.id === minha?.id) as Extract<OpEstorno, { op: 'apagar' }> | undefined
    if (apagouMinha?.desligar && outros && co - dosOutros > 0) {
      apagouMinha.desligar = undefined
      ops.push({ op: 'religar', linha: o.vinculos!.get(minha!.id)!, de: minha!.id, para: outros.id })
    }
    const liquido = real(cm + co - e)
    return { modo: liquido === 0 ? 'apagou' : 'reduziu', estorno_de, liquido, ops }
  }

  // lançamento comum
  const base = cent(lanc.valor)
  maior(base)
  const liquido = real(base - e)
  const op = ajustar(lanc, base - e)
  if (op.op === 'apagar' && linha && !op.desligar) op.desligar = linha.id
  return { modo: liquido === 0 ? 'apagou' : 'reduziu', estorno_de, liquido, ops: [op] }
}
