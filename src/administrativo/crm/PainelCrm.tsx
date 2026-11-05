import { useMemo, useState, type ReactNode } from 'react'
import { CircleDollarSign, Filter, Gauge, Percent, Target, Timer, Trophy, XCircle } from 'lucide-react'
import { BarrasHorizontais } from '../../tributario/components/graficos'
import { Section } from '../../components/ui'
import { labelDe, moeda } from '../tipos'
import { ETAPAS_ABERTAS, MOTIVOS_PERDA, ORIGENS, aberta, resumir, type Oportunidade } from './tipos'

const COR_SERIE = '#2449f5'
const COR_PERDA = '#f43f5e'

type Periodo = 'mes' | 'trimestre' | 'ano'
const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Este mês' },
  { value: 'trimestre', label: 'Últimos 90 dias' },
  { value: 'ano', label: 'Este ano' },
]

function inicioPeriodo(p: Periodo, hoje = new Date()) {
  if (p === 'mes') return new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  if (p === 'ano') return new Date(hoje.getFullYear(), 0, 1)
  return new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 90)
}

function Kpi({ icone: I, rotulo, valor, detalhe }: { icone: typeof Target; rotulo: string; valor: string; detalhe?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <I className="h-4 w-4 text-slate-400" />
        {rotulo}
      </div>
      <div className="mt-2 text-lg font-extrabold break-words text-slate-900 tabular-nums sm:text-2xl">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  )
}

