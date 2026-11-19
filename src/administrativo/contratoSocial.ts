// Leitura da qualificação dos sócios no Contrato Social (PDF com texto ou Word .docx).
// A qualificação costuma vir no primeiro parágrafo: "FULANO DE TAL, brasileiro, solteiro, ..., portador da
// cédula de identidade RG nº 12.345.678-9 SSP/SP, inscrito no CPF sob nº 123.456.789-00, residente e
// domiciliado na Rua X, nº 10, Apto 2, Bairro Y, Cidade/UF, CEP 00000-000". Leitura de melhor esforço:
// o que for encontrado é sugerido e o usuário confere antes de salvar.
import { importarModulo } from '../lib/importar'
import { strFromU8, unzipSync } from 'fflate'
import type { SocioCadastro } from './tipos'
import type { ItemPdf } from './documentos'
import { cpfValido, mascaraCpfTexto, separarEnderecoSocio, socioVazio } from './socios'

const RE_CPF = /\d{3}\.?\d{3}\.?\d{3}\s?[-–]?\s?\d{2}/g
// Nome em MAIÚSCULAS (2 a 10 palavras) seguido de vírgula. Sem alternativas sobrepostas e sem /i, para não
// travar em textos longos (contratos autenticados têm páginas de carimbos sem vírgula).
const RE_NOME = /([A-ZÀ-Ý][A-ZÀ-Ý'´`.-]+(?: +[A-ZÀ-Ý][A-ZÀ-Ý'´`.-]*){1,9}) *,/g
// Alguns contratos escrevem o nome só com as iniciais maiúsculas ("Adilson Romero, brasileiro, ...")
const RE_NOME_TITULO = /([A-ZÀ-Ý][a-zà-ÿ'´`.-]+(?: +(?:d[aeo]s?|e|[A-ZÀ-Ý][a-zà-ÿ'´`.-]+)){1,8}) *,/g
// Palavras que não fazem parte do nome da pessoa
const PREFIXO_NAO_NOME =
  /^(?:(?:COM|E|DA|DE|DO|PELA|PELO|CONSOLIDA[ÇC][ÃA]O|ALTERA[ÇC][ÃA]O|CONSTITUI[ÇC][ÃA]O|CONTRATUAL|CONTRATO|SOCIAL|S[ÓO]CI[OA]S?|ADMINISTRADOR(?:A|ES)?|TITULAR|SENHOR(?:A)?|SR\.?|SRA\.?|N[º°O]\.?|\d+[ªº°]?)\s+)+/
// Órgãos emissores, siglas e documentos não são nomes ("DENATRAN RJ", "SSP SP")
const NAO_E_NOME =
  /\b(?:DETRAN|DENATRAN|SSP|SESP|SSPDS|SDS|IIRGD|IFP|IGP|DGPC|PCII|SEJUSP|POL[ÍI]CIA|CNH|RG|CPF|CNPJ|OAB|CRC|CREA|JUCESP|JUNTA|COMERCIAL|CART[ÓO]RIO|TABELI[ÃA]O|LTDA|EIRELI|ME|EPP)\b|\s(?:AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/

// Depois do nome vem a qualificação: nacionalidade, estado civil, profissão...
const RE_QUALIFICACAO =
  /^[^,]{0,60}?(?:brasileir|nacionalidade|portugu|argentin|italian|estrangeir|solteir|casad|divorciad|vi[uú]v|separad|convivente|uni[aã]o est[aá]vel|natural|nascid|maior|empres[aá]ri|comerciante)/i

/** Itens de texto do PDF com a posição na página (para ler o Cartão CNPJ). */
export async function itensDoPdf(buf: ArrayBuffer, paginas = 1): Promise<ItemPdf[]> {
  const pdfjs = await importarModulo(() => import('pdfjs-dist'))
  const worker = await importarModulo(() => import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const r: ItemPdf[] = []
  for (let p = 1; p <= Math.min(doc.numPages, paginas); p++) {
    const c = await (await doc.getPage(p)).getTextContent()
    for (const i of c.items) {
      if (!('str' in i) || !i.str.trim()) continue
      r.push({ str: i.str, x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || i.height || 8, pagina: p })
    }
  }
  return r
}

/** Texto de um PDF (com texto, não escaneado) ou de um .docx. */
export async function textoDoArquivo(arquivo: File): Promise<string> {
  const buf = await arquivo.arrayBuffer()
  const nome = arquivo.name.toLowerCase()
  if (nome.endsWith('.docx')) {
    const z = unzipSync(new Uint8Array(buf))
    const xml = z['word/document.xml'] ? strFromU8(z['word/document.xml']) : ''
    return xml
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:tab\/>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  }
  if (nome.endsWith('.pdf') || arquivo.type === 'application/pdf') {
    const pdfjs = await importarModulo(() => import('pdfjs-dist'))
    const worker = await importarModulo(() => import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
    const partes: string[] = []
    // A qualificação fica no começo do contrato; na certidão autenticada (inteiro teor) vem depois das capas da Junta
    for (let p = 1; p <= Math.min(doc.numPages, 20); p++) {
      const pag = await doc.getPage(p)
      const c = await pag.getTextContent()
      partes.push(c.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join(''))
    }
    return partes.join('\n')
  }
  throw new Error('Envie o Contrato Social em PDF ou Word (.docx).')
}

function documento(trecho: string): Pick<SocioCadastro, 'doc_tipo' | 'doc_numero' | 'doc_orgao'> {
  const m = trecho.match(
    /(carteira nacional de habilita[cç][aã]o|\bCNH\b|c[ée]dula de identidade(?:\s+profissional)?|carteira de identidade|documento de identidade|\bidentidade\b|\bR\.?G\.?\b|\bRNE\b|\bRNM\b|\bCRNM\b|passaporte)\s*(?:\(?R\.?G\.?\)?\s*)?(?:civil\s*)?(?:sob\s+)?(?:o\s+)?(?:n[º°o]?\.?\s*º?|número)?\s*[:.]?\s*([0-9][0-9A-Za-z.\-/ ]{3,18}?[0-9Xx])(?=\s*[,;)]|\s+[–-]\s|\s+(?:[óÓoO]rg[ãaÃA]o|expedid|emitid|SSP|DETRAN|SESP|SDS|PC|IFP|DIC|SEJUSP|SJS|IGP|PCII|DGPC|POLÍCIA|POLICIA|[A-Z]{2,6}\s*\/\s*[A-Z]{2}|e\s|inscrit)|\s*$)/i,
  )
  if (!m) return {}
  const rotulo = m[1].toLowerCase()
  const tipo = /habilita|cnh/.test(rotulo)
    ? 'CNH'
    : /rne|rnm|crnm/.test(rotulo)
      ? 'RNE/RNM'
      : /passaporte/.test(rotulo)
        ? 'Passaporte'
        : /profissional/.test(rotulo)
          ? 'Carteira profissional'
          : 'RG'
  const depois = trecho.slice((m.index ?? 0) + m[0].length)
  const org = depois.match(
    /^\s*[,–-]?\s*(?:(?:expedid[ao]|emitid[ao])\s+(?:em\s+\d{2}\/\d{2}\/\d{4}\s+)?(?:pel[ao]\s+)?)?(?:[óÓoO]rg[ãaÃA]o\s+(?:[eE]missor|[eE]xpedidor|EMISSOR|EXPEDIDOR)\s*:?\s*)?((?:SSP|DETRAN|SESP|SDS|PC|IFP|DIC|SEJUSP|SJS|IGP|PCII|DGPC|SSPDS|SESDC|SEDS|DPF|MRE|PF|CREA|OAB|CRC|CRM)[A-Z]*(?:\s*[/\-–]\s*[A-Z]{2})?|[A-Z]{2,6}\s*\/\s*[A-Z]{2})\b/,
  )
  return { doc_tipo: tipo, doc_numero: m[2].trim(), doc_orgao: org ? org[1].replace(/\s+/g, '').replace(/[-–]/, '/') : '' }
}

function endereco(trecho: string): Partial<SocioCadastro> {
  const m = trecho.match(
    /(?:residentes?|domiciliad[oa]s?)(?:\([oa]s?\))?\s+(?:e\s+domiciliad[oa]s?(?:\([oa]s?\))?\s+)?(?:na|no|à|a|em|ao)(?:\([oa]\))?\s+(.+?(?:CEP[:\s]*n?[º°.]?\s*\d{2}\.?\d{3}\s?-?\s?\d{3}|(?=;|\.\s|\s+e\s+[A-ZÀ-Ý]{3,}\s|$)))/i,
  )
  if (!m) return {}
  return separarEnderecoSocio(m[1].replace(/^(?:rua|avenida|av\.|alameda|travessa|estrada|rodovia|praça)/i, (x) => x))
}

/** Sócios encontrados no texto do contrato (nome, CPF, documento e endereço). Exportada para teste. */
export function extrairSocios(textoBruto: string): SocioCadastro[] {
  const texto = textoBruto
    .replace(/[ \t]/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
  // A qualificação vem antes da primeira cláusula; se não houver CPF ali, usa o texto todo
  const corte = texto.search(/CL[ÁA]USULA\s+(?:PRIMEIRA|1|I\b)/i)
  const area = corte > 0 && RE_CPF.test(texto.slice(0, corte)) ? texto.slice(0, corte) : texto
  RE_CPF.lastIndex = 0

  // CPFs válidos, cada um ancorado no rótulo "CPF" logo antes
  const cpfs: { cpf: string; pos: number }[] = []
  for (const m of area.matchAll(RE_CPF)) {
    const antes = area.slice(Math.max(0, (m.index ?? 0) - 70), m.index)
    const d = m[0].replace(/\D/g, '')
    if (!/C\.?P\.?F/i.test(antes) || !cpfValido(d) || cpfs.some((c) => c.cpf === d)) continue
    cpfs.push({ cpf: d, pos: m.index ?? 0 })
  }
  // Nomes (MAIÚSCULAS seguidas de nacionalidade/estado civil etc.)
  const nomes = [...area.matchAll(RE_NOME), ...area.matchAll(RE_NOME_TITULO)]
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .filter((m) => RE_QUALIFICACAO.test(area.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 80)))
    .map((m) => {
      // Título colado no nome (ex.: "MINUSCOLI & FREITAS LTDA GUILHERME MINUSCOLI"): fica o que vem depois do LTDA/ME/EIRELI...
      const nome = m[1].trim()
      const corteTitulo = [...nome.matchAll(/\b(?:LTDA|EIRELI|EPP|SLU|S\/A|S\.A\.?|ME|LIMITADA|CONTRATUAL|SOCIAL)\.?\s+/g)].pop()
      const limpo = corteTitulo ? nome.slice((corteTitulo.index ?? 0) + corteTitulo[0].length) : nome
      return { nome: limpo.trim(), pos: (m.index ?? 0) + (nome.length - limpo.length) }
    })
    .map((n) => {
      // Tira palavras do título que vêm grudadas antes do nome ("COM CONSOLIDAÇÃO THIAGO ...", "SÓCIO ADMINISTRADOR ANA ...")
      const nome = n.nome.toUpperCase()
      const limpo = nome.replace(PREFIXO_NAO_NOME, '')
      return { nome: limpo, pos: n.pos + (nome.length - limpo.length) }
    })
    .filter((n) => n.nome.split(' ').length >= 2 && !/^(CONTRATO|SOCIEDADE|LTDA|ALTERA|INSTRUMENTO|EMPRESA)/.test(n.nome) && !NAO_E_NOME.test(n.nome))

  const r: SocioCadastro[] = []
  cpfs.forEach((c, i) => {
    const nome = [...nomes].reverse().find((n) => n.pos < c.pos && c.pos - n.pos < 900 && (i === 0 || n.pos > cpfs[i - 1].pos))
    // CPF sem a qualificação de um sócio antes (ex.: funcionário da Junta, contador que assina): não é sócio
    if (!nome) return
    const ini = nome.pos
    const proximo = nomes.find((n) => n.pos > c.pos)
    const fim = Math.min(cpfs[i + 1]?.pos ?? area.length, proximo?.pos ?? area.length, c.pos + 700)
    const trecho = area.slice(ini, fim)
    // Qualificação escrita antes do nome ("Sócio-Administrador ADILSON ROMERO, ...")
    const antes = area.slice(Math.max(0, nome.pos - 40), nome.pos)
    const qualif = antes.match(/(S[óo]ci[oa][\s-]+Administrador[a]?|Administrador[a]?|Titular|S[óo]ci[oa])\s*:?\s*$/i)?.[1]
    r.push({
      ...socioVazio(),
      qualificacao: qualif ? qualif.replace(/\s+/g, ' ').replace(/^./, (x) => x.toUpperCase()) : '',
      nome: nome.nome,
      cpf: mascaraCpfTexto(c.cpf),
      ...documento(trecho),
      ...endereco(trecho),
    })
  })
  return r
}

/**
 * Texto do contrato pronto para achar os sócios: lê o texto do arquivo e, se não achar sócios (contrato
 * escaneado, comum na certidão autenticada), lê as páginas de imagem com OCR até encontrar a qualificação.
 */
export async function lerContratoComSocios(arquivo: File, progresso?: (m: string) => void): Promise<{ texto: string; socios: SocioCadastro[]; ocr: boolean }> {
  let texto = ''
  try {
    texto = await textoDoArquivo(arquivo)
  } catch (e) {
    if (!/\.pdf$/i.test(arquivo.name)) throw e
  }
  const socios = extrairSocios(texto)
  if (socios.length || !/\.pdf$/i.test(arquivo.name)) return { texto, socios, ocr: false }
  const { textoComOcr } = await import('./ocr')
  const comOcr = await textoComOcr(await arquivo.arrayBuffer(), {
    progresso,
    // Para quando já achou sócio e chegou nas cláusulas (a qualificação acabou)
    bastou: (t) => extrairSocios(t).length > 0 && /resolvem|CL[ÁA]USULA\s+PRIMEIRA/i.test(t),
  })
  const tudo = `${texto}\n${comOcr}`
  return { texto: tudo, socios: extrairSocios(tudo), ocr: true }
}
