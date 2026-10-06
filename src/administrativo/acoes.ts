import { supabase } from '../lib/supabase'
import type { Cliente } from './tipos'

/** Fecha o honorário vigente na data de encerramento (usado também pela lista). */
export async function encerrarCliente(cliente: Cliente, data: string) {
  const r1 = await supabase.from('adm_clientes').update({ status: 'encerrado', data_encerramento: data }).eq('id', cliente.id)
  if (r1.error) return r1.error.message
  const { data: vig } = await supabase.from('adm_honorarios').select('id, vigencia_inicio').eq('cliente_id', cliente.id).is('vigencia_fim', null).maybeSingle()
  if (vig) {
    const fim = vig.vigencia_inicio > data ? vig.vigencia_inicio : data
    const r2 = await supabase.from('adm_honorarios').update({ vigencia_fim: fim }).eq('id', vig.id)
    if (r2.error) return r2.error.message
  }
  return null
}
