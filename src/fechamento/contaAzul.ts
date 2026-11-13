// Planilha de importação de clientes do Conta Azul (modelo "pessoas-clientes"): 20 colunas, tudo em texto.

export const CABECALHO_CONTA_AZUL = [
  'Nome',
  'Razão social',
  'CPF',
  'CNPJ',
  'ID estrangeiro',
  'Data de cadastro',
  'Observações',
  'Situação',
  'Código',
  'Inscrição estadual',
  'E-mail principal',
  'Telefone principal',
  'Data de nascimento / Abertura da empresa',
  'CEP',
  'UF',
  'Cidade',
  'Endereço',
  'Número',
  'Bairro',
  'Complemento',
]

export const LARGURAS_CONTA_AZUL = [
  57, 57, 4.4, 14.89, 13.75, 16.2, 45.87, 8.69, 7.12, 17.18, 39.87, 17.01, 39.22, 8.89, 3.47, 14.26, 33.66, 8.01, 19.73, 49.71,
]

export interface ClienteContaAzul {
  codigo: number
  razao_social: string
  cnpj: string | null
  email: string | null
  telefone: string | null
  endereco: string | null
  inscricao: string | null
  tipo_inscricao: string | null
  data_abertura: string | null
}

export interface EnderecoPartes {
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
  cep: string
}

/**
 * Separa o endereço da Base de Clientes (formato do Cartão CNPJ:
 * "RUA X, 249 - BOX 809 - BAIRRO - CIDADE/UF - CEP 05095-000"). Sem o padrão, vai tudo em Endereço.
 */
export function separarEndereco(texto: string | null): EnderecoPartes {
  const vazio = { logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', cep: '' }
  if (!texto?.trim()) return vazio
  let t = texto.trim()
  const r = { ...vazio }
  const cep = t.match(/-?\s*CEP\s*(\d{5})-?(\d{3})\s*$/i)
  if (cep) {
    r.cep = cep[1] + cep[2]
    t = t.slice(0, cep.index).trim()
  }
  const partes = t
    .split(/\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
  const ultima = partes[partes.length - 1] ?? ''
  const cidadeUf = ultima.match(/^(.+)\/([A-Z]{2})$/i)
  if (!cidadeUf) return { ...r, logradouro: t }
  r.cidade = cidadeUf[1].trim()
  r.uf = cidadeUf[2].toUpperCase()
  partes.pop()
  const [primeira, ...meio] = partes
  const ln = (primeira ?? '').match(/^(.*?),\s*([^,]+)$/)
  if (ln) {
    r.logradouro = ln[1].trim()
    r.numero = ln[2].trim()
  } else r.logradouro = primeira ?? ''
  if (meio.length) r.bairro = meio.pop()!
  r.complemento = meio.join(' - ')
  return r
}

const br = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const digitos = (v: string | null) => (v ?? '').replace(/\D/g, '')

/** Uma linha da planilha do Conta Azul a partir do cadastro do cliente na Base. */
export function linhaContaAzul(c: ClienteContaAzul, hojeIso: string): string[] {
  const e = separarEndereco(c.endereco)
  const ie = c.tipo_inscricao === 'estadual' || c.tipo_inscricao === 'ambas' ? digitos(c.inscricao) : ''
  return [
    c.razao_social,
    c.razao_social,
    '',
    digitos(c.cnpj),
    '',
    br(hojeIso),
    '',
    'ativado',
    String(c.codigo),
    ie,
    c.email ?? '',
    digitos(c.telefone),
    br(c.data_abertura),
    e.cep,
    e.uf,
    e.cidade,
    e.logradouro,
    e.numero,
    e.bairro,
    e.complemento,
  ]
}
