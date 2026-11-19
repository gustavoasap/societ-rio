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

  const inicio = texto.slice(0, 4000)
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
  return { clienteId: null, como: null }
}
