import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Inbox, X, type LucideIcon } from 'lucide-react'
import { mesAtual, somarMesesAoMes } from '../lib/datas'
import { lerValor, mesPorExtenso, valorParaCampo } from '../lib/formato'

export interface Opcao {
  value: string
  label: string
}

export function Campo({ label, children, className = '', dica }: { label: string; children: ReactNode; className?: string; dica?: ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-400">{dica}</span>}
    </label>
  )
}

export function Selecao({ value, onChange, opcoes, vazio, disabled }: { value: string; onChange: (v: string) => void; opcoes: Opcao[]; vazio?: string; disabled?: boolean }) {
  return (
    <div className="relative">
      <select className="input cursor-pointer appearance-none pr-9" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-60" />
    </div>
  )
}

/** Campo de valor em reais: aceita "1.234,56" e formata ao sair do campo. */
export function CampoValor({ valor, onChange, placeholder = '0,00', autoFocus }: { valor: number | null; onChange: (v: number | null) => void; placeholder?: string; autoFocus?: boolean }) {
  const [texto, setTexto] = useState(valorParaCampo(valor))
  const [focado, setFocado] = useState(false)
  useEffect(() => {
    if (!focado) setTexto(valorParaCampo(valor))
  }, [valor, focado])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-sm font-semibold text-slate-400">R$</span>
      <input
        className="input pl-10 tabular-nums"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={texto}
        onFocus={() => setFocado(true)}
        onBlur={() => {
          setFocado(false)
          setTexto(valorParaCampo(lerValor(texto)))
        }}
        onChange={(e) => {
          setTexto(e.target.value)
          onChange(lerValor(e.target.value))
        }}
      />
    </div>
  )
}

/** Botões lado a lado para escolher uma opção (ex.: Despesa | Receita | Transferência). */
export function Segmentado<T extends string>({ valor, onChange, opcoes }: { valor: T; onChange: (v: T) => void; opcoes: { value: T; label: string; ativo?: string }[] }) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1">
      {opcoes.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${valor === o.value ? `bg-white shadow-sm ${o.ativo ?? 'text-azul-700'}` : 'text-slate-500 hover:text-slate-800'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({ titulo, onClose, children, rodape }: { titulo: ReactNode; onClose: () => void; children: ReactNode; rodape?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const abertas = document.querySelectorAll('[data-modal]')
      if (abertas[abertas.length - 1] === ref.current) onClose()
    }
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      if (document.querySelectorAll('[data-modal]').length <= 1) document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      data-modal
      className="animar-fundo fixed inset-0 z-50 flex items-end justify-center bg-azul-950/60 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="animar-modal safe-bottom flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-azul-800 to-azul-700 px-5 py-4 text-white">
          <h2 className="min-w-0 truncate text-base font-bold">{titulo}</h2>
          <button className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/10 transition hover:bg-white/20" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">{children}</div>
        {rodape && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">{rodape}</div>}
      </div>
    </div>
  )
}

export function Cabecalho({ titulo, descricao, acoes }: { titulo: string; descricao?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{titulo}</h1>
        {descricao && <p className="mt-0.5 text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}

export function SeletorMes({ mes, onChange }: { mes: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <button className="icon-btn" onClick={() => onChange(somarMesesAoMes(mes, -1))} aria-label="Mês anterior">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button
        className="min-w-36 cursor-pointer rounded-lg px-2 py-1 text-center text-sm font-bold text-slate-800 first-letter:uppercase hover:bg-slate-50"
        onClick={() => onChange(mesAtual())}
        title="Voltar para o mês atual"
      >
        {mesPorExtenso(mes)}
      </button>
      <button className="icon-btn" onClick={() => onChange(somarMesesAoMes(mes, 1))} aria-label="Próximo mês">
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export function Progresso({ fracao, cor = 'bg-azul-600', alerta = false }: { fracao: number; cor?: string; alerta?: boolean }) {
  const pct = Math.max(0, Math.min(1, fracao)) * 100
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full transition-all ${alerta ? 'bg-rose-500' : cor}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function Vazio({ icone: I = Inbox, children }: { icone?: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center text-sm text-slate-500">
      <I className="h-8 w-8 text-slate-300" />
      {children}
    </div>
  )
}

export function Erro({ children }: { children: ReactNode }) {
  return children ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{children}</p> : null
}

export function Carregando() {
  return <div className="py-16 text-center text-sm text-slate-400">Carregando...</div>
}

export function Bolinha({ icone: I, fundo, texto, tamanho = 'h-10 w-10' }: { icone: LucideIcon; fundo: string; texto: string; tamanho?: string }) {
  return (
    <span className={`flex ${tamanho} shrink-0 items-center justify-center rounded-xl ${fundo} ${texto}`}>
      <I className="h-[45%] w-[45%]" />
    </span>
  )
}
