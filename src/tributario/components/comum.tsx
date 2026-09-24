import { Fragment, useState, type ReactNode } from 'react'
import { AlertTriangle, ChevronDown, Info as InfoIcon } from 'lucide-react'
import type { LinhaMemoria, RegimeId, Tributos } from '../engine/tipos'
import { TRIBUTOS } from '../engine/tipos'
import { COR_REGIME, NOME_TRIBUTO, moeda, pct } from '../formatacao'

export function PontoRegime({ regime }: { regime: RegimeId }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_REGIME[regime] }} />
}

export function Kpi({ titulo, valor, detalhe, icone, tom = 'brand' }: { titulo: string; valor: ReactNode; detalhe?: ReactNode; icone?: ReactNode; tom?: 'brand' | 'emerald' | 'amber' | 'violet' }) {
  const tons = {
    brand: 'from-brand-500 to-indigo-600 shadow-brand-500/30',
    emerald: 'from-emerald-400 to-teal-500 shadow-emerald-500/30',
    amber: 'from-amber-400 to-orange-500 shadow-orange-500/30',
    violet: 'from-violet-500 to-fuchsia-500 shadow-violet-500/30',
  }
  return (
    <div className="rounded-2xl bg-white p-5 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{titulo}</div>
        {icone && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg ${tons[tom]}`}>{icone}</span>}
      </div>
      <div className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 tabular-nums">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  )
}

export function Alertas({ itens, tom = 'amber' }: { itens: string[]; tom?: 'amber' | 'sky' }) {
  if (!itens.length) return null
  const estilo = tom === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-sky-200 bg-sky-50 text-sky-800'
  const Icone = tom === 'amber' ? AlertTriangle : InfoIcon
  return (
    <div className={`space-y-1.5 rounded-2xl border px-4 py-3 text-sm ${estilo}`}>
      {itens.map((a) => (
        <p key={a} className="flex gap-2">
          <Icone className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{a}</span>
        </p>
      ))}
    </div>
  )
}

/** Tabela de tributos (linhas) × colunas (regimes, períodos...). */
export function TabelaTributos({
  colunas,
  receita,
  destaque,
}: {
  colunas: { id: string; titulo: ReactNode; tributos: Tributos; total: number; receita: number }[]
  receita?: boolean
  destaque?: string | null
}) {
  const usados = TRIBUTOS.filter((t) => colunas.some((c) => Math.abs(c.tributos[t]) > 0.005))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-400 uppercase">
            <th className="py-2.5 pr-4 text-left">Tributo</th>
            {colunas.map((c) => (
              <th key={c.id} className={`px-3 py-2.5 ${destaque === c.id ? 'text-brand-700' : ''}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {receita && (
            <tr className="border-b border-slate-100 text-right text-slate-500">
              <td className="py-2 pr-4 text-left">Receita bruta</td>
              {colunas.map((c) => (
                <td key={c.id} className="px-3 py-2">
                  {moeda(c.receita)}
                </td>
              ))}
            </tr>
          )}
          {usados.map((t) => (
            <tr key={t} className="border-b border-slate-100 text-right">
              <td className="py-2 pr-4 text-left font-medium text-slate-700">{NOME_TRIBUTO[t]}</td>
              {colunas.map((c) => (
                <td key={c.id} className={`px-3 py-2 ${destaque === c.id ? 'bg-brand-50/60' : ''}`}>
                  {c.tributos[t] ? moeda(c.tributos[t]) : <span className="text-slate-300">—</span>}
                </td>
              ))}
            </tr>
          ))}
          <tr className="text-right font-bold text-slate-900">
            <td className="py-2.5 pr-4 text-left">Total</td>
            {colunas.map((c) => (
              <td key={c.id} className={`px-3 py-2.5 ${destaque === c.id ? 'bg-brand-50/60' : ''}`}>
                {moeda(c.total)}
                <div className="text-xs font-semibold text-slate-500">{c.receita ? pct(c.total / c.receita) : '—'}</div>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

/** Memória de cálculo agrupada, recolhível. */
export function Memoria({ linhas, titulo = 'Memória de cálculo' }: { linhas: LinhaMemoria[]; titulo?: string }) {
  const [aberto, setAberto] = useState(false)
  const grupos = new Map<string, LinhaMemoria[]>()
  for (const l of linhas) grupos.set(l.grupo, [...(grupos.get(l.grupo) ?? []), l])
  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <button className="flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setAberto(!aberto)}>
        {titulo}
        <ChevronDown className={`h-4 w-4 transition ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <table className="w-full text-sm">
          <tbody>
            {[...grupos.entries()].map(([g, ls]) => (
              <Fragment key={g}>
                <tr className="bg-slate-50">
                  <td colSpan={3} className="px-4 py-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    {g}
                  </td>
                </tr>
                {ls.map((l, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className={`px-4 py-1.5 ${l.destaque ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{l.descricao}</td>
                    <td className="px-4 py-1.5 text-xs text-slate-400">{l.formula}</td>
                    <td className={`px-4 py-1.5 text-right tabular-nums ${l.destaque ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                      {/Alíquota efetiva|faixa/i.test(l.descricao) ? `${l.valor.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%` : moeda(l.valor)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function Abas<T extends string>({ abas, ativa, onChange }: { abas: { id: T; label: string; icone: ReactNode }[]; ativa: T; onChange: (a: T) => void }) {
  return (
    <div className="no-print flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/70">
      {abas.map((a) => (
        <button
          key={a.id}
          onClick={() => onChange(a.id)}
          className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${ativa === a.id ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-md shadow-brand-500/25' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
        >
          {a.icone}
          {a.label}
        </button>
      ))}
    </div>
  )
}

export function Segmentado<T extends string>({ opcoes, valor, onChange }: { opcoes: { value: T; label: string }[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1">
      {opcoes.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition ${valor === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Vazio({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-14 text-center shadow-sm ring-1 ring-slate-200/70">
      <p className="font-semibold text-slate-700">{titulo}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">{texto}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  )
}
