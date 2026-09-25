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
  objeto_social: string | null
  bloco_cnae_id: string | null
  numero_viabilidade: string | null
  numero_dbe: string | null
  status_viabilidade: string
  status_dbe: string
  status_integrador: string
  status_taxa: string
  status_contrato_social: string
  status_registro_digital: string
  status_contrato_servicos: string
  status_documento_baixa: string
  status_distrato: string
  status_declaracoes_baixa: string
  observacoes: string | null
  created_at?: string
  updated_at?: string
}

export interface ObjetoSocial {
  id: string
  nome: string
  texto: string
}

export interface BlocoCnae {
  id: string
  nome: string
  cnae_principal: string | null
  cnaes_secundarios: string[]
  objeto_social_id: string | null
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

const CONTRATO_SOCIAL: Opcao[] = [
  { value: 'pendente_envio', label: 'Pendente de envio' },
  { value: 'falta_assinatura', label: 'Falta assinatura' },
  { value: 'ok', label: 'OK' },
]

const REGISTRO_DIGITAL_SIMPLES: Opcao[] = [
  { value: 'pendente_envio', label: 'Pendente de envio' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'concluido', label: 'Concluído' },
]

export type CampoAcompanhamento =
  | 'status_viabilidade'
  | 'status_dbe'
  | 'status_integrador'
  | 'status_taxa'
  | 'status_contrato_social'
  | 'status_registro_digital'
  | 'status_contrato_servicos'
  | 'status_documento_baixa'
  | 'status_distrato'
  | 'status_declaracoes_baixa'

export type Etapa = { campo: CampoAcompanhamento; label: string; opcoes: Opcao[]; concluido: string }

const VIABILIDADE: Etapa = { campo: 'status_viabilidade', label: 'Status Viabilidade', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' }
const DBE: Etapa = { campo: 'status_dbe', label: 'Status DBE', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' }
const INTEGRADOR: Etapa = { campo: 'status_integrador', label: 'Integrador', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' }
const TAXA: Etapa = { campo: 'status_taxa', label: 'Pagamento da Taxa', opcoes: PENDENTE_ANALISE_OK, concluido: 'ok' }
const REGISTRO_SIMPLES: Etapa = { campo: 'status_registro_digital', label: 'Registro Digital', opcoes: REGISTRO_DIGITAL_SIMPLES, concluido: 'concluido' }

/** Etapas de acompanhamento de cada tipo de processo. */
export const ACOMPANHAMENTO_POR_TIPO: Record<TipoProcesso, Etapa[]> = {
  abertura: [
    VIABILIDADE,
    DBE,
    INTEGRADOR,
    TAXA,
    { campo: 'status_contrato_social', label: 'Contrato Social', opcoes: CONTRATO_SOCIAL, concluido: 'ok' },
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
  ],
  alteracao: [
    VIABILIDADE,
    DBE,
    INTEGRADOR,
    TAXA,
    { campo: 'status_contrato_social', label: 'Alteração de Contrato Social', opcoes: CONTRATO_SOCIAL, concluido: 'ok' },
    REGISTRO_SIMPLES,
  ],
  baixa: [
    DBE,
    INTEGRADOR,
    {
      campo: 'status_documento_baixa',
      label: 'Documento de Baixa',
      opcoes: [
        { value: 'pendente', label: 'Pendente' },
        { value: 'enviado_assinatura', label: 'Enviado para Assinatura' },
        { value: 'assinado', label: 'Assinado' },
      ],
      concluido: 'assinado',
    },
    REGISTRO_SIMPLES,
    {
      campo: 'status_distrato',
      label: 'Distrato de Assessoria Contábil',
      opcoes: [
        { value: 'pendente_envio', label: 'Pendente de Envio' },
        { value: 'enviado_assinatura', label: 'Enviado para Assinatura' },
        { value: 'assinado', label: 'Assinado' },
      ],
      concluido: 'assinado',
    },
    {
      campo: 'status_declaracoes_baixa',
      label: 'Declarações Acessórias de Baixa',
      opcoes: [
        { value: 'pendente_envio', label: 'Pendente de Envio' },
        { value: 'em_andamento', label: 'Em andamento' },
        { value: 'enviadas', label: 'Enviadas' },
      ],
      concluido: 'enviadas',
    },
  ],
}

/** Número de referência exibido na lista: viabilidade (abertura/alteração) ou DBE (baixa). */
export function numeroReferencia(p: Pick<Processo, 'tipo' | 'numero_viabilidade' | 'numero_dbe'>) {
  return p.tipo === 'baixa' ? p.numero_dbe : p.numero_viabilidade
}

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

/** O primeiro sócio é sempre o responsável legal. */
export function rotuloSocio(indice: number) {
  return indice === 0 ? 'Sócio 1 - Responsável Legal' : `Sócio ${indice + 1}`
}
