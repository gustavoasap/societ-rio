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
  drive_id?: string
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
export async function enviarArquivoDrive(
  codigo: number,
  arquivo: File,
  registro?: RegistroDoc,
  subpasta = 'DEPARTAMENTO - SOCIETÁRIO',
): Promise<RespostaEnvio> {
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
  let resp: RespostaEnvio
  try {
    resp = JSON.parse(texto) as RespostaEnvio
  } catch {
    return { ok: false, erro: 'O script do Drive ainda não recebe arquivos: cole a versão nova do código e atualize a implantação (Nova versão).' }
  }
  // Registra o documento do cliente (a Base mostra quem está sem Contrato Social)
  if (resp.ok && registro) await registrarDocumento(registro, arquivo.name, resp.url ?? null, resp.drive_id ?? null)
  return resp
}

export type TipoDoc = 'contrato' | 'cartao' | 'certificado'

export interface RegistroDoc {
  clienteId: string
  tipo: TipoDoc
  hash?: string | null
  validade?: string | null
  titular?: string | null
  situacao?: 'ativo' | 'expirado' | 'invalido'
}

export async function registrarDocumento(r: RegistroDoc, nome: string, url: string | null, driveId: string | null = null) {
  return supabase.from('adm_documentos').upsert(
    {
      cliente_id: r.clienteId,
      tipo: r.tipo,
      nome,
      url,
      drive_id: driveId,
      origem: 'portal',
      hash: r.hash ?? null,
      validade: r.validade ?? null,
      titular: r.titular ?? null,
      situacao: r.situacao ?? 'ativo',
    },
    { onConflict: 'cliente_id,tipo,nome' },
  )
}

/** Impressão digital do arquivo (SHA-256): o mesmo arquivo enviado de novo é reconhecido e ignorado. */
export async function hashArquivo(arquivo: File) {
  const d = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer())
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** O cliente já tem este documento (mesmo arquivo ou mesmo nome)? Nesse caso o envio é ignorado. */
export async function documentoJaExiste(clienteId: string, tipo: TipoDoc, nome: string, hash: string) {
  const { data } = await supabase.from('adm_documentos').select('nome, hash').eq('cliente_id', clienteId).eq('tipo', tipo)
  return ((data as { nome: string; hash: string | null }[]) ?? []).some((d) => d.hash === hash || d.nome === nome)
}

/** Move o certificado vencido para CERTIFICADO DIGITAL / EXPIRADO no Drive. */
export async function expirarArquivoDrive(driveId: string): Promise<{ ok: boolean; erro: string | null }> {
  const url = await obterUrlDrive()
  if (!url) return { ok: false, erro: 'Endereço do script do Drive não configurado.' }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, erro: 'Sessão expirada: entre no portal novamente.' }
  try {
    const r = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, acao: 'expirar', drive_id: driveId }),
    })
    return JSON.parse(await r.text())
  } catch {
    return { ok: false, erro: 'O script do Drive ainda não move certificados: atualize o código e a implantação (Nova versão).' }
  }
}

/** Baixa o documento do Drive direto para o computador (sem abrir o Drive). */
export async function baixarParaComputador(driveId: string) {
  const f = await baixarArquivoDrive(driveId)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(f)
  a.download = f.name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(a.href)
    a.remove()
  }, 1000)
}

/** Pede ao script para procurar Contratos Sociais e Cartões CNPJ que já estão nas pastas dos clientes. */
export async function procurarDocumentosDrive(): Promise<{ ok: boolean; documentos: number; erro: string | null }> {
  const url = await obterUrlDrive()
  if (!url) return { ok: false, documentos: 0, erro: 'Endereço do script do Drive não configurado (Base de Clientes > Drive).' }
  try {
    const r = await fetch(`${url}?acao=documentos`, { method: 'GET', redirect: 'follow' })
    const j = JSON.parse(await r.text())
    if (typeof j.documentos !== 'number') throw new Error()
    return j
  } catch {
    return {
      ok: false,
      documentos: 0,
      erro: 'O script do Drive ainda não procura documentos: cole a versão nova do código e atualize a implantação (Nova versão).',
    }
  }
}

/** Baixa (pelo script) um documento salvo na pasta do cliente no Drive. */
export async function baixarArquivoDrive(driveId: string): Promise<File> {
  const url = await obterUrlDrive()
  if (!url) throw new Error('Endereço do script do Drive não configurado.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada: entre no portal novamente.')
  const r = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, acao: 'baixar', drive_id: driveId }),
  })
  let j: { ok: boolean; nome?: string; mime?: string; base64?: string; erro: string | null }
  try {
    j = JSON.parse(await r.text())
  } catch {
    throw new Error('O script do Drive ainda não envia arquivos: cole a versão nova do código e atualize a implantação (Nova versão).')
  }
  if (!j.ok || !j.base64) throw new Error(j.erro ?? 'Arquivo não recebido.')
  const bin = atob(j.base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new File([bytes], j.nome ?? 'documento.pdf', { type: j.mime ?? '' })
}

async function postarScript<T>(corpo: Record<string, unknown>, erroVersao: string): Promise<T> {
  const url = await obterUrlDrive()
  if (!url) throw new Error('Endereço do script do Drive não configurado.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sessão expirada: entre no portal novamente.')
  const r = await fetch(url, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token, ...corpo }),
  })
  let j: T & { ok: boolean; erro: string | null }
  try {
    j = JSON.parse(await r.text())
  } catch {
    throw new Error(erroVersao)
  }
  if (!j.ok) throw new Error(j.erro ?? 'O script do Drive respondeu com erro.')
  return j
}

export interface SenhaTxt {
  codigo: number
  drive_id: string
  conteudo: string
  /** Só o texto padrão "SENHA CERTIFICADO" (sem senha de verdade) */
  padrao: boolean
}

/** Lê os SENHA CERTIFICADO.txt das pastas dos clientes (só sócios), para migrar ao cofre. */
export async function lerSenhasTxtDrive() {
  const r = await postarScript<{ itens: SenhaTxt[] }>(
    { acao: 'senhas_txt' },
    'O script do Drive ainda não lê as senhas: cole a versão nova do código e atualize a implantação (Nova versão).',
  )
  return r.itens
}

/** Manda para a lixeira do Drive os SENHA CERTIFICADO.txt já migrados. */
export async function apagarSenhasTxtDrive(ids: string[]) {
  const r = await postarScript<{ apagados: number }>({ acao: 'apagar_txt', drive_ids: ids }, 'O script do Drive ainda não apaga os arquivos de senha.')
  return r.apagados
}
