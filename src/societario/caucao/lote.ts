// Recebimento de caução em lote: lê a lista (colada do Excel/WhatsApp ou de um arquivo),
// encontra cada cliente no cadastro e aponta erros e inconsistências antes de gravar.
import { lerNumeroBR } from '../../lib/format'
import type { Caucao } from './tipos'

export type Gravidade = 'erro' | 'alerta'

export interface Problema {
  gravidade: Gravidade
  texto: string
}

export interface LinhaLote {
  /** Número da linha na lista colada (1, 2, 3...). */
  linha: number
  nomeDigitado: string
  valorDigitado: number | null
  dataDigitada: string | null
  caucao: Caucao | null
  /** Outros cadastros parecidos, quando o nome não é único. */
  candidatos: Caucao[]
  /** Cliente que não existe no cadastro e será criado com o nome da lista. */
  novo: boolean
  valor: number | null
  data: string | null
  problemas: Problema[]
}

const PALAVRAS_IGNORADAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'ss', 'slu', 'mei', 'cia', 'e', 'de', 'da', 'do', 'das', 'dos'])

/** Nome comparável: sem acento, minúsculo, sem pontuação e sem "Ltda", "ME", "EPP"... */
export function normalizarNome(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((p) => p && !PALAVRAS_IGNORADAS.has(p))
    .join(' ')
}

const DATA_BR = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/

/** Aceita 05/11/2026, 5/11/26, 2026-11-05 ou número de série de data do Excel. */
export function lerData(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
    const n = Math.floor(Number(v))
    if (n < 20000 || n > 80000) return null
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000)
    return d.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  let a: number, m: number, d: number
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else {
    const br = s.match(DATA_BR)
    if (!br) return null
    ;[d, m, a] = [Number(br[1]), Number(br[2]), Number(br[3])]
    if (a < 100) a += 2000
  }
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

export interface EntradaLote {
  linha: number
  nome: string
  valor: string | number | null
  data: string | number | null
}

const pareceValor = (s: string) => /^(R\$\s*)?-?[\d.]+(,\d{1,2})?$|^(R\$\s*)?-?\d+(\.\d{1,2})?$/.test(s.trim())

/**
 * Lê o texto colado: uma linha por cliente. Colunas separadas por TAB (Excel), ";" ou " - ".
 * Em cada linha, o que parece data vira a data, o que parece valor vira o valor e o resto é o nome.
 */
export function lerTextoLote(texto: string): EntradaLote[] {
  const entradas: EntradaLote[] = []
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const linha = bruta.trim()
    if (!linha) return
    const partes = linha
      .split(/\t|;|\s+[-–]\s+|\s{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
    let valor: string | null = null
    let data: string | null = null
    const nome: string[] = []
    for (const p of partes) {
      if (!data && lerData(p) && !/^\d{5}$/.test(p)) data = p
      else if (!valor && pareceValor(p) && /\d/.test(p)) valor = p
      else nome.push(p)
    }
    // Cabeçalho copiado junto ("Cliente / Valor / Data")
    if (i === 0 && !valor && !data && /cliente|nome|empresa/i.test(linha)) return
    entradas.push({ linha: i + 1, nome: nome.join(' '), valor, data })
  })
  return entradas
}

/** Lê linhas de uma planilha: procura as colunas pelo título (cliente, valor, data). */
export function lerPlanilhaLote(linhas: (string | number | boolean | null)[][]): EntradaLote[] {
  const idxCab = linhas.findIndex((l) => l.some((c) => typeof c === 'string' && /cliente|nome|empresa|raz[aã]o/i.test(c)))
  const cab = (idxCab >= 0 ? linhas[idxCab] : []).map((c) => String(c ?? '').toLowerCase())
  const col = (re: RegExp, padrao: number) => {
    const i = cab.findIndex((c) => re.test(c))
    return i >= 0 ? i : padrao
  }
  const cNome = col(/cliente|nome|empresa|raz/, 0)
  const cValor = col(/valor|cau[cç][aã]o|r\$/, 1)
  const cData = col(/data|pag|receb/, 2)
  const entradas: EntradaLote[] = []
  linhas.slice(idxCab + 1).forEach((l, i) => {
    const nome = String(l[cNome] ?? '').trim()
    if (!nome) return
    const v = l[cValor]
    const d = l[cData]
    entradas.push({ linha: idxCab + 2 + i, nome, valor: typeof v === 'boolean' ? null : (v ?? null), data: typeof d === 'boolean' ? null : (d ?? null) })
  })
  return entradas
}

function encontrar(nome: string, caucoes: Caucao[]) {
  const alvo = normalizarNome(nome)
  if (!alvo) return { achado: null, candidatos: [] as Caucao[] }
  const exatos = caucoes.filter((c) => normalizarNome(c.cliente) === alvo)
  if (exatos.length) return { achado: exatos.length === 1 ? exatos[0] : null, candidatos: exatos.length > 1 ? exatos : [] }
  // Contém (ex.: "Padaria Pão Quente" × "Padaria Pão Quente Comércio de Alimentos")
  const contem = caucoes.filter((c) => {
    const n = normalizarNome(c.cliente)
    return n.includes(alvo) || alvo.includes(n)
  })
  if (contem.length === 1) return { achado: contem[0], candidatos: [] }
  if (contem.length > 1) return { achado: null, candidatos: contem }
  // Palavras em comum (pelo menos 2, ou a única palavra do nome)
  const palavras = new Set(alvo.split(' '))
  const pontuados = caucoes
    .map((c) => {
      const p = normalizarNome(c.cliente).split(' ')
      const comuns = p.filter((x) => palavras.has(x) && x.length > 2).length
      return { c, comuns, total: Math.max(p.length, palavras.size) }
    })
    .filter((x) => x.comuns >= Math.min(2, palavras.size))
    .sort((a, b) => b.comuns / b.total - a.comuns / a.total)
  return { achado: null, candidatos: pontuados.slice(0, 3).map((x) => x.c) }
}

