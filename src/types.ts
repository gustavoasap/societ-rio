export type TipoProcesso = 'abertura' | 'alteracao' | 'baixa'
export type StatusProcesso = 'pendente' | 'andamento' | 'concluido'

export interface Parceiro {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  observacoes: string | null
  created_at?: string
}

export interface Socio {
  nome: string
  cpf: string
  email: string
  telefone: string
  qualificacao: string
  sexo: string
  cor_raca: string
  data_nascimento: string
  profissao: string
  nome_mae: string
  nome_pai: string
  rg: string
  rg_orgao_emissor: string
  rg_data_emissao: string
  cnh: string
  cnh_orgao_emissor: string
  cep: string
  endereco: string
  estado_civil: string
  regime_bens: string
  naturalidade: string
}

export interface Processo {
  id: string
  tipo: TipoProcesso
  status: StatusProcesso
  data_inicio: string
  parceiro_id: string | null
  cnpj: string | null
  razao_social: string | null
  responsavel: string | null
  alteracao_descricao: string | null
  municipio: string | null
  natureza_juridica: string | null
  orgao_registro: string | null
  enquadramento: string | null
  cnae_principal: string | null
  cnaes_secundarios: string | null
  tipo_unidade: string | null
  nome_fantasia: string | null
  cep: string | null
  endereco: string | null
  complemento: string | null
  area_imovel: number | null
  area_estabelecimento: number | null
  area_terreno: number | null
  capital_social: number | null
  socios: Socio[]
  numero_viabilidade: string | null
  status_viabilidade: string
  status_dbe: string
  status_integrador: string
  status_taxa: string
  status_contrato_social: string
  status_registro_digital: string
  status_contrato_servicos: string
  observacoes: string | null
  created_at?: string
  updated_at?: string
}

export type Opcao = { value: string; label: string }

export const TIPOS: Opcao[] = [
  { value: 'abertura', label: 'Abertura' },
  { value: 'alteracao', label: 'Alteração' },
  { value: 'baixa', label: 'Baixa' },
]

export const STATUS_PROCESSO: Opcao[] = [
  { value: 'pendente', label: 'Pendente de Início' },
  { value: 'andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
]

const PENDENTE_ANALISE_OK: Opcao[] = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'ok', label: 'OK' },
]

export type CampoAcompanhamento =
  | 'status_viabilidade'
  | 'status_dbe'
  | 'status_integrador'
  | 'status_taxa'
  | 'status_contrato_social'
  | 'status_registro_digital'
  | 'status_contrato_servicos'

export const ACOMPANHAMENTO: { campo: CampoAcompanhamento; label: string; opcoes: Opcao[]; concluido: string }[] = [
  { campo: 'status_viabilidade', label: 'Status Viabilidade', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' },
  { campo: 'status_dbe', label: 'Status DBE', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' },
  { campo: 'status_integrador', label: 'Integrador', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' },
  { campo: 'status_taxa', label: 'Pagamento da Taxa', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' },
  {
    campo: 'status_contrato_social',
    label: 'Contrato Social',
    opcoes: [
      { value: 'pendente_envio', label: 'Pendente de envio' },
      { value: 'falta_assinatura', label: 'Falta assinatura' },
      { value: 'ok', label: 'OK' },
    ],
    concluido: 'ok',
  },
  {
    campo: 'status_registro_digital',
    label: 'Registro Digital',
    opcoes: [
      { value: 'pendente_envio', label: 'Pendente de Envio' },
      { value: 'em_analise', label: 'Em análise' },
      { value: 'pendente_mat', label: 'Pendente MAT' },
      { value: 'cnpj_liberado', label: 'CNPJ Liberado' },
    ],
    concluido: 'cnpj_liberado',
  },
  {
    campo: 'status_contrato_servicos',
    label: 'Contrato Prestação de Serviços',
    opcoes: [
      { value: 'pendente_envio', label: 'Pendente de envio' },
      { value: 'enviado', label: 'Contrato Enviado' },
    ],
    concluido: 'enviado',
  },
]

export const QUALIFICACOES = ['Sócio', 'Sócio-Administrador', 'Administrador']
export const SEXOS = ['Masculino', 'Feminino']
export const CORES_RACA = ['Branca', 'Preta', 'Parda', 'Amarela', 'Indígena', 'Não declarada']
export const ESTADOS_CIVIS = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a) judicialmente', 'União estável']
export const REGIMES_BENS = [
  'Comunhão parcial de bens',
  'Comunhão universal de bens',
  'Separação total de bens',
  'Separação obrigatória de bens',
  'Participação final nos aquestos',
]
export const ENQUADRAMENTOS = ['ME - Microempresa', 'EPP - Empresa de Pequeno Porte', 'Demais (sem enquadramento)']
export const NATUREZAS_JURIDICAS = [
  '213-5 - Empresário (Individual)',
  '206-2 - Sociedade Empresária Limitada',
  '224-5 - Sociedade Simples Limitada',
  '223-2 - Sociedade Simples Pura',
  '232-1 - Sociedade Unipessoal de Advocacia',
  '214-3 - Cooperativa',
  '205-4 - Sociedade Anônima Fechada',
  '399-9 - Associação Privada',
]
export const ORGAOS_REGISTRO = ['Junta Comercial', 'Cartório (RCPJ)', 'OAB']

export const SOCIO_VAZIO: Socio = {
  nome: '',
  cpf: '',
  email: '',
  telefone: '',
  qualificacao: 'Sócio-Administrador',
  sexo: '',
  cor_raca: '',
  data_nascimento: '',
  profissao: '',
  nome_mae: '',
  nome_pai: '',
  rg: '',
  rg_orgao_emissor: '',
  rg_data_emissao: '',
  cnh: '',
  cnh_orgao_emissor: '',
  cep: '',
  endereco: '',
  estado_civil: '',
  regime_bens: '',
  naturalidade: '',
}

export function labelDe(opcoes: Opcao[], value: string | null | undefined) {
  return opcoes.find((o) => o.value === value)?.label ?? value ?? '—'
}
