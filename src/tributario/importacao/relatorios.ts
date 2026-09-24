// Interpreta os relatórios fiscais exportados em Excel pelo sistema do escritório:
// - Registro de Entradas/Saídas — Detalhado (por item)
// - Resumo do Registro de Entradas/Saídas por CFOP
// - Registro de Serviços — Detalhado (tomados ou prestados)
// As linhas são agregadas por competência × CFOP × NCM × UF × CST × serviço, que é o que o motor precisa.
import { somarMeses } from '../engine/base'
import type { MovimentoLinha, TipoMovimento } from '../engine/tipos'
import { lerXlsx, type Celula } from './xlsx'

export type TipoRelatorio = 'entradas_detalhado' | 'saidas_detalhado' | 'entradas_resumo' | 'saidas_resumo' | 'servicos'

export const NOMES_RELATORIO: Record<TipoRelatorio, string> = {
  entradas_detalhado: 'Registro de Entradas — detalhado',
  saidas_detalhado: 'Registro de Saídas — detalhado',
  entradas_resumo: 'Resumo de Entradas por CFOP',
  saidas_resumo: 'Resumo de Saídas por CFOP',
  servicos: 'Registro de Serviços — detalhado',
}

export type LinhaImportada = Omit<MovimentoLinha, 'estabelecimento_id'>

export interface RelatorioLido {
  arquivo: string
  tipo: TipoRelatorio
  titulo: string
  empresa: string
  cnpj: string
  periodo: { inicio: string; fim: string } | null // AAAA-MM
  /** Tipo de serviço: definido pelo título quando possível; senão o usuário escolhe. */
  tipoServico: 'servico_tomado' | 'servico_prestado' | null
  linhas: LinhaImportada[]
  registros: number
  valorTotal: number
  /** Resumos que cobrem mais de um mês precisam de uma competência (ou rateio) escolhida pelo usuário. */
  exigeCompetencia: boolean
  avisos: string[]
}

const normalizar = (s: unknown) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const numero = (v: Celula | undefined): number => {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return 0
  const s = v.trim()
  // "1.234,56" (pt-BR) ou "1234.56"
  const n = /,\d{1,}$/.test(s) ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : 0
}

const texto = (v: Celula | undefined) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : String(v).trim())

/** Converte data do relatório (dd/mm/aaaa, aaaa-mm-dd ou número serial do Excel) em AAAA-MM. */
export function competenciaDe(v: Celula | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') {
    if (v < 20_000 || v > 80_000) return null
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000)
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}`
  m = s.match(/^(\d{4})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}`
  return null
}

function cabecalhoDoArquivo(celulas: Celula[][]) {
  const topo = celulas
    .slice(0, 15)
    .flat()
    .filter((c) => typeof c === 'string')
    .join('\n')
  const cnpj = topo.match(/CNPJ:\s*([\d./-]{14,18})/i)?.[1]?.replace(/\D/g, '') ?? ''
  const empresa = topo.match(/Empresa:\s*([^\n]+?)(?:\s*-\s*CNPJ|\s*\n|$)/i)?.[1]?.trim() ?? ''
  const per = topo.match(/Per[ií]odo:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i)
  const periodo = per ? { inicio: competenciaDe(per[1])!, fim: competenciaDe(per[2])! } : null
  return { topo, cnpj, empresa, periodo }
}

function acharCabecalho(celulas: Celula[][], obrigatorios: string[]) {
  for (let i = 0; i < Math.min(celulas.length, 40); i++) {
    const nomes = (celulas[i] ?? []).map(normalizar)
    if (obrigatorios.every((o) => nomes.includes(o))) {
      const indice = new Map<string, number>()
      nomes.forEach((n, j) => {
        if (n && !indice.has(n)) indice.set(n, j)
      })
      return { linha: i, indice }
    }
  }
  return null
}

/** Busca a coluna pelo primeiro nome (normalizado) que existir. */
const coluna = (indice: Map<string, number>, ...nomes: string[]) => {
  for (const n of nomes) {
    const i = indice.get(normalizar(n))
    if (i !== undefined) return i
  }
  return -1
}

class Agregador {
  private mapa = new Map<string, LinhaImportada>()
  registros = 0
  valorTotal = 0

