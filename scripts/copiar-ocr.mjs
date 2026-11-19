// Copia o leitor de texto em imagem (OCR: tesseract.js) e o idioma português para public/ocr,
// para o portal servir esses arquivos do próprio site (sem depender de CDN externa).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const destino = join(process.cwd(), 'public', 'ocr')
mkdirSync(destino, { recursive: true })

const tesseract = dirname(require.resolve('tesseract.js/package.json'))
const core = dirname(require.resolve('tesseract.js-core/package.json'))
const por = dirname(require.resolve('@tesseract.js-data/por/package.json'))

const arquivos = [
  [join(tesseract, 'dist', 'worker.min.js'), 'worker.min.js'],
  [join(core, 'tesseract-core-lstm.wasm.js'), 'tesseract-core-lstm.wasm.js'],
  [join(core, 'tesseract-core-simd-lstm.wasm.js'), 'tesseract-core-simd-lstm.wasm.js'],
  [join(por, '4.0.0_best_int', 'por.traineddata.gz'), 'por.traineddata.gz'],
]
for (const [de, para] of arquivos) {
  if (!existsSync(de)) throw new Error(`Arquivo do OCR não encontrado: ${de}`)
  copyFileSync(de, join(destino, para))
}
console.log('OCR copiado para public/ocr')
