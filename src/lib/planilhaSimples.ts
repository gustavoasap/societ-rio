// Leitura de planilhas (.xlsx e .csv) no navegador e geração de .xlsx "simples": tudo em texto,
// cabeçalho em negrito, no mesmo formato das planilhas de importação de sistemas (ex.: Conta Azul).
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

const desc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')

const esc = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function indiceColuna(ref: string) {
  const letras = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function letraColuna(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

const textoSi = (si: string) => desc([...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))

/** Lê a primeira aba de um .xlsx e devolve as linhas como texto. */
export function lerXlsx(buf: ArrayBuffer): string[][] {
  const arq = unzipSync(new Uint8Array(buf))
  const ler = (n: string) => (arq[n] ? strFromU8(arq[n]) : '')
  const compartilhadas = [...ler('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoSi(m[1]))
  // Primeira aba pelo workbook (rId) ou sheet1
  const wb = ler('xl/workbook.xml')
  const rels = ler('xl/_rels/workbook.xml.rels')
  const rid = wb.match(/<sheet [^>]*r:id="([^"]+)"/)?.[1]
  const alvo = rid ? (rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1]) : null
  const caminho = alvo ? `xl/${alvo.replace(/^\/?xl\//, '')}` : 'xl/worksheets/sheet1.xml'
  const folha = ler(caminho) || ler('xl/worksheets/sheet1.xml')
  const linhas: string[][] = []
  for (const r of folha.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const linha: string[] = []
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1]
      const tipo = attrs.match(/t="([^"]+)"/)?.[1]
      const corpo = c[2] ?? ''
      let v = ''
      if (tipo === 's') v = compartilhadas[Number(corpo.match(/<v>([^<]*)<\/v>/)?.[1] ?? -1)] ?? ''
      else if (tipo === 'inlineStr') v = textoSi(corpo)
      else v = desc(corpo.match(/<v>([^<]*)<\/v>/)?.[1] ?? '')
      const i = ref ? indiceColuna(ref) : linha.length
      linha[i] = v
    }
    linhas.push(Array.from(linha, (x) => x ?? ''))
  }
  return linhas
}

/** Lê .csv (separador ; , ou tab) como texto. */
export function lerCsvTexto(texto: string): string[][] {
  const ls = texto.split(/\r?\n/).filter((l) => l.trim())
  const sep = [';', '\t', ','].find((s) => ls.slice(0, 10).some((l) => l.split(s).length >= 2)) ?? ';'
  return ls.map((l) => {
    const r: string[] = []
    let cur = ''
    let aspas = false
    for (const ch of l) {
      if (ch === '"') aspas = !aspas
      else if (ch === sep && !aspas) {
        r.push(cur.trim())
        cur = ''
      } else cur += ch
    }
    r.push(cur.trim())
    return r
  })
}

export async function lerPlanilhaArquivo(f: File): Promise<string[][]> {
  const buf = await f.arrayBuffer()
  const zip = new Uint8Array(buf.slice(0, 2))
  if (zip[0] === 0x50 && zip[1] === 0x4b) return lerXlsx(buf)
  let texto: string
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    texto = new TextDecoder('windows-1252').decode(buf)
  }
  return lerCsvTexto(texto)
}

/** .xlsx com todas as células em texto e cabeçalho em negrito (Calibri 11), como as planilhas de importação. */
export function gerarXlsxTexto(aba: string, cabecalho: string[], linhas: string[][], larguras: number[]) {
  const sst: string[] = []
  const idx = new Map<string, number>()
  const s = (v: string) => {
    if (!idx.has(v)) {
      idx.set(v, sst.length)
      sst.push(v)
    }
    return idx.get(v)!
  }
  let usos = 0
  const linhaXml = (valores: string[], r: number, estilo: number) =>
    `<row r="${r}">${valores
      .map((v, i) => {
        if (v === '' || v === null || v === undefined) return ''
        usos++
        return `<c r="${letraColuna(i)}${r}" t="s" s="${estilo}"><v>${s(v)}</v></c>`
      })
      .join('')}</row>`
  const corpo = [linhaXml(cabecalho, 1, 1), ...linhas.map((l, i) => linhaXml(l, i + 2, 0))].join('')
  const ultima = `${letraColuna(cabecalho.length - 1)}${linhas.length + 1}`
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="true" bestFit="true"/>`).join('')
  const nomeAba = esc(aba.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="false"/><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${nomeAba}" r:id="rId3" sheetId="1"/></sheets></workbook>`,
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="0"/><fonts count="2"><font><sz val="11.0"/><color indexed="8"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font><font><name val="Calibri"/><sz val="11.0"/><b val="true"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="darkGray"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="true"/></cellXfs></styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${ultima}"/><sheetViews><sheetView workbookViewId="0" tabSelected="true"/></sheetViews><sheetFormatPr defaultRowHeight="15.0"/><cols>${cols}</cols><sheetData>${corpo}</sheetData><pageMargins bottom="0.75" footer="0.3" header="0.3" left="0.7" right="0.7" top="0.75"/></worksheet>`,
    ),
  }
  arquivos['xl/sharedStrings.xml'] = strToU8(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sst count="${usos}" uniqueCount="${sst.length}" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${sst
      .map((v) => `<si><t${/^\s|\s$|\n/.test(v) ? ' xml:space="preserve"' : ''}>${esc(v)}</t></si>`)
      .join('')}</sst>`,
  )
  return zipSync(arquivos)
}
