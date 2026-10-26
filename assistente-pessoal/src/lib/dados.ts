import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Aporte, Categoria, Config, Conta, Etapa, Lancamento, Meta, Objetivo, Pessoa, Recorrencia } from '../tipos'
import type { LinhaExtrato } from './extrato'
import { supabase } from './supabase'

// Qualquer gravação avisa as telas abertas para recarregarem os dados.
const EVENTO = 'dados-mudaram'
export function avisarMudanca() {
  window.dispatchEvent(new Event(EVENTO))
}

export function useDados<T>(carregar: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T>()
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const ref = useRef(carregar)
  useLayoutEffect(() => {
    ref.current = carregar
  })

  const recarregar = useCallback(() => {
    let ativo = true
    ref
      .current()
      .then((d) => {
        if (!ativo) return
        setDados(d)
        setErro(null)
      })
      .catch((e: unknown) => ativo && setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelar = recarregar()
    const ouvir = () => {
      cancelar()
      cancelar = recarregar()
    }
    window.addEventListener(EVENTO, ouvir)
    return () => {
      cancelar()
      window.removeEventListener(EVENTO, ouvir)
    }
  }, [recarregar])

  return { dados, erro, carregando }
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

// numeric do Postgres chega como número no supabase-js, mas garantimos
const num = <T extends object>(linhas: T[], campos: (keyof T)[]) =>
  linhas.map((l) => {
    const c = { ...l } as Record<keyof T, unknown>
    for (const k of campos) if (c[k] !== null && c[k] !== undefined) c[k] = Number(c[k])
    return c as T
  })

// ---------------------------------------------------------------- leitura

export async function buscarContas() {
  const [contas, saldos] = await Promise.all([
    supabase.from('pes_contas').select('*').order('ordem').order('nome'),
    supabase.from('pes_saldos').select('*'),
  ])
  const mapa = new Map(ok(saldos).map((s: { conta_id: string; saldo: number }) => [s.conta_id, Number(s.saldo)]))
  return num(ok(contas) as Conta[], ['saldo_inicial', 'limite']).map((c) => ({ ...c, saldo: mapa.get(c.id) ?? c.saldo_inicial }))
}
export type ContaComSaldo = Awaited<ReturnType<typeof buscarContas>>[number]

export async function buscarCategorias() {
  return num(ok(await supabase.from('pes_categorias').select('*').order('nome')) as Categoria[], ['orcamento_mensal'])
}

export async function buscarLancamentos(inicio: string, fim: string) {
  const linhas: Lancamento[] = []
  // pagina de 1000 em 1000 (limite padrão da API)
  for (let de = 0; ; de += 1000) {
    const r = ok(
      await supabase
        .from('pes_lancamentos')
        .select('*')
        .gte('data', inicio)
        .lte('data', fim)
        .order('data', { ascending: false })
        .order('criado_em', { ascending: false })
        .range(de, de + 999),
    ) as Lancamento[]
    linhas.push(...r)
    if (r.length < 1000) break
  }
  return num(linhas, ['valor'])
}

export async function buscarMetas() {
  const [metas, aportes] = await Promise.all([
    supabase.from('pes_metas').select('*').order('concluida').order('prazo', { nullsFirst: false }),
    supabase.from('pes_meta_aportes').select('*').order('data', { ascending: false }),
  ])
  return { metas: num(ok(metas) as Meta[], ['valor_alvo']), aportes: num(ok(aportes) as Aporte[], ['valor']) }
}

export async function buscarObjetivos() {
  const [objetivos, etapas] = await Promise.all([
    supabase.from('pes_objetivos').select('*').order('prazo', { nullsFirst: false }).order('criado_em'),
    supabase.from('pes_etapas').select('*').order('ordem').order('criado_em'),
  ])
  return { objetivos: ok(objetivos) as Objetivo[], etapas: ok(etapas) as Etapa[] }
}

export async function buscarPessoas() {
  return ok(await supabase.from('pes_pessoas').select('*').order('nome')) as Pessoa[]
}

export async function buscarRecorrencias() {
  return num(ok(await supabase.from('pes_recorrencias').select('*').order('tipo', { ascending: false }).order('dia')) as Recorrencia[], ['valor'])
}

export async function buscarConfig(): Promise<Config> {
  const d = ok(await supabase.from('pes_config').select('meses_reserva, pct_investimento, margem_folga').maybeSingle()) as Config | null
  return { meses_reserva: Number(d?.meses_reserva ?? 6), pct_investimento: Number(d?.pct_investimento ?? 20), margem_folga: Number(d?.margem_folga ?? 20) }
}

export async function salvarConfig(c: Partial<Config>) {
  ok(await supabase.from('pes_config').upsert({ unico: true, ...c, atualizado_em: new Date().toISOString() }))
  avisarMudanca()
}

// ---------------------------------------------------------------- conciliação bancária

export async function buscarExtrato(contaId: string, inicio: string, fim: string) {
  const r = await supabase.from('pes_extrato').select('*').eq('conta_id', contaId).gte('data', inicio).lte('data', fim).order('data').order('criado_em')
  return num(ok(r) as LinhaExtrato[], ['valor'])
}

/** Todas as chaves já importadas da conta (identificador do banco ou data|valor|descrição). */
export async function buscarChavesExtrato(contaId: string) {
  const r = await supabase.from('pes_extrato').select('data, valor, descricao, fitid').eq('conta_id', contaId).limit(20000)
  return num(ok(r) as Pick<LinhaExtrato, 'data' | 'valor' | 'descricao' | 'fitid'>[], ['valor'])
}

/** Saldo informado pelo banco mais recente até `ate`. */
export async function buscarSaldoExtrato(contaId: string, inicio: string, ate: string) {
  const r = await supabase.from('pes_extrato_saldos').select('data, saldo').eq('conta_id', contaId).gte('data', inicio).lte('data', ate).order('data', { ascending: false }).limit(1).maybeSingle()
  const d = ok(r) as { data: string; saldo: number } | null
  return d ? { data: d.data, saldo: Number(d.saldo) } : null
}

export async function salvarSaldoExtrato(contaId: string, data: string, saldo: number) {
  ok(await supabase.from('pes_extrato_saldos').upsert({ conta_id: contaId, data, saldo }))
  avisarMudanca()
}

/** Saldo da conta no app ao fim do dia `data` (saldo inicial + o que foi pago/recebido até lá). */
export async function saldoNaData(contaId: string, saldoInicial: number, data: string) {
  let total = Math.round(saldoInicial * 100)
  for (let de = 0; ; de += 1000) {
    const r = ok(
      await supabase
        .from('pes_lancamentos')
        .select('tipo, valor, conta_id, conta_destino_id')
        .or(`conta_id.eq.${contaId},conta_destino_id.eq.${contaId}`)
        .eq('pago', true)
        .lte('data', data)
        .order('id')
        .range(de, de + 999),
    ) as Pick<Lancamento, 'tipo' | 'valor' | 'conta_id' | 'conta_destino_id'>[]
    for (const l of r) {
      const v = Math.round(Number(l.valor) * 100)
      total += l.conta_destino_id === contaId ? v : l.tipo === 'receita' ? v : -v
    }
    if (r.length < 1000) break
  }
  return total / 100
}

/** Despesas em nome de outras pessoas ainda não reembolsadas. */
export async function buscarDeTerceiros() {
  const r = await supabase.from('pes_lancamentos').select('*').not('pessoa_id', 'is', null).eq('reembolsado', false).eq('tipo', 'despesa').order('data').limit(5000)
  return num(ok(r) as Lancamento[], ['valor'])
}

/** Cria no banco os lançamentos das recorrências (salário, aluguel...) até o mês que vem. */
export async function gerarRecorrencias() {
  const r = await supabase.rpc('pes_gerar_recorrencias')
  if (r.error) throw new Error(r.error.message)
  if ((r.data as number) > 0) avisarMudanca()
  return r.data as number
}

// ---------------------------------------------------------------- gravação

type Tabela = 'pes_extrato' | 'pes_contas' | 'pes_categorias' | 'pes_lancamentos' | 'pes_metas' | 'pes_meta_aportes' | 'pes_objetivos' | 'pes_etapas' | 'pes_pessoas' | 'pes_recorrencias'

export async function salvar<T extends object>(tabela: Tabela, id: string | null | undefined, valores: T) {
  const r = id ? await supabase.from(tabela).update(valores).eq('id', id).select().single() : await supabase.from(tabela).insert(valores).select().single()
  const d = ok(r) as T & { id: string }
  avisarMudanca()
  return d
}

export async function inserirVarios<T extends object>(tabela: Tabela, linhas: T[]) {
  ok(await supabase.from(tabela).insert(linhas))
  avisarMudanca()
}

/** Aplica a mesma alteração a este lançamento e aos próximos da mesma repetição. */
export async function atualizarDaquiEmDiante(l: Lancamento, valores: Partial<Lancamento>) {
  if (!l.grupo) return salvar('pes_lancamentos', l.id, valores)
  ok(await supabase.from('pes_lancamentos').update(valores).eq('grupo', l.grupo).gte('data', l.data))
  avisarMudanca()
}

export async function excluir(tabela: Tabela, id: string) {
  const r = await supabase.from(tabela).delete().eq('id', id)
  if (r.error) {
    // FK restrict: conta com lançamentos
    if (r.error.code === '23503') throw new Error('Este item está em uso por lançamentos. Desative-o em vez de excluir.')
    throw new Error(r.error.message)
  }
  avisarMudanca()
}

/** Exclui este lançamento e os próximos da mesma repetição. */
export async function excluirDaquiEmDiante(l: Lancamento) {
  if (!l.grupo) return excluir('pes_lancamentos', l.id)
  ok(await supabase.from('pes_lancamentos').delete().eq('grupo', l.grupo).gte('data', l.data))
  avisarMudanca()
}
