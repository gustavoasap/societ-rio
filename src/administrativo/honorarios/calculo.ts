// Controle de Honorários: o valor de cada mês vem do honorário vigente na Base de Clientes.
// Exceções do mês (valor ajustado) e recebimentos ficam em adm_hon_mensal.

export interface ClienteHon {
  id: string
  codigo: number
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  responsavel: string | null
  status: 'pendente' | 'assinado' | 'encerrado'
  data_inicio_servicos: string | null
  carencia_meses: number | null
}

export interface HonorarioBase {
  cliente_id: string
  valor: number
  vigencia_inicio: string
  vigencia_fim: string | null
  dia_vencimento: number | null
}

export interface Mensal {
  cliente_id: string
  competencia: string
  valor_ajustado: number | null
  motivo_ajuste: string | null
  recebido_em: string | null
  valor_recebido: number | null
  origem: 'manual' | 'extrato' | null
  extrato_id: string | null
  extrato_descricao: string | null
  observacao: string | null
}

export interface ConfigHon {
  inicio: string
  dia_vencimento: number
  vence_mes_seguinte: boolean
}

export type Situacao = 'recebido' | 'parcial' | 'vencido' | 'a_vencer' | 'carencia' | 'isento'

export const SITUACOES: Record<Situacao, { label: string; pill: string }> = {
  recebido: { label: 'Recebido', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  parcial: { label: 'Recebido parcial', pill: 'border-orange-200 bg-orange-50 text-orange-700' },
  vencido: { label: 'Vencido', pill: 'border-rose-200 bg-rose-50 text-rose-700' },
  a_vencer: { label: 'A vencer', pill: 'border-amber-200 bg-amber-50 text-amber-700' },
  carencia: { label: 'Carência', pill: 'border-sky-200 bg-sky-50 text-sky-700' },
  isento: { label: 'Sem cobrança', pill: 'border-slate-200 bg-slate-100 text-slate-600' },
}

export interface Linha {
  cliente: ClienteHon
  /** AAAA-MM */
  competencia: string
  /** Honorário da base no mês (null = sem honorário cadastrado) */
  base: number | null
  /** Valor a receber no mês (ajustado, base ou 0 na carência) */
  valor: number
  ajustado: boolean
  carencia: boolean
  vencimento: string
  mensal: Mensal | null
  recebido: number
  aberto: number
  situacao: Situacao
}

export const mesDe = (iso: string) => iso.slice(0, 7)
export const competenciaDe = (mes: string) => `${mes}-01`
export const chaveMensal = (clienteId: string, mes: string) => `${clienteId}|${mes}`

export function somarMes(mes: string, n: number) {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function mesHoje(hoje = new Date()) {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`
}

export function hojeIso(hoje = new Date()) {
  return `${mesHoje(hoje)}-${String(hoje.getDate()).padStart(2, '0')}`
}

/** Meses de `de` até `ate` (inclusive), AAAA-MM. */
export function mesesEntre(de: string, ate: string) {
  const r: string[] = []
  for (let m = de; m <= ate && r.length < 600; m = somarMes(m, 1)) r.push(m)
  return r
}

/** Honorário vigente no mês (o mais recente que já começou e ainda não terminou). */
export function honorarioDoMes(hons: HonorarioBase[], mes: string) {
  let atual: HonorarioBase | null = null
  for (const h of hons) {
    if (mesDe(h.vigencia_inicio) > mes) continue
    if (h.vigencia_fim && mesDe(h.vigencia_fim) < mes) continue
    if (!atual || h.vigencia_inicio > atual.vigencia_inicio) atual = h
  }
  return atual
}

/** Carência: do mês do início dos serviços até N meses (não cobra honorário). */
export function emCarencia(c: Pick<ClienteHon, 'data_inicio_servicos' | 'carencia_meses'>, mes: string) {
  if (!c.data_inicio_servicos || !c.carencia_meses || c.carencia_meses <= 0) return false
  const ini = mesDe(c.data_inicio_servicos)
  return mes >= ini && mes <= somarMes(ini, c.carencia_meses - 1)
}

export function vencimentoDe(mes: string, dia: number, mesSeguinte: boolean) {
  const m = mesSeguinte ? somarMes(mes, 1) : mes
  const [a, mm] = m.split('-').map(Number)
  const ultimo = new Date(a, mm, 0).getDate()
  return `${m}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, '0')}`
}

const centavos = (v: number) => Math.round(v * 100) / 100

/** Linha do controle de um cliente num mês (null = sem honorário a controlar). Inativos não entram. */
export function linhaDoMes(c: ClienteHon, hons: HonorarioBase[], mensal: Mensal | null, mes: string, cfg: ConfigHon, hoje: string): Linha | null {
  if (c.status === 'encerrado') return null
  const h = honorarioDoMes(hons, mes)
  const carencia = emCarencia(c, mes)
  const ajustado = mensal?.valor_ajustado !== null && mensal?.valor_ajustado !== undefined
  if (!h && !ajustado && !mensal?.recebido_em) return null
  const base = h ? Number(h.valor) : null
  const valor = centavos(ajustado ? Number(mensal!.valor_ajustado) : carencia ? 0 : (base ?? 0))
  const recebido = mensal?.recebido_em ? centavos(mensal.valor_recebido !== null ? Number(mensal.valor_recebido) : valor) : 0
  const aberto = centavos(Math.max(0, valor - recebido))
  const vencimento = vencimentoDe(mes, h?.dia_vencimento ?? cfg.dia_vencimento, cfg.vence_mes_seguinte)
  let situacao: Situacao
  if (mensal?.recebido_em) situacao = aberto > 0 ? 'parcial' : 'recebido'
  else if (valor === 0) situacao = carencia ? 'carencia' : 'isento'
  else situacao = vencimento < hoje ? 'vencido' : 'a_vencer'
  return { cliente: c, competencia: mes, base, valor, ajustado, carencia, vencimento, mensal, recebido, aberto, situacao }
}

/** Em atraso: tem valor em aberto e o vencimento já passou. */
export const emAtraso = (l: Linha, hoje: string) => l.aberto > 0 && l.vencimento < hoje

export function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86_400_000)
}

export interface Inadimplente {
  cliente: ClienteHon
  linhas: Linha[]
  total: number
  maisAntigo: string
  diasAtraso: number
}

export function inadimplentes(linhas: Linha[], hoje: string): Inadimplente[] {
  const porCliente = new Map<string, Linha[]>()
  for (const l of linhas) if (emAtraso(l, hoje)) porCliente.set(l.cliente.id, [...(porCliente.get(l.cliente.id) ?? []), l])
  return [...porCliente.values()]
    .map((ls) => {
      const ord = [...ls].sort((a, b) => a.competencia.localeCompare(b.competencia))
      return {
        cliente: ord[0].cliente,
        linhas: ord,
        total: centavos(ord.reduce((s, l) => s + l.aberto, 0)),
        maisAntigo: ord[0].vencimento,
        diasAtraso: diasEntre(ord[0].vencimento, hoje),
      }
    })
    .sort((a, b) => b.total - a.total)
}

export interface ResumoMes {
  competencia: string
  previsto: number
  recebido: number
  aberto: number
  atrasado: number
}

export function resumoDoMes(linhas: Linha[], mes: string, hoje: string): ResumoMes {
  const r = { competencia: mes, previsto: 0, recebido: 0, aberto: 0, atrasado: 0 }
  for (const l of linhas) {
    if (l.competencia !== mes) continue
    r.previsto += l.valor
    r.recebido += l.recebido
    r.aberto += l.aberto
    if (emAtraso(l, hoje)) r.atrasado += l.aberto
  }
  return { competencia: mes, previsto: centavos(r.previsto), recebido: centavos(r.recebido), aberto: centavos(r.aberto), atrasado: centavos(r.atrasado) }
}
