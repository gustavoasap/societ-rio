/** Uma linha do cadastro em lote: código (opcional) e CNPJ, em qualquer ordem e separador. */
export interface LinhaLote {
  linha: number
  texto: string
  codigo: number | null
  cnpj: string | null
  erro: string | null
}

export function lerLote(texto: string): LinhaLote[] {
  return texto
    .split(/\r?\n/)
    .map((t, i) => ({ t: t.trim(), i: i + 1 }))
    .filter(({ t }) => t)
    .map(({ t, i }) => {
      const partes = t.split(/[\s;,|]+/).filter(Boolean)
      let cnpj: string | null = null
      let codigo: number | null = null
      for (const p of partes) {
        const d = p.replace(/\D/g, '')
        if (d.length === 14 && !cnpj) cnpj = d
        else if (/^\d{1,6}$/.test(p) && codigo === null) codigo = Number(p)
      }
      const erro = !cnpj ? 'CNPJ não encontrado (precisa ter 14 dígitos)' : codigo === 0 ? 'Código precisa ser maior que zero' : null
      return { linha: i, texto: t, codigo, cnpj, erro }
    })
}
