// Leitura de extrato bancário (OFX ou CSV) e sugestão automática de qual honorário cada crédito paga.
import type { Linha } from './calculo'

export interface Lancamento {
  /** Identificação única do lançamento (FITID do OFX ou data+valor+descrição) */
  id: string
  data: string
  valor: number
  descricao: string
}

const tag = (bloco: string, nome: string) => {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  return m ? m[1].trim() : ''
}

/** OFX (padrão dos bancos brasileiros): um <STMTTRN> por lançamento. */
export function lerOfx(texto: string): Lancamento[] {
  const conta = tag(texto, 'ACCTID')
  return texto
    .split(/<STMTTRN>/i)
    .slice(1)
    .map((b) => {
      const dt = tag(b, 'DTPOSTED').replace(/\D/g, '').slice(0, 8)
      const valor = Number(tag(b, 'TRNAMT').replace(',', '.'))
      const descricao = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).join(' - ')
      const data = dt.length === 8 ? `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6)}` : ''
      const fitid = tag(b, 'FITID')
      return { id: fitid ? `ofx:${conta}:${fitid}` : `ofx:${data}|${valor}|${descricao}`, data, valor, descricao }
    })
    .filter((l) => l.data && Number.isFinite(l.valor))
}

function numeroBR(v: string) {
  let t = v.replace(/[R$\s]/g, '')
  let neg = false
  if (/^\(.*\)$/.test(t)) {
    neg = true
    t = t.slice(1, -1)
  }
  if (/[CD]$/i.test(t)) {
    neg = /D$/i.test(t)
    t = t.slice(0, -1)
  }
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) && t !== '' ? (neg ? -Math.abs(n) : n) : null
}

function dataBR(v: string) {
  const t = v.trim()
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{2,4})/)
  if (br) return `${br[3].length === 2 ? `20${br[3]}` : br[3]}-${br[2]}-${br[1]}`
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
}

