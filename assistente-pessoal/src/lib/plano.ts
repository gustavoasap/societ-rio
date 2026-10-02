// Plano financeiro: custo de vida, renda mínima, reserva de emergência, quanto separar por mês,
// quanto ainda posso gastar no mês e projeção dos próximos 12 meses.
import type { Categoria, Config, Lancamento, Meta, Aporte, Recorrencia } from '../tipos'
import { progressoMeta, somar } from './calculos'
import { diasEntre, diasNoMes, mesDe, somarMesesAoMes, ultimoDia } from './datas'

const mesNum = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return a * 12 + (m - 1)
}

/** A recorrência cai neste mês ("AAAA-MM")? Respeita início, fim e periodicidade (ex.: anual só no mês do início). */
export function ocorreNoMes(r: Pick<Recorrencia, 'inicio' | 'fim' | 'intervalo_meses' | 'ativa'>, mes: string) {
  if (!r.ativa) return false
  const desde = mesNum(mes) - mesNum(mesDe(r.inicio))
  if (desde < 0 || desde % (r.intervalo_meses || 1) !== 0) return false
  return !r.fim || mesDe(r.fim) >= mes
}

/** Valor mensal equivalente (provisão): IPVA de R$ 2.400 por ano = R$ 200 por mês. */
export const mensalizado = (r: Pick<Recorrencia, 'valor' | 'intervalo_meses'>) => Math.round((r.valor / (r.intervalo_meses || 1)) * 100) / 100

/** Recorrência que vale para o plano: ativa, minha, e ainda não terminou. */
const vigente = (r: Recorrencia, mesAtual: string) => r.ativa && !r.pessoa_id && (!r.fim || mesDe(r.fim) >= mesAtual)

/** Quantos meses de histórico fechado existem (do 1º lançamento até o mês anterior), limitado à janela. */
function mesesDeHistorico(lancamentos: Lancamento[], mesAtual: string, janela: number) {
  const meus = lancamentos.filter((l) => !l.pessoa_id && l.tipo !== 'transferencia' && mesDe(l.data) < mesAtual)
  if (meus.length === 0) return 0
  const primeiro = meus.reduce((min, l) => (l.data < min ? l.data : min), meus[0].data)
  return Math.min(janela, mesNum(mesAtual) - mesNum(mesDe(primeiro)))
}

/** Lançamento "avulso": não vem de recorrência nem de parcelamento (esses entram por conta própria no plano). */
const avulso = (l: Lancamento) => !l.recorrencia_id && !l.grupo && !l.pessoa_id

const chaveRec = (tipo: string, categoria: string | null, descricao: string) => `${tipo}|${categoria ?? ''}|${descricao.trim().toLowerCase()}`

/** Metas que são a própria reserva de emergência (a reserva já tem a sua "caixinha"; não conta duas vezes). */
export const ehMetaDeReserva = (m: Pick<Meta, 'nome'>) => /reserva/i.test(m.nome) && /emerg/i.test(m.nome)

export interface LinhaCusto {
  categoriaId: string
  nome: string
  essencial: boolean
  /** recorrências (aluguel, assinaturas, IPVA/12...) */
  recorrente: number
  /** média dos gastos avulsos no histórico */
  media: number
  orcamento: number | null
  /** max(recorrente + média, limite do orçamento) */
  estimativa: number
}

export interface Renda {
  recorrente: number
  variavelMedia: number
  total: number
}

export interface Plano {
  renda: Renda
  custos: LinhaCusto[]
  /** parcelas já lançadas para o próximo mês (compromisso temporário) */
  parcelas: number
  custoTotal: number
  custoEssencial: number
  /** parte do custo que é de despesas anuais/periódicas (separar todo mês) */
  provisaoAnuais: number
  rendaMinima: number
  rendaIdeal: number
  reserva: { alvo: number; confortavel: number; atual: number; falta: number; aporte: number; meses: number }
  guardar: number
  investir: number
  metas: { meta: Meta; porMes: number }[]
  metasTotal: number
  /** o que sobra depois de custos e de tudo que deve ser separado (negativo = plano não fecha) */
  livre: number
  /** 50/30/20: necessidades, desejos, poupança, em fração da renda */
  regra: { necessidades: number; desejos: number; poupanca: number }
  historicoMeses: number
}

