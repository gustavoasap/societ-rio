// Criptografia do cofre de senhas (Web Crypto, no navegador): chave AES-256-GCM derivada da senha-mestra
// por PBKDF2-SHA256. A senha-mestra e as senhas abertas nunca saem do navegador.

export const ITERACOES_PADRAO = 600_000
const VERIFICADOR = 'ASAP-COFRE-OK'

const b64 = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const x of u) s += String.fromCharCode(x)
  return btoa(s)
}
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function novoSalt() {
  return b64(crypto.getRandomValues(new Uint8Array(16)))
}

/** Chave derivada da senha-mestra (não exportável: não dá para tirar a chave da memória do navegador). */
export async function derivarChave(senhaMestra: string, salt: string, iteracoes = ITERACOES_PADRAO): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senhaMestra), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: deB64(salt), iterations: iteracoes, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function cifrar(chave: CryptoKey, texto: string): Promise<{ iv: string; cifrado: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chave, new TextEncoder().encode(texto))
  return { iv: b64(iv), cifrado: b64(c) }
}

/** Abre o texto; com a chave errada o AES-GCM falha (não devolve lixo). */
export async function decifrar(chave: CryptoKey, iv: string, cifrado: string): Promise<string> {
  const t = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deB64(iv) }, chave, deB64(cifrado))
  return new TextDecoder().decode(t)
}

export async function criarVerificador(chave: CryptoKey) {
  return cifrar(chave, VERIFICADOR)
}

export async function chaveConfere(chave: CryptoKey, iv: string, cifrado: string) {
  try {
    return (await decifrar(chave, iv, cifrado)) === VERIFICADOR
  } catch {
    return false
  }
}

/** Regras mínimas da senha-mestra. */
export function problemaSenhaMestra(s: string): string | null {
  if (s.length < 10) return 'Use pelo menos 10 caracteres.'
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return 'Misture letras e números.'
  return null
}
