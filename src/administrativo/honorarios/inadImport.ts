// Importação da inadimplência anterior (planilha do sistema de cobrança) com erros e advertências.
import { normalizar, nomeNaDescricao } from './extrato'

export interface ClienteImport {
  id: string
  codigo: number
  razao_social: string
  nome_fantasia: string | null
  cnpj: string | null
  status: string
  sem_honorario: boolean
}

export type NivelImport = 'ok' | 'advertencia' | 'erro' | 'ignorado'

export interface LinhaImport {
  linha: number
  texto: string
  cliente: ClienteImport | null
  vencimento: string | null
  competencia: string | null
  valor: number | null
  descricao: string
  nivel: NivelImport
  motivos: string[]
}

const tem = (cab: string, ...ps: string[]) => ps.some((p) => cab.includes(p))

/** Data em DD/MM/AAAA, AAAA-MM-DD ou número de série do Excel. */
export function lerData(v: string): string | null {
  const t = (v ?? '').trim()
  if (!t) return null
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (br) {
    const a = br[3].length === 2 ? `20${br[3]}` : br[3]
    return `${a}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const mesAno = t.match(/^(\d{1,2})\/(\d{4})$/)
  if (mesAno) return `${mesAno[2]}-${mesAno[1].padStart(2, '0')}-01`
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(t)) * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

export function lerValor(v: string): number | null {
  let t = (v ?? '').replace(/[R$\s]/g, '')
  if (!t) return null
  const neg = t.startsWith('-')
  t = t.replace(/^-/, '')
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  const n = Number(t)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

const PAGO = /\b(pag[oa]|quitad[oa]|recebid[oa]|liquidad[oa]|baixad[oa])\b/i

/**
 * Lê a planilha de inadimplência do sistema: acha as colunas pelo título (CNPJ, código, cliente,
 * vencimento, competência, valor/saldo, situação), identifica o cliente na Base e aponta inconsistências.
 * `desde` (AAAA-MM-DD): a partir desta competência a inadimplência já é automática no portal.
 * `honorarioNoMes`: valor do honorário da base para o cliente no mês (para conferir o valor).
 */
export function analisarInadimplencia(
  linhas: string[][],
  clientes: ClienteImport[],
  desde: string,
  honorarioNoMes: (clienteId: string, mes: string) => number | null,
): { colunas: Record<string, string>; itens: LinhaImport[] } {
  const iCab = linhas.findIndex((l) => l.filter((c) => c.trim()).length >= 2)
  const cab = (linhas[iCab] ?? []).map((c) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))
  const acha = (f: (c: string) => boolean) => cab.findIndex(f)
  const iCnpj = acha((c) => tem(c, 'cnpj', 'cpf/cnpj', 'documento'))
  const iCod = acha((c) => /^c(o|ó)?d(igo)?\.?$|codigo|cod\. cliente/.test(c))
  const iNome = acha((c) => tem(c, 'cliente', 'razao', 'nome', 'sacado', 'pagador'))
  const iVenc = acha((c) => tem(c, 'venc'))
  const iComp = acha((c) => tem(c, 'compet', 'refer', 'mes ref'))
  const iValor = [acha((c) => tem(c, 'aberto', 'saldo', 'a receber', 'devido')), acha((c) => tem(c, 'valor', 'total'))].find((i) => i >= 0) ?? -1
  const iSit = acha((c) => tem(c, 'situa', 'status'))
  const colunas: Record<string, string> = {}
  const nomeCol = (i: number) => (i >= 0 ? (linhas[iCab]?.[i] ?? '') : '—')
  colunas['CNPJ'] = nomeCol(iCnpj)
  colunas['Código'] = nomeCol(iCod)
  colunas['Cliente'] = nomeCol(iNome)
  colunas['Vencimento'] = nomeCol(iVenc)
  colunas['Competência'] = nomeCol(iComp)
  colunas['Valor'] = nomeCol(iValor)
  colunas['Situação'] = nomeCol(iSit)

  const porCnpj = new Map(clientes.filter((c) => c.cnpj).map((c) => [c.cnpj!, c]))
  const porCod = new Map(clientes.map((c) => [c.codigo, c]))
  const vistos = new Set<string>()
  const de = desde.slice(0, 7)

  const itens = linhas.slice(iCab + 1).flatMap((l, k): LinhaImport[] => {
    if (!l.some((c) => c.trim())) return []
    const motivos: string[] = []
    let nivel: NivelImport = 'ok'
    const sobe = (n: NivelImport, m: string) => {
      motivos.push(m)
      const ordem: NivelImport[] = ['ok', 'advertencia', 'ignorado', 'erro']
      if (ordem.indexOf(n) > ordem.indexOf(nivel)) nivel = n
    }
    const nome = iNome >= 0 ? (l[iNome] ?? '').trim() : ''
    const doc = iCnpj >= 0 ? (l[iCnpj] ?? '').replace(/\D/g, '') : ''
    const cod = iCod >= 0 ? Number((l[iCod] ?? '').replace(/\D/g, '')) : NaN
    let cliente = (doc.length === 14 ? porCnpj.get(doc) : undefined) ?? (Number.isInteger(cod) && cod > 0 ? porCod.get(cod) : undefined) ?? null
    if (!cliente && nome) {
      const n = normalizar(nome)
      cliente =
        clientes.find((c) => normalizar(c.razao_social) === n || (c.nome_fantasia && normalizar(c.nome_fantasia) === n)) ??
        clientes.find((c) => nomeNaDescricao(c.razao_social, nome)) ??
        null
    }
    const vencimento = iVenc >= 0 ? lerData(l[iVenc] ?? '') : null
    const compBruta = iComp >= 0 ? lerData(l[iComp] ?? '') : null
    const competencia = compBruta ? `${compBruta.slice(0, 7)}-01` : vencimento ? `${vencimento.slice(0, 7)}-01` : null
    const valor = iValor >= 0 ? lerValor(l[iValor] ?? '') : null
    const situacao = iSit >= 0 ? (l[iSit] ?? '') : ''

    if (!cliente) sobe('erro', `Cliente não encontrado na Base${nome ? ` (“${nome}”)` : doc ? ` (documento ${doc})` : ''}`)
    if (valor === null || valor <= 0) sobe('erro', 'Sem valor em aberto')
    if (!competencia) sobe('erro', 'Sem data de vencimento ou competência')
    if (situacao && PAGO.test(situacao)) sobe('ignorado', `Situação “${situacao}”: não está em aberto`)
    if (competencia && competencia.slice(0, 7) >= de) sobe('ignorado', 'Competência já controlada automaticamente pelo portal')
    if (cliente?.status === 'encerrado') sobe('advertencia', 'Cliente inativo na Base')
    if (cliente?.sem_honorario) sobe('advertencia', 'Cliente marcado como sem honorário')
    if (cliente && competencia && valor && valor > 0) {
      const base = honorarioNoMes(cliente.id, competencia.slice(0, 7))
      if (base === null && !cliente.sem_honorario) sobe('advertencia', 'Cliente sem honorário cadastrado nesse mês')
      else if (base !== null && Math.abs(base - valor) >= 0.01)
        sobe('advertencia', `Valor diferente do honorário da base (${base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`)
      const chave = `${cliente.id}|${vencimento ?? competencia}|${valor}`
      if (vistos.has(chave)) sobe('ignorado', 'Linha repetida na planilha')
      vistos.add(chave)
    }
    return [
      {
        linha: iCab + k + 2,
        texto: l.filter(Boolean).join(' · '),
        cliente,
        vencimento,
        competencia,
        valor,
        descricao: [nome, situacao].filter(Boolean).join(' · '),
        nivel,
        motivos,
      },
    ]
  })
  return { colunas, itens }
}
