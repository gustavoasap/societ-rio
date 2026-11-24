// Cofre das senhas de certificado (só sócios). A chave fica só na memória do navegador enquanto o portal
// estiver aberto (compartilhada entre as abas do portal); fecha ao sair, ao clicar em "Fechar" ou ao fechar o navegador.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ITERACOES_PADRAO, chaveConfere, cifrar, criarVerificador, decifrar, derivarChave, novoSalt } from './cofreCripto'

interface ConfigCofre {
  salt: string
  iteracoes: number
  verificador_iv: string
  verificador: string
}

type MsgCanal = { tipo: 'pedir' } | { tipo: 'chave'; chave: CryptoKey } | { tipo: 'fechar' }

let chave: CryptoKey | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

// Abas do portal trocam a chave entre si (mesma origem, sem passar pela rede); a chave continua não-exportável.
const canal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('asap-cofre') : null
canal?.addEventListener('message', (e: MessageEvent<MsgCanal>) => {
  const m = e.data
  if (m.tipo === 'pedir' && chave) canal.postMessage({ tipo: 'chave', chave } satisfies MsgCanal)
  else if (m.tipo === 'chave' && !chave && m.chave instanceof CryptoKey) {
    chave = m.chave
    avisar()
  } else if (m.tipo === 'fechar' && chave) {
    chave = null
    avisar()
  }
})
canal?.postMessage({ tipo: 'pedir' } satisfies MsgCanal)

// Ao sair do portal, fecha o cofre
supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') bloquearCofre()
})

function abrir(k: CryptoKey) {
  chave = k
  canal?.postMessage({ tipo: 'chave', chave: k } satisfies MsgCanal)
  avisar()
}

/** Fecha o cofre nesta e em todas as abas do portal. */
export function bloquearCofre() {
  chave = null
  canal?.postMessage({ tipo: 'fechar' } satisfies MsgCanal)
  avisar()
}

export const cofreAberto = () => !!chave

/** Estado do cofre para a tela (aberto/fechado). */
export function useCofre() {
  const [, setN] = useState(0)
  useEffect(() => {
    const f = () => setN((n) => n + 1)
    ouvintes.add(f)
    return () => {
      ouvintes.delete(f)
    }
  }, [])
  return { aberto: cofreAberto() }
}

/** O usuário é sócio (único perfil que acessa o cofre)? */
export function useSocio() {
  const [socio, setSocio] = useState(false)
  useEffect(() => {
    supabase.rpc('portal_is_admin').then(({ data }) => setSocio(data === true))
  }, [])
  return socio
}

async function registrar(acao: string, clienteId: string | null = null) {
  const { data } = await supabase.auth.getUser()
  await supabase.from('adm_cofre_acessos').insert({ acao, cliente_id: clienteId, user_id: data.user?.id })
}

export async function configCofre(): Promise<ConfigCofre | null> {
  const { data, error } = await supabase.from('adm_cofre_config').select('salt, iteracoes, verificador_iv, verificador').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as ConfigCofre | null) ?? null
}

export async function criarSenhaMestra(senha: string) {
  const salt = novoSalt()
  const k = await derivarChave(senha, salt, ITERACOES_PADRAO)
  const v = await criarVerificador(k)
  const { error } = await supabase.from('adm_cofre_config').insert({ id: 1, salt, iteracoes: ITERACOES_PADRAO, verificador_iv: v.iv, verificador: v.cifrado })
  if (error) throw new Error(error.code === '23505' ? 'A senha-mestra já foi criada por outro sócio. Recarregue a página.' : error.message)
  await registrar('criar_mestra')
  abrir(k)
}

/** Abre o cofre se a senha-mestra conferir. */
export async function desbloquearCofre(senha: string) {
  const c = await configCofre()
  if (!c) throw new Error('A senha-mestra ainda não foi criada.')
  const k = await derivarChave(senha, c.salt, c.iteracoes)
  if (!(await chaveConfere(k, c.verificador_iv, c.verificador))) throw new Error('Senha-mestra incorreta.')
  abrir(k)
}

function exigirChave() {
  if (!chave) throw new Error('Abra o cofre com a senha-mestra.')
  return chave
}

/** Clientes que já têm senha guardada. */
export async function clientesComSenha() {
  const { data } = await supabase.from('adm_cofre_senhas').select('cliente_id').range(0, 9999)
  return new Set(((data as { cliente_id: string }[]) ?? []).map((d) => d.cliente_id))
}

export async function gravarSenha(clienteId: string, senha: string, origem: 'manual' | 'drive' = 'manual') {
  const k = exigirChave()
  const c = await cifrar(k, senha)
  const { error } = await supabase
    .from('adm_cofre_senhas')
    .upsert({ cliente_id: clienteId, iv: c.iv, cifrado: c.cifrado, origem, atualizado_em: new Date().toISOString() })
  if (error) throw new Error(error.message)
  await registrar(origem === 'drive' ? 'importar' : 'gravar', clienteId)
}

export async function revelarSenha(clienteId: string, acao: 'revelar' | 'copiar' = 'revelar') {
  const k = exigirChave()
  const { data, error } = await supabase.from('adm_cofre_senhas').select('iv, cifrado').eq('cliente_id', clienteId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Nenhuma senha guardada para este cliente.')
  const senha = await decifrar(k, data.iv as string, data.cifrado as string)
  await registrar(acao, clienteId)
  return senha
}

export async function excluirSenha(clienteId: string) {
  exigirChave()
  const { error } = await supabase.from('adm_cofre_senhas').delete().eq('cliente_id', clienteId)
  if (error) throw new Error(error.message)
  await registrar('excluir', clienteId)
}

/** Troca a senha-mestra: abre todas as senhas com a chave atual e grava de novo com a nova. */
export async function trocarSenhaMestra(nova: string) {
  const atual = exigirChave()
  const { data, error } = await supabase.from('adm_cofre_senhas').select('cliente_id, iv, cifrado').range(0, 9999)
  if (error) throw new Error(error.message)
  const salt = novoSalt()
  const k = await derivarChave(nova, salt, ITERACOES_PADRAO)
  const linhas = []
  for (const d of (data as { cliente_id: string; iv: string; cifrado: string }[]) ?? []) {
    const aberto = await decifrar(atual, d.iv, d.cifrado)
    const c = await cifrar(k, aberto)
    linhas.push({ cliente_id: d.cliente_id, iv: c.iv, cifrado: c.cifrado })
  }
  const v = await criarVerificador(k)
  // Tudo numa transação só (senhas + nova verificação): ou troca tudo, ou nada
  const { error: e } = await supabase.rpc('cofre_trocar_mestra', {
    p_salt: salt,
    p_iteracoes: ITERACOES_PADRAO,
    p_verificador_iv: v.iv,
    p_verificador: v.cifrado,
    p_linhas: linhas,
  })
  if (e) throw new Error(e.message)
  abrir(k)
}

/** Copia para a área de transferência e limpa depois de 30 segundos (se ainda for a mesma senha). */
export async function copiarTemporario(texto: string) {
  await navigator.clipboard.writeText(texto)
  setTimeout(async () => {
    try {
      if ((await navigator.clipboard.readText()) === texto) await navigator.clipboard.writeText('')
    } catch {
      // sem permissão de leitura: limpa assim mesmo
      navigator.clipboard.writeText('').catch(() => {})
    }
  }, 30_000)
}
