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

export interface RespostaEnvio {
  ok: boolean
  duplicado?: boolean
  url?: string
  pasta?: string
  erro: string | null
}

function paraBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/**
 * Salva um documento (Contrato Social, Cartão CNPJ...) na pasta do cliente no Drive, dentro de
 * DEPARTAMENTO - SOCIETÁRIO. O script confere o login do usuário no portal antes de aceitar.
 */
export async function enviarArquivoDrive(codigo: number, arquivo: File, subpasta = 'DEPARTAMENTO - SOCIETÁRIO'): Promise<RespostaEnvio> {
  const url = await obterUrlDrive()
  if (!url) return { ok: false, erro: 'Endereço do script do Drive não configurado (Base de Clientes > Drive).' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, erro: 'Sessão expirada: entre no portal novamente.' }
  const corpo = JSON.stringify({
    token,
    codigo,
    nome: arquivo.name,
    mime: arquivo.type || (arquivo.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
    base64: paraBase64(await arquivo.arrayBuffer()),
    subpasta,
  })
  let r: Response
  try {
    // text/plain evita a verificação prévia (CORS) que o Apps Script não responde
    r = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo })
  } catch {
    return { ok: false, erro: 'Não consegui falar com o script do Google (confira a implantação do App da Web).' }
  }
  const texto = await r.text()
  try {
    return JSON.parse(texto) as RespostaEnvio
  } catch {
    return { ok: false, erro: 'O script do Drive ainda não recebe arquivos: cole a versão nova do código e atualize a implantação (Nova versão).' }
  }
}
