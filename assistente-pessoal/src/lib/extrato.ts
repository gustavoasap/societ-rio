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
}

export type LinhaLida = Pick<LinhaExtrato, 'data' | 'descricao' | 'valor' | 'fitid'>

export interface ExtratoLido {
  linhas: LinhaLida[]
  /** Saldo final informado no arquivo (OFX traz; CSV normalmente não) */
  saldo: { data: string; valor: number } | null
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
  return { linhas, saldo: bal && Number.isFinite(saldoValor) && saldoData ? { data: saldoData, valor: saldoValor } : null }
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

  for (const linha of linhas) {
    if (linha.ignorada) continue
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
  return { pares, soExtrato, soApp: lancs.filter((l) => !usados.has(l.id)).sort((a, b) => a.data.localeCompare(b.data)), ignoradas }
}

/** Categoria usada da última vez num lançamento com a mesma descrição (para já sugerir). */
export function categoriaPorDescricao(descricao: string, lancamentos: Lancamento[]): string | null {
  const alvo = sem(descricao).replace(/\s+/g, ' ').trim()
  const achado = [...lancamentos]
    .sort((a, b) => b.data.localeCompare(a.data))
    .find((l) => l.categoria_id && sem(l.descricao).replace(/\s+/g, ' ').trim() === alvo)
  return achado?.categoria_id ?? null
}
