import { labelDe, type Etapa } from '../types'
import { Badge } from './ui'

export function corEtapa(etapa: Etapa, valor: string) {
  if (valor === etapa.concluido) return 'ok'
  if (valor.startsWith('pendente') || valor === 'falta_assinatura') return 'pendente'
  return 'analise'
}

export function StatusBadge({ etapa, valor }: { etapa: Etapa; valor: string }) {
  return <Badge cor={corEtapa(etapa, valor)}>{labelDe(etapa.opcoes, valor)}</Badge>
}
