// Lê os Contratos Sociais / Certidões de Inteiro Teor já salvos nas pastas dos clientes no Drive
// e preenche os sócios das empresas que ainda não têm sócios no cadastro.
import { supabase } from '../lib/supabase'
import { extrairSocios, textoDoArquivo } from './contratoSocial'
import { baixarArquivoDrive } from './drive'
import { completarPeloCep, mesclarSocios, semAcento } from './socios'
import type { Cliente, SocioCadastro } from './tipos'

/** Ordem de leitura: consolidação e a alteração mais recente primeiro; inteiro teor (geralmente escaneado) por último. */
export function prioridadeContrato(nome: string) {
  const n = semAcento(nome)
  const num = Number(n.match(/(\d+)\s*[ªAº°O]?\s*ALTERA/)?.[1] ?? 0)
  if (/CONSOLIDA/.test(n)) return 1000 + num
  if (/ALTERA/.test(n)) return 500 + num
  if (/CONTRATO\s*SOCIAL|CONSTITUI/.test(n)) return 100
  return 0
}

export interface ResultadoLeitura {
  preenchidos: number
  semTexto: number
  semSocios: number
  falhas: string[]
}

export async function lerContratosDoDrive(clientes: Cliente[], progresso: (msg: string) => void): Promise<ResultadoLeitura> {
  const r: ResultadoLeitura = { preenchidos: 0, semTexto: 0, semSocios: 0, falhas: [] }
  const { data, error } = await supabase
    .from('adm_documentos')
    .select('cliente_id, nome, drive_id')
    .eq('tipo', 'contrato')
    .not('drive_id', 'is', null)
    .range(0, 9999)
  if (error) throw new Error(error.message)
  const porCliente = new Map<string, { nome: string; drive_id: string }[]>()
  for (const d of (data as { cliente_id: string; nome: string; drive_id: string }[]) ?? [])
    porCliente.set(d.cliente_id, [...(porCliente.get(d.cliente_id) ?? []), d])
  // Só quem ainda não tem sócios no cadastro (não mexe no que já foi preenchido)
  const alvos = clientes.filter((c) => c.status !== 'encerrado' && !(c.socios ?? []).length && porCliente.has(c.id))
  for (let i = 0; i < alvos.length; i++) {
    const c = alvos[i]
    progresso(`Lendo contratos do Drive: ${i + 1} de ${alvos.length} — ${c.razao_social}`)
    const arquivos = [...porCliente.get(c.id)!].sort((a, b) => prioridadeContrato(b.nome) - prioridadeContrato(a.nome)).slice(0, 3)
    let socios: SocioCadastro[] = []
    let algumTexto = false
    for (const a of arquivos) {
      try {
        // Uma nova tentativa se o Google falhar de forma passageira
        const f = await baixarArquivoDrive(a.drive_id).catch(async (e) => {
          if (/script do Drive|Sessão expirada|não configurado|fora das pastas|maior que/.test(String(e?.message))) throw e
          await new Promise((ok) => setTimeout(ok, 2000))
          return baixarArquivoDrive(a.drive_id)
        })
        const texto = await textoDoArquivo(f)
        if (texto.replace(/\s/g, '').length < 50) continue
        algumTexto = true
        socios = extrairSocios(texto)
        if (socios.length) break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/script do Drive|Sessão expirada|não configurado/.test(msg)) throw e
        r.falhas.push(`${String(c.codigo).padStart(3, '0')} ${a.nome}: ${msg}`)
      }
    }
    if (!socios.length) {
      if (!algumTexto) r.semTexto++
      else r.semSocios++
      continue
    }
    const completos = await completarPeloCep(socios)
    const { error: e2 } = await supabase
      .from('adm_clientes')
      .update({ socios: mesclarSocios([], completos) })
      .eq('id', c.id)
    if (e2) r.falhas.push(`${c.razao_social}: ${e2.message}`)
    else r.preenchidos++
  }
  return r
}
