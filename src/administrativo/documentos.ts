// Identificação de documentos enviados em lote (Contrato Social / Cartão CNPJ) e do cliente a que pertencem.
import { semAcento } from './socios'

export type TipoDocumento = 'contrato' | 'cartao'

export interface ClienteIdent {
  id: string
  codigo: number
  razao_social: string
  nome_fantasia?: string | null
  cnpj: string | null
}

export interface Identificacao {
  clienteId: string | null
  /** Como foi identificado (mostrado na conferência) */
  como: 'CNPJ' | 'Razão social' | 'Nome do arquivo' | null
}

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const GENERICAS = /\b(LTDA|EIRELI|EPP|ME|SLU|S A|SA|LIMITADA|SOCIEDADE EMPRESARIA|SOCIEDADE)\b/g
/** Só letras e números, um espaço entre palavras (para comparar nomes). */
const plano = (s: string) =>
  ` ${semAcento(s)
    .replace(/&/g, ' E ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()} `

export function tipoDocumento(texto: string): TipoDocumento {
  return /COMPROVANTE\s+DE\s+INSCRI[ÇC][ÃA]O\s+E\s+DE\s+SITUA[ÇC][ÃA]O\s+CADASTRAL/i.test(texto) ? 'cartao' : 'contrato'
}

/** CNPJs que aparecem no texto, na ordem. */
export function cnpjsDoTexto(texto: string) {
  return [...texto.matchAll(/\b\d{2}\.?\s?\d{3}\.?\s?\d{3}\s?\/?\s?\d{4}\s?-?\s?\d{2}\b/g)].map((m) => digitos(m[0])).filter((d) => d.length === 14)
}

/**
 * Descobre o cliente do documento: 1º pelo CNPJ (o primeiro do texto que existe na Base), 2º pela razão social
 * escrita no começo do documento (a mais longa que bater), 3º pelo nome do arquivo (código "007 - ..." ou razão social).
 */