  somar(chave: Omit<LinhaImportada, 'itens' | 'valor_contabil' | 'bc_icms' | 'icms' | 'icms_st' | 'ipi' | 'pis' | 'cofins' | 'iss' | 'difal' | 'retencoes'>, v: Partial<LinhaImportada>) {
    const k = [chave.competencia, chave.tipo, chave.cfop, chave.ncm, chave.uf, chave.cst, chave.servico].join('|')
    const atual =
      this.mapa.get(k) ??
      ({ ...chave, itens: 0, valor_contabil: 0, bc_icms: 0, icms: 0, icms_st: 0, ipi: 0, pis: 0, cofins: 0, iss: 0, difal: 0, retencoes: 0 } as LinhaImportada)
    atual.itens += v.itens ?? 1
    for (const campo of ['valor_contabil', 'bc_icms', 'icms', 'icms_st', 'ipi', 'pis', 'cofins', 'iss', 'difal', 'retencoes'] as const) atual[campo] += v[campo] ?? 0
    this.mapa.set(k, atual)
    this.registros++
    this.valorTotal += v.valor_contabil ?? 0
  }

  linhas() {
    const arred = (n: number) => Math.round(n * 100) / 100
    return [...this.mapa.values()].map((l) => ({
      ...l,
      valor_contabil: arred(l.valor_contabil),
      bc_icms: arred(l.bc_icms),
      icms: arred(l.icms),
      icms_st: arred(l.icms_st),
      ipi: arred(l.ipi),
      pis: arred(l.pis),
      cofins: arred(l.cofins),
      iss: arred(l.iss),
      difal: arred(l.difal),
      retencoes: arred(l.retencoes),
    }))
  }
}

function lerDetalhado(celulas: Celula[][], tipo: TipoMovimento, avisos: string[]) {
  const cab = acharCabecalho(celulas, ['cfop'])
  if (!cab) throw new Error('Cabeçalho com a coluna CFOP não encontrado.')
  const ix = cab.indice
  const c = {
    data: coluna(ix, 'Dt. Escrituração', 'Dt. Entrada', 'Dt. Saída', 'Dt. Emissão', 'Data Emissão', 'Data'),
    cfop: coluna(ix, 'CFOP'),
    ncm: coluna(ix, 'Código do NCM', 'NCM'),
    cst: coluna(ix, 'CST ICMS', 'CST', 'CSOSN'),
    uf: coluna(ix, 'Uf Forn/Cliente', 'UF', 'UF Destinatário', 'UF Cliente'),
    total: coluna(ix, 'Vr Total Item', 'Valor Total', 'Vr. Total'),
    contabil: coluna(ix, 'Vr. Contábil', 'Valor Contábil'),
    desconto: coluna(ix, 'Desconto'),
    frete: coluna(ix, 'Frete'),
    seguro: coluna(ix, 'Seguro'),
    outras: coluna(ix, 'Outras Desp.', 'Outras Despesas'),
    bcIcms: coluna(ix, 'BC ICMS'),
    icms: coluna(ix, 'VR ICMS', 'ICMS'),
    st: coluna(ix, 'ICMS ST'),
    ipi: coluna(ix, 'VR IPI', 'IPI'),
    pis: coluna(ix, 'Vr. PIS'),
    cofins: coluna(ix, 'Vr. COFINS'),
    difal: coluna(ix, 'DIFAL'),
    ret: ['PIS Retido', 'COFINS Retido', 'CSLL Retido', 'IRRF Retido', 'INSS Retido'].map((n) => coluna(ix, n)).filter((i) => i >= 0),
  }
  if (c.data < 0) throw new Error('Coluna de data não encontrada no relatório detalhado.')
  if (c.total < 0 && c.contabil < 0) throw new Error('Coluna de valor não encontrada no relatório detalhado.')

  const ag = new Agregador()
  let semData = 0
  for (let i = cab.linha + 1; i < celulas.length; i++) {
    const l = celulas[i] ?? []
    const cfop = texto(l[c.cfop]).replace(/\D/g, '')
    if (cfop.length !== 4) continue
    const comp = competenciaDe(l[c.data])
    if (!comp) {
      semData++
      continue
    }
    const v = (j: number) => (j >= 0 ? numero(l[j]) : 0)
    const ipi = v(c.ipi)
    const st = v(c.st)
    const valor = c.contabil >= 0 ? v(c.contabil) : v(c.total) - v(c.desconto) + v(c.frete) + v(c.seguro) + v(c.outras) + ipi + st
    ag.somar(
      { competencia: comp, tipo, cfop, ncm: texto(l[c.ncm]).replace(/\D/g, ''), uf: texto(l[c.uf]).toUpperCase(), cst: texto(l[c.cst]).replace(/\D/g, ''), servico: '' },
      {
        valor_contabil: valor,
        bc_icms: v(c.bcIcms),
        icms: v(c.icms),
        icms_st: st,
        ipi,
        pis: v(c.pis),
        cofins: v(c.cofins),
        difal: v(c.difal),
        retencoes: c.ret.reduce((s, j) => s + v(j), 0),
      },
    )
  }
  if (semData) avisos.push(`${semData} linha(s) sem data válida foram ignoradas.`)
  return ag
}

