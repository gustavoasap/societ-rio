// Partes do portal carregadas só quando usadas (leitor de PDF, certificado...). Se o portal foi atualizado
// enquanto a página estava aberta, o arquivo antigo não existe mais: avisa para recarregar a página.
const RE_CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch/i

export const MSG_ATUALIZADO = 'O portal foi atualizado enquanto esta página estava aberta. Recarregue a página (Ctrl+F5) e envie de novo.'

export function avisarPortalAtualizado() {
  window.dispatchEvent(new Event('portal:atualizado'))
}

export async function importarModulo<T>(carregar: () => Promise<T>): Promise<T> {
  try {
    return await carregar()
  } catch (e) {
    if (RE_CHUNK.test(String(e instanceof Error ? e.message : e))) {
      avisarPortalAtualizado()
      throw new Error(MSG_ATUALIZADO)
    }
    throw e
  }
}
