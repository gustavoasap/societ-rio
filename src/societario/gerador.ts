// Monta o texto do objeto social (contrato social ou alteração) a partir das
// descrições oficiais das subclasses CNAE.

export type Finalidade = 'constituicao' | 'alteracao'

export interface OpcoesObjeto {
  finalidade: Finalidade
  caracteresEspeciais: boolean
  acentos: boolean
  caixaAlta: boolean
  agrupar: boolean
}

export interface AtividadeCnae {
  codigo: string // 7 dígitos
  descricao: string
}

export const OPCOES_PADRAO: OpcoesObjeto = { finalidade: 'constituicao', caracteresEspeciais: true, acentos: true, caixaAlta: false, agrupar: true }

export function formatarCnae(codigo: string) {
  const c = codigo.replace(/\D/g, '')
  return c.length === 7 ? `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5, 7)}` : codigo
}

// Aceita 4711-3/02, 4711302, 47.11-3-02, um por linha ou separados por vírgula, ponto e vírgula ou espaço
export function extrairCodigos(texto: string): { codigos: string[]; invalidos: string[] } {
  const codigos: string[] = []
  const invalidos: string[] = []
  for (const trecho of texto.match(/\d[\d.\-/]*\d|\d/g) ?? []) {
    const digitos = trecho.replace(/\D/g, '')
    if (digitos.length === 7) {
      if (!codigos.includes(digitos)) codigos.push(digitos)
    } else invalidos.push(trecho)
  }
  return { codigos, invalidos }
}

const minusculaInicial = (s: string) => (/^[A-ZÀ-Ú][a-zà-ú]/.test(s) ? s.charAt(0).toLocaleLowerCase('pt-BR') + s.slice(1) : s)

// Prepara a descrição de uma atividade para entrar no texto corrido
function prepararAtividade(descricao: string, especiais: boolean) {
  let t = descricao.trim().replace(/\s+/g, ' ').replace(/[.;]+$/, '')
  t = minusculaInicial(t)
  if (!especiais) t = semEspeciais(t)
  return t
}

// Deixa só letras (com acento), números, espaço, vírgula e ponto
function semEspeciais(t: string) {
  return t
    .replace(/\s+[-–—]\s+([A-Z][A-Z.]+)(?=$|[\s,;])|\s*\(([A-Z][A-Z.]+)\)/g, (_, a, b) => ` ${a ?? b}`)
    .replace(/\s*\(([^)]*)\)/g, ', $1,')
    .replace(/\s+[-–—]\s+|\s*[;:]\s*/g, ', ')
    .replace(/\be\/ou\b/gi, 'e')
    .replace(/\//g, ' e ')
    .replace(/(\p{L})-(\p{L})/gu, '$1 $2')
    .replace(/[^\p{L}\p{N}\s,.]/gu, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/,(?=\S)/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')
}

// Tira "atividades de" / "outras atividades de" do começo, porque o texto já diz "atividades de"
function semAtividadesNoInicio(t: string) {
  return t.replace(/^(outras\s+)?atividades?\s+de\s+/i, '')
}

// Junta atividades com o mesmo começo ("comércio varejista de", "fabricação de" ...)
// quando o complemento é simples (sem vírgula, parênteses ou travessão)
function agruparAtividades(itens: string[]) {
  const prefixoDe = (t: string) => {
    const m = t.match(/^((?:\S+\s+){0,4}?de)\s+(.+)$/)
    if (!m || /[,()\-–;]/.test(m[2]) || /[,()]/.test(m[1])) return null
    return { prefixo: m[1], resto: m[2] }
  }
  const grupos: { prefixo: string | null; partes: string[] }[] = []
  for (const t of itens) {
    const p = prefixoDe(t)
    const existente = p && grupos.find((g) => g.prefixo === p.prefixo)
    if (p && existente) existente.partes.push(p.resto)
    else if (p) grupos.push({ prefixo: p.prefixo, partes: [p.resto] })
    else grupos.push({ prefixo: null, partes: [t] })
  }
  return grupos.map((g) => {
    if (!g.prefixo) return g.partes[0]
    if (g.partes.length === 1) return `${g.prefixo} ${g.partes[0]}`
    const deMais = g.partes.slice(1).map((r) => `de ${r}`)
    return `${g.prefixo} ${juntar([g.partes[0], ...deMais], ', ', ' e ')}`
  })
}

// Tira acentos, til e cedilha (ç vira c)
export const semAcentos = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')

function juntar(itens: string[], separador: string, ultimo: string) {
  if (itens.length <= 1) return itens.join('')
  return itens.slice(0, -1).join(separador) + ultimo + itens[itens.length - 1]
}

export function gerarObjetoSocial(atividades: AtividadeCnae[], opcoes: OpcoesObjeto): string {
  const esp = opcoes.caracteresEspeciais
  let itens = atividades.map((a) => prepararAtividade(a.descricao, esp)).filter(Boolean)
  if (itens.length === 0) return ''
  if (opcoes.agrupar) itens = agruparAtividades(itens)

  const verbo = opcoes.finalidade === 'alteracao' ? 'passa a ter' : 'tem'
  let texto: string
  if (esp) {
    const lista = itens.length === 1 ? itens[0] : juntar(itens, '; ', '; e ')
    texto = `A sociedade ${verbo} por objeto social o exercício ${itens.length === 1 ? 'da seguinte atividade' : 'das seguintes atividades'}: ${lista}.`
  } else {
    const lista = juntar(itens.map(semAtividadesNoInicio), ', ', ' e ')
    texto = `A sociedade ${verbo} por objeto social o exercício das atividades de ${lista}.`
    texto = semEspeciais(texto) + '.'
    texto = texto.replace(/\.\.+$/, '.')
  }
  if (!opcoes.acentos) texto = semAcentos(texto)
  return opcoes.caixaAlta ? texto.toLocaleUpperCase('pt-BR') : texto
}
