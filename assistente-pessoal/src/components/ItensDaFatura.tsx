import { useApp } from '../contexto'
import { agruparItens } from '../lib/financas'
import { moeda } from '../lib/formato'
import type { Lancamento } from '../tipos'
import { LinhaLancamento } from './LinhaLancamento'

/** Itens da fatura separados por categoria (a de maior total primeiro), cada uma com seu subtotal. */
export function ItensDaFatura({ itens }: { itens: Lancamento[] }) {
  const { categorias } = useApp()
  const cats = new Map(categorias.map((c) => [c.id, c]))
  const grupos = agruparItens(itens, 'categoria', 'data', cats)

  return (
    <div className="space-y-4">
      {grupos.map((g) => (
        <div key={g.chave || '-'}>
          <div className="flex items-baseline justify-between border-b border-slate-200 pb-1 text-xs font-bold tracking-wide text-slate-500 uppercase">
            <span className="truncate">{cats.get(g.chave)?.nome ?? 'Sem categoria'}</span>
            <span className="shrink-0 tabular-nums">{moeda(g.total)}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {g.itens.map((l) => (
              <LinhaLancamento key={l.id} l={l} mostrarData />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