export function PainelCrm({ oportunidades, nomeMembro }: { oportunidades: Oportunidade[]; nomeMembro: (id: string | null) => string }) {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const desde = useMemo(() => inicioPeriodo(periodo), [periodo])
  const r = useMemo(() => resumir(oportunidades, desde), [oportunidades, desde])

  const fechadasPeriodo = useMemo(() => oportunidades.filter((o) => !aberta(o) && o.fechado_em && new Date(o.fechado_em) >= desde), [oportunidades, desde])
  const criadasPeriodo = useMemo(() => oportunidades.filter((o) => new Date(o.created_at) >= desde), [oportunidades, desde])

  const porEtapa = ETAPAS_ABERTAS.map((e) => {
    const l = oportunidades.filter((o) => o.etapa === e.value)
    return { id: e.value, rotulo: e.label, valor: l.length, cor: e.barra, detalhe: `${moeda(l.reduce((s, o) => s + (o.valor_mensal ?? 0), 0))}/mês` }
  })

  const porOrigem = ORIGENS.map((og) => {
    const novas = criadasPeriodo.filter((o) => o.origem === og.value).length
    const ganhas = fechadasPeriodo.filter((o) => o.origem === og.value && o.etapa === 'ganho')
    return { id: og.value, rotulo: og.label, valor: novas, ganhas: ganhas.length, mrr: ganhas.reduce((s, o) => s + (o.valor_mensal ?? 0), 0) }
  })
    .filter((x) => x.valor || x.ganhas)
    .sort((a, b) => b.valor - a.valor)

  const motivos = MOTIVOS_PERDA.map((m) => ({
    id: m.value,
    rotulo: m.label,
    valor: fechadasPeriodo.filter((o) => o.etapa === 'perdido' && o.motivo_perda === m.value).length,
    cor: COR_PERDA,
  }))
    .filter((x) => x.valor)
    .sort((a, b) => b.valor - a.valor)

  const porResponsavel = useMemo(() => {
    const m = new Map<string, { abertas: number; funil: number; ganhas: number; mrr: number; perdidas: number }>()
    for (const o of oportunidades) {
      const k = o.responsavel_id ?? ''
      const x = m.get(k) ?? { abertas: 0, funil: 0, ganhas: 0, mrr: 0, perdidas: 0 }
      if (aberta(o)) {
        x.abertas++
        x.funil += o.valor_mensal ?? 0
      } else if (o.fechado_em && new Date(o.fechado_em) >= desde) {
        if (o.etapa === 'ganho') {
          x.ganhas++
          x.mrr += o.valor_mensal ?? 0
        } else x.perdidas++
      }
      m.set(k, x)
    }
    return [...m.entries()].filter(([, x]) => x.abertas || x.ganhas || x.perdidas).sort((a, b) => b[1].mrr - a[1].mrr || b[1].funil - a[1].funil)
  }, [oportunidades, desde])

  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-500">Resultados de:</span>
        {PERIODOS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriodo(p.value)}
            className={`cursor-pointer rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset transition ${periodo === p.value ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <Kpi icone={Filter} rotulo="No funil" valor={String(r.abertas)} detalhe={`${moeda(r.mrrFunil)}/mês em negociação`} />
        <Kpi icone={Gauge} rotulo="Previsão ponderada" valor={moeda(r.ponderado)} detalhe="honorários × chance de fechar" />
        <Kpi icone={Trophy} rotulo="Ganhos" valor={String(r.ganhasPeriodo)} detalhe={`+${moeda(r.mrrGanho)}/mês em honorários`} />
        <Kpi icone={Percent} rotulo="Taxa de conversão" valor={pct(r.conversao)} detalhe={`${r.ganhasPeriodo} ganhos × ${r.perdidasPeriodo} perdidos`} />
        <Kpi icone={CircleDollarSign} rotulo="Ticket médio" valor={r.ticket === null ? '—' : moeda(r.ticket)} detalhe="honorário dos ganhos" />
        <Kpi icone={Timer} rotulo="Ciclo de venda" valor={r.cicloMedio === null ? '—' : `${Math.round(r.cicloMedio)} dias`} detalhe="do cadastro ao fechamento" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Funil hoje (quantidade por etapa)" icone={Filter}>
          <BarrasHorizontais itens={porEtapa} formatar={(v) => String(v)} />
        </Section>

        <Section title="De onde vêm os clientes (origem)" icone={Target} cor="violet">
          {porOrigem.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="py-1.5 pr-3">Origem</th>
                    <th className="px-3 py-1.5 text-right">Novos leads</th>
                    <th className="px-3 py-1.5 text-right">Ganhos</th>
                    <th className="py-1.5 pl-3 text-right">Honorários ganhos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {porOrigem.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2 pr-3 font-medium text-slate-700">{o.rotulo}</td>
                      <td className="px-3 py-2 text-right">{o.valor}</td>
                      <td className="px-3 py-2 text-right">{o.ganhas}</td>
                      <td className="py-2 pl-3 text-right">{moeda(o.mrr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Nenhum lead no período.</p>
          )}
        </Section>

        <Section title="Por que perdemos" icone={XCircle} cor="rose">
          {motivos.length ? <BarrasHorizontais itens={motivos} formatar={(v) => String(v)} /> : <p className="py-6 text-center text-sm text-slate-400">Nenhuma perda no período.</p>}
        </Section>

        <Section title="Desempenho por responsável" icone={Trophy} cor="emerald">
          {porResponsavel.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="py-1.5 pr-3">Responsável</th>
                    <th className="px-3 py-1.5 text-right">No funil</th>
                    <th className="px-3 py-1.5 text-right">Ganhos</th>
                    <th className="px-3 py-1.5 text-right">Perdidos</th>
                    <th className="py-1.5 pl-3 text-right">Honorários ganhos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {porResponsavel.map(([id, x]) => (
                    <tr key={id}>
                      <td className="py-2 pr-3 font-medium text-slate-700">{nomeMembro(id || null) || 'Sem responsável'}</td>
                      <td className="px-3 py-2 text-right" title={`${moeda(x.funil)}/mês`}>
                        {x.abertas}
                      </td>
                      <td className="px-3 py-2 text-right text-emerald-700">{x.ganhas}</td>
                      <td className="px-3 py-2 text-right text-rose-600">{x.perdidas}</td>
                      <td className="py-2 pl-3 text-right">{moeda(x.mrr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Sem dados ainda.</p>
          )}
        </Section>
      </div>

      {r.ganhasPeriodo > 0 && (
        <Section title="Clientes ganhos no período" icone={CircleDollarSign} cor="sky">
          <BarrasHorizontais
            itens={fechadasPeriodo
              .filter((o) => o.etapa === 'ganho')
              .sort((a, b) => (b.valor_mensal ?? 0) - (a.valor_mensal ?? 0))
              .slice(0, 10)
              .map((o) => ({ id: o.id, rotulo: o.empresa, valor: o.valor_mensal ?? 0, cor: COR_SERIE, detalhe: labelDe(ORIGENS, o.origem) }))}
            formatar={(v) => `${moeda(v)}/mês`}
          />
        </Section>
      )}
    </div>
  )
}
