import { supabase } from '../../lib/supabase'
import { competenciaDe } from './calculo'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
export const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)}/${mes.slice(2, 4)}`
export const valorTexto = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Grava (inclui ou atualiza) as informações do mês de um cliente. */
export async function salvarMensal(clienteId: string, mes: string, campos: Record<string, unknown>) {
  return supabase
    .from('adm_hon_mensal')
    .upsert(
      { cliente_id: clienteId, competencia: competenciaDe(mes), ...campos, atualizado_em: new Date().toISOString() },
      { onConflict: 'cliente_id,competencia' },
    )
}
