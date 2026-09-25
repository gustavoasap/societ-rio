// Consulta pública do CNPJ (dados abertos da Receita Federal) pela BrasilAPI, com a CNPJ.ws como alternativa.
// A consulta roda no navegador de quem cadastra: gratuita e sem chave de acesso.

import type { RegimeAtual } from './engine/tipos'
import type { Anexo } from './engine/tabelas'

export interface RegimeDoAno {
  ano: number
  forma: string // LUCRO REAL, LUCRO PRESUMIDO, LUCRO ARBITRADO, IMUNE, ISENTA...
}

export interface DadosCnpj {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  matriz: boolean
  situacao: string // ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA
  abertura: string | null // AAAA-MM-DD
  uf: string
  municipio: string
  cnae: string // 4789-0/99
  cnaeDescricao: string
  naturezaJuridica: string
  porte: string
  simples: { optante: boolean; desde: string | null; excluidoEm: string | null } | null // null = informação indisponível
  mei: { optante: boolean; desde: string | null; excluidoEm: string | null } | null
  regimes: RegimeDoAno[] // declarados pela empresa (ECF), quando a fonte traz
  fonte: string
}

const digitos = (v: string) => v.replace(/\D/g, '')

/** Dígitos verificadores do CNPJ (IN RFB 2.119/2022, Anexo XV). */
export function cnpjValido(v: string) {
  const c = digitos(v)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = [...base].reduce((s, d, i) => s + Number(d) * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(c.slice(0, 12))
  const d2 = dv(c.slice(0, 12) + d1)
  return c.endsWith(`${d1}${d2}`)
}

export const formatarCnae = (v: string | number | null | undefined) => {
  const d = digitos(String(v ?? '')).padStart(7, '0')
  return d === '0000000' ? '' : `${d.slice(0, 4)}-${d.slice(4, 5)}/${d.slice(5, 7)}`
}

const data = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)
const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const simNao = (v: unknown) => (typeof v === 'boolean' ? v : typeof v === 'string' ? /^s/i.test(v) : null)

type Obj = Record<string, unknown>

/** Resposta da BrasilAPI (/api/cnpj/v1). */
export function deBrasilApi(r: Obj): DadosCnpj {
  const simples = simNao(r.opcao_pelo_simples)
  const mei = simNao(r.opcao_pelo_mei)
  const regimes = Array.isArray(r.regime_tributario)
    ? (r.regime_tributario as Obj[]).map((x) => ({ ano: Number(x.ano), forma: texto(x.forma_de_tributacao).toUpperCase() })).filter((x) => x.ano && x.forma)
    : []
  return {
    cnpj: digitos(texto(r.cnpj)),
    razaoSocial: texto(r.razao_social),
    nomeFantasia: texto(r.nome_fantasia),
    matriz: Number(r.identificador_matriz_filial) !== 2,
    situacao: texto(r.descricao_situacao_cadastral).toUpperCase(),
    abertura: data(r.data_inicio_atividade),
    uf: texto(r.uf).toUpperCase(),
    municipio: texto(r.municipio),
    cnae: formatarCnae(r.cnae_fiscal as number),
    cnaeDescricao: texto(r.cnae_fiscal_descricao),
    naturezaJuridica: texto(r.natureza_juridica),
    porte: texto(r.porte),
    simples: simples === null ? null : { optante: simples, desde: data(r.data_opcao_pelo_simples), excluidoEm: data(r.data_exclusao_do_simples) },
    mei: mei === null ? null : { optante: mei, desde: data(r.data_opcao_pelo_mei), excluidoEm: data(r.data_exclusao_do_mei) },
    regimes: regimes.sort((a, b) => a.ano - b.ano),
    fonte: 'BrasilAPI (dados abertos da Receita Federal)',
  }
}

