import { supabase } from '../lib/supabase'
import type { ConfigNcm, Estabelecimento, MovimentoLinha, Parametros, RegimeAtual, RegimeFornecedor, TipoMovimento } from './engine/tipos'
import type { LinhaImportada, Parceiro, TipoRelatorio } from './importacao/relatorios'

export interface Empresa {
  id: string
  razao_social: string
  cnpj: string | null
  regime_atual: RegimeAtual
  cnae: string | null
  observacoes: string | null
  parametros: Partial<Parametros>
  created_at: string
  updated_at: string
}

export interface EmpresaComEstab extends Empresa {
  trib_estabelecimentos: Estabelecimento[]
}

export interface Importacao {
  id: string
  empresa_id: string
  estabelecimento_id: string
  arquivo: string
  tipo_relatorio: TipoRelatorio
  tipo_movimento: TipoMovimento
  competencia_inicio: string
  competencia_fim: string
  registros: number
  valor_total: number
  created_at: string
}

/** Logo após o login o token pode chegar com horário levemente à frente do servidor ("JWT issued at future"). */
async function comRetentativa<T extends { error: { message: string } | null }>(fn: () => PromiseLike<T>): Promise<T> {
  let r = await fn()
  for (let i = 0; i < 3 && /issued at future/i.test(r.error?.message ?? ''); i++) {
    await new Promise((ok) => setTimeout(ok, 1500))
    r = await fn()
  }
  return r
}

function erro(e: { message: string } | null) {
  if (e) throw new Error(e.message)
}

export async function listarEmpresas(): Promise<EmpresaComEstab[]> {
  const r = await comRetentativa(() => supabase.from('trib_empresas').select('*, trib_estabelecimentos(*)').order('razao_social'))
  erro(r.error)
  return (r.data as EmpresaComEstab[]) ?? []
}

export async function salvarEmpresa(
  dados: Pick<Empresa, 'razao_social' | 'cnpj' | 'regime_atual' | 'cnae' | 'observacoes'> & { id?: string; parametros?: Partial<Parametros> },
  estabelecimentos: (Omit<Estabelecimento, 'id'> & { id?: string })[],
  removidos: string[],
): Promise<string> {
  const { id, ...campos } = dados
  let empresaId = id
  if (id) {
    const { error } = await supabase.from('trib_empresas').update(campos).eq('id', id)
    erro(error)
  } else {
    const { data, error } = await supabase.from('trib_empresas').insert(campos).select('id').single()
    erro(error)
    empresaId = data!.id as string
  }
  if (removidos.length) {
    const { error } = await supabase.from('trib_estabelecimentos').delete().in('id', removidos)
    erro(error)
  }
  for (const e of estabelecimentos) {
    const { id: eid, ...rest } = e
    const linha = { ...rest, empresa_id: empresaId }
    const { error } = eid ? await supabase.from('trib_estabelecimentos').update(linha).eq('id', eid) : await supabase.from('trib_estabelecimentos').insert(linha)
    if (error?.message.includes('trib_estabelecimentos_cnpj_unico')) throw new Error(`O CNPJ ${e.cnpj} já está cadastrado em outra empresa.`)
    erro(error)
  }
  return empresaId!
}

export async function excluirEmpresa(id: string) {
  const { error } = await supabase.from('trib_empresas').delete().eq('id', id)
  erro(error)
}

export async function salvarParametros(empresaId: string, parametros: Parametros) {
  // o tratamento por NCM fica na tabela trib_ncms
  const { ncms: _ncms, regimeFornecedores: _regimes, ...resto } = parametros
  const { error } = await supabase.from('trib_empresas').update({ parametros: resto }).eq('id', empresaId)
  erro(error)
}

export async function listarImportacoes(empresaId: string): Promise<Importacao[]> {
  const { data, error } = await supabase.from('trib_importacoes').select('*').eq('empresa_id', empresaId).order('created_at', { ascending: false })
  erro(error)
  return (data as Importacao[]) ?? []
}

const CAMPOS_MOV =
  'estabelecimento_id, competencia, tipo, cfop, ncm, uf, cst, servico, destinatario, parceiro, itens, valor_contabil, bc_icms, icms, icms_st, ipi, pis, cofins, iss, difal, retencoes'

