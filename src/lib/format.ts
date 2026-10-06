const digitos = (v: string) => v.replace(/\D/g, '')

export function mascaraCnpj(v: string) {
  return digitos(v)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function mascaraCpf(v: string) {
  return digitos(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraCep(v: string) {
  return digitos(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}

export function mascaraTelefone(v: string) {
  const d = digitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function formatarData(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// Dias corridos entre a data (AAAA-MM-DD) e hoje, pelo calendário local
export function diasDesde(iso: string | null | undefined, hoje = new Date()) {
  if (!iso) return null
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number)
  const inicio = Date.UTC(a, m - 1, d)
  const agora = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return Math.round((agora - inicio) / 86_400_000)
}

export function formatarMoeda(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Lê um valor digitado no padrão brasileiro ou não ("10000", "10.000", "10000.5",
 * "R$ 10.000,00", "1,5") e devolve o número. Vírgula é sempre decimal; ponto só é
 * decimal quando seguido de 1 ou 2 dígitos no final (ex.: "1500.50").
 */
export function lerNumeroBR(v: string | null | undefined): number | null {
  let s = (v ?? '').replace(/R\$|\s/g, '').replace(/[^\d.,-]/g, '')
  if (!s) return null
  if (s.includes(',')) {
    const i = s.lastIndexOf(',')
    s = s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1).replace(/[.,]/g, '')
  } else if (/\.\d{1,2}$/.test(s)) {
    const i = s.lastIndexOf('.')
    s = s.slice(0, i).replace(/\./g, '') + '.' + s.slice(i + 1)
  } else {
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  return s && Number.isFinite(n) ? n : null
}

/** Formata como moeda com R$, ponto nos milhares e sempre 2 casas decimais. */
export function moedaDigitada(v: string | null | undefined) {
  const n = lerNumeroBR(v)
  return n === null ? '' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatarNumero(v: number | null | undefined, sufixo = '') {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + sufixo
}

/** Consulta o CEP na ViaCEP e devolve o endereço em uma linha (sem número). */
export async function buscarCep(cep: string): Promise<{ endereco: string; municipio: string } | null> {
  const d = digitos(cep)
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    const j = await r.json()
    if (j.erro) return null
    const partes = [j.logradouro, j.bairro, `${j.localidade}/${j.uf}`].filter(Boolean)
    return { endereco: partes.join(', '), municipio: `${j.localidade}/${j.uf}` }
  } catch {
    return null
  }
}

/** Número da viabilidade: 3 letras + 10 números (ex.: SPN2633893093). */
export const REGEX_VIABILIDADE = /^[A-Z]{3}\d{10}$/

export function mascaraViabilidade(v: string) {
  let letras = ''
  let numeros = ''
  for (const c of v.toUpperCase()) {
    if (letras.length < 3) {
      if (/[A-Z]/.test(c)) letras += c
    } else if (/\d/.test(c) && numeros.length < 10) numeros += c
  }
  return letras + numeros
}

/** CNAE no formato 0000-0-00 (ex.: 4713-0-02). */
export function mascaraCnae(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 7)
    .replace(/^(\d{4})(\d)/, '$1-$2')
    .replace(/^(\d{4})-(\d)(\d)/, '$1-$2-$3')
}

export const REGEX_CNAE = /^\d{4}-\d-\d{2}$/

/** Extrai todos os CNAEs (7 dígitos) de um texto colado, já formatados. */
export function extrairCnaes(texto: string) {
  const achados = texto.match(/\d{4}\D?\d\D?\d{2}/g) ?? []
  return achados.map(mascaraCnae).filter((c) => REGEX_CNAE.test(c))
}

/** CNAEs secundários são guardados como texto, um por linha. */
export function listaCnaes(texto: string | null | undefined) {
  return (texto ?? '')
    .split(/\n+/)
    .map((c) => c.trim())
    .filter(Boolean)
}
