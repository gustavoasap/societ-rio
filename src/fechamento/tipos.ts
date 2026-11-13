export type Departamento = 'contabil' | 'fiscal' | 'pessoal' | 'societario' | 'cadastros'

export const NOME_DEPARTAMENTO: Record<Departamento, string> = {
  contabil: 'Contábil',
  fiscal: 'Fiscal',
  pessoal: 'Departamento Pessoal',
  societario: 'Societário',
  cadastros: 'Administrativo',
}

/** Página do departamento (o Controle de Cadastros fica no Administrativo e só os sócios veem). */
export const SLUG_DEPARTAMENTO: Record<Departamento, string> = {
  contabil: 'contabil',
  fiscal: 'fiscal',
  pessoal: 'pessoal',
  societario: 'societario',
  cadastros: 'administrativo',
}

/** Como cada controle chama as colunas. */
export const TERMO: Record<Departamento, { um: string; uns: string; novo: string; artigo: 'a' | 'o' }> = {
  contabil: { um: 'obrigação', uns: 'obrigações', novo: 'Nova obrigação', artigo: 'a' },
  fiscal: { um: 'obrigação', uns: 'obrigações', novo: 'Nova obrigação', artigo: 'a' },
  pessoal: { um: 'obrigação', uns: 'obrigações', novo: 'Nova obrigação', artigo: 'a' },
  societario: { um: 'tarefa', uns: 'tarefas', novo: 'Nova tarefa', artigo: 'a' },
  cadastros: { um: 'sistema', uns: 'sistemas', novo: 'Novo sistema', artigo: 'o' },
}

/** Nome do controle em cada departamento (mesmo funcionamento em todos). */
export const TITULO_CONTROLE: Record<Departamento, string> = {
  contabil: 'Controle de Fechamento Mensal',
  fiscal: 'Controle de Fechamento Mensal',
  pessoal: 'Controle de Fechamento Mensal',
  societario: 'Controle de Tarefas Mensal',
  cadastros: 'Controle de Cadastros',
}

export type Cor = 'vermelho' | 'laranja' | 'amarelo' | 'verde' | 'azul' | 'roxo' | 'cinza'

