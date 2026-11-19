// Lê o vencimento dos certificados que já estão nas pastas do Drive (só pelo arquivo, sem senha).
import { supabase } from '../lib/supabase'
import { lerCertificado } from './certificado'
import { baixarArquivoDrive } from './drive'

export interface ResultadoValidades {
  lidos: number
  protegidos: number
  invalidos: number
  falhas: string[]
}

export async function lerValidadesDoDrive(progresso: (m: string) => void): Promise<ResultadoValidades> {
  const r: ResultadoValidades = { lidos: 0, protegidos: 0, invalidos: 0, falhas: [] }
  const { data, error } = await supabase
    .from('adm_documentos')
    .select('id, nome, drive_id')
    .eq('tipo', 'certificado')
    .eq('situacao', 'ativo')
    .is('validade', null)
    .not('drive_id', 'is', null)
  if (error) throw new Error(error.message)
  const docs = (data as { id: string; nome: string; drive_id: string }[]) ?? []
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]
    progresso(`Lendo vencimento dos certificados: ${i + 1} de ${docs.length} — ${d.nome}`)
    try {
      const f = await baixarArquivoDrive(d.drive_id)
      const info = await lerCertificado(await f.arrayBuffer(), f.name)
      if (info.invalido) {
        r.invalidos++
        await supabase.from('adm_documentos').update({ situacao: 'invalido' }).eq('id', d.id)
      } else if (info.validade) {
        r.lidos++
        await supabase.from('adm_documentos').update({ validade: info.validade, titular: info.titular }).eq('id', d.id)
      } else r.protegidos++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/script do Drive|Sessão expirada|não configurado/.test(msg)) throw e
      r.falhas.push(`${d.nome}: ${msg}`)
    }
  }
  return r
}
