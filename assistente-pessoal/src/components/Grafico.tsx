import { useEffect, useRef, useState } from 'react'
import { mesAbreviado, moeda, moedaCurta } from '../lib/formato'

export const COR_RECEITA = '#1d5fd6'
export const COR_DESPESA = '#e8743b'

function useLargura() {
  const ref = useRef<HTMLDivElement>(null)
  const [largura, setLargura] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const obs = new ResizeObserver(([e]) => setLargura(Math.max(260, e.contentRect.width)))
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return [ref, largura] as const
}

function escala(max: number) {
  if (max <= 0) return { topo: 1000, passos: [0, 250, 500, 750, 1000] }
  const bruto = max / 4
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? bruto
  const topo = Math.ceil(max / passo) * passo
  const passos: number[] = []
  for (let v = 0; v <= topo + passo / 2; v += passo) passos.push(v)
  return { topo, passos }
}

/** Barra com as pontas arredondadas (4px) e base reta na linha zero. */
function barra(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

/** Receitas × despesas por mês (um único eixo em R$), com dica ao passar o dedo/mouse. */
export function GraficoMensal({ meses }: { meses: { mes: string; receitas: number; despesas: number; resultado: number }[] }) {
  const [ref, largura] = useLargura()
  const [ativo, setAtivo] = useState<number | null>(null)
  const altura = 220
  const m = { t: 10, r: 8, b: 26, l: 58 }
  const w = largura - m.l - m.r
  const h = altura - m.t - m.b
  const { topo, passos } = escala(Math.max(...meses.flatMap((x) => [x.receitas, x.despesas])))
  const y = (v: number) => m.t + h - (v / topo) * h
  const grupo = w / meses.length
  const bw = Math.min(28, (grupo * 0.62) / 2)
  const gap = 2

  const dica = ativo !== null ? meses[ativo] : null
  const xDica = ativo !== null ? m.l + grupo * ativo + grupo / 2 : 0

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden select-none" onMouseLeave={() => setAtivo(null)}>
      <svg width={largura} height={altura} role="img" aria-label="Receitas e despesas dos últimos meses">
        {passos.map((p) => (
          <g key={p}>
            <line x1={m.l} x2={largura - m.r} y1={y(p)} y2={y(p)} stroke="#e2e8f0" strokeDasharray={p === 0 ? undefined : '3 3'} />
            <text x={m.l - 8} y={y(p)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">
              {moedaCurta(p)}
            </text>
          </g>
        ))}
        {meses.map((x, i) => {
          const cx = m.l + grupo * i + grupo / 2
          return (
            <g key={x.mes}>
              {ativo === i && <rect x={m.l + grupo * i + 2} y={m.t} width={grupo - 4} height={h} rx={6} className="fill-azul-50" />}
              <path d={barra(cx - bw - gap / 2, y(x.receitas), bw, m.t + h - y(x.receitas))} fill={COR_RECEITA} />
              <path d={barra(cx + gap / 2, y(x.despesas), bw, m.t + h - y(x.despesas))} fill={COR_DESPESA} />
              <text x={cx} y={altura - 8} textAnchor="middle" className={`text-[10.5px] ${ativo === i ? 'fill-slate-800 font-semibold' : 'fill-slate-500'}`}>
                {mesAbreviado(x.mes)}
              </text>
              {/* área de toque maior que as barras */}
              <rect x={m.l + grupo * i} y={0} width={grupo} height={altura} fill="transparent" onMouseEnter={() => setAtivo(i)} onClick={() => setAtivo(ativo === i ? null : i)} />
            </g>
          )
        })}
      </svg>
      {dica && (
        <div
          className="pointer-events-none absolute top-1 z-10 w-44 rounded-xl bg-azul-950/95 px-3 py-2 text-xs text-white shadow-xl"
          style={{ left: Math.min(Math.max(0, xDica - 88), largura - 176) }}
        >
          <div className="mb-1 font-bold first-letter:uppercase">{mesAbreviado(dica.mes)}</div>
          <Linha cor={COR_RECEITA} rotulo="Receitas" valor={dica.receitas} />
          <Linha cor={COR_DESPESA} rotulo="Despesas" valor={dica.despesas} />
          <div className="mt-1 flex justify-between border-t border-white/15 pt-1 font-semibold">
            <span>Resultado</span>
            <span className="tabular-nums">{moeda(dica.resultado)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Linha({ cor, rotulo, valor }: { cor: string; rotulo: string; valor: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-white/80">
        <span className="h-2 w-2 rounded-sm" style={{ background: cor }} />
        {rotulo}
      </span>
      <span className="tabular-nums">{moeda(valor)}</span>
    </div>
  )
}

export function Legenda() {
  return (
    <div className="flex gap-4 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_RECEITA }} />
        Receitas
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_DESPESA }} />
        Despesas
      </span>
    </div>
  )
}
