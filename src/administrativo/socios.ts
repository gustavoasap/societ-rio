import { buscarCepPartes } from '../lib/format'
import type { Socio } from '../types'
import type { SocioCadastro } from './tipos'

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
export const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()

export const TIPOS_DOCUMENTO = ['RG', 'CNH', 'RNE/RNM', 'Passaporte', 'Carteira profissional', 'Outro']

/** Campos do sócio, na ordem da tela (o CPF e o nome ficam à parte). */
export const CAMPOS_SOCIO: (keyof SocioCadastro)[] = [
  'nome',
  'cpf',
  'qualificacao',
  'cep',
  'rua',
  'numero',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'cor_raca',
  'doc_tipo',
  'doc_numero',
  'doc_orgao',
]

export const socioVazio = (): SocioCadastro => ({
  nome: '',
  cpf: '',
  qualificacao: '',
  cep: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cor_raca: '',
  doc_tipo: '',
  doc_numero: '',
  doc_orgao: '',
})

export function mascaraCpfTexto(v: string | null | undefined) {
  const d = digitos(v)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v ?? '')
}

export function mascaraCepTexto(v: string | null | undefined) {
  const d = digitos(v)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (v ?? '')
}

/** Confere os dígitos verificadores do CPF. */
export function cpfValido(cpf: string) {
  const c = digitos(cpf)
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10])
}

/** Sócio do cadastro com o mesmo nome (para mostrar o CPF ao lado do quadro da Receita). */
export function socioPorNome(socios: SocioCadastro[] | null | undefined, nome: string) {
  const n = semAcento(nome)
  return (socios ?? []).find((s) => semAcento(s.nome) === n)
}

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''

/**
 * Junta sócios novos aos que já existem: o mesmo sócio (pelo CPF ou, sem CPF, pelo nome) só tem os campos
 * vazios completados — nada que já foi digitado é sobrescrito. Sócios que não existiam entram no fim.
 */
export function mesclarSocios(atuais: SocioCadastro[], novos: SocioCadastro[]): SocioCadastro[] {
  const r = atuais.map((s) => ({ ...s }))
  for (const n of novos) {
    if (vazio(n.nome) && vazio(n.cpf)) continue
    const cpf = digitos(n.cpf)
    const igual = r.find((s) => (cpf.length === 11 && digitos(s.cpf) === cpf) || (!vazio(n.nome) && semAcento(s.nome) === semAcento(n.nome)))
    if (!igual) {
      r.push({ ...socioVazio(), ...n })
      continue
    }
    for (const k of CAMPOS_SOCIO) if (vazio(igual[k]) && !vazio(n[k])) (igual as unknown as Record<string, unknown>)[k] = n[k]
  }
  return r
}

/** Separa "Rua X, 123, Apto 4, Bairro Y, Cidade/UF" em partes (melhor esforço). */
export function separarEnderecoSocio(texto: string): Partial<SocioCadastro> {
  const r: Partial<SocioCadastro> = {}
  let t = ` ${texto.replace(/\s+/g, ' ').trim()} `
  const cep = t.match(/CEP[:\s]*n?[º°.]?\s*(\d{2}\.?\d{3}\s?[-–]?\s?\d{3})/i) ?? t.match(/\b(\d{5}\s?-\s?\d{3})\b/)
  if (cep) {
    r.cep = mascaraCepTexto(cep[1])
    t = t.replace(cep[0], ' ')
  }
  // Cidade/UF: "Canoas/RS", "Canoas - RS", "Canoas (RS)", "Canoas, Estado do Rio Grande do Sul" não é tratado
  const cid = t.match(/([A-Za-zÀ-ÿ'.\s]+?)\s*(?:\/|-|–|\()\s*([A-Z]{2})\)?\s*[,.;]?\s*$/) ?? t.match(/([A-Za-zÀ-ÿ'.\s]+?)\s*(?:\/|\s-\s|\()\s*([A-Z]{2})\b\)?/)
  if (cid) {
    r.cidade = cid[1].replace(/^(munic[ií]pio|cidade)\s+de\s+/i, '').trim()
    r.uf = cid[2]
    t = t.slice(0, cid.index) + ' ' + t.slice((cid.index ?? 0) + cid[0].length)
  }
  const partes = t
    .split(/\s*,\s*|\s+-\s+|\s+–\s+/)
    .map((p) => p.trim().replace(/[.;]$/, ''))
    .filter((p) => /[0-9A-Za-zÀ-ÿ]/.test(p))
  const resto: string[] = []
  for (const p of partes) {
    const num = p.match(/^(?:n(?:[º°o]|\.\s?º|úmero)?\.?\s*)?(\d+[A-Za-z]?|s\/?n[º°]?)$/i)
    if (!r.numero && num && resto.length) {
      r.numero = num[1]
      continue
    }
    const numJunto = !r.numero && resto.length === 0 ? p.match(/^(.+?)\s*,?\s+n(?:[º°o]|\.\s?º)\.?\s*(\d+[A-Za-z]?)$/i) : null
    if (numJunto) {
      resto.push(numJunto[1])
      r.numero = numJunto[2]
      continue
    }
    if (/^bairro\b/i.test(p)) {
      r.bairro = p.replace(/^bairro\s*:?\s*/i, '')
      continue
    }
    if (/\b(apto|apartamento|ap\.|bloco|bl\.|casa\s+\d|sala|conj|conjunto|andar|lote|quadra|qd\.|fundos|box|torre|unidade)\b/i.test(p)) {
      r.complemento = r.complemento ? `${r.complemento}, ${p}` : p
      continue
    }
    resto.push(p)
  }
  if (resto[0]) r.rua = resto[0]
  if (!r.bairro && resto.length > 1) r.bairro = resto[resto.length - 1]
  return r
}

/** Sócio cadastrado num processo societário (abertura/alteração) no formato da Base. */
export function deProcesso(s: Partial<Socio>): SocioCadastro {
  const end = separarEnderecoSocio(s.endereco ?? '')
  const temRg = !vazio(s.rg)
  return {
    ...socioVazio(),
    nome: (s.nome ?? '').trim().toUpperCase(),
    cpf: mascaraCpfTexto(s.cpf),
    qualificacao: s.qualificacao ?? '',
    cep: mascaraCepTexto(s.cep) || end.cep || '',
    rua: end.rua ?? '',
    numero: s.numero || end.numero || '',
    complemento: s.complemento || end.complemento || '',
    bairro: end.bairro ?? '',
    cidade: end.cidade ?? '',
    uf: end.uf ?? '',
    cor_raca: s.cor_raca ?? '',
    doc_tipo: temRg ? 'RG' : !vazio(s.cnh) ? 'CNH' : '',
    doc_numero: temRg ? (s.rg ?? '') : (s.cnh ?? ''),
    doc_orgao: temRg ? (s.rg_orgao_emissor ?? '') : (s.cnh_orgao_emissor ?? ''),
  }
}

/** Completa rua, bairro, cidade e UF pelo CEP (só o que estiver vazio). */
export async function completarPeloCep(lista: SocioCadastro[]) {
  return Promise.all(
    lista.map(async (s) => {
      if (digitos(s.cep).length !== 8 || (s.rua && s.bairro && s.cidade && s.uf)) return s
      const e = await buscarCepPartes(s.cep ?? '')
      return e ? { ...s, rua: s.rua || e.rua, bairro: s.bairro || e.bairro, cidade: s.cidade || e.cidade, uf: s.uf || e.uf } : s
    }),
  )
}
