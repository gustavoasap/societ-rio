// Leitor mínimo de XLSX (Office Open XML): descompacta com fflate e lê a primeira planilha.
// Funciona no navegador e no Node (testes), sem dependências com vulnerabilidades conhecidas.
import { unzipSync, strFromU8 } from 'fflate'

export type Celula = string | number | boolean | null

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodificar(s: string) {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
    return ENTIDADES[e]
  })
}

/** Junta os textos de todos os <t> (inclui rich text com vários <r>). */
function textos(xml: string) {
  let r = ''
  for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) r += decodificar(m[1])
  return r
}

function colunaParaIndice(ref: string) {
  let n = 0
  for (const c of ref.replace(/\d+/g, '')) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/** Lê a primeira planilha do arquivo como matriz de linhas × colunas. */
export function lerXlsx(dados: Uint8Array): Celula[][] {
  const zip = unzipSync(dados)
  const arquivo = (nome: string) => (zip[nome] ? strFromU8(zip[nome]) : null)

  const compartilhadas: string[] = []
  const ss = arquivo('xl/sharedStrings.xml')
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) compartilhadas.push(textos(m[1]))

  // Primeira planilha declarada no workbook
  let caminho = 'xl/worksheets/sheet1.xml'
  const wb = arquivo('xl/workbook.xml')
  const rels = arquivo('xl/_rels/workbook.xml.rels')
  const rid = wb?.match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1]
  if (rid && rels) {
    const alvo = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels.match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1]
    if (alvo) caminho = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, '')}`
  }
  const sheet = arquivo(caminho)
  if (!sheet) throw new Error('Planilha não encontrada no arquivo.')

  const linhas: Celula[][] = []
  for (const mr of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(mr[1].match(/\br="(\d+)"/)?.[1] ?? linhas.length + 1) - 1
    const linha: Celula[] = []
    const corpo = mr[2] ?? ''
    for (const mc of corpo.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = mc[1]
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
      const col = ref ? colunaParaIndice(ref) : linha.length
      const tipo = attrs.match(/\bt="([^"]+)"/)?.[1]
      const conteudo = mc[2] ?? ''
      const v = conteudo.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let valor: Celula = null
      if (tipo === 's') valor = v !== undefined ? (compartilhadas[Number(v)] ?? '') : ''
      else if (tipo === 'inlineStr') valor = textos(conteudo)
      else if (tipo === 'str' || tipo === 'e') valor = v !== undefined ? decodificar(v) : ''
      else if (tipo === 'b') valor = v === '1'
      else if (v !== undefined) valor = Number(v)
      linha[col] = valor
    }
    for (let i = 0; i < linha.length; i++) if (linha[i] === undefined) linha[i] = null
    linhas[numero] = linha
  }
  for (let i = 0; i < linhas.length; i++) if (!linhas[i]) linhas[i] = []
  return linhas
}
