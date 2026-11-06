// Gerador mínimo de planilha Excel (.xlsx) no navegador, com formatação:
// cabeçalho em destaque, moeda em R$, datas dd/mm/aaaa, filtro automático,
// cabeçalho congelado e destaque (verde/vermelho em negrito) por célula.
import { strToU8, zipSync } from 'fflate'

export type TipoColuna = 'texto' | 'moeda' | 'data' | 'numero'
export type Destaque = 'positivo' | 'negativo' | 'negrito'

export interface ColunaPlanilha {
  titulo: string
  tipo?: TipoColuna
  /** Largura aproximada em caracteres. */
  largura?: number
}

export type ValorCelula = string | number | null | undefined | { valor: string | number | null | undefined; destaque?: Destaque }

// Índices de estilo (cellXfs) definidos em styles.xml abaixo
const XF = {
  padrao: 0,
  cabecalho: 1,
  moeda: 2,
  data: 3,
  moedaPositivo: 4,
  moedaNegativo: 5,
  negrito: 6,
  moedaNegrito: 7,
  numero: 8,
  numeroNegrito: 9,
}

const esc = (s: string) =>
  s
    // caracteres de controle são inválidos em XML
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

function letraColuna(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

/** "AAAA-MM-DD" → número de série de data do Excel. */
export function serialData(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  return (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000
}

function celula(ref: string, tipo: TipoColuna, bruto: ValorCelula) {
  const obj = bruto !== null && typeof bruto === 'object' ? bruto : { valor: bruto }
  const v = obj.valor
  const d = obj.destaque
  if (v === null || v === undefined || v === '') {
    return d ? `<c r="${ref}" s="${d === 'negrito' ? XF.negrito : XF.padrao}"/>` : ''
  }
  if (tipo === 'data' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return `<c r="${ref}" s="${XF.data}"><v>${serialData(v)}</v></c>`
  if ((tipo === 'moeda' || tipo === 'numero') && typeof v === 'number' && Number.isFinite(v)) {
    const s =
      tipo === 'numero'
        ? d === 'negrito'
          ? XF.numeroNegrito
          : XF.numero
        : d === 'positivo'
          ? XF.moedaPositivo
          : d === 'negativo'
            ? XF.moedaNegativo
            : d === 'negrito'
              ? XF.moedaNegrito
              : XF.moeda
    return `<c r="${ref}" s="${s}"><v>${Math.round(v * 100) / 100}</v></c>`
  }
  const s = d === 'negrito' ? ` s="${XF.negrito}"` : ''
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;[Red]\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF15803D"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFDC2626"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E2A5A"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

/** Monta o arquivo .xlsx (uma aba). `total` vira a última linha, em negrito. */
export function gerarXlsx({ aba, colunas, linhas, total }: { aba: string; colunas: ColunaPlanilha[]; linhas: ValorCelula[][]; total?: ValorCelula[] }) {
  const tipos = colunas.map((c) => c.tipo ?? 'texto')
  const ultima = letraColuna(colunas.length - 1)
  const linhaXml = (r: number, vals: ValorCelula[], negrito = false) =>
    `<row r="${r}">${vals
      .map((v, i) => {
        const val = negrito && (v === null || typeof v !== 'object') ? { valor: v, destaque: 'negrito' as const } : v
        return celula(`${letraColuna(i)}${r}`, tipos[i], val)
      })
      .join('')}</row>`

  const cab = `<row r="1" ht="30" customHeight="1">${colunas.map((c, i) => `<c r="${letraColuna(i)}1" t="inlineStr" s="${XF.cabecalho}"><is><t>${esc(c.titulo)}</t></is></c>`).join('')}</row>`
  const corpo = linhas.map((l, i) => linhaXml(i + 2, l)).join('')
  const rodape = total ? linhaXml(linhas.length + 2, total, true) : ''
  const fimFiltro = linhas.length + 1

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${colunas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? Math.max(12, c.titulo.length + 4)}" customWidth="1"/>`).join('')}</cols>
<sheetData>${cab}${corpo}${rodape}</sheetData>
<autoFilter ref="A1:${ultima}${fimFiltro}"/>
</worksheet>`

  const nomeAba = esc(aba.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  const arquivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${nomeAba}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nomeAba.replace(/'/g, "''")}'!$A$1:$${ultima}$${fimFiltro}</definedName></definedNames>
</workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    'xl/styles.xml': strToU8(STYLES),
    'xl/worksheets/sheet1.xml': strToU8(sheet),
  }
  return zipSync(arquivos, { level: 6 })
}

export function baixarArquivo(nome: string, dados: BlobPart, tipo: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([dados], { type: tipo }))
  a.download = nome
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