function lerResumoCfop(celulas: Celula[][], tipo: TipoMovimento, competencia: string) {
  const cab = acharCabecalho(celulas, ['codigo', 'vrcontabil'])
  if (!cab) throw new Error('Cabeçalho do resumo por CFOP (Código / Vr. Contábil) não encontrado.')
  const ix = cab.indice
  const c = {
    cfop: coluna(ix, 'Código', 'CFOP'),
    contabil: coluna(ix, 'Vr. Contábil'),
    bcIcms: coluna(ix, 'BC ICMS'),
    icms: coluna(ix, 'ICMS'),
    st: coluna(ix, 'Icms ST', 'ICMS ST'),
    ipi: coluna(ix, 'IPI', 'Vr. IPI'),
  }
  const ag = new Agregador()
  for (let i = cab.linha + 1; i < celulas.length; i++) {
    const l = celulas[i] ?? []
    const cfop = texto(l[c.cfop]).replace(/\D/g, '')
    if (cfop.length !== 4) continue
    const v = (j: number) => (j >= 0 ? numero(l[j]) : 0)
    ag.somar(
      { competencia, tipo, cfop, ncm: '', uf: '', cst: '', servico: '' },
      { valor_contabil: v(c.contabil), bc_icms: v(c.bcIcms), icms: v(c.icms), icms_st: v(c.st), ipi: v(c.ipi) },
    )
  }
  return ag
}

function lerServicos(celulas: Celula[][], tipo: TipoMovimento, avisos: string[]) {
  const cab = acharCabecalho(celulas, ['atividade'])
  if (!cab) throw new Error('Cabeçalho do registro de serviços (coluna Atividade) não encontrado.')
  const ix = cab.indice
  const c = {
    data: coluna(ix, 'Data', 'Dt. Emissão', 'Data Emissão'),
    uf: coluna(ix, 'UF Fornec/Cliente', 'UF'),
    atividade: coluna(ix, 'Atividade'),
    valor: coluna(ix, 'Valor Serviços'),
    contabil: coluna(ix, 'Vr. Contabil', 'Vr. Contábil'),
    iss: coluna(ix, 'ISSQN', 'ISS'),
    pis: coluna(ix, 'Vr. PIS'),
    cofins: coluna(ix, 'Vr, Cofins', 'Vr. Cofins'),
    ret: ['INSS', 'IRRF', 'CSLL', 'Vr. PIS Retido', 'Vr. Cofins Retido'].map((n) => coluna(ix, n)).filter((i) => i >= 0),
  }
  const ag = new Agregador()
  let semData = 0
  for (let i = cab.linha + 1; i < celulas.length; i++) {
    const l = celulas[i] ?? []
    const comp = competenciaDe(l[c.data])
    const v = (j: number) => (j >= 0 ? numero(l[j]) : 0)
    const valor = c.contabil >= 0 && v(c.contabil) ? v(c.contabil) : v(c.valor)
    if (!comp) {
      if (valor) semData++
      continue
    }
    if (!valor) continue
    ag.somar(
      { competencia: comp, tipo, cfop: '', ncm: '', uf: texto(l[c.uf]).toUpperCase(), cst: '', servico: texto(l[c.atividade]).replace(/[^\d.]/g, '') },
      { valor_contabil: valor, iss: v(c.iss), pis: v(c.pis), cofins: v(c.cofins), retencoes: c.ret.reduce((s, j) => s + v(j), 0) },
    )
  }
  if (semData) avisos.push(`${semData} linha(s) sem data válida foram ignoradas.`)
  return ag
}