export function montarPlano(o: {
  categorias: Categoria[]
  recorrencias: Recorrencia[]
  /** histórico (até 12 meses fechados) e lançamentos futuros já existentes */
  lancamentos: Lancamento[]
  metas: Meta[]
  aportes: Aporte[]
  config: Config
  saldoReserva: number
  hoje: string
}): Plano {
  const mesAtual = mesDe(o.hoje)
  const recs = o.recorrencias.filter((r) => vigente(r, mesAtual))
  const cats = new Map(o.categorias.map((c) => [c.id, c]))
  const h3 = mesesDeHistorico(o.lancamentos, mesAtual, 3)
  const h12 = mesesDeHistorico(o.lancamentos, mesAtual, 12)
  const inicio3 = somarMesesAoMes(mesAtual, -h3)
  const inicio12 = somarMesesAoMes(mesAtual, -h12)
  const passado = (l: Lancamento, desde: string) => mesDe(l.data) >= desde && mesDe(l.data) < mesAtual
  // o que foi lançado à mão antes de virar recorrência (mesma descrição e categoria) já está coberto por ela
  const cobertos = new Set(o.recorrencias.filter((r) => !r.pessoa_id).map((r) => chaveRec(r.tipo, r.categoria_id, r.descricao)))
  const avulsoReal = (l: Lancamento) => avulso(l) && !cobertos.has(chaveRec(l.tipo, l.categoria_id, l.descricao))

  // ---------------- renda
  const rendaRec = somar(recs.filter((r) => r.tipo === 'receita').map(mensalizado))
  const recVar = o.lancamentos.filter((l) => l.tipo === 'receita' && avulsoReal(l) && passado(l, inicio3))
  const rendaVar = h3 ? Math.round((somar(recVar.map((l) => l.valor)) / h3) * 100) / 100 : 0
  const renda = { recorrente: rendaRec, variavelMedia: rendaVar, total: somar([rendaRec, rendaVar]) }

  // ---------------- custos por categoria
  const linhas = new Map<string, LinhaCusto>()
  const linha = (id: string) => {
    let x = linhas.get(id)
    if (!x) {
      const c = cats.get(id)
      x = { categoriaId: id, nome: c?.nome ?? 'Sem categoria', essencial: !!c?.essencial, recorrente: 0, media: 0, orcamento: c?.orcamento_mensal ?? null, estimativa: 0 }
      linhas.set(id, x)
    }
    return x
  }
  for (const r of recs.filter((r) => r.tipo === 'despesa')) {
    const x = linha(r.categoria_id ?? '')
    x.recorrente = somar([x.recorrente, mensalizado(r)])
  }
  for (const l of o.lancamentos) {
    if (l.tipo !== 'despesa' || !avulsoReal(l)) continue
    const c = l.categoria_id ? cats.get(l.categoria_id) : undefined
    const nat = l.natureza ?? c?.natureza ?? 'variavel'
    // variáveis: média dos últimos 3 meses; fixas sem recorrência e eventuais: média de 12 meses
    const [desde, meses] = nat === 'variavel' ? [inicio3, h3] : [inicio12, h12]
    if (!meses || !passado(l, desde)) continue
    const x = linha(l.categoria_id ?? '')
    x.media = somar([x.media, l.valor / meses])
  }
  for (const c of o.categorias) if (c.tipo === 'despesa' && c.ativa && c.orcamento_mensal) linha(c.id)
  const custos = [...linhas.values()]
    .map((x) => {
      const media = Math.round(x.media * 100) / 100
      // o limite do Orçamento vale para a categoria inteira (fixos + avulsos)
      return { ...x, media, estimativa: Math.max(somar([x.recorrente, media]), x.orcamento ?? 0) }
    })
    .filter((x) => x.estimativa > 0)
    .sort((a, b) => Number(b.essencial) - Number(a.essencial) || b.estimativa - a.estimativa)

  const proximoMes = somarMesesAoMes(mesAtual, 1)
  const parcelas = somar(o.lancamentos.filter((l) => l.tipo === 'despesa' && l.grupo && !l.pessoa_id && mesDe(l.data) === proximoMes).map((l) => l.valor))

  const custoTotal = somar([...custos.map((x) => x.estimativa), parcelas])
  const custoEssencial = somar(custos.filter((x) => x.essencial).map((x) => x.estimativa))
  const provisaoAnuais = somar(recs.filter((r) => r.tipo === 'despesa' && r.intervalo_meses > 1).map(mensalizado))
  const pct = o.config.pct_investimento / 100

  // ---------------- reserva de emergência
  const alvo = Math.round(custoEssencial * o.config.meses_reserva * 100) / 100
  const confortavel = Math.round(custoTotal * o.config.meses_reserva * 100) / 100
  const falta = Math.max(0, somar([alvo, -o.saldoReserva]))

  // ---------------- quanto separar: primeiro completa a reserva (em até 12 meses), o resto vai para investimento
  const guardar = Math.round(renda.total * pct * 100) / 100
  const aporteReserva = Math.min(guardar, Math.ceil((falta / 12) * 100) / 100)
  const investir = somar([guardar, -aporteReserva])
  const metas = o.metas
    .filter((m) => !m.concluida && !ehMetaDeReserva(m))
    .map((meta) => ({ meta, porMes: progressoMeta(meta, o.aportes, o.hoje).porMes ?? 0 }))
    .filter((x) => x.porMes > 0)
  const metasTotal = somar(metas.map((x) => x.porMes))
  const livre = somar([renda.total, -custoTotal, -guardar, -metasTotal])

  const r = renda.total || 1
  return {
    renda,
    custos,
    parcelas,
    custoTotal,
    custoEssencial,
    provisaoAnuais,
    rendaMinima: custoEssencial,
    rendaIdeal: pct < 1 ? Math.ceil(((custoTotal + metasTotal) / (1 - pct)) * 100) / 100 : custoTotal,
    reserva: {
      alvo,
      confortavel,
      atual: o.saldoReserva,
      falta,
      aporte: aporteReserva,
      meses: aporteReserva > 0 ? Math.ceil(falta / aporteReserva) : 0,
    },
    guardar,
    investir,
    metas,
    metasTotal,
    livre,
    regra: {
      necessidades: custoEssencial / r,
      desejos: somar([custoTotal, -custoEssencial]) / r,
      poupanca: somar([guardar, metasTotal]) / r,
    },
    historicoMeses: h3,
  }
}

