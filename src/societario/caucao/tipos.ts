export type ResponsavelTipo = 'cliente' | 'parceiro'

export interface Caucao {
  id: string
  cliente: string
  parceiro_id: string | null
  responsavel_tipo: ResponsavelTipo
  responsavel_parceiro_id: string | null
  cobertura_meses: number
  valor_caucao: number | null
  data_recebimento: string | null
  junta_uf: string | null
  taxa_junta: number | null
  data_pagamento_taxa: string | null
  valor_certificado: number | null
  data_pagamento_certificado: string | null
  data_apropriacao: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface Junta {
  uf: string
  nome: string
  taxa: number
}

export const COBERTURAS = [
  { value: '0', label: 'Sem cobertura' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'mês' : 'meses'}` })),
]

export const labelCobertura = (n: number) => COBERTURAS.find((c) => c.value === String(n))?.label ?? ''

/** Valor do responsável no select: "cliente" ou o id do parceiro. */
export const valorResponsavel = (c: Pick<Caucao, 'responsavel_tipo' | 'responsavel_parceiro_id'>) =>
  c.responsavel_tipo === 'parceiro' && c.responsavel_parceiro_id ? c.responsavel_parceiro_id : 'cliente'

/** Lucro (positivo) ou prejuízo (negativo): Caução − Taxa da junta − Certificado digital. */
export const resultado = (c: Pick<Caucao, 'valor_caucao' | 'taxa_junta' | 'valor_certificado'>) =>
  Math.round(((c.valor_caucao ?? 0) - (c.taxa_junta ?? 0) - (c.valor_certificado ?? 0)) * 100) / 100

export interface Totais {
  caucao: number
  taxa: number
  certificado: number
  resultado: number
  comLucro: number
  comPrejuizo: number
}

export function totalizar(lista: Caucao[]): Totais {
  const t: Totais = { caucao: 0, taxa: 0, certificado: 0, resultado: 0, comLucro: 0, comPrejuizo: 0 }
  for (const c of lista) {
    t.caucao += c.valor_caucao ?? 0
    t.taxa += c.taxa_junta ?? 0
    t.certificado += c.valor_certificado ?? 0
    const r = resultado(c)
    t.resultado += r
    if (r > 0) t.comLucro++
    else if (r < 0) t.comPrejuizo++
  }
  t.resultado = Math.round(t.resultado * 100) / 100
  return t
}

// ---------------------------------------------------------------------------
// Conciliação mensal da conta "Adiantamento de Clientes - Caução" (passivo).
// Crédito: caução recebido. Débito: taxa da junta e certificado pagos por conta do
// cliente. Na data de apropriação, o saldo que sobrou sai da conta para o resultado
// (lucro = débito; prejuízo = crédito). Cada valor entra no mês da sua própria data.
// ---------------------------------------------------------------------------

export type TipoMovimento = 'caucao' | 'taxa' | 'certificado' | 'apropriacao'

export interface Movimento {
  caucaoId: string
  cliente: string
  data: string
  tipo: TipoMovimento
  historico: string
  /** Positivo = crédito (aumenta o saldo credor); negativo = débito. */
  valor: number
}

export const ROTULO_MOVIMENTO: Record<TipoMovimento, string> = {
  caucao: 'Caução recebido',
  taxa: 'Taxa da junta paga',
  certificado: 'Certificado digital pago',
  apropriacao: 'Baixa do saldo para resultado',
}

export function movimentos(c: Caucao): Movimento[] {
  const m: Movimento[] = []
  const add = (data: string | null, valor: number | null, tipo: TipoMovimento, historico: string) => {
    if (data && valor) m.push({ caucaoId: c.id, cliente: c.cliente, data, tipo, historico, valor: Math.round(valor * 100) / 100 })
  }
  add(c.data_recebimento, c.valor_caucao, 'caucao', `Caução recebido - ${c.cliente}`)
  add(c.data_pagamento_taxa, c.taxa_junta === null ? null : -c.taxa_junta, 'taxa', `Taxa junta comercial${c.junta_uf ? ` ${c.junta_uf}` : ''} - ${c.cliente}`)
  add(c.data_pagamento_certificado, c.valor_certificado === null ? null : -c.valor_certificado, 'certificado', `Certificado digital - ${c.cliente}`)
  if (c.data_apropriacao) {
    // Só o que de fato passou pela conta até a apropriação
    const saldo = m.filter((x) => x.data <= c.data_apropriacao!).reduce((s, x) => s + x.valor, 0)
    const r = Math.round(saldo * 100) / 100
    add(c.data_apropriacao, -r, 'apropriacao', `${r >= 0 ? 'Apropriação de receita (lucro)' : 'Reconhecimento de prejuízo'} - ${c.cliente}`)
  }
  return m
}

/** "AAAA-MM" → primeiro e último dia do mês (AAAA-MM-DD). */
export function limitesMes(mes: string) {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

export interface LinhaConciliacao {
  caucao: Caucao
  saldoAnterior: number
  creditos: number
  taxa: number
  certificado: number
  apropriacao: number
  saldoFinal: number
}

export interface Conciliacao {
  linhas: LinhaConciliacao[]
  lancamentos: Movimento[]
  totais: Omit<LinhaConciliacao, 'caucao'>
  /** Valores lançados sem data: não entram na conta até a data ser informada. */
  semData: number
}

const r2 = (v: number) => Math.round(v * 100) / 100

export function conciliarMes(caucoes: Caucao[], mes: string): Conciliacao {
  const { inicio, fim } = limitesMes(mes)
  return conciliarPeriodo(caucoes, inicio, fim)
}

/** Conciliação de um período qualquer (datas AAAA-MM-DD, inclusive). */
export function conciliarPeriodo(caucoes: Caucao[], inicio: string, fim: string): Conciliacao {
  const linhas: LinhaConciliacao[] = []
  const lancamentos: Movimento[] = []
  let semData = 0
  for (const c of caucoes) {
    if ((c.valor_caucao && !c.data_recebimento) || (c.taxa_junta && !c.data_pagamento_taxa) || (c.valor_certificado && !c.data_pagamento_certificado)) semData++
    const mov = movimentos(c)
    const doMes = mov.filter((x) => x.data >= inicio && x.data <= fim)
    const saldoAnterior = r2(mov.filter((x) => x.data < inicio).reduce((s, x) => s + x.valor, 0))
    if (!doMes.length && !saldoAnterior) continue
    const soma = (t: TipoMovimento) => r2(doMes.filter((x) => x.tipo === t).reduce((s, x) => s + x.valor, 0))
    const l = {
      caucao: c,
      saldoAnterior,
      creditos: soma('caucao'),
      taxa: soma('taxa'),
      certificado: soma('certificado'),
      apropriacao: soma('apropriacao'),
      saldoFinal: 0,
    }
    l.saldoFinal = r2(l.saldoAnterior + l.creditos + l.taxa + l.certificado + l.apropriacao)
    linhas.push(l)
    lancamentos.push(...doMes)
  }
  linhas.sort((a, b) => a.caucao.cliente.localeCompare(b.caucao.cliente, 'pt-BR'))
  lancamentos.sort((a, b) => a.data.localeCompare(b.data) || a.cliente.localeCompare(b.cliente, 'pt-BR'))
  const tot = (k: keyof Omit<LinhaConciliacao, 'caucao'>) => r2(linhas.reduce((s, l) => s + l[k], 0))
  return {
    linhas,
    lancamentos,
    totais: {
      saldoAnterior: tot('saldoAnterior'),
      creditos: tot('creditos'),
      taxa: tot('taxa'),
      certificado: tot('certificado'),
      apropriacao: tot('apropriacao'),
      saldoFinal: tot('saldoFinal'),
    },
    semData,
  }
}

// ---------------------------------------------------------------------------
// Resumo do período: o que "sobra" de cada caução vai para receita (ou prejuízo).
// Um caução está "concluído" quando foi recebido e a taxa da junta e o certificado
// foram pagos (use valor 0 quando um deles não se aplica). A data de conclusão é a
// mais recente das três; é ela que define o mês em que o saldo pode ir para receita.
// ---------------------------------------------------------------------------

export function dataConclusao(c: Caucao): string | null {
  if (c.valor_caucao === null || !c.data_recebimento) return null
  const taxa = c.taxa_junta === 0 ? c.data_recebimento : c.taxa_junta !== null ? c.data_pagamento_taxa : null
  const cert = c.valor_certificado === 0 ? c.data_recebimento : c.valor_certificado !== null ? c.data_pagamento_certificado : null
  if (!taxa || !cert) return null
  return [c.data_recebimento, taxa, cert].sort().at(-1)!
}

export type SituacaoReceita = 'a_transferir' | 'transferido'

export interface ItemReceita {
  caucao: Caucao
  conclusao: string
  /** Concluído antes do início do período e ainda não transferido. */
  anterior: boolean
  situacao: SituacaoReceita
  /** Lucro (+) ou prejuízo (−) do cliente. */
  valor: number
}

export interface ResumoReceita {
  movimento: Conciliacao
  itens: ItemReceita[]
  aTransferir: { lucro: number; prejuizo: number; liquido: number; doPeriodo: number; anteriores: number; qtd: number }
  transferido: { lucro: number; prejuizo: number; liquido: number; qtd: number }
  /** Recebidos que ainda aguardam pagamento da taxa ou do certificado. */
  aguardando: { qtd: number; saldo: number }
}

export function resumirPeriodo(caucoes: Caucao[], inicio: string, fim: string): ResumoReceita {
  const itens: ItemReceita[] = []
  const aguardando = { qtd: 0, saldo: 0 }
  for (const c of caucoes) {
    const conclusao = dataConclusao(c)
    if (!conclusao) {
      if (c.data_recebimento && c.data_recebimento <= fim && !c.data_apropriacao) {
        aguardando.qtd++
        aguardando.saldo += movimentos(c)
          .filter((m) => m.data <= fim)
          .reduce((s, m) => s + m.valor, 0)
      }
      continue
    }
    if (conclusao > fim) continue
    if (c.data_apropriacao && c.data_apropriacao < inicio) continue // já transferido antes
    const transferido = !!c.data_apropriacao && c.data_apropriacao <= fim
    itens.push({ caucao: c, conclusao, anterior: conclusao < inicio, situacao: transferido ? 'transferido' : 'a_transferir', valor: resultado(c) })
  }
  itens.sort((a, b) => a.caucao.cliente.localeCompare(b.caucao.cliente, 'pt-BR'))
  const soma = (l: ItemReceita[], f: (i: ItemReceita) => boolean) => r2(l.filter(f).reduce((s, i) => s + i.valor, 0))
  const at = itens.filter((i) => i.situacao === 'a_transferir')
  const tr = itens.filter((i) => i.situacao === 'transferido')
  return {
    movimento: conciliarPeriodo(caucoes, inicio, fim),
    itens,
    aTransferir: {
      lucro: soma(at, (i) => i.valor > 0),
      prejuizo: soma(at, (i) => i.valor < 0),
      liquido: soma(at, () => true),
      doPeriodo: soma(at, (i) => !i.anterior),
      anteriores: soma(at, (i) => i.anterior),
      qtd: at.length,
    },
    transferido: { lucro: soma(tr, (i) => i.valor > 0), prejuizo: soma(tr, (i) => i.valor < 0), liquido: soma(tr, () => true), qtd: tr.length },
    aguardando: { qtd: aguardando.qtd, saldo: r2(aguardando.saldo) },
  }
}