/** Lê um relatório. Para resumos de vários meses, as linhas voltam com competência vazia (use `definirCompetencia`). */
export function lerRelatorio(dados: Uint8Array, arquivo: string, tipoServico?: 'servico_tomado' | 'servico_prestado'): RelatorioLido {
  const celulas = lerXlsx(dados)
  const cab = cabecalhoDoArquivo(celulas)
  const titulo = cab.topo.split('\n').find((t) => /registro|resumo/i.test(t))?.trim() ?? ''
  const tn = normalizar(titulo)
  const avisos: string[] = []

  let tipo: TipoRelatorio
  if (tn.includes('servico')) tipo = 'servicos'
  else if (tn.includes('resumo') && tn.includes('saida')) tipo = 'saidas_resumo'
  else if (tn.includes('resumo') && tn.includes('entrada')) tipo = 'entradas_resumo'
  else if (tn.includes('saida')) tipo = 'saidas_detalhado'
  else if (tn.includes('entrada')) tipo = 'entradas_detalhado'
  else throw new Error(`Relatório não reconhecido${titulo ? `: "${titulo}"` : ''}. Envie o Registro de Entradas/Saídas detalhado, o Resumo por CFOP ou o Registro de Serviços.`)

  let ag: Agregador
  let exigeCompetencia = false
  let servico: RelatorioLido['tipoServico'] = null
  if (tipo === 'servicos') {
    servico = /prestad/i.test(titulo) ? 'servico_prestado' : /tomad/i.test(titulo) ? 'servico_tomado' : null
    ag = lerServicos(celulas, tipoServico ?? servico ?? 'servico_tomado', avisos)
  } else if (tipo === 'saidas_resumo' || tipo === 'entradas_resumo') {
    const umMes = cab.periodo && cab.periodo.inicio === cab.periodo.fim
    exigeCompetencia = !umMes
    ag = lerResumoCfop(celulas, tipo === 'saidas_resumo' ? 'saida' : 'entrada', umMes ? cab.periodo!.inicio : '')
    if (exigeCompetencia)
      avisos.push(
        cab.periodo
          ? `O resumo cobre de ${cab.periodo.inicio} a ${cab.periodo.fim}. Escolha a competência ou ratear entre os meses — para a visão mensal exata, exporte o resumo mês a mês ou o relatório detalhado.`
          : 'Período do resumo não identificado: escolha a competência.',
      )
  } else {
    ag = lerDetalhado(celulas, tipo === 'saidas_detalhado' ? 'saida' : 'entrada', avisos)
  }

  const linhas = ag.linhas()
  if (!linhas.length) avisos.push('Nenhum lançamento encontrado no arquivo.')
  const comps = [...new Set(linhas.map((l) => l.competencia).filter(Boolean))].sort()
  return {
    arquivo,
    tipo,
    titulo,
    empresa: cab.empresa,
    cnpj: cab.cnpj,
    periodo: comps.length ? { inicio: comps[0], fim: comps[comps.length - 1] } : cab.periodo,
    tipoServico: servico,
    linhas,
    registros: ag.registros,
    valorTotal: Math.round(ag.valorTotal * 100) / 100,
    exigeCompetencia,
    avisos,
  }
}

/** Define a competência das linhas de um resumo: tudo em um mês, ou rateado igualmente entre `inicio` e `fim`. */
export function definirCompetencia(linhas: LinhaImportada[], inicio: string, fim = inicio): LinhaImportada[] {
  const meses: string[] = []
  for (let c = inicio; c <= fim && meses.length < 120; c = somarMeses(c, 1)) meses.push(c)
  const n = meses.length || 1
  const campos = ['valor_contabil', 'bc_icms', 'icms', 'icms_st', 'ipi', 'pis', 'cofins', 'iss', 'difal', 'retencoes'] as const
  return meses.flatMap((competencia, i) =>
    linhas.map((l) => {
      const nova: LinhaImportada = { ...l, competencia }
      for (const k of campos) {
        const parte = Math.round((l[k] / n) * 100) / 100
        // o último mês absorve a diferença de arredondamento
        nova[k] = i === n - 1 ? Math.round((l[k] - parte * (n - 1)) * 100) / 100 : parte
      }
      return nova
    }),
  )
}
