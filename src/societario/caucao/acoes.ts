import { supabase } from '../../lib/supabase'
import { lerNumeroBR } from '../../lib/format'
import type { Junta } from './tipos'

/** Grava uma junta (tela de juntas e cadastro rápido dentro do caução). */
export async function salvarJunta(form: { uf: string; nome: string; taxa: string }, ufOriginal: string | null) {
  const uf = form.uf.trim().toUpperCase()
  const taxa = lerNumeroBR(form.taxa)
  if (!/^[A-Z]{2}$/.test(uf)) return { erro: 'Informe a UF com 2 letras (ex.: RJ).' }
  if (taxa === null) return { erro: 'Informe o valor da taxa.' }
  const payload = { uf, nome: form.nome.trim() || `Junta Comercial - ${uf}`, taxa, updated_at: new Date().toISOString() }
  const { error } = ufOriginal ? await supabase.from('soc_caucao_juntas').update(payload).eq('uf', ufOriginal) : await supabase.from('soc_caucao_juntas').insert(payload)
  if (error) return { erro: error.code === '23505' ? `A junta de ${uf} já está cadastrada.` : error.message }
  return { junta: payload as Junta }
}

