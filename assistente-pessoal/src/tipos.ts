export type TipoConta = 'corrente' | 'poupanca' | 'investimento' | 'carteira' | 'cartao' | 'outro'
export type TipoLancamento = 'receita' | 'despesa' | 'transferencia'
export type AreaObjetivo = 'pessoal' | 'profissional' | 'financeiro' | 'saude' | 'familia' | 'estudos' | 'espiritual' | 'lazer'
export type StatusObjetivo = 'planejado' | 'andamento' | 'pausado' | 'concluido'
export type Prioridade = 'alta' | 'media' | 'baixa'

export interface Conta {
  id: string
  nome: string
  tipo: TipoConta
  instituicao: string | null
  saldo_inicial: number
  limite: number | null
  cor: string
  ativa: boolean
  ordem: number
}

export interface Categoria {
  id: string
  nome: string
  tipo: 'receita' | 'despesa'
  cor: string
  icone: string
  orcamento_mensal: number | null
  ativa: boolean
}

export interface Lancamento {
  id: string
  tipo: TipoLancamento
  descricao: string
  valor: number
  data: string
  pago: boolean
  conta_id: string
  conta_destino_id: string | null
  categoria_id: string | null
  observacao: string | null
  grupo: string | null
  parcela: number | null
  parcelas: number | null
}

export interface Meta {
  id: string
  nome: string
  descricao: string | null
  valor_alvo: number
  prazo: string | null
  cor: string
  icone: string
  concluida: boolean
  criado_em: string
}

export interface Aporte {
  id: string
  meta_id: string
  valor: number
  data: string
  observacao: string | null
}

export interface Objetivo {
  id: string
  titulo: string
  descricao: string | null
  area: AreaObjetivo
  status: StatusObjetivo
  prioridade: Prioridade
  prazo: string | null
  concluido_em: string | null
  criado_em: string
}

export interface Etapa {
  id: string
  objetivo_id: string
  titulo: string
  feita: boolean
  ordem: number
}

export const TIPOS_CONTA: { value: TipoConta; label: string }[] = [
  { value: 'corrente', label: 'Conta corrente' },
  { value: 'poupanca', label: 'Poupança' },
  { value: 'investimento', label: 'Investimentos' },
  { value: 'carteira', label: 'Dinheiro / carteira' },
  { value: 'cartao', label: 'Cartão de crédito' },
  { value: 'outro', label: 'Outro' },
]

export const AREAS: { value: AreaObjetivo; label: string }[] = [
  { value: 'pessoal', label: 'Pessoal' },
  { value: 'profissional', label: 'Profissional' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'saude', label: 'Saúde' },
  { value: 'familia', label: 'Família' },
  { value: 'estudos', label: 'Estudos' },
  { value: 'espiritual', label: 'Espiritual' },
  { value: 'lazer', label: 'Lazer' },
]

export const STATUS_OBJETIVO: { value: StatusObjetivo; label: string }[] = [
  { value: 'planejado', label: 'Planejado' },
  { value: 'andamento', label: 'Em andamento' },
  { value: 'pausado', label: 'Pausado' },
  { value: 'concluido', label: 'Concluído' },
]

export const PRIORIDADES: { value: Prioridade; label: string }[] = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Média' },
  { value: 'baixa', label: 'Baixa' },
]

export const rotuloDe = <T extends string>(lista: { value: T; label: string }[], v: T) => lista.find((o) => o.value === v)?.label ?? v