/** Resposta da CNPJ.ws pública (/cnpj). */
export function deCnpjWs(r: Obj): DadosCnpj {
  const e = (r.estabelecimento ?? {}) as Obj
  const s = (r.simples ?? null) as Obj | null
  const cidade = (e.cidade ?? {}) as Obj
  const estado = (e.estado ?? {}) as Obj
  const atividade = (e.atividade_principal ?? {}) as Obj
  const natureza = (r.natureza_juridica ?? {}) as Obj
  const porte = (r.porte ?? {}) as Obj
  return {
    cnpj: digitos(texto(e.cnpj)),
    razaoSocial: texto(r.razao_social),
    nomeFantasia: texto(e.nome_fantasia),
    matriz: !/filial/i.test(texto(e.tipo)),
    situacao: texto(e.situacao_cadastral).toUpperCase(),
    abertura: data(e.data_inicio_atividade),
    uf: texto(estado.sigla).toUpperCase(),
    municipio: texto(cidade.nome).toUpperCase(),
    cnae: formatarCnae(texto(atividade.subclasse) || texto(atividade.id)),
    cnaeDescricao: texto(atividade.descricao),
    naturezaJuridica: texto(natureza.descricao),
    porte: texto(porte.descricao),
    simples: s ? { optante: simNao(s.simples) === true, desde: data(s.data_opcao_simples), excluidoEm: data(s.data_exclusao_simples) } : { optante: false, desde: null, excluidoEm: null },
    mei: s ? { optante: simNao(s.mei) === true, desde: data(s.data_opcao_mei), excluidoEm: data(s.data_exclusao_mei) } : { optante: false, desde: null, excluidoEm: null },
    regimes: [],
    fonte: 'CNPJ.ws (dados abertos da Receita Federal)',
  }
}

async function buscarJson(url: string, sinal?: AbortSignal): Promise<{ status: number; corpo: Obj | null }> {
  const r = await fetch(url, { signal: sinal, headers: { Accept: 'application/json' } })
  let corpo: Obj | null = null
  try {
    corpo = (await r.json()) as Obj
  } catch {
    corpo = null
  }
  return { status: r.status, corpo }
}

export class CnpjNaoEncontrado extends Error {}

/** Consulta o CNPJ na BrasilAPI e, se ela falhar, na CNPJ.ws. */
export async function consultarCnpj(cnpj: string, sinal?: AbortSignal): Promise<DadosCnpj> {
  const c = digitos(cnpj)
  if (!cnpjValido(c)) throw new Error('CNPJ inválido (confira os dígitos verificadores).')
  const falhas: string[] = []
  try {
    const r = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${c}`, sinal)
    if (r.status === 200 && r.corpo) return deBrasilApi(r.corpo)
    if (r.status === 404) throw new CnpjNaoEncontrado('CNPJ não encontrado na base da Receita Federal.')
    falhas.push(`BrasilAPI respondeu ${r.status}`)
  } catch (e) {
    if (e instanceof CnpjNaoEncontrado || (e as Error).name === 'AbortError') throw e
    falhas.push('BrasilAPI indisponível')
  }
  try {
    const r = await buscarJson(`https://publica.cnpj.ws/cnpj/${c}`, sinal)
    if (r.status === 200 && r.corpo) return deCnpjWs(r.corpo)
    if (r.status === 404) throw new CnpjNaoEncontrado('CNPJ não encontrado na base da Receita Federal.')
    falhas.push(r.status === 429 ? 'CNPJ.ws: limite de consultas por minuto atingido' : `CNPJ.ws respondeu ${r.status}`)
  } catch (e) {
    if (e instanceof CnpjNaoEncontrado || (e as Error).name === 'AbortError') throw e
    falhas.push('CNPJ.ws indisponível')
  }
  throw new Error(`Não foi possível consultar o CNPJ agora (${falhas.join('; ')}). Tente de novo em instantes ou preencha manualmente.`)
}

/**
 * Regime sugerido: optante do Simples (ou MEI) sem exclusão → Simples; senão o último regime declarado na ECF
 * (Lucro Real/Presumido), quando a fonte traz. null = não dá para saber pelos dados públicos.
 */
export function regimeSugerido(d: DadosCnpj): RegimeAtual | null {
  if (d.simples?.optante || d.mei?.optante) return 'simples'
  const ultimo = d.regimes[d.regimes.length - 1]
  if (ultimo && /REAL/.test(ultimo.forma)) return 'real'
  if (ultimo && /PRESUMIDO|ARBITRADO/.test(ultimo.forma)) return 'presumido'
  return null
}

/** Anexo do Simples para mercadorias pela divisão do CNAE: indústria (10 a 33) → Anexo II; comércio → Anexo I. */
export function anexoSugerido(cnae: string): Anexo | null {
  const divisao = Number(digitos(cnae).slice(0, 2))
  if (!divisao) return null
  if (divisao >= 10 && divisao <= 33) return 'II'
  if (divisao >= 45 && divisao <= 47) return 'I'
  return null
}
