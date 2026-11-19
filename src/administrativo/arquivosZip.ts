import { unzipSync } from 'fflate'

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pfx: 'application/x-pkcs12',
  p12: 'application/x-pkcs12',
  cer: 'application/x-x509-ca-cert',
  crt: 'application/x-x509-ca-cert',
}
const oculto = (caminho: string) => /(^|\/)(__MACOSX|\.)/.test(caminho)

/** Abre os .zip (inclusive subpastas) e devolve os arquivos aceitos de dentro, junto com os arquivos soltos. */
export async function expandirZips(arquivos: File[], aceitar: (nome: string) => boolean) {
  const r: { arquivo: File; zip: string | null }[] = []
  const erros: string[] = []
  for (const f of arquivos) {
    if (/\.zip$/i.test(f.name)) {
      try {
        const conteudo = unzipSync(new Uint8Array(await f.arrayBuffer()))
        let n = 0
        for (const [caminho, dados] of Object.entries(conteudo)) {
          const nome = caminho.split('/').pop() ?? ''
          if (!nome || oculto(caminho) || !aceitar(nome) || !dados.length) continue
          const ext = nome.split('.').pop()!.toLowerCase()
          r.push({ arquivo: new File([dados as Uint8Array<ArrayBuffer>], nome, { type: MIME[ext] ?? '' }), zip: f.name })
          n++
        }
        if (!n) erros.push(`${f.name}: nenhum arquivo aceito dentro do .zip.`)
      } catch {
        erros.push(`${f.name}: não consegui abrir o arquivo .zip.`)
      }
    } else if (aceitar(f.name)) r.push({ arquivo: f, zip: null })
  }
  return { r, erros }
}
