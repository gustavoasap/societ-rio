import { useMemo } from 'react'
import { Circle, CircleCheck } from 'lucide-react'
import { labelDe } from '../tipos'
import { PRAZOS, TIPOS_ATIVIDADE, etapaInfo, formatarDataHora, prazoDe, type Atividade, type Oportunidade, type Prazo } from './tipos'

const COR_PRAZO: Record<Prazo, string> = {
  atrasada: 'text-rose-600',
  hoje: 'text-amber-600',
  semana: 'text-brand-600',
  depois: 'text-slate-500',
  sem_data: 'text-slate-400',
}

export function Tarefas({
  atividades,
  oportunidades,
  nomeMembro,
  onConcluir,
  onAbrir,
}: {
  atividades: Atividade[]
  oportunidades: Map<string, Oportunidade>
  nomeMembro: (id: string | null) => string
  onConcluir: (a: Atividade) => void
  onAbrir: (o: Oportunidade) => void
}) {
  const grupos = useMemo(() => {
    const g = new Map<Prazo, Atividade[]>(PRAZOS.map((p) => [p.value, []]))
    for (const a of atividades) if (oportunidades.has(a.oportunidade_id)) g.get(prazoDe(a.data_prevista))!.push(a)
    for (const l of g.values()) l.sort((x, y) => (x.data_prevista ?? '9').localeCompare(y.data_prevista ?? '9'))
    return g
  }, [atividades, oportunidades])

  const total = [...grupos.values()].reduce((s, l) => s + l.length, 0)
  if (!total)
    return (
      <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-sm ring-1 ring-slate-200/70">
        Nenhum follow-up pendente. Abra uma oportunidade e agende o próximo passo (ligação, WhatsApp, reunião...).
      </div>
    )

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {PRAZOS.map((p) => {
        const lista = grupos.get(p.value)!
        if (!lista.length) return null
        return (
          <section key={p.value} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <h3 className={`mb-2 flex items-center gap-2 text-sm font-bold ${COR_PRAZO[p.value]}`}>
              {p.label}
              <span className="rounded-full bg-slate-100 px-2 text-xs text-slate-500 tabular-nums">{lista.length}</span>
            </h3>
            <ul className="divide-y divide-slate-100">
              {lista.map((a) => {
                const o = oportunidades.get(a.oportunidade_id)!
                return (
                  <li key={a.id} className="flex items-start gap-3 py-2.5">
                    <button className="group mt-0.5 cursor-pointer text-slate-300 hover:text-emerald-600" onClick={() => onConcluir(a)} title="Marcar como feita">
                      <Circle className="h-5 w-5 group-hover:hidden" />
                      <CircleCheck className="hidden h-5 w-5 group-hover:block" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800">{a.descricao}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                        <span className="font-semibold">{labelDe(TIPOS_ATIVIDADE, a.tipo)}</span>
                        {a.data_prevista && <span className={COR_PRAZO[p.value]}>{formatarDataHora(a.data_prevista)}</span>}
                        {a.responsavel_id && <span>· {nomeMembro(a.responsavel_id)}</span>}
                      </div>
                    </div>
                    <button className="max-w-[45%] cursor-pointer text-right" onClick={() => onAbrir(o)}>
                      <div className="truncate text-xs font-semibold text-slate-700 hover:text-brand-600">{o.empresa}</div>
                      <div className="text-[0.6875rem] text-slate-400">{etapaInfo(o.etapa).label}</div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
