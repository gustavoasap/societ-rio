import { useState, type DragEvent } from 'react'
import { CalendarClock, Clock3, Plus, Trophy, UserRound, XCircle } from 'lucide-react'
import { moeda, labelDe } from '../tipos'
import { ETAPAS_ABERTAS, SERVICOS, TEMPERATURAS, diasDesdeInstante, etapaInfo, formatarDataHora, prazoDe, valorPonderado, type Atividade, type EtapaCrm, type Oportunidade } from './tipos'

/** Depois de quantos dias parada na mesma etapa a oportunidade recebe o alerta "parada". */
export const DIAS_PARADA = 10

const COR_TEMP: Record<string, string> = { quente: 'bg-rose-500', morno: 'bg-amber-400', frio: 'bg-sky-400' }

function Card({
  o,
  proxima,
  nomeResponsavel,
  onAbrir,
  arrastando,
  setArrastando,
}: {
  o: Oportunidade
  proxima?: Atividade
  nomeResponsavel: string
  onAbrir: () => void
  arrastando: boolean
  setArrastando: (id: string | null) => void
}) {
  const dias = diasDesdeInstante(o.etapa_desde)
  const prazo = proxima ? prazoDe(proxima.data_prevista) : null
  const temp = TEMPERATURAS.find((t) => t.value === o.temperatura)
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', o.id)
        e.dataTransfer.effectAllowed = 'move'
        setArrastando(o.id)
      }}
      onDragEnd={() => setArrastando(null)}
      onClick={onAbrir}
      className={`cursor-grab rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/80 transition select-none hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-300 active:cursor-grabbing ${arrastando ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[0.8125rem] leading-snug font-bold break-words text-slate-900">{o.empresa}</div>
        <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${COR_TEMP[o.temperatura]}`} title={`Temperatura: ${temp?.label}`} />
      </div>
      {o.contato_nome && <div className="truncate text-xs text-slate-500">{o.contato_nome}</div>}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-sm font-extrabold text-slate-800 tabular-nums">{o.valor_mensal ? `${moeda(o.valor_mensal)}/mês` : <span className="text-xs font-medium text-slate-300">sem valor</span>}</span>
        <span className="truncate text-[0.6875rem] text-slate-400">{labelDe(SERVICOS, o.servico)}</span>
      </div>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2 text-[0.6875rem]">
        {proxima ? (
          <div className={`flex items-center gap-1.5 ${prazo === 'atrasada' ? 'font-semibold text-rose-600' : prazo === 'hoje' ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {proxima.data_prevista ? formatarDataHora(proxima.data_prevista) : 'Sem data'} · {proxima.descricao}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 font-semibold text-amber-600">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            Sem próximo passo agendado
          </div>
        )}
        <div className="flex items-center justify-between gap-2 text-slate-400">
          <span className={`flex items-center gap-1 ${dias >= DIAS_PARADA ? 'font-semibold text-rose-500' : ''}`} title="Dias nesta etapa">
            <Clock3 className="h-3.5 w-3.5" />
            {dias === 0 ? 'hoje' : `${dias} dia${dias > 1 ? 's' : ''}`}
            {dias >= DIAS_PARADA && ' · parada'}
          </span>
          {nomeResponsavel && (
            <span className="flex min-w-0 items-center gap-1 truncate">
              <UserRound className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{nomeResponsavel.split(' ')[0]}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function Funil({
  oportunidades,
  proximas,
  nomeMembro,
  onAbrir,
  onNova,
  onMover,
}: {
  oportunidades: Oportunidade[]
  proximas: Map<string, Atividade>
  nomeMembro: (id: string | null) => string
  onAbrir: (o: Oportunidade) => void
  onNova: (etapa: EtapaCrm) => void
  onMover: (o: Oportunidade, etapa: EtapaCrm) => void
}) {
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [alvo, setAlvo] = useState<EtapaCrm | null>(null)

  const soltar = (etapa: EtapaCrm) => (e: DragEvent) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    const o = oportunidades.find((x) => x.id === id)
    setAlvo(null)
    setArrastando(null)
    if (o && o.etapa !== etapa) onMover(o, etapa)
  }
  const sobre = (etapa: EtapaCrm) => (e: DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (alvo !== etapa) setAlvo(etapa)
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {ETAPAS_ABERTAS.map((et) => {
          const cards = oportunidades.filter((o) => o.etapa === et.value)
          const total = cards.reduce((s, o) => s + (o.valor_mensal ?? 0), 0)
          const ponderado = cards.reduce((s, o) => s + valorPonderado(o), 0)
          return (
            <section
              key={et.value}
              onDragOver={sobre(et.value)}
              onDragLeave={() => setAlvo((a) => (a === et.value ? null : a))}
              onDrop={soltar(et.value)}
              className={`flex min-w-0 flex-col rounded-2xl bg-slate-100/80 ring-1 transition ${alvo === et.value ? 'bg-brand-50 ring-2 ring-brand-400' : 'ring-slate-200/70'}`}
            >
              <header className="border-b-[3px] px-3 pt-3 pb-2" style={{ borderColor: et.barra }}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[0.8125rem] font-bold text-slate-800" title={et.dica}>
                    {et.label}
                  </h3>
                  <span className="rounded-full bg-white px-2 text-xs font-semibold text-slate-500 tabular-nums ring-1 ring-slate-200">{cards.length}</span>
                </div>
                <div className="mt-0.5 flex justify-between gap-2 text-[0.6875rem] text-slate-500 tabular-nums">
                  <span>{moeda(total)}/mês</span>
                  <span title={`Ponderado: ${Math.round(et.probabilidade * 100)}% de chance de fechar nesta etapa`}>
                    ≈ {moeda(ponderado)} · {Math.round(et.probabilidade * 100)}%
                  </span>
                </div>
              </header>
              <div className="flex min-h-40 flex-1 flex-col gap-2 p-2">
                {cards.map((o) => (
                  <Card
                    key={o.id}
                    o={o}
                    proxima={proximas.get(o.id)}
                    nomeResponsavel={nomeMembro(o.responsavel_id)}
                    onAbrir={() => onAbrir(o)}
                    arrastando={arrastando === o.id}
                    setArrastando={setArrastando}
                  />
                ))}
                <button
                  className="mt-auto flex cursor-pointer items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-400 transition hover:border-brand-400 hover:bg-white hover:text-brand-600"
                  onClick={() => onNova(et.value)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <div className={`grid grid-cols-2 gap-3 transition ${arrastando ? 'opacity-100' : 'opacity-60'}`}>
        {(['ganho', 'perdido'] as const).map((et) => {
          const info = etapaInfo(et)
          const I = et === 'ganho' ? Trophy : XCircle
          return (
            <div
              key={et}
              onDragOver={sobre(et)}
              onDragLeave={() => setAlvo((a) => (a === et ? null : a))}
              onDrop={soltar(et)}
              className={`flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed py-4 text-sm font-semibold transition ${
                et === 'ganho' ? 'border-emerald-300 text-emerald-700' : 'border-rose-300 text-rose-600'
              } ${alvo === et ? (et === 'ganho' ? 'bg-emerald-50' : 'bg-rose-50') : 'bg-white/60'}`}
            >
              <I className="h-4 w-4" />
              {arrastando ? `Solte aqui: ${info.label}` : `Arraste um card para cá para marcar como ${info.label.toLowerCase()}`}
            </div>
          )
        })}
      </div>
    </div>
  )
}
