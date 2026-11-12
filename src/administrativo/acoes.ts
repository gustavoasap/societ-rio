import { supabase } from '../lib/supabase'
import type { Cliente, MotivoEncerramento } from './tipos'

/** Confirma (ou desfaz) que o cliente não terá honorário. */
export async function marcarSemHonorario(clienteId: string, sem: boolean, motivo: string | null = null) {
  const { error } = await supabase
    .from('adm_clientes')
    .update({ sem_honorario: sem, sem_honorario_motivo: sem ? motivo?.trim() || null : null })
    .eq('id', clienteId)
  return error?.message ?? null
}

/** Fecha o honorário vigente na data de encerramento (usado também pela lista). */
export async function encerrarCliente(cliente: Cliente, data: string, motivo: MotivoEncerramento) {
  if (!data) return 'Informe a data do encerramento.'
  const r1 = await supabase.from('adm_clientes').update({ status: 'encerrado', data_encerramento: data, motivo_encerramento: motivo }).eq('id', cliente.id)
  if (r1.error) return r1.error.message
  const { data: vig } = await supabase.from('adm_honorarios').select('id, vigencia_inicio').eq('cliente_id', cliente.id).is('vigencia_fim', null).maybeSingle()
  if (vig) {
    const fim = vig.vigencia_inicio > data ? vig.vigencia_inicio : data
    const r2 = await supabase.from('adm_honorarios').update({ vigencia_fim: fim }).eq('id', vig.id)
    if (r2.error) return r2.error.message
  }
  return null
}