/** Carrega todo o movimento da empresa (paginado — o Supabase devolve no máximo 1.000 linhas por consulta). */
export async function carregarMovimentos(empresaId: string): Promise<MovimentoLinha[]> {
  const todas: MovimentoLinha[] = []
  const pagina = 1000
  for (let de = 0; ; de += pagina) {
    const { data, error } = await supabase.from('trib_movimentos').select(CAMPOS_MOV).eq('empresa_id', empresaId).order('id').range(de, de + pagina - 1)
    erro(error)
    const linhas = (data ?? []) as MovimentoLinha[]
    todas.push(...linhas.map((l) => ({ ...l, ...numeros(l) })))
    if (linhas.length < pagina) break
  }
  return todas
}

// numeric do Postgres chega como string ou número conforme o driver; normaliza
function numeros(l: MovimentoLinha) {
  const n = (v: unknown) => Number(v) || 0
  return {
    itens: n(l.itens),
    valor_contabil: n(l.valor_contabil),
    bc_icms: n(l.bc_icms),
    icms: n(l.icms),
    icms_st: n(l.icms_st),
    ipi: n(l.ipi),
    pis: n(l.pis),
    cofins: n(l.cofins),
    iss: n(l.iss),
    difal: n(l.difal),
    retencoes: n(l.retencoes),
  }
}

/** Importações do mesmo estabelecimento/tipo que cobrem alguma das competências (para substituir). */
export async function importacoesSobrepostas(estabelecimentoId: string, tipo: TipoMovimento, inicio: string, fim: string): Promise<Importacao[]> {
  const { data, error } = await supabase
    .from('trib_importacoes')
    .select('*')
    .eq('estabelecimento_id', estabelecimentoId)
    .eq('tipo_movimento', tipo)
    .lte('competencia_inicio', fim)
    .gte('competencia_fim', inicio)
  erro(error)
  return (data as Importacao[]) ?? []
}

export async function gravarImportacao(args: {
  empresaId: string
  estabelecimentoId: string
  arquivo: string
  tipoRelatorio: TipoRelatorio
  tipoMovimento: TipoMovimento
  linhas: LinhaImportada[]
  registros: number
  substituir: string[]
  produtos?: Record<string, string>
  parceiros?: Record<string, Parceiro>
}) {
  const comps = args.linhas.map((l) => l.competencia).sort()
  if (!comps.length) throw new Error('Nenhuma linha para importar.')
  if (args.substituir.length) {
    const { error } = await supabase.from('trib_importacoes').delete().in('id', args.substituir)
    erro(error)
  }
  const { data, error } = await supabase
    .from('trib_importacoes')
    .insert({
      empresa_id: args.empresaId,
      estabelecimento_id: args.estabelecimentoId,
      arquivo: args.arquivo,
      tipo_relatorio: args.tipoRelatorio,
      tipo_movimento: args.tipoMovimento,
      competencia_inicio: comps[0],
      competencia_fim: comps[comps.length - 1],
      registros: args.registros,
      valor_total: Math.round(args.linhas.reduce((s, l) => s + l.valor_contabil, 0) * 100) / 100,
    })
    .select('id')
    .single()
  erro(error)
  const importacaoId = data!.id as string
  const linhas = args.linhas.map((l) => ({ ...l, tipo: args.tipoMovimento, importacao_id: importacaoId, empresa_id: args.empresaId, estabelecimento_id: args.estabelecimentoId }))
  try {
    for (let i = 0; i < linhas.length; i += 500) {
      const { error: e } = await supabase.from('trib_movimentos').insert(linhas.slice(i, i + 500))
      erro(e)
    }
  } catch (e) {
    // desfaz a importação parcial
    await supabase.from('trib_importacoes').delete().eq('id', importacaoId)
    throw e
  }
  if (args.produtos) await registrarNcms(args.empresaId, args.produtos)
  if (args.parceiros) await registrarParceiros(args.empresaId, args.parceiros)
}

// ---------------------------------------------------------------------------
// NCM por empresa
// ---------------------------------------------------------------------------

export interface NcmRegistro {
  empresa_id: string
  ncm: string
  descricao: string | null
  monofasico: boolean | null
  st: boolean | null
  reducao: number | null
  aliquota_icms: number | null
  mva: number | null
}

