export type StatusCliente = 'pendente' | 'assinado' | 'encerrado'
export type Etapa = 'pendente' | 'pdf_enviado' | 'concluida' | 'na'

export interface Cliente {
  id: string
  codigo: number
  cnpj: string | null
  razao_social: string
  nome_fantasia: string | null
  status: StatusCliente
  data_abertura: string | null
  data_assinatura: string | null
  data_encerramento: string | null
  responsavel: string | null
  email: string | null
  telefone: string | null
  parceiro_id: string | null
  regime_tributario: string | null
  segmento: string | null
  tipo_inscricao: string | null
  inscricao: string | null
  procuracao: Etapa | null
  certificado_digital: Etapa | null
  onboarding: Etapa | null
  licenciamento: Etapa | null
  makrosystem: Etapa | null
  link_drive: string | null
  observacoes: string | null
  created_at?: string
}

export interface Honorario {
  id: string
  cliente_id: string
  valor: number
  vigencia_inicio: string
  vigencia_fim: string | null
  dia_vencimento: number | null
  descricao: string | null
}

export interface Vigente {
  cliente_id: string
  valor: number
  dia_vencimento: number | null
}

export interface ParceiroResumo {
  id: string
  nome: string
}

export const STATUS_CLIENTE: { value: StatusCliente; label: string }[] = [
  { value: 'assinado', label: 'Contrato assinado' },
  { value: 'pendente', label: 'Aguardando assinatura' },
  { value: 'encerrado', label: 'Encerrado' },
]

export const COR_STATUS: Record<StatusCliente, string> = {
  assinado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pendente: 'border-amber-200 bg-amber-50 text-amber-700',
  encerrado: 'border-slate-200 bg-slate-100 text-slate-600',
}

export const REGIMES = [
  { value: 'simples', label: 'Simples Nacional' },
  { value: 'mei', label: 'MEI' },
  { value: 'presumido', label: 'Lucro Presumido' },
  { value: 'real', label: 'Lucro Real' },
  { value: 'outro', label: 'Outro' },
]

export const SEGMENTOS = [
  { value: 'comercio', label: 'Comércio' },
  { value: 'servicos', label: 'Serviços' },
  { value: 'industria', label: 'Indústria' },
  { value: 'misto', label: 'Misto' },
]

export const INSCRICOES = [
  { value: 'estadual', label: 'Estadual' },
  { value: 'municipal', label: 'Municipal' },
  { value: 'ambas', label: 'Estadual e municipal' },
]

export const ETAPAS: { campo: 'procuracao' | 'certificado_digital' | 'onboarding' | 'licenciamento' | 'makrosystem'; label: string }[] = [
  { campo: 'procuracao', label: 'Procuração' },
  { campo: 'certificado_digital', label: 'Certificado digital' },
  { campo: 'onboarding', label: 'Onboarding ASAP' },
  { campo: 'licenciamento', label: 'Licenciamento' },
  { campo: 'makrosystem', label: 'Makrosystem' },
]

export const OPCOES_ETAPA: { value: Etapa; label: string }[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'pdf_enviado', label: 'PDF enviado' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'na', label: 'Não se aplica' },
]

export const labelDe = (lista: { value: string; label: string }[], v: string | null | undefined) => lista.find((o) => o.value === v)?.label ?? ''

export const formatarCnpj = (c: string | null) => (c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c ?? ''))

export const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const temPendencia = (c: Cliente) => ETAPAS.some((e) => c[e.campo] === 'pendente' || c[e.campo] === 'pdf_enviado')

export const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
