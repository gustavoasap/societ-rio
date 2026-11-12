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
export type Nivel = 'ok' | 'erro' | 'advertencia' | 'info'

export interface ClienteRef {
  id: string
  codigo: number
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  responsavel: string | null
  status: string
}

export interface Sugestao {
  lancamento: Lancamento
  /** Cliente identificado na descrição (inclusive inativo) */
  cliente: ClienteRef | null
  /** chaveMensal do honorário sugerido */
  chave: string | null
  confianca: Confianca | null
  nivel: Nivel
  motivo: string
  /** Crédito veio com a tarifa do boleto descontada (o honorário é dado como recebido integralmente) */
  tarifa: number
}

const chaveDe = (l: Linha) => `${l.cliente.id}|${l.competencia}`

/** Cliente citado na descrição do crédito: CNPJ primeiro, depois razão social, nome fantasia e responsável. */
export function identificarCliente(descricao: string, clientes: ClienteRef[]): ClienteRef | null {
  return (
    clientes.find((c) => cnpjNaDescricao(c.cnpj, descricao)) ??
    clientes.find((c) => nomeNaDescricao(c.razao_social, descricao)) ??
    clientes.find((c) => nomeNaDescricao(c.nome_fantasia, descricao)) ??
    clientes.find((c) => nomeNaDescricao(c.responsavel, descricao, true)) ??
    null
  )
}

/**
 * Conciliação do extrato: para cada crédito, identifica o cliente e o honorário em aberto que ele paga.
 * - ok: cliente e valor conferem com um honorário em aberto
 * - advertência: valor diferente, cliente sem honorário em aberto, pagador só sugerido pelo valor ou não encontrado
 * - erro: cliente inativo ou sem honorário cadastrado
 */
export function sugerir(
  lancamentos: Lancamento[],
  abertos: Linha[],
  usados: Set<string>,
  clientes: ClienteRef[] = [],
  comHonorario?: Set<string>,
  tarifaBoleto = 0,
): Sugestao[] {
  const reservados = new Set<string>()
  const ord = [...abertos].sort((a, b) => a.competencia.localeCompare(b.competencia))
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.005
  // Valor do crédito confere com o honorário em aberto: exato ou com a tarifa do boleto descontada
  const confere = (aberto: number, credito: number) => igual(aberto, credito) || (tarifaBoleto > 0 && igual(aberto - tarifaBoleto, credito))
  const tarifaDe = (aberto: number, credito: number) => (igual(aberto, credito) ? 0 : tarifaBoleto)
  const todos = clientes.length ? clientes : [...new Map(abertos.map((l) => [l.cliente.id, { ...l.cliente } as ClienteRef])).values()]
  return lancamentos.map((lanc): Sugestao => {
    const base = { lancamento: lanc, cliente: null, chave: null, confianca: null, tarifa: 0 }
    if (lanc.valor <= 0) return { ...base, nivel: 'info', motivo: 'Débito' }
    if (usados.has(lanc.id)) return { ...base, nivel: 'info', motivo: 'Já importado antes' }
    const livres = ord.filter((l) => !reservados.has(chaveDe(l)))
    const cli = identificarCliente(lanc.descricao, todos)
    const fim = (s: Omit<Sugestao, 'lancamento' | 'tarifa'> & { tarifa?: number }): Sugestao => {
      if (s.chave) reservados.add(s.chave)
      return { lancamento: lanc, tarifa: 0, ...s }
    }
    if (cli) {
      if (cli.status === 'encerrado') return fim({ cliente: cli, chave: null, confianca: null, nivel: 'erro', motivo: 'Cliente inativo na base (encerrado)' })
      // Prioriza o honorário do mês do crédito; depois os mais antigos em aberto
      const mesCredito = lanc.data.slice(0, 7)
      const doCliente = livres
        .filter((l) => l.cliente.id === cli.id)
        .sort((a, b) => Number(b.competencia === mesCredito) - Number(a.competencia === mesCredito) || a.competencia.localeCompare(b.competencia))
      const exato = doCliente.find((l) => confere(l.aberto, lanc.valor))
      if (exato) {
        const tarifa = tarifaDe(exato.aberto, lanc.valor)
        return fim({
          cliente: cli,
          chave: chaveDe(exato),
          confianca: 'alta',
          nivel: 'ok',
          motivo: tarifa
            ? `Cliente e valor conferem (descontada a tarifa do boleto de ${tarifa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
            : 'Cliente e valor conferem',
          tarifa,
        })
      }
      if (doCliente.length)
        return fim({
          cliente: cli,
          chave: chaveDe(doCliente[0]),
          confianca: 'media',
          nivel: 'advertencia',
          motivo: `Valor diferente do honorário em aberto (${doCliente[0].aberto.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
        })
      if (comHonorario && !comHonorario.has(cli.id))
        return fim({ cliente: cli, chave: null, confianca: null, nivel: 'erro', motivo: 'Cliente sem honorário cadastrado na base' })
      return fim({
        cliente: cli,
        chave: null,
        confianca: null,
        nivel: 'advertencia',
        motivo: 'Cliente sem honorário em aberto (pagamento em duplicidade ou adiantado?)',
      })
    }
    const porValor = livres
      .filter((l) => confere(l.aberto, lanc.valor))
      .sort((a, b) => Number(b.competencia === lanc.data.slice(0, 7)) - Number(a.competencia === lanc.data.slice(0, 7)))
    if (porValor.length && new Set(porValor.map((l) => l.cliente.id)).size === 1)
      return fim({
        cliente: null,
        chave: chaveDe(porValor[0]),
        confianca: 'baixa',
        nivel: 'advertencia',
        motivo: 'Pagador não identificado; sugerido só pelo valor',
        tarifa: tarifaDe(porValor[0].aberto, lanc.valor),
      })
    return fim({ cliente: null, chave: null, confianca: null, nivel: 'advertencia', motivo: 'Pagador não encontrado na base de clientes' })
  })
}

/** Honorários vencidos dentro do período do extrato que não tiveram crédito correspondente. */
export function vencidosSemCredito(abertos: Linha[], sugestoes: Sugestao[], de: string, ate: string, hoje: string) {
  const pagos = new Set(sugestoes.map((s) => s.chave).filter(Boolean))
  return abertos.filter((l) => l.vencimento >= de && l.vencimento <= ate && l.vencimento < hoje && !pagos.has(chaveDe(l)))
}