export interface MesProjetado {
  mes: string
  entradas: number
  saidas: number
  resultado: number
  /** patrimônio ao fim do mês, se o plano for seguido */
  patrimonio: number
}

/**
 * Projeção mês a mês: recorrências que caem em cada mês (anuais só no mês delas), parcelas já lançadas
 * e a média dos gastos avulsos. O que é "guardado" continua sendo patrimônio.
 */
export function projetar(o: { plano: Plano; recorrencias: Recorrencia[]; lancamentos: Lancamento[]; patrimonioAtual: number; hoje: string; meses?: number }): MesProjetado[] {
  const mesAtual = mesDe(o.hoje)
  // parte não recorrente de cada categoria (a recorrente entra no mês em que cai)
  const avulsosMes = somar(o.plano.custos.map((x) => somar([x.estimativa, -x.recorrente])))
  const recs = o.recorrencias.filter((r) => vigente(r, mesAtual))
  const lista: MesProjetado[] = []
  let patrimonio = o.patrimonioAtual
  for (let i = 1; i <= (o.meses ?? 12); i++) {
    const mes = somarMesesAoMes(mesAtual, i)
    const noMes = recs.filter((r) => ocorreNoMes(r, mes))
    const entradas = somar([...noMes.filter((r) => r.tipo === 'receita').map((r) => r.valor), o.plano.renda.variavelMedia])
    const parcelas = o.lancamentos.filter((l) => l.tipo === 'despesa' && l.grupo && !l.pessoa_id && mesDe(l.data) === mes).map((l) => l.valor)
    const saidas = somar([...noMes.filter((r) => r.tipo === 'despesa').map((r) => r.valor), ...parcelas, avulsosMes])
    const resultado = somar([entradas, -saidas])
    patrimonio = somar([patrimonio, resultado])
    lista.push({ mes, entradas, saidas, resultado, patrimonio })
  }
  return lista
}

export interface Disponivel {
  renda: number
  gasto: number
  separar: number
  disponivel: number
  porDia: number
  diasRestantes: number
}

/**
 * Quanto ainda posso gastar no mês: renda do mês − o que já foi gasto/lançado − o que o plano manda separar.
 * Se ainda não entrou receita no mês, usa a renda prevista do plano.
 */
export function disponivelNoMes(o: { plano: Plano; lancamentos: Lancamento[]; hoje: string }): Disponivel {
  const mes = mesDe(o.hoje)
  const doMes = o.lancamentos.filter((l) => mesDe(l.data) === mes && !l.pessoa_id)
  const recebido = somar(doMes.filter((l) => l.tipo === 'receita').map((l) => l.valor))
  const renda = Math.max(recebido, o.plano.renda.total)
  const gasto = somar(doMes.filter((l) => l.tipo === 'despesa').map((l) => l.valor))
  const separar = somar([o.plano.guardar, o.plano.metasTotal, o.plano.provisaoAnuais])
  const disponivel = somar([renda, -gasto, -separar])
  const diasRestantes = diasEntre(o.hoje, ultimoDia(mes)) + 1
  const [a, m] = mes.split('-').map(Number)
  return {
    renda,
    gasto,
    separar,
    disponivel,
    diasRestantes: Math.min(diasRestantes, diasNoMes(a, m)),
    porDia: disponivel > 0 ? Math.floor((disponivel / diasRestantes) * 100) / 100 : 0,
  }
}
