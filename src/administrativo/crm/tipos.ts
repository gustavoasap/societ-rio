export type EtapaCrm = 'lead' | 'contato' | 'diagnostico' | 'proposta' | 'negociacao' | 'ganho' | 'perdido'
export type Temperatura = 'frio' | 'morno' | 'quente'
export type TipoAtividade = 'ligacao' | 'whatsapp' | 'email' | 'reuniao' | 'tarefa' | 'nota'

export interface Oportunidade {
  id: string
  empresa: string
  cnpj: string | null
  contato_nome: string | null
  contato_cargo: string | null
  email: string | null
  telefone: string | null
  cidade: string | null
  uf: string | null
  origem: string
  parceiro_id: string | null
  servico: string
  regime_tributario: string | null
  segmento: string | null
  faturamento_mensal: number | null
  qtd_funcionarios: number | null
  etapa: EtapaCrm
  valor_mensal: number | null
  valor_avulso: number | null
  previsao_fechamento: string | null
  temperatura: Temperatura
  responsavel_id: string | null
  motivo_perda: string | null
  motivo_perda_detalhe: string | null
  cliente_id: string | null
  etapa_desde: string
  fechado_em: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface Atividade {
  id: string
  oportunidade_id: string
  tipo: TipoAtividade
  descricao: string
  data_prevista: string | null
  concluida: boolean
  concluida_em: string | null
  responsavel_id: string | null
  created_at: string
}

export interface Historico {
  id: string
  oportunidade_id: string
  de: string | null
  para: EtapaCrm
  em: string
  por: string | null
}

export interface Membro {
  user_id: string
  nome: string
  email: string
}

/**
 * Etapas do funil. "Probabilidade" é a chance de fechar estimada para cada etapa:
 * usada para calcular o valor ponderado do funil (previsão de receita).
 */
export const ETAPAS_CRM: { value: EtapaCrm; label: string; dica: string; probabilidade: number; cor: string; barra: string }[] = [
  { value: 'lead', label: 'Lead', dica: 'Contato recebido, ainda não conversamos', probabilidade: 0.1, cor: 'bg-slate-100 text-slate-700 ring-slate-200', barra: '#94a3b8' },
  { value: 'contato', label: 'Primeiro contato', dica: 'Já falamos com a pessoa', probabilidade: 0.2, cor: 'bg-sky-50 text-sky-700 ring-sky-200', barra: '#38bdf8' },
  { value: 'diagnostico', label: 'Diagnóstico', dica: 'Levantando a situação da empresa', probabilidade: 0.35, cor: 'bg-violet-50 text-violet-700 ring-violet-200', barra: '#8b5cf6' },
  { value: 'proposta', label: 'Proposta enviada', dica: 'Proposta de honorários enviada', probabilidade: 0.55, cor: 'bg-amber-50 text-amber-700 ring-amber-200', barra: '#f59e0b' },
  { value: 'negociacao', label: 'Negociação', dica: 'Ajustando valores e condições', probabilidade: 0.75, cor: 'bg-orange-50 text-orange-700 ring-orange-200', barra: '#f97316' },
  { value: 'ganho', label: 'Ganho', dica: 'Fechou! Virou cliente', probabilidade: 1, cor: 'bg-emerald-50 text-emerald-700 ring-emerald-200', barra: '#10b981' },
  { value: 'perdido', label: 'Perdido', dica: 'Não fechou', probabilidade: 0, cor: 'bg-rose-50 text-rose-700 ring-rose-200', barra: '#f43f5e' },
]

export const ETAPAS_ABERTAS = ETAPAS_CRM.filter((e) => e.value !== 'ganho' && e.value !== 'perdido')

export const ORIGENS = [
  { value: 'indicacao_parceiro', label: 'Indicação de parceiro' },
  { value: 'indicacao_cliente', label: 'Indicação de cliente' },
  { value: 'site', label: 'Site' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'google', label: 'Google' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'evento', label: 'Evento / networking' },
  { value: 'prospeccao', label: 'Prospecção ativa' },
  { value: 'outro', label: 'Outro' },
]

export const SERVICOS = [
  { value: 'contabilidade', label: 'Contabilidade mensal' },
  { value: 'abertura', label: 'Abertura de empresa' },
  { value: 'troca_contador', label: 'Troca de contador' },
  { value: 'bpo', label: 'BPO financeiro' },
  { value: 'regularizacao', label: 'Regularização' },
  { value: 'consultoria', label: 'Consultoria / planejamento' },
  { value: 'outro', label: 'Outro' },
]

export const MOTIVOS_PERDA = [
  { value: 'preco', label: 'Preço' },
  { value: 'concorrente', label: 'Fechou com concorrente' },
  { value: 'ficou_atual', label: 'Ficou com o contador atual' },
  { value: 'sem_resposta', label: 'Parou de responder' },
  { value: 'desistiu', label: 'Desistiu do projeto' },
  { value: 'sem_perfil', label: 'Fora do nosso perfil' },
  { value: 'outro', label: 'Outro' },
]

export const TEMPERATURAS: { value: Temperatura; label: string; cor: string }[] = [
  { value: 'quente', label: 'Quente', cor: 'bg-rose-50 text-rose-700 ring-rose-200' },
  { value: 'morno', label: 'Morno', cor: 'bg-amber-50 text-amber-700 ring-amber-200' },
  { value: 'frio', label: 'Frio', cor: 'bg-sky-50 text-sky-700 ring-sky-200' },
]

export const TIPOS_ATIVIDADE: { value: TipoAtividade; label: string }[] = [
  { value: 'ligacao', label: 'Ligação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'tarefa', label: 'Tarefa' },
  { value: 'nota', label: 'Anotação' },
]

export const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')

export const etapaInfo = (e: string) => ETAPAS_CRM.find((x) => x.value === e) ?? ETAPAS_CRM[0]

export const aberta = (o: Pick<Oportunidade, 'etapa'>) => o.etapa !== 'ganho' && o.etapa !== 'perdido'

/** Valor ponderado: honorário mensal × chance de fechar da etapa. */
export const valorPonderado = (o: Pick<Oportunidade, 'etapa' | 'valor_mensal'>) => (o.valor_mensal ?? 0) * etapaInfo(o.etapa).probabilidade

/** Dias inteiros desde um instante (timestamptz), pelo calendário local. */
export function diasDesdeInstante(iso: string, agora = new Date()) {
  const d = new Date(iso)
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const b = Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate())
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

export type Prazo = 'atrasada' | 'hoje' | 'semana' | 'depois' | 'sem_data'

export const PRAZOS: { value: Prazo; label: string }[] = [
  { value: 'atrasada', label: 'Atrasadas' },
  { value: 'hoje', label: 'Hoje' },
  { value: 'semana', label: 'Próximos 7 dias' },
  { value: 'depois', label: 'Mais adiante' },
  { value: 'sem_data', label: 'Sem data' },
]

/**
 * Classifica uma atividade pendente pela data prevista. Horário 00:00 significa
 * "o dia todo": só fica atrasada no dia seguinte. Com horário, atrasa ao passar a hora.
 */
export function prazoDe(dataPrevista: string | null, agora = new Date()): Prazo {
  if (!dataPrevista) return 'sem_data'
  const d = new Date(dataPrevista)
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const fimHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
  const fimSemana = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 8)
  const temHorario = d.getHours() !== 0 || d.getMinutes() !== 0
  if (d < inicioHoje) return 'atrasada'
  if (d < fimHoje) return temHorario && d < agora ? 'atrasada' : 'hoje'
  if (d < fimSemana) return 'semana'
  return 'depois'
}

/** Converte timestamptz para o valor de <input type="datetime-local"> no fuso local. */
export function paraInputLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function formatarDataHora(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = d.getHours() || d.getMinutes() ? ` ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''
  return data + hora
}

export interface ResumoCrm {
  abertas: number
  mrrFunil: number
  ponderado: number
  ganhasPeriodo: number
  mrrGanho: number
  perdidasPeriodo: number
  conversao: number | null
  ticket: number | null
  cicloMedio: number | null
}

/** Indicadores do painel: funil aberto e resultado das fechadas a partir de `desde`. */
export function resumir(ops: Oportunidade[], desde: Date): ResumoCrm {
  const abertas = ops.filter(aberta)
  const fechadas = ops.filter((o) => !aberta(o) && o.fechado_em && new Date(o.fechado_em) >= desde)
  const ganhas = fechadas.filter((o) => o.etapa === 'ganho')
  const perdidas = fechadas.filter((o) => o.etapa === 'perdido')
  const mrrGanho = ganhas.reduce((s, o) => s + (o.valor_mensal ?? 0), 0)
  const comValor = ganhas.filter((o) => (o.valor_mensal ?? 0) > 0)
  const ciclos = ganhas.map((o) => diasDesdeInstante(o.created_at, new Date(o.fechado_em!)))
  return {
    abertas: abertas.length,
    mrrFunil: abertas.reduce((s, o) => s + (o.valor_mensal ?? 0), 0),
    ponderado: abertas.reduce((s, o) => s + valorPonderado(o), 0),
    ganhasPeriodo: ganhas.length,
    mrrGanho,
    perdidasPeriodo: perdidas.length,
    conversao: fechadas.length ? ganhas.length / fechadas.length : null,
    ticket: comValor.length ? comValor.reduce((s, o) => s + (o.valor_mensal ?? 0), 0) / comValor.length : null,
    cicloMedio: ciclos.length ? ciclos.reduce((a, b) => a + b, 0) / ciclos.length : null,
  }
}
