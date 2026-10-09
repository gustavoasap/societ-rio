export type StatusLicenciamento = 'pendente' | 'andamento' | 'concluido'
export type StatusIM = 'pendente_liberacao' | 'andamento' | 'liberada'
export type StatusTfe = 'pendente_liberacao' | 'enviada_pagamento' | 'pagamento_atrasado' | 'pagamento_concluido'

export interface ClienteBase {
  id: string
  codigo: number
  cnpj: string | null
  razao_social: string
  nome_fantasia: string | null
  status: 'pendente' | 'assinado' | 'encerrado'
  data_abertura: string | null
}

export interface Legalizacao {
  cliente_id: string
  licenciamento_status: StatusLicenciamento
  licenciamento_validade: string | null
  ie_uf: string | null
  ie_numero: string | null
  im_status: StatusIM
  im_municipio: string | null
  im_numero: string | null
  observacoes: string | null
}

export interface Tfe {
  cliente_id: string
  ano: number
  status: StatusTfe
}

type Opcao<T extends string> = { value: T; label: string; cor: string }

export const STATUS_LICENCIAMENTO: Opcao<StatusLicenciamento>[] = [
  { value: 'pendente', label: 'Pendente', cor: 'pendente' },
  { value: 'andamento', label: 'Em andamento', cor: 'andamento' },
  { value: 'concluido', label: 'Concluído', cor: 'ok' },
]

export const STATUS_IM: Opcao<StatusIM>[] = [
  { value: 'pendente_liberacao', label: 'Pendente de liberação', cor: 'pendente' },
  { value: 'andamento', label: 'Em andamento', cor: 'andamento' },
  { value: 'liberada', label: 'Liberada', cor: 'ok' },
]

export const STATUS_TFE: Opcao<StatusTfe>[] = [
  { value: 'pendente_liberacao', label: 'Pendente de liberação', cor: 'pendente' },
  { value: 'enviada_pagamento', label: 'Enviada para pagamento', cor: 'andamento' },
  { value: 'pagamento_atrasado', label: 'Pagamento atrasado', cor: 'atrasado' },
  { value: 'pagamento_concluido', label: 'Pagamento concluído', cor: 'ok' },
]

export const UFS: { sigla: string; nome: string }[] = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
]

export const legalizacaoVazia = (cliente_id: string): Legalizacao => ({
  cliente_id,
  licenciamento_status: 'pendente',
  licenciamento_validade: null,
  ie_uf: null,
  ie_numero: null,
  im_status: 'pendente_liberacao',
  im_municipio: null,
  im_numero: null,
  observacoes: null,
})

export function labelDe<T extends string>(opcoes: Opcao<T>[], v: T | null | undefined) {
  return opcoes.find((o) => o.value === v)?.label ?? '—'
}

export function corDe<T extends string>(opcoes: Opcao<T>[], v: T | null | undefined) {
  return opcoes.find((o) => o.value === v)?.cor ?? 'neutro'
}

/** Situação da validade do licenciamento em relação a hoje. */
export type SituacaoValidade = 'vencida' | 'vence_em_breve' | 'valida' | 'sem_data'

export function situacaoValidade(validade: string | null | undefined, hoje = new Date(), diasAviso = 30): SituacaoValidade {
  if (!validade) return 'sem_data'
  const [a, m, d] = validade.slice(0, 10).split('-').map(Number)
  const data = Date.UTC(a, m - 1, d)
  const base = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const dias = Math.round((data - base) / 86_400_000)
  if (dias < 0) return 'vencida'
  if (dias <= diasAviso) return 'vence_em_breve'
  return 'valida'
}

/** Anos de TFE/TFLF: do ano de abertura da empresa até o ano atual (ou só o atual, sem data de abertura). */
export function anosTfe(dataAbertura: string | null | undefined, anosSalvos: number[] = [], hoje = new Date()) {
  const atual = hoje.getFullYear()
  const abertura = dataAbertura ? Number(dataAbertura.slice(0, 4)) : atual
  const inicio = Math.min(abertura > 1989 && abertura <= atual ? abertura : atual, ...anosSalvos.filter((a) => a <= atual))
  const fim = Math.max(atual, ...anosSalvos)
  const anos: number[] = []
  for (let a = fim; a >= inicio; a--) anos.push(a)
  return anos
}
