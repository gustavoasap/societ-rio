import { useEffect, useRef, useState, type ReactNode } from 'react'
import { compacto } from '../formatacao'

export interface Serie {
  id: string
  label: string
  cor: string
}

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [largura, setLargura] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(280, e.contentRect.width)))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, largura] as const
}

/** Escala "bonita" para o eixo Y. */
function escala(max: number) {
  if (max <= 0) return { topo: 1, passos: [0, 1] }
  const bruto = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? bruto
  const topo = Math.ceil(max / passo) * passo
  const passos: number[] = []
  for (let v = 0; v <= topo + passo / 2; v += passo) passos.push(v)
  return { topo, passos }
}

/** Barra com as pontas de dados arredondadas (4px) e base reta na linha zero. */
function barra(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

export function Legenda({ series }: { series: Serie[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {series.map((s) => (
        <span key={s.id} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.cor }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

interface Dica {
  x: number
  y: number
  conteudo: ReactNode
}

/**
 * Barras agrupadas (ex.: carga por regime em cada ano). Um único eixo em R$.
 * `valores[serieId]` ausente = regime não disponível naquele grupo.
 */
export function BarrasAgrupadas({
  grupos,
  series,
  formatar,
  destaque,
  altura = 280,
  aoClicar,
  selecionado,
}: {
  grupos: { rotulo: string; valores: Record<string, number | undefined>; extra?: Record<string, string> }[]
  series: Serie[]
  formatar: (v: number) => string
  destaque?: (grupo: number, serie: string) => boolean
  altura?: number
  aoClicar?: (grupo: number) => void
  selecionado?: number | null
}) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [dica, setDica] = useState<Dica | null>(null)
  const margem = { t: 12, r: 8, b: 28, l: 56 }
  const w = largura - margem.l - margem.r
  const h = altura - margem.t - margem.b
  const max = Math.max(0, ...grupos.flatMap((g) => Object.values(g.valores).filter((v): v is number => v !== undefined)))
  const { topo, passos } = escala(max)
  const larguraGrupo = w / Math.max(1, grupos.length)
  const nSeries = series.length
  const larguraBarra = Math.max(4, Math.min(28, (larguraGrupo * 0.8 - (nSeries - 1) * 2) / nSeries))
  const y = (v: number) => margem.t + h - (v / topo) * h

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setDica(null)}>
      <svg width={largura} height={altura} role="img" aria-label="Gráfico de barras agrupadas">
        {passos.map((p) => (
          <g key={p}>
            <line x1={margem.l} x2={margem.l + w} y1={y(p)} y2={y(p)} stroke="#e2e8f0" strokeWidth={1} />
            <text x={margem.l - 8} y={y(p)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px]">
              {compacto(p)}
            </text>
          </g>
        ))}
        {grupos.map((g, gi) => {
          const presentes = series.filter((s) => g.valores[s.id] !== undefined)
          const total = presentes.length * larguraBarra + (presentes.length - 1) * 2
          const x0 = margem.l + gi * larguraGrupo + (larguraGrupo - total) / 2
          return (
            <g key={g.rotulo}>
              {selecionado === gi && <rect x={margem.l + gi * larguraGrupo + 2} y={margem.t} width={larguraGrupo - 4} height={h} rx={8} fill="#eef4ff" />}
              {presentes.map((s, si) => {
                const v = g.valores[s.id] ?? 0
                const x = x0 + si * (larguraBarra + 2)
                const top = y(Math.max(0, v))
                const alto = Math.max(1, margem.t + h - top)
                const marcado = destaque?.(gi, s.id)
                return (
                  <g key={s.id}>
                    <path d={barra(x, top, larguraBarra, alto)} fill={s.cor} opacity={dica && !marcado ? 0.9 : 1} />
                    {marcado && <circle cx={x + larguraBarra / 2} cy={top - 7} r={3} fill="#0f172a" />}
                    <rect
                      x={x - 1}
                      y={margem.t}
                      width={larguraBarra + 2}
                      height={h}
                      fill="transparent"
                      style={aoClicar ? { cursor: 'pointer' } : undefined}
                      onClick={() => aoClicar?.(gi)}
                      onMouseMove={(e) => {
                        const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
                        setDica({
                          x: e.clientX - box.left,
                          y: e.clientY - box.top,
                          conteudo: (
                            <>
                              <div className="font-semibold text-slate-900">
                                {s.label} · {g.rotulo}
                              </div>
                              <div className="text-slate-700">{formatar(v)}</div>
                              {g.extra?.[s.id] && <div className="text-slate-500">{g.extra[s.id]}</div>}
                            </>
                          ),
                        })
                      }}
                    />
                  </g>
                )
              })}
              <text x={margem.l + gi * larguraGrupo + larguraGrupo / 2} y={altura - 8} textAnchor="middle" className="fill-slate-500 text-[11px] font-medium">
                {g.rotulo}
              </text>
            </g>
          )
        })}
        <line x1={margem.l} x2={margem.l + w} y1={margem.t + h} y2={margem.t + h} stroke="#94a3b8" strokeWidth={1} />
      </svg>
      {dica && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-slate-200"
          style={{ left: Math.min(dica.x + 12, largura - 190), top: Math.max(0, dica.y - 60) }}
        >
          {dica.conteudo}
        </div>
      )}
    </div>
  )
}

/** Barras horizontais: uma por item (ex.: carga de cada regime). */
export function BarrasHorizontais({
  itens,
  formatar,
}: {
  itens: { id: string; rotulo: string; valor: number; cor: string; detalhe?: string; marca?: ReactNode }[]
  formatar: (v: number) => string
}) {
  const max = Math.max(1, ...itens.map((i) => i.valor))
  return (
    <div className="space-y-3">
      {itens.map((i) => (
        <div key={i.id} title={`${i.rotulo}: ${formatar(i.valor)}${i.detalhe ? ` · ${i.detalhe}` : ''}`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-semibold text-slate-700">
              {i.rotulo}
              {i.marca}
            </span>
            <span className="tabular-nums text-slate-900">
              <span className="font-bold">{formatar(i.valor)}</span>
              {i.detalhe && <span className="ml-2 text-xs text-slate-500">{i.detalhe}</span>}
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-100">
            <div className="h-3 rounded-full transition-all" style={{ width: `${(i.valor / max) * 100}%`, background: i.cor }} />
          </div>
        </div>
      ))}
    </div>
  )
}
