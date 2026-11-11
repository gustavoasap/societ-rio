import { supabase } from './supabase'
import { deSerpro, type DadosCnpj } from './cnpj'

/**
 * Consulta o CNPJ no Serpro pela função do servidor (a chave do contrato não fica no navegador).
 * Devolve null quando o Serpro ainda não está configurado.
 */
export async function consultarSerpro(cnpj: string, sinal?: AbortSignal): Promise<DadosCnpj | null> {
  const { data, error } = await supabase.functions.invoke('cnpj-serpro', { body: { cnpj }, signal: sinal })
  if (error) {
    // Erro com corpo JSON (ex.: 404 CNPJ não encontrado)
    const corpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
    throw new Error(corpo?.erro ?? error.message)
  }
  if (!data?.configurado || !data?.dados) return null
  return deSerpro(data.dados)
}
