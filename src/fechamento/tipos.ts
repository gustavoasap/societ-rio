export type Departamento = 'contabil' | 'fiscal' | 'pessoal'

export const NOME_DEPARTAMENTO: Record<Departamento, string> = {
  contabil: 'Contábil',
  fiscal: 'Fiscal',
  pessoal: 'Departamento Pessoal',
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
]

export interface Obrigacao {
  id: string
  departamento: Departamento
  nome: string
  opcoes: Opcao[]
  /** Primeiro dia do mês a partir do qual a obrigação vale. */
  inicio: string
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
  regime_tributario: string | null
  empresa: string | null
  parceiro: string | null
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

/**
 * A empresa entra no controle a partir do mês da data de abertura (sem data: sempre).
 * Encerrada: aparece até o mês do encerramento (sem data de encerramento: não aparece).
 */
export function empresaNoMes(e: Pick<EmpresaFech, 'status' | 'data_abertura' | 'data_encerramento'>, mes: string) {
  if (e.data_abertura && mesDe(e.data_abertura) > mes) return false
  if (e.status === 'encerrado') return !!e.data_encerramento && mesDe(e.data_encerramento) >= mes
  return true
}

export function obrigacaoNoMes(o: Pick<Obrigacao, 'inicio' | 'fim'>, mes: string) {
  return mesDe(o.inicio) <= mes && (!o.fim || mesDe(o.fim) >= mes)
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

export const chave = (obrigacaoId: string, clienteId: string) => `${obrigacaoId}|${clienteId}`

/** Sugestões para começar, por departamento. */
export const SUGESTOES: Record<Departamento, string[]> = {
  contabil: ['Conciliação bancária', 'Lançamentos contábeis', 'Conciliação de contas', 'Balancete', 'Envio de relatórios'],
  fiscal: ['Importação de notas', 'Apuração', 'DAS / Guias', 'Obrigações acessórias', 'Envio de guias ao cliente'],
  pessoal: ['Folha de pagamento', 'Pró-labore', 'eSocial', 'FGTS Digital', 'DCTFWeb', 'Envio de guias ao cliente'],
}
