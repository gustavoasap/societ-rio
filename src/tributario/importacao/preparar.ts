import type { TipoMovimento } from '../engine/tipos'
import { definirCompetencia, type LinhaImportada, type RelatorioLido } from './relatorios'

export const NOMES_MOV: Record<TipoMovimento, string> = {
  entrada: 'Entradas',
  saida: 'Saídas',
  servico_tomado: 'Serviços tomados',
  servico_prestado: 'Serviços prestados',
}

export type TipoServico = 'servico_tomado' | 'servico_prestado'

export const tipoMovimentoDe = (rel: RelatorioLido, tipoServico: TipoServico): TipoMovimento =>
  rel.tipo === 'servicos' ? tipoServico : rel.tipo.startsWith('entradas') ? 'entrada' : 'saida'

/** Linhas prontas para gravar: resumos de vários meses vão para uma competência ou são rateados. */
export function prepararLinhas(rel: RelatorioLido, modo: 'unica' | 'ratear', inicio: string, fim: string): LinhaImportada[] {
  if (!rel.exigeCompetencia) return rel.linhas
  if (!inicio) throw new Error('Escolha a competência do resumo.')
  return modo === 'ratear' ? definirCompetencia(rel.linhas, inicio, fim || inicio) : definirCompetencia(rel.linhas, inicio)
}
