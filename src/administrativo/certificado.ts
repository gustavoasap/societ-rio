// Leitura do certificado digital (A1: .pfx/.p12; também .cer/.crt) no navegador.
// Só o arquivo: a senha nunca é guardada nem enviada. Sem a senha, a validade só pode ser lida quando o
// certificado vem aberto dentro do .pfx (muitos vêm); se vier protegido, a senha pode ser digitada na hora
// apenas para leitura, ou a data informada à mão.
import { importarModulo } from '../lib/importar'

export interface InfoCertificado {
  /** AAAA-MM-DD */
  validade: string | null
  inicio: string | null
  titular: string | null
  cnpj: string | null
  /** O .pfx está protegido por senha e não deu para ler a validade */
  protegido: boolean
  /** O arquivo não é um certificado válido (corrompido ou outro tipo de arquivo) */
  invalido: boolean
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Lê validade, titular e CNPJ do arquivo (a biblioteca de criptografia só é carregada quando usada). */
export async function lerCertificado(buf: ArrayBuffer, nome: string, senha?: string): Promise<InfoCertificado> {
  const m = await importarModulo(() => import('./certificadoLeitura'))
  return m.lerCertificadoSincrono(buf, nome, senha)
}

export const diasAte = (validade: string | null, hoje = new Date()) =>
  validade ? Math.floor((Date.parse(`${validade}T12:00:00`) - Date.parse(`${iso(hoje)}T12:00:00`)) / 86_400_000) : null

export type SituacaoCert = 'valido' | 'vencendo' | 'vencido' | 'sem_validade'

/** Válido, vencendo (até 10 dias), vencido ou sem validade informada. */
export function situacaoCertificado(validade: string | null, hoje = new Date()): SituacaoCert {
  const d = diasAte(validade, hoje)
  if (d === null) return 'sem_validade'
  if (d < 0) return 'vencido'
  if (d <= 10) return 'vencendo'
  return 'valido'
}

// ---------------------------------------------------------------------------------------------
// Situação do certificado de cada cliente (a partir dos documentos registrados)

export interface DocCertificado {
  id: string
  cliente_id: string
  nome: string
  url: string | null
  drive_id: string | null
  validade: string | null
  titular: string | null
  situacao: 'ativo' | 'expirado' | 'invalido'
  criado_em?: string
}

export type SituacaoCliente = 'na' | 'sem' | 'invalido' | SituacaoCert

/** Certificado atual: o ativo com a validade mais longa (sem validade informada fica por último). */
export function certificadoAtual(docs: DocCertificado[]) {
  const ativos = docs.filter((d) => d.situacao === 'ativo')
  return ativos.sort((a, b) => (b.validade ?? '0000').localeCompare(a.validade ?? '0000') || (b.criado_em ?? '').localeCompare(a.criado_em ?? ''))[0] ?? null
}

export function situacaoDoCliente(etapa: string | null, docs: DocCertificado[], hoje = new Date()): SituacaoCliente {
  if (etapa === 'na') return 'na'
  const atual = certificadoAtual(docs)
  if (!atual) return docs.some((d) => d.situacao === 'invalido') ? 'invalido' : 'sem'
  return situacaoCertificado(atual.validade, hoje)
}

export const ROTULO_SITUACAO: Record<SituacaoCliente, { label: string; pill: string }> = {
  valido: { label: 'Válido', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  vencendo: { label: 'Vence em até 10 dias', pill: 'border-amber-200 bg-amber-50 text-amber-800' },
  vencido: { label: 'Vencido', pill: 'border-rose-200 bg-rose-50 text-rose-700' },
  sem_validade: { label: 'Validade não informada', pill: 'border-slate-200 bg-slate-50 text-slate-600' },
  sem: { label: 'Sem certificado', pill: 'border-rose-200 bg-rose-50 text-rose-700' },
  invalido: { label: 'Arquivo inválido', pill: 'border-rose-300 bg-rose-100 text-rose-800' },
  na: { label: 'Não se aplica', pill: 'border-slate-200 bg-slate-100 text-slate-500' },
}