const moedaBR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Confere cada linha da lista contra o cadastro. `dataPadrao` vale para as linhas sem data.
 * `hoje` (AAAA-MM-DD) permite testar a regra de data futura.
 */
/** Valor especial de escolha: cadastrar a linha como cliente novo. */
export const NOVO_CLIENTE = '__novo__'

export interface OpcoesLote {
  dataPadrao: string | null
  /** AAAA-MM-DD de hoje (para a regra de data futura). */
  hoje: string
  /** Cliente escolhido à mão para uma linha (número da linha → id do caução). */
  escolhas?: Map<number, string>
  /** Quem pagou o lote. Omitido = manter o responsável do cadastro. */
  pagador?: { tipo: 'cliente' } | { tipo: 'parceiro'; parceiroId: string; nome: string }
  nomeParceiro?: (id: string | null) => string
}

export function validarLote(
  entradas: EntradaLote[],
  caucoes: Caucao[],
  { dataPadrao, hoje, escolhas, pagador, nomeParceiro = () => '' }: OpcoesLote,
): LinhaLote[] {
  const usados = new Map<string, number>()
  return entradas.map((e) => {
    const problemas: Problema[] = []
    const erro = (texto: string) => problemas.push({ gravidade: 'erro', texto })
    const alerta = (texto: string) => problemas.push({ gravidade: 'alerta', texto })

    const valorDigitado = e.valor === null || e.valor === '' ? null : typeof e.valor === 'number' ? e.valor : lerNumeroBR(e.valor)
    const dataDigitada = lerData(e.data)
    if (e.valor !== null && e.valor !== '' && valorDigitado === null) erro(`Valor "${e.valor}" não reconhecido.`)
    if (e.data !== null && e.data !== '' && !dataDigitada) erro(`Data "${e.data}" inválida.`)

    const escolhido = escolhas?.get(e.linha)
    const novo = escolhido === NOVO_CLIENTE
    const { achado, candidatos } = escolhido
      ? { achado: caucoes.find((c) => c.id === escolhido) ?? null, candidatos: [] as Caucao[] }
      : e.nome
        ? encontrar(e.nome, caucoes)
        : { achado: null, candidatos: [] as Caucao[] }
    if (!e.nome && !achado) erro('Linha sem nome de cliente.')
    else if (novo) alerta('Cliente novo: será cadastrado no Acompanhamento de Caução com o nome da lista.')
    else if (!achado && candidatos.length > 1) erro(`Nome parecido com ${candidatos.length} clientes: escolha qual é.`)
    else if (!achado && candidatos.length === 1) erro('Cliente não encontrado com esse nome exato: confirme a sugestão.')
    else if (!achado) erro('Cliente não encontrado no Acompanhamento de Caução.')

    const data = dataDigitada ?? dataPadrao
    if (!data) erro('Sem data de recebimento: informe na linha ou a data geral.')
    else if (data > hoje) erro(`Data ${dataBR(data)} está no futuro.`)

    let valor = valorDigitado
    if (achado) {
      const vezes = (usados.get(achado.id) ?? 0) + 1
      usados.set(achado.id, vezes)
      if (vezes > 1) erro('Cliente repetido na lista.')
      if (valor === null) valor = achado.valor_caucao
      if (valor === null) erro('Sem valor: informe na lista (não há valor de caução no cadastro).')
      else if (valor <= 0) erro('Valor deve ser maior que zero.')
      if (valorDigitado !== null && achado.valor_caucao !== null && Math.abs(valorDigitado - achado.valor_caucao) >= 0.005)
        alerta(`Valor diferente do cadastrado (${moedaBR(achado.valor_caucao)}): será atualizado para ${moedaBR(valorDigitado)}.`)
      if (achado.data_recebimento) alerta(`Já consta recebido em ${dataBR(achado.data_recebimento)}: a data será substituída.`)
      if (achado.data_apropriacao) erro(`Saldo já baixado para resultado em ${dataBR(achado.data_apropriacao)}: altere pelo cadastro do cliente.`)
      if (pagador) {
        const atual =
          achado.responsavel_tipo === 'parceiro' ? `o parceiro ${nomeParceiro(achado.responsavel_parceiro_id) || '(sem nome)'}` : 'o próprio cliente'
        const novo = pagador.tipo === 'parceiro' ? `o parceiro ${pagador.nome}` : 'o próprio cliente'
        const igual =
          pagador.tipo === 'cliente'
            ? achado.responsavel_tipo === 'cliente'
            : achado.responsavel_tipo === 'parceiro' && achado.responsavel_parceiro_id === pagador.parceiroId
        if (!igual) alerta(`No cadastro, quem paga o caução é ${atual}: será alterado para ${novo}.`)
      }
      if (data && achado.data_pagamento_taxa && achado.data_pagamento_taxa < data && !achado.data_recebimento)
        alerta(`A taxa da junta foi paga antes (${dataBR(achado.data_pagamento_taxa)}) do recebimento.`)
    } else if (novo && valor === null) erro('Cliente novo precisa do valor do caução na lista.')
    else if (valor !== null && valor <= 0) erro('Valor deve ser maior que zero.')

    return {
      linha: e.linha,
      nomeDigitado: e.nome,
      valorDigitado,
      dataDigitada,
      caucao: achado,
      candidatos: achado ? [] : candidatos,
      novo,
      valor,
      data,
      problemas,
    }
  })
}

export const temErro = (l: LinhaLote) => l.problemas.some((p) => p.gravidade === 'erro')