export function identificarCliente(texto: string, nomeArquivo: string, clientes: ClienteIdent[]): Identificacao {
  const porCnpj = new Map(clientes.filter((c) => digitos(c.cnpj).length === 14).map((c) => [digitos(c.cnpj), c]))
  for (const c of cnpjsDoTexto(texto)) {
    const cli = porCnpj.get(c)
    if (cli) return { clienteId: cli.id, como: 'CNPJ' }
  }

  const acharNome = (alvo: string) => {
    const t = plano(alvo)
    let melhor: ClienteIdent | null = null
    let tam = 0
    for (const c of clientes) {
      const nomes = [plano(c.razao_social), plano(c.razao_social.replace(GENERICAS, ' '))]
      for (const n of nomes) {
        if (n.trim().length < 5 || !t.includes(n) || n.length <= tam) continue
        melhor = c
        tam = n.length
      }
    }
    return melhor
  }

  // Certidão autenticada: a razão social pode vir depois das capas da Junta
  const inicio = texto.slice(0, 15000)
  const porNome = acharNome(inicio)
  if (porNome) return { clienteId: porNome.id, como: 'Razão social' }

  const base = nomeArquivo.replace(/\.[a-z0-9]+$/i, '')
  const cod = base.match(/^\s*(\d{1,4})\s*[-_.]/)
  if (cod) {
    const c = clientes.find((x) => x.codigo === Number(cod[1]))
    if (c) return { clienteId: c.id, como: 'Nome do arquivo' }
  }
  const porArquivo = acharNome(base)
  if (porArquivo) return { clienteId: porArquivo.id, como: 'Nome do arquivo' }

  // Nome curto no arquivo ("Contrato - Nova Era", "Contrato Social - Adiju"): vale se for o começo da razão
  // social de um único cliente
  const resto = plano(base)
    .replace(
      /\b(CONTRATO|SOCIAL|AUTENTICADO|AUTENTICADA|CERTIDAO|INTEIRO|TEOR|ALTERACAO|CONTRATUAL|CONSOLIDACAO|CONSTITUICAO|CARTAO|CNPJ|CADASTRO|COMPROVANTE|DE|DA|DO|E|\d+[AO]?)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
  if (resto.length >= 3) {
    const candidatos = clientes.filter(
      (c) =>
        plano(c.razao_social.replace(GENERICAS, ' '))
          .trim()
          .startsWith(resto + ' ') || plano(c.razao_social.replace(GENERICAS, ' ')).trim() === resto,
    )
    if (candidatos.length === 1) return { clienteId: candidatos[0].id, como: 'Nome do arquivo' }
  }
  return { clienteId: null, como: null }
}

// ---------------------------------------------------------------------------------------------
// Dados da empresa no documento (para cadastrar um cliente que ainda não está na Base)

export interface DadosEmpresaDoc {
  cnpj: string | null
  razao_social: string | null
  nome_fantasia?: string | null
  data_abertura?: string | null
  endereco?: string | null
  situacao_cadastral?: string | null
  email?: string | null
  telefone?: string | null
}

const ACENTOS: Record<string, string> = { A: '[AÁÂÃÀ]', E: '[EÉÊ]', I: '[IÍ]', O: '[OÓÔÕ]', U: '[UÚÜ]', C: '[CÇ]' }
const rotulo = (t: string) =>
  t
    .split('')
    .map((ch) => ACENTOS[ch] ?? (/[A-Z0-9]/.test(ch) ? ch : ch === ' ' ? '\\s+' : `\\${ch}`))
    .join('')

// Rótulos do Comprovante de Inscrição e de Situação Cadastral (Cartão CNPJ), do mais longo ao mais curto
const ROTULOS_CARTAO: [string, string][] = [
  ['COMPROVANTE DE INSCRICAO E DE SITUACAO CADASTRAL', 'titulo'],
  ['CODIGO E DESCRICAO DAS ATIVIDADES ECONOMICAS SECUNDARIAS', 'secundarias'],
  ['CODIGO E DESCRICAO DA ATIVIDADE ECONOMICA PRINCIPAL', 'principal'],
  ['CODIGO E DESCRICAO DA NATUREZA JURIDICA', 'natureza'],
  ['TITULO DO ESTABELECIMENTO (NOME DE FANTASIA)', 'fantasia'],
  ['ENTE FEDERATIVO RESPONSAVEL (EFR)', 'efr'],
  ['CADASTRO NACIONAL DA PESSOA JURIDICA', 'cnpjTitulo'],
  ['REPUBLICA FEDERATIVA DO BRASIL', 'republica'],
  ['MOTIVO DE SITUACAO CADASTRAL', 'motivo'],
  ['DATA DA SITUACAO CADASTRAL', 'dataSituacao'],
  ['DATA DA SITUACAO ESPECIAL', 'dataEspecial'],
  ['SITUACAO CADASTRAL', 'situacao'],
  ['SITUACAO ESPECIAL', 'especial'],
  ['NUMERO DE INSCRICAO', 'inscricao'],
  ['ENDERECO ELETRONICO', 'email'],
  ['DATA DE ABERTURA', 'abertura'],
  ['NOME EMPRESARIAL', 'razao'],
  ['BAIRRO/DISTRITO', 'bairro'],
  ['COMPLEMENTO', 'complemento'],
  ['LOGRADOURO', 'logradouro'],
  ['MUNICIPIO', 'municipio'],
  ['TELEFONE', 'telefone'],
  ['NUMERO', 'numero'],
  ['PORTE', 'porte'],
  ['CEP', 'cep'],
  ['UF', 'uf'],
]
const RE_ROTULOS = new RegExp(
  ROTULOS_CARTAO.map(([t]) => `(?<![A-Za-zÀ-ÿ])${rotulo(t)}(?![A-Za-zÀ-ÿ])${t === 'NUMERO' ? `(?!\\s+DE\\s+INSCRI)` : ''}`).join('|'),
  'gi',
)
const chaveDoRotulo = (achado: string) => {
  const a = semAcento(achado).replace(/\s+/g, ' ')
  return ROTULOS_CARTAO.find(([t]) => t === a)?.[1] ?? null
}
const util = (v: string | undefined) => {
  const t = (v ?? '').replace(/\s+/g, ' ').trim()
  return t && !/^\*+$/.test(t) ? t : null
}
const isoDeBr = (v: string | null) => {
  const m = v?.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Lê o Cartão CNPJ (texto do PDF da Receita). Exportada para teste. */
export function lerCartaoCnpj(texto: string): DadosEmpresaDoc {
  const t = texto.replace(/\s+/g, ' ')
  const achados = [...t.matchAll(RE_ROTULOS)]
  const v: Record<string, string> = {}
  achados.forEach((m, i) => {
    const k = chaveDoRotulo(m[0])
    if (!k || v[k] !== undefined) return
    const ini = (m.index ?? 0) + m[0].length
    const fim = achados[i + 1]?.index ?? Math.min(t.length, ini + 300)
    v[k] = t.slice(ini, fim)
  })
  const cnpj = digitos(v.inscricao?.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0]) || cnpjsDoTexto(t)[0] || null
  const cepD = digitos(v.cep)
  const end = [
    [util(v.logradouro), util(v.numero)].filter(Boolean).join(', '),
    util(v.complemento),
    util(v.bairro),
    [util(v.municipio), util(v.uf)?.slice(0, 2)].filter(Boolean).join('/'),
    cepD.length === 8 ? `CEP ${cepD.slice(0, 5)}-${cepD.slice(5)}` : null,
  ]
    .filter(Boolean)
    .join(' - ')
  return {
    cnpj,
    razao_social: util(v.razao)?.toUpperCase() ?? null,
    nome_fantasia: util(v.fantasia)?.toUpperCase() ?? null,
    data_abertura: isoDeBr(util(v.abertura)),
    endereco: end || null,
    situacao_cadastral: util(v.situacao)?.split(' ')[0].toUpperCase() ?? null,
    email: util(v.email)?.toLowerCase() ?? null,
    telefone: util(v.telefone),
  }
}

/** CNPJ e razão social da empresa no Contrato Social (título e primeiras linhas). Exportada para teste. */
export function lerEmpresaDoContrato(texto: string): DadosEmpresaDoc {
  const t = texto.replace(/\s+/g, ' ').slice(0, 3000)
  const cnpjRotulado = t.match(/CNPJ(?:\/MF)?\s*(?:sob\s+)?(?:o\s+)?(?:n[º°o.]*\s*)?[:\s]*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i)
  const cnpj = digitos(cnpjRotulado?.[1]) || cnpjsDoTexto(t)[0] || null
  // Certidão de inteiro teor / requerimento da Junta: campo "NOME EMPRESARIAL"; senão, o primeiro nome em
  // MAIÚSCULAS terminado em LTDA/EIRELI/S.A./SLU
  const rotulado = t.match(/NOME\s+EMPRESARIAL\s*:?\s*([A-ZÀ-Ý0-9][A-ZÀ-Ý0-9&.,'\- ]{1,150}?\s(?:LTDA|EIRELI|S\/A|S\.A\.?|SLU)\.?)(?![A-Za-zÀ-ÿ])/)
  if (rotulado) return { cnpj: cnpj && cnpj.length === 14 ? cnpj : null, razao_social: rotulado[1].trim() }
  const m = t.match(/([A-ZÀ-Ý0-9][A-ZÀ-Ý0-9&.,'\- ]{1,150}?\s(?:LTDA|EIRELI|S\/A|S\.A\.?|SLU)\.?)(?![A-Za-zÀ-ÿ])/)
  let razao = m ? m[1] : null
  if (razao) {
    // Tira o começo do título ("ALTERAÇÃO CONTRATUAL Nº 3 DA SOCIEDADE ...", "CONSTITUIÇÃO DE SOCIEDADE LIMITADA ...")
    const cortes = [
      ...razao.matchAll(
        /\b(?:SOCIEDADE|CONTRATUAL|CONSOLIDA[ÇC][ÃA]O|CONSTITUI[ÇC][ÃA]O|CONTRATO SOCIAL|EMPRES[ÁA]RIA|LIMITADA|DENOMINADA|N[º°O]\.?\s*\d+)\b/g,
      ),
    ]
    const ult = cortes.pop()
    if (ult) razao = razao.slice((ult.index ?? 0) + ult[0].length)
    razao = razao.replace(/^[\s\-:,.]*(?:(?:DA|DE|DO)\s+)?/, '').trim()
  }
  return { cnpj: cnpj && cnpj.length === 14 ? cnpj : null, razao_social: razao && razao.length >= 4 ? razao : null }
}

// ---------------------------------------------------------------------------------------------
// Leitura do Cartão CNPJ pela posição na página: cada campo é uma caixa com o rótulo em cima e o valor
// logo abaixo (no texto corrido, caixas lado a lado saem misturadas: "LOGRADOURO NÚMERO COMPLEMENTO R X 249 BOX 1").

export interface ItemPdf {
  str: string
  x: number
  /** Coordenada do PDF (cresce para cima) */
  y: number
  /** Altura da fonte */
  h: number
  pagina: number
}

const ROTULO_POR_TEXTO = new Map(ROTULOS_CARTAO.map(([t, k]) => [t, k]))

/** Valores do Cartão CNPJ a partir dos itens de texto com posição (1ª página). Exportada para teste. */
export function lerCartaoPorPosicao(itens: ItemPdf[]): DadosEmpresaDoc | null {
  const pag = itens.filter((i) => i.pagina === 1 && i.str.trim())
  const norm = (s: string) => semAcento(s).replace(/\s+/g, ' ').trim()
  const rotulos = pag.map((i) => ({ i, k: ROTULO_POR_TEXTO.get(norm(i.str)) })).filter((r) => r.k) as { i: ItemPdf; k: string }[]
  if (rotulos.length < 5) return null
  const ehRotulo = new Set(rotulos.map((r) => r.i))
  const v: Record<string, string> = {}
  for (const { i: r, k } of rotulos) {
    if (v[k] !== undefined) continue
    // Limite à direita: o próximo rótulo na mesma linha
    const direita = rotulos.filter((o) => Math.abs(o.i.y - r.y) < 2 && o.i.x > r.x + 1).map((o) => o.i.x)
    const limite = direita.length ? Math.min(...direita) : Infinity
    const abaixo = pag
      .filter((o) => !ehRotulo.has(o) && o.y < r.y - 0.5 && o.y > r.y - (r.h * 2.6 + 8) && o.x >= r.x - 3 && o.x < limite - 1)
      .sort((a, b) => b.y - a.y || a.x - b.x)
    // Só a primeira linha de valores (atividades secundárias podem ter várias, mas não usamos)
    const linha1 = abaixo.length ? abaixo.filter((o) => Math.abs(o.y - abaixo[0].y) < 2) : []
    v[k] = linha1.map((o) => o.str).join(' ')
  }
  const cepD = digitos(v.cep)
  const end = [
    [util(v.logradouro), util(v.numero)].filter(Boolean).join(', '),
    util(v.complemento),
    util(v.bairro),
    [util(v.municipio), util(v.uf)?.slice(0, 2)].filter(Boolean).join('/'),
    cepD.length === 8 ? `CEP ${cepD.slice(0, 5)}-${cepD.slice(5)}` : null,
  ]
    .filter(Boolean)
    .join(' - ')
  const cnpj = digitos(v.inscricao?.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0]) || null
  return {
    cnpj: cnpj && cnpj.length === 14 ? cnpj : null,
    razao_social: util(v.razao)?.toUpperCase() ?? null,
    nome_fantasia: util(v.fantasia)?.toUpperCase() ?? null,
    data_abertura: isoDeBr(util(v.abertura)),
    endereco: end || null,
    situacao_cadastral: util(v.situacao)?.split(' ')[0].toUpperCase() ?? null,
    email: util(v.email)?.toLowerCase() ?? null,
    telefone: util(v.telefone),
  }
}
