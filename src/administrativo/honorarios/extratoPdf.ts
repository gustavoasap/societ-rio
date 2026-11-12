// Leitura de extrato bancário em PDF (melhor esforço: cada banco tem um layout).
// O texto é agrupado em linhas pela posição na página; cada linha com data + valor vira um lançamento.
import type { Lancamento } from './extrato'

const RE_VALOR = /(-?\s?R?\$?\s?\d{1,3}(?:\.\d{3})*,\d{2})\s?([CD])?(?![\d])/gi
const RE_DATA = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\b/
const DEBITO = /\b(PAGAMENTO|PAGTO|PGTO|ENVIAD[OA]|TARIFA|D[ÉE]BITO|SAQUE|COMPRA|TRANSF(?:ER[ÊE]NCIA)? ENVIADA|PIX ENVIADO|PIX EMITIDO|IOF|JUROS)\b/i
const IGNORAR = /\b(SALDO|S A L D O|TOTAL)\b/i

function valorBR(t: string) {
  const neg = /-/.test(t)
  const n = Number(t.replace(/[^\d,]/g, '').replace(',', '.'))
  return neg ? -n : n
}

/** Converte as linhas de texto do PDF em lançamentos. Exportada para teste. */
export function lancamentosDeLinhas(linhas: string[], anoPadrao: number): Lancamento[] {
  // Ano do extrato: o primeiro dd/mm/aaaa que aparecer
  const comAno = linhas.join(' ').match(/\b\d{2}\/\d{2}\/(\d{4})\b/)
  const ano = comAno ? Number(comAno[1]) : anoPadrao
  const r: Lancamento[] = []
  let ultimo: Lancamento | null = null
  for (const bruta of linhas) {
    const linha = bruta.replace(/\s+/g, ' ').trim()
    if (!linha) continue
    const d = linha.match(RE_DATA)
    const valores = [...linha.matchAll(RE_VALOR)]
    if (!d || !valores.length || IGNORAR.test(linha)) {
      // Linha de continuação (ex.: nome do pagador na linha de baixo)
      if (ultimo && !d && !valores.length && linha.length < 120 && !IGNORAR.test(linha)) ultimo.descricao = `${ultimo.descricao} ${linha}`.trim()
      else ultimo = null
      continue
    }
    const a = d[3] ? (d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])) : ano
    const data = `${a}-${d[2]}-${d[1]}`
    // Com dois ou mais valores na linha, o primeiro é o lançamento e o último costuma ser o saldo
    const v = valores[0]
    let valor = valorBR(v[1])
    if (v[2]?.toUpperCase() === 'D') valor = -Math.abs(valor)
    let descricao = linha.slice(d[0].length, v.index).replace(/\s+/g, ' ').trim()
    // Sem sinal no extrato: palavras de débito indicam saída
    if (valor > 0 && !v[2] && !/-/.test(v[1]) && DEBITO.test(descricao)) valor = -valor
    descricao = descricao.replace(/^[-–\s]+|[-–\s]+$/g, '')
    ultimo = { id: '', data, valor, descricao }
    r.push(ultimo)
  }
  return r.map((l, i) => ({ ...l, id: `pdf:${l.data}|${l.valor}|${l.descricao}|${i}` }))
}

/** Lê o PDF no navegador (pdf.js) e devolve os lançamentos. */
export async function lerPdf(buf: ArrayBuffer): Promise<Lancamento[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const linhas: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pag = await doc.getPage(p)
    const conteudo = await pag.getTextContent()
    const porY = new Map<number, { x: number; t: string }[]>()
    for (const item of conteudo.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5] / 3) * 3
      const x = item.transform[4]
      porY.set(y, [...(porY.get(y) ?? []), { x, t: item.str }])
    }
    ;[...porY.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, itens]) =>
        linhas.push(
          itens
            .sort((a, b) => a.x - b.x)
            .map((i) => i.t)
            .join(' '),
        ),
      )
  }
  return lancamentosDeLinhas(linhas, new Date().getFullYear())
}