export const CORES: { value: Cor; label: string; pill: string; ponto: string }[] = [
  { value: 'vermelho', label: 'Vermelho', pill: 'border-rose-200 bg-rose-50 text-rose-700', ponto: 'bg-rose-500' },
  { value: 'laranja', label: 'Laranja', pill: 'border-orange-200 bg-orange-50 text-orange-700', ponto: 'bg-orange-500' },
  { value: 'amarelo', label: 'Amarelo', pill: 'border-amber-200 bg-amber-50 text-amber-700', ponto: 'bg-amber-400' },
  { value: 'verde', label: 'Verde', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700', ponto: 'bg-emerald-500' },
  { value: 'azul', label: 'Azul', pill: 'border-sky-200 bg-sky-50 text-sky-700', ponto: 'bg-sky-500' },
  { value: 'roxo', label: 'Roxo', pill: 'border-violet-200 bg-violet-50 text-violet-700', ponto: 'bg-violet-500' },
  { value: 'cinza', label: 'Cinza', pill: 'border-slate-200 bg-slate-100 text-slate-600', ponto: 'bg-slate-400' },
]

export const corDe = (c: string) => CORES.find((x) => x.value === c) ?? CORES[CORES.length - 1]

export interface Opcao {
  id: string
  label: string
  cor: Cor
  /** Conta como "feito" no progresso. */
  concluido: boolean
}

export const OPCOES_PADRAO: Opcao[] = [
  { id: 'pendente', label: 'Pendente', cor: 'vermelho', concluido: false },
  { id: 'andamento', label: 'Em andamento', cor: 'amarelo', concluido: false },
  { id: 'concluido', label: 'Concluído', cor: 'verde', concluido: true },
  // Não se aplica: não deixa a empresa "pendente" nessa obrigação
  { id: 'na', label: 'N/A', cor: 'cinza', concluido: true },
]

export type Periodicidade = 'mensal' | 'anual' | 'unica'

export const PERIODICIDADES: { value: Periodicidade; label: string; ajuda: string }[] = [
  { value: 'mensal', label: 'Mensal', ajuda: 'Toda competência começa como pendente até ser marcada.' },
  { value: 'anual', label: 'Anual', ajuda: 'Uma entrega por ano, controlada nos meses do período de entrega.' },
  { value: 'unica', label: 'Única', ajuda: 'Feita uma vez por empresa: concluída, fica concluída daí em diante.' },
]

export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export interface Obrigacao {
  id: string
  departamento: Departamento
  nome: string
  opcoes: Opcao[]
  periodicidade: Periodicidade
  /** Anual: meses do período de entrega (1 a 12). */
  meses_entrega: number[] | null
  /** Primeiro mês em que vale (primeiro dia), ou null = desde a abertura de cada empresa. */
  inicio: string | null
  /** Último mês em que vale (primeiro dia), ou null. */
  fim: string | null
  ordem: number
  created_at?: string
}

export interface EmpresaFech {
  id: string
  codigo: number
  razao_social: string
  cnpj: string | null
  status: 'pendente' | 'assinado' | 'encerrado'
  data_abertura: string | null
  data_encerramento: string | null
  motivo_encerramento: 'baixa' | 'distrato' | null
  regime_tributario: string | null
  empresa: string | null
  parceiro: string | null
  link_drive: string | null
  responsavel: string | null
}

export interface StatusFech {
  obrigacao_id: string
  cliente_id: string
  competencia: string
  valor: string
}

/** "AAAA-MM" → "AAAA-MM-01" */
export const competenciaDe = (mes: string) => `${mes}-01`
export const mesDe = (data: string) => data.slice(0, 7)

/** Competência anterior ao mês atual (em novembro trabalha-se a competência de outubro). */
export function competenciaAtual(hoje = new Date()) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Competência usada para gravar a marcação das obrigações únicas (uma só por empresa). */
export const COMP_UNICA = '1900-01-01'

/** Competência em que a marcação fica gravada: mensal = o mês; anual = o ano; única = uma só. */
export function competenciaStatus(o: Pick<Obrigacao, 'periodicidade'>, mes: string) {
  if (o.periodicidade === 'unica') return COMP_UNICA
  if (o.periodicidade === 'anual') return `${mes.slice(0, 4)}-01-01`
  return competenciaDe(mes)
}

/**
 * A empresa entra no controle a partir da competência da data de abertura (sem data: sempre).
 * Encerrada (baixa ou distrato): aparece até a competência do encerramento e sai na seguinte
 * (sem data de encerramento: não aparece).
 */
export function empresaNoMes(e: Pick<EmpresaFech, 'status' | 'data_abertura' | 'data_encerramento'>, mes: string) {
  if (e.data_abertura && mesDe(e.data_abertura) > mes) return false
  if (e.status === 'encerrado') return !!e.data_encerramento && mesDe(e.data_encerramento) >= mes
  return true
}

/** Visão geral: só empresas ativas (inativas não aparecem), já abertas até o fim do ano. */
export function empresaNoAno(e: Pick<EmpresaFech, 'status' | 'data_abertura' | 'data_encerramento'>, ano: string) {
  return e.status !== 'encerrado' && empresaNoMes(e, `${ano}-12`)
}

const vigente = (o: Pick<Obrigacao, 'inicio' | 'fim'>, mes: string) => (!o.inicio || mesDe(o.inicio) <= mes) && (!o.fim || mesDe(o.fim) >= mes)

/** Colunas da visão por competência: mensais e anuais dentro do período de entrega. */
export function obrigacaoNoMes(o: Pick<Obrigacao, 'inicio' | 'fim' | 'periodicidade' | 'meses_entrega'>, mes: string) {
  if (!vigente(o, mes)) return false
  if (o.periodicidade === 'unica') return false
  if (o.periodicidade === 'anual') return (o.meses_entrega ?? []).includes(Number(mes.slice(5, 7)))
  return true
}

/** Colunas da visão geral: únicas e anuais vigentes no ano. */
export function obrigacaoNaGeral(o: Pick<Obrigacao, 'inicio' | 'fim' | 'periodicidade'>, ano: string) {
  if (o.periodicidade === 'mensal') return false
  return (!o.inicio || o.inicio.slice(0, 4) <= ano) && (!o.fim || o.fim.slice(0, 4) >= ano)
}

/** "mar a mai" / "mar, jun e dez" */
export function textoMeses(meses: number[] | null) {
  const m = [...(meses ?? [])].sort((a, b) => a - b)
  if (!m.length) return 'sem meses de entrega'
  const seguidos = m.every((x, i) => i === 0 || x === m[i - 1] + 1)
  if (m.length > 2 && seguidos) return `${MESES_CURTOS[m[0] - 1]} a ${MESES_CURTOS[m[m.length - 1] - 1]}`
  const n = m.map((x) => MESES_CURTOS[x - 1])
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} e ${n[n.length - 1]}` : n[0]
}

/** Opção marcada (ou a primeira, quando ainda não foi marcada / a opção deixou de existir). */
export function opcaoAtual(o: Pick<Obrigacao, 'opcoes'>, valor: string | undefined) {
  return o.opcoes.find((x) => x.id === valor) ?? o.opcoes[0]
}

/** Identificador estável para uma opção nova (não muda se o nome for editado depois). */
export function novoIdOpcao(label: string, existentes: string[]) {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '') || 'opcao'
  let id = base
  for (let i = 2; existentes.includes(id); i++) id = `${base}_${i}`
  return id
}

export const chave = (obrigacaoId: string, clienteId: string, competencia: string) => `${obrigacaoId}|${clienteId}|${competencia}`

/** Sugestões para começar, por departamento. */
export const SUGESTOES: Record<Departamento, string[]> = {
  contabil: ['Conciliação bancária', 'Lançamentos contábeis', 'Conciliação de contas', 'Balancete', 'Envio de relatórios'],
  fiscal: ['Importação de notas', 'Apuração', 'DAS / Guias', 'Obrigações acessórias', 'Envio de guias ao cliente'],
  pessoal: ['Folha de pagamento', 'Pró-labore', 'eSocial', 'FGTS Digital', 'DCTFWeb', 'Envio de guias ao cliente'],
  cadastros: ['Sistema contábil', 'Sistema fiscal', 'Folha de pagamento', 'Banco / extrato', 'Portal do cliente'],
  societario: ['Alvarás e licenças', 'Certidões negativas', 'Vencimento do certificado digital', 'Vencimento de procurações', 'Alterações contratuais'],
}