function dividir(linha: string, sep: string) {
  const r: string[] = []
  let cur = ''
  let aspas = false
  for (const ch of linha) {
    if (ch === '"') aspas = !aspas
    else if (ch === sep && !aspas) {
      r.push(cur)
      cur = ''
    } else cur += ch
  }
  r.push(cur)
  return r.map((x) => x.trim())
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** CSV exportado do banco: procura as colunas de data, descrição e valor (ou crédito/débito). */
export function lerCsv(texto: string): Lancamento[] {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  if (!linhas.length) return []
  const sep = [';', '\t', ','].find((s) => linhas.slice(0, 15).some((l) => l.split(s).length >= 3)) ?? ';'
  const iCab = linhas.findIndex((l) => {
    const c = dividir(semAcento(l), sep)
    return c.some((x) => x.startsWith('data')) && c.some((x) => /valor|credito|entrada/.test(x))
  })
  if (iCab < 0) return []
  const cab = dividir(semAcento(linhas[iCab]), sep)
  const iData = cab.findIndex((x) => x.startsWith('data'))
  const iDesc = cab.findIndex((x) => /descri|historico|lancamento|detalhe|memo/.test(x))
  const iCred = cab.findIndex((x) => /credito|entrada/.test(x))
  const iValor = cab.findIndex((x) => /^valor/.test(x))
  const iDoc = cab.findIndex((x) => /documento|identifica/.test(x))
  return linhas
    .slice(iCab + 1)
    .map((l) => {
      const c = dividir(l, sep)
      const data = dataBR(c[iData] ?? '')
      const valor = numeroBR((iCred >= 0 && c[iCred] ? c[iCred] : c[iValor]) ?? '')
      const descricao = [iDesc >= 0 ? c[iDesc] : '', iDoc >= 0 ? c[iDoc] : ''].filter(Boolean).join(' - ')
      return data && valor !== null ? { id: `csv:${data}|${valor}|${descricao}`, data, valor, descricao } : null
    })
    .filter((l): l is Lancamento => !!l)
}

export function lerExtrato(nome: string, texto: string) {
  return /\.ofx$/i.test(nome) || /<OFX>/i.test(texto) ? lerOfx(texto) : lerCsv(texto)
}

/** Lê o arquivo como UTF-8; se não for, como Windows-1252 (padrão de muitos bancos). */
export function decodificar(buf: ArrayBuffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

// Palavras que aparecem em muitos nomes e não identificam ninguém
const GENERICAS = new Set(
  'LTDA ME EPP EIRELI SA SLU SS MEI COMERCIO COMERCIAL SERVICOS SERVICO VENDAS ONLINE DIGITAL DIGITAIS ECOMMERCE COMMERCE STORE SHOP LOJA NEGOCIOS GROUP GRUPO ADMINISTRACAO IMPORTACAO EXPORTACAO PRODUTOS DE DA DO DAS DOS E EM PIX TED DOC TRANSF TRANSFERENCIA RECEBIDO RECEBIDA RECEBIMENTO CREDITO PAGAMENTO'.split(
    ' ',
  ),
)

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

const palavras = (s: string) => normalizar(s).split(' ').filter(Boolean)

/** O nome aparece na descrição? Empresa: todas as palavras que identificam; pessoa: primeiro e último nome. */
export function nomeNaDescricao(nome: string | null, descricao: string, pessoa = false) {
  if (!nome) return false
  const desc = new Set(palavras(descricao))
  const p = palavras(nome).filter((x) => x.length >= 3 && !GENERICAS.has(x))
  if (!p.length) return false
  if (pessoa) return p.length >= 2 && desc.has(p[0]) && desc.has(p[p.length - 1])
  return p.every((x) => desc.has(x))
}

export function cnpjNaDescricao(cnpj: string | null, descricao: string) {
  return !!cnpj && cnpj.length === 14 && descricao.replace(/\D/g, '').includes(cnpj)
}

export type Confianca = 'alta' | 'media' | 'baixa'

export interface Sugestao {
  lancamento: Lancamento
  /** chaveMensal do honorário sugerido */
  chave: string | null
  confianca: Confianca | null
  motivo: string
}

const chaveDe = (l: Linha) => `${l.cliente.id}|${l.competencia}`

/**
 * Para cada crédito do extrato, sugere o honorário em aberto que ele paga:
 * - alta: cliente identificado (CNPJ ou nome) e valor igual ao honorário em aberto
 * - média: cliente identificado, mas valor diferente (confira)
 * - baixa: só o valor bate e com um único cliente (confira)
 */
export function sugerir(lancamentos: Lancamento[], abertos: Linha[], usados: Set<string>): Sugestao[] {
  const reservados = new Set<string>()
  const ord = [...abertos].sort((a, b) => a.competencia.localeCompare(b.competencia))
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.005
  return lancamentos.map((lanc) => {
    if (lanc.valor <= 0) return { lancamento: lanc, chave: null, confianca: null, motivo: 'Débito' }
    if (usados.has(lanc.id)) return { lancamento: lanc, chave: null, confianca: null, motivo: 'Já importado antes' }
    const livres = ord.filter((l) => !reservados.has(chaveDe(l)))
    const doCliente = livres.filter(
      (l) =>
        cnpjNaDescricao(l.cliente.cnpj, lanc.descricao) ||
        nomeNaDescricao(l.cliente.razao_social, lanc.descricao) ||
        nomeNaDescricao(l.cliente.nome_fantasia, lanc.descricao) ||
        nomeNaDescricao(l.cliente.responsavel, lanc.descricao, true),
    )
    let escolhida: Linha | undefined
    let confianca: Confianca | null = null
    let motivo = 'Nenhum honorário em aberto encontrado'
    if (doCliente.length) {
      escolhida = doCliente.find((l) => igual(l.aberto, lanc.valor))
      if (escolhida) {
        confianca = 'alta'
        motivo = 'Cliente e valor conferem'
      } else {
        escolhida = doCliente[0]
        confianca = 'media'
        motivo = 'Cliente identificado, valor diferente'
      }
    } else {
      const porValor = livres.filter((l) => igual(l.aberto, lanc.valor))
      if (porValor.length && new Set(porValor.map((l) => l.cliente.id)).size === 1) {
        escolhida = porValor[0]
        confianca = 'baixa'
        motivo = 'Só o valor confere'
      }
    }
    if (escolhida) reservados.add(chaveDe(escolhida))
    return { lancamento: lanc, chave: escolhida ? chaveDe(escolhida) : null, confianca, motivo }
  })
}
