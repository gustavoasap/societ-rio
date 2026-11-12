import { supabase } from '../lib/supabase'

// Endereço do App da Web do Apps Script (automação de pastas). Ao ser chamado, o script cria na hora
// as pastas dos clientes que ainda não têm link no portal e grava o link.
const CHAVE = 'drive_webapp_url'

export async function obterUrlDrive() {
  const { data } = await supabase.from('adm_config').select('valor').eq('chave', CHAVE).maybeSingle()
  return (data?.valor as string | null) ?? null
}

export async function salvarUrlDrive(url: string) {
  return supabase.from('adm_config').upsert({ chave: CHAVE, valor: url.trim() || null, atualizado_em: new Date().toISOString() })
}

export const urlDriveValida = (url: string) => /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec$/.test(url.trim())

export interface RespostaDrive {
  ok: boolean
  ocupado: boolean
  pastasCriadas: number
  linksGravados: number
  erros: number
  avisos: string[]
  erro: string | null
}

/** Pede ao script do Google para criar agora as pastas dos clientes sem pasta. */
export async function criarPastasDrive(url: string): Promise<RespostaDrive> {
  let r: Response
  try {
    r = await fetch(url, { method: 'GET', redirect: 'follow' })
  } catch {
    throw new Error(
      'Não consegui falar com o script do Google. Confira se a implantação do App da Web está com acesso "Qualquer pessoa" e se a URL termina em /exec.',
    )
  }
  const texto = await r.text()
  try {
    return JSON.parse(texto) as RespostaDrive
  } catch {
    throw new Error('O script respondeu, mas não no formato esperado. Confira se colou a versão nova do código e fez uma nova implantação.')
  }
}