export async function listarNcms(empresaId: string): Promise<NcmRegistro[]> {
  const { data, error } = await supabase.from('trib_ncms').select('*').eq('empresa_id', empresaId)
  erro(error)
  const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v))
  return ((data ?? []) as NcmRegistro[]).map((n) => ({ ...n, reducao: num(n.reducao), aliquota_icms: num(n.aliquota_icms), mva: num(n.mva) }))
}

/** Registra os NCMs novos encontrados na importação (os já existentes mantêm o tratamento definido). */
export async function registrarNcms(empresaId: string, produtos: Record<string, string>) {
  const linhas = Object.entries(produtos).map(([ncm, descricao]) => ({ empresa_id: empresaId, ncm, descricao: descricao || null }))
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('trib_ncms').upsert(linhas.slice(i, i + 500), { onConflict: 'empresa_id,ncm', ignoreDuplicates: true })
    erro(error)
  }
}

export type CamposNcm = Pick<NcmRegistro, 'monofasico' | 'st' | 'reducao' | 'aliquota_icms' | 'mva'>

export async function salvarNcm(empresaId: string, ncm: string, campos: CamposNcm) {
  const { error } = await supabase.from('trib_ncms').upsert({ empresa_id: empresaId, ncm, ...campos, updated_at: new Date().toISOString() }, { onConflict: 'empresa_id,ncm' })
  erro(error)
}

export function configDosNcms(registros: NcmRegistro[]): Record<string, ConfigNcm> {
  const r: Record<string, ConfigNcm> = {}
  for (const n of registros) {
    const c: ConfigNcm = {}
    if (n.monofasico !== null) c.monofasico = n.monofasico
    if (n.st !== null) c.st = n.st
    if (n.reducao !== null) c.reducao = n.reducao
    if (n.aliquota_icms !== null) c.aliquotaIcms = n.aliquota_icms
    if (n.mva !== null) c.mva = n.mva
    if (Object.keys(c).length) r[n.ncm] = c
  }
  return r
}

export async function excluirImportacao(id: string) {
  const { error } = await supabase.from('trib_importacoes').delete().eq('id', id)
  erro(error)
}

export async function adicionarEstabelecimento(empresaId: string, e: Omit<Estabelecimento, 'id'>): Promise<string> {
  const { data, error } = await supabase
    .from('trib_estabelecimentos')
    .insert({ ...e, empresa_id: empresaId })
    .select('id')
    .single()
  if (error?.message.includes('trib_estabelecimentos_cnpj_unico')) throw new Error(`O CNPJ ${e.cnpj} já está cadastrado em outra empresa.`)
  erro(error)
  return data!.id as string
}

// ---------------------------------------------------------------------------
// Clientes e fornecedores
// ---------------------------------------------------------------------------

export interface ParceiroRegistro {
  documento: string
  nome: string | null
  tipo: string
  uf: string | null
  municipio: string | null
  regime: RegimeFornecedor | null
}

export async function salvarRegimeFornecedor(empresaId: string, documento: string, regime: RegimeFornecedor | null) {
  const { error } = await supabase.from('trib_parceiros').update({ regime, updated_at: new Date().toISOString() }).eq('empresa_id', empresaId).eq('documento', documento)
  erro(error)
}

export function regimesDosParceiros(registros: ParceiroRegistro[]): Record<string, RegimeFornecedor> {
  const r: Record<string, RegimeFornecedor> = {}
  for (const p of registros) if (p.regime) r[p.documento] = p.regime
  return r
}

export async function listarParceiros(empresaId: string): Promise<ParceiroRegistro[]> {
  const todos: ParceiroRegistro[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from('trib_parceiros').select('documento, nome, tipo, uf, municipio, regime').eq('empresa_id', empresaId).range(de, de + 999)
    erro(error)
    todos.push(...((data ?? []) as ParceiroRegistro[]))
    if ((data ?? []).length < 1000) break
  }
  return todos
}

export async function registrarParceiros(empresaId: string, parceiros: Record<string, Parceiro>) {
  const linhas = Object.entries(parceiros).map(([documento, p]) => ({
    empresa_id: empresaId,
    documento,
    nome: p.nome || null,
    tipo: p.tipo,
    uf: p.uf || null,
    municipio: p.municipio || null,
  }))
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('trib_parceiros').upsert(linhas.slice(i, i + 500), { onConflict: 'empresa_id,documento', ignoreDuplicates: true })
    erro(error)
  }
}
