import { ArrowLeftRight, Check } from 'lucide-react'
import { useApp } from '../contexto'
import { hoje } from '../lib/datas'
import { salvar } from '../lib/dados'
import { dataBR, moeda } from '../lib/formato'
import type { Lancamento } from '../tipos'
import { Bolinha } from './ui'
import { corDe, iconeDe } from './visual'

/** Uma linha de lançamento: ícone da categoria, descrição, conta, valor e marcação de pago. */
export function LinhaLancamento({ l, mostrarData = false }: { l: Lancamento; mostrarData?: boolean }) {
  const { contas, categorias, abrirLancamento } = useApp()
  const cat = categorias.find((c) => c.id === l.categoria_id)
  const conta = contas.find((c) => c.id === l.conta_id)
  const destino = contas.find((c) => c.id === l.conta_destino_id)
  const cor = l.tipo === 'transferencia' ? corDe('cinza') : corDe(cat?.cor)
  const vencido = !l.pago && l.data < hoje()
  const sinal = l.tipo === 'receita' ? '+' : l.tipo === 'despesa' ? '−' : ''
  const corValor = l.tipo === 'receita' ? 'text-emerald-600' : l.tipo === 'despesa' ? 'text-slate-900' : 'text-slate-500'

  return (
    <div className="flex items-center gap-3 py-2.5">
      <button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left" onClick={() => abrirLancamento(l)}>
        <Bolinha icone={l.tipo === 'transferencia' ? ArrowLeftRight : iconeDe(cat?.icone)} fundo={cor.fundo} texto={cor.texto} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-800">
            {l.descricao}
            {l.parcelas && <span className="ml-1.5 text-xs font-medium text-slate-400">{`${l.parcela}/${l.parcelas}`}</span>}
          </span>
          <span className="block truncate text-xs text-slate-500">
            {mostrarData && <span className={vencido ? 'font-semibold text-rose-600' : ''}>{dataBR(l.data)} · </span>}
            {l.tipo === 'transferencia' ? `${conta?.nome ?? '?'} → ${destino?.nome ?? '?'}` : `${cat?.nome ?? 'Sem categoria'} · ${conta?.nome ?? '?'}`}
          </span>
        </span>
        <span className="text-right">
          <span className={`block text-sm font-bold tabular-nums ${corValor}`}>
            {sinal} {moeda(l.valor)}
          </span>
          {!l.pago && <span className={`block text-[0.6875rem] font-semibold ${vencido ? 'text-rose-600' : 'text-amber-600'}`}>{vencido ? 'Vencido' : l.tipo === 'receita' ? 'A receber' : 'A pagar'}</span>}
        </span>
      </button>
      <button
        className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition ${l.pago ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400 hover:text-emerald-400'}`}
        onClick={() => salvar('pes_lancamentos', l.id, { pago: !l.pago })}
        title={l.pago ? 'Marcar como em aberto' : l.tipo === 'receita' ? 'Marcar como recebido' : 'Marcar como pago'}
        aria-label={l.pago ? 'Pago' : 'Em aberto'}
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </button>
    </div>
  )
}
