// Leitura de páginas escaneadas (imagem) do PDF com OCR (tesseract.js), no próprio navegador.
// O leitor e o idioma português são servidos pelo portal (public/ocr) e só carregam quando necessários.
import type { Worker } from 'tesseract.js'
import { importarModulo } from '../lib/importar'

let leitor: Promise<Worker> | null = null

function obterLeitor() {
  if (!leitor) {
    leitor = (async () => {
      const T = await importarModulo(() => import('tesseract.js'))
      const base = `${location.origin}/ocr`
      return T.createWorker('por', 1, { workerPath: `${base}/worker.min.js`, corePath: base, langPath: base, gzip: true })
    })()
    leitor.catch(() => {
      leitor = null
    })
  }
  return leitor
}

/** Libera a memória do leitor (chamar ao terminar um lote). */
export async function encerrarOcr() {
  const l = leitor
  leitor = null
  if (l) await (await l).terminate().catch(() => {})
}

/**
 * Texto do PDF página a página: páginas com texto são lidas direto; páginas que são imagem (escaneadas)
 * passam pelo OCR. Para assim que `bastou(texto)` responder sim (ex.: já achou os sócios).
 */
export async function textoComOcr(
  buf: ArrayBuffer,
  opcoes: { progresso?: (m: string) => void; bastou?: (texto: string) => boolean; maxPaginas?: number } = {},
): Promise<string> {
  const pdfjs = await importarModulo(() => import('pdfjs-dist'))
  const worker = await importarModulo(() => import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const total = Math.min(doc.numPages, opcoes.maxPaginas ?? 15)
  let texto = ''
  for (let p = 1; p <= total; p++) {
    const pag = await doc.getPage(p)
    const conteudo = await pag.getTextContent()
    const daPagina = conteudo.items.map((i) => ('str' in i ? i.str + (i.hasEOL ? '\n' : ' ') : '')).join('')
    // Página escaneada: quase nenhum texto (só o carimbo da Junta) e com imagem
    const ops = await pag.getOperatorList()
    const temImagem = ops.fnArray.some((f) => f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject)
    if (temImagem && daPagina.replace(/\s/g, '').length < 900) {
      opcoes.progresso?.(`lendo a imagem da página ${p} de ${total} (OCR)`)
      const viewport = pag.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await pag.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
      const l = await obterLeitor()
      const { data } = await l.recognize(canvas)
      texto += `${data.text}\n${daPagina}\n`
      canvas.width = canvas.height = 0
    } else texto += `${daPagina}\n`
    if (opcoes.bastou?.(texto)) break
  }
  return texto
}
