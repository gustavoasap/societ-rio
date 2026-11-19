// Lê os Contratos Sociais / Certidões de Inteiro Teor salvos nas pastas dos clientes no Drive (inclusive
// escaneados, com OCR) e preenche os sócios no cadastro, só completando o que está vazio.
import { supabase } from '../lib/supabase'
import { lerContratoComSocios } from './contratoSocial'
import { baixarArquivoDrive } from './drive'
import { completarPeloCep, mesclarSocios, semAcento } from './socios'
import type { Cliente, SocioCadastro } from './tipos'

/** Ordem de leitura: consolidação e a alteração mais recente primeiro; inteiro teor por último. */
export function prioridadeContrato(nome: string) {
  const n = semAcento(nome)
  const num = Number(n.match(/(\d+)\s*[ªAº°O]?\s*ALTERA/)?.[1] ?? 0)
  if (/CONSOLIDA/.test(n)) return 1000 + num
  if (/ALTERA/.test(n)) return 500 + num
  if (/CONTRATO\s*SOCIAL|CONSTITUI/.test(n)) return 100
  return 0
}

/** Sem sócios, ou algum sócio sem CPF, documento ou endereço. */
export function sociosIncompletos(socios: SocioCadastro[] | null | undefined) {
  const l = socios ?? []
  return !l.length || l.some((s) => !s.cpf || !s.doc_numero || !s.rua || !s.cep)
}

export interface DocContrato {
  cliente_id: string
  nome: string
  drive_id: string | null
}

export async function contratosDoDrive() {
  const { data, error } = await supabase.from('adm_documentos').select('cliente_id, nome, drive_id').eq('tipo', 'contrato').range(0, 9999)
  if (error) throw new Error(error.message)
  const porCliente = new Map<string, DocContrato[]>()
  for (const d of (data as DocContrato[]) ?? []) porCliente.set(d.cliente_id, [...(porCliente.get(d.cliente_id) ?? []), d])
  return porCliente
}

export type ResultadoCliente =
  | { tipo: 'preenchido'; socios: number; ocr: boolean }
  | { tipo: 'sem_socios'; ocr: boolean }
  | { tipo: 'sem_arquivo' }
  | { tipo: 'falha'; erro: string }

export interface ResultadoLeitura {
  preenchidos: number
  semTexto: number
  semSocios: number
  falhas: string[]
}

/** Lê o contrato de um cliente (do Drive) e completa os sócios. */
export async function atualizarSociosDoCliente(c: Cliente, docs: DocContrato[], progresso: (m: string) => void): Promise<ResultadoCliente> {
  const arquivos = docs
    .filter((d) => d.drive_id)
    .sort((a, b) => prioridadeContrato(b.nome) - prioridadeContrato(a.nome))
    .slice(0, 3)
  if (!arquivos.length) return { tipo: 'sem_arquivo' }
  let achados: SocioCadastro[] = []
  let usouOcr = false
  let ultimaFalha: string | null = null
  for (const a of arquivos) {
    try {
      progresso(`baixando ${a.nome}`)
      const f = await baixarArquivoDrive(a.drive_id!).catch(async (e) => {
        if (/script do Drive|Sessão expirada|não configurado|fora das pastas|maior que|portal foi atualizado/.test(String(e?.message))) throw e
        await new Promise((ok) => setTimeout(ok, 2000))
        return baixarArquivoDrive(a.drive_id!)
      })
      const r = await lerContratoComSocios(f, (m) => progresso(`${a.nome}: ${m}`))
      usouOcr ||= r.ocr
      achados = r.socios
      if (achados.length) break
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/script do Drive|Sessão expirada|não configurado|portal foi atualizado/.test(msg)) throw e
      ultimaFalha = `${a.nome}: ${msg}`
    }
  }
  if (!achados.length) return ultimaFalha ? { tipo: 'falha', erro: ultimaFalha } : { tipo: 'sem_socios', ocr: usouOcr }
  const completos = await completarPeloCep(achados)
  // Lê o cadastro atual para não perder o que já foi digitado: só completa campos vazios
  const { data } = await supabase.from('adm_clientes').select('socios').eq('id', c.id).single()
  const atuais = ((data?.socios as SocioCadastro[] | null) ?? []) as SocioCadastro[]
  const { error } = await supabase
    .from('adm_clientes')
    .update({ socios: mesclarSocios(atuais, completos) })
    .eq('id', c.id)
  if (error) return { tipo: 'falha', erro: error.message }
  return { tipo: 'preenchido', socios: completos.length, ocr: usouOcr }
}

/** Usado pelo "Procurar no Drive": lê o contrato de quem tem contrato e ainda não tem sócios. */
export async function lerContratosDoDrive(clientes: Cliente[], progresso: (msg: string) => void): Promise<ResultadoLeitura> {
  const r: ResultadoLeitura = { preenchidos: 0, semTexto: 0, semSocios: 0, falhas: [] }
  const porCliente = await contratosDoDrive()
  const alvos = clientes.filter((c) => c.status !== 'encerrado' && !(c.socios ?? []).length && porCliente.has(c.id))
  for (let i = 0; i < alvos.length; i++) {
    const c = alvos[i]
    const res = await atualizarSociosDoCliente(c, porCliente.get(c.id)!, (m) =>
      progresso(`Lendo contratos do Drive: ${i + 1} de ${alvos.length} — ${c.razao_social}: ${m}`),
    )
    if (res.tipo === 'preenchido') r.preenchidos++
    else if (res.tipo === 'sem_socios') {
      if (res.ocr) r.semTexto++
      else r.semSocios++
    } else if (res.tipo === 'falha') r.falhas.push(`${String(c.codigo).padStart(3, '0')} ${res.erro}`)
  }
  const { encerrarOcr } = await import('./ocr')
  await encerrarOcr()
  return r
}
