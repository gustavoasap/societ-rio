import { useEffect, type ComponentType, type ReactNode } from 'react'
import { ChevronDown, X } from 'lucide-react'
import type { Opcao } from '../types'

type Icone = ComponentType<{ className?: string }>

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  )
}

export function Select({
  value,
  onChange,
  opcoes,
  vazio,
  className = 'input',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  opcoes: (Opcao | string)[]
  vazio?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <select
        className={`${className} cursor-pointer appearance-none pr-9`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {vazio !== undefined && <option value="">{vazio}</option>}
        {opcoes.map((o) => {
          const op = typeof o === 'string' ? { value: o, label: o } : o
          return (
            <option key={op.value} value={op.value}>
              {op.label}
            </option>
          )
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 opacity-60" />
    </div>
  )
}

export function Section({
  title,
  children,
  actions,
  icone: I,
  cor = 'brand',
}: {
  title: string
  children: ReactNode
  actions?: ReactNode
  icone?: Icone
  cor?: 'brand' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky'
}) {
  const cores = {
    brand: 'bg-brand-100 text-brand-600',
    violet: 'bg-violet-100 text-violet-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    rose: 'bg-rose-100 text-rose-600',
    sky: 'bg-sky-100 text-sky-600',
  }
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-800">
          {I && (
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${cores[cor]}`}>
              <I className="h-4 w-4" />
            </span>
          )}
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Modal({
  title,
  subtitulo,
  onClose,
  children,
  footer,
  largura = 'max-w-5xl',
}: {
  title: ReactNode
  subtitulo?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  largura?: string
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="animar-fundo fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-asap-950/60 p-2 backdrop-blur-sm sm:p-6">
      <div className={`animar-modal relative w-full ${largura} overflow-hidden rounded-3xl bg-[#f5f7fc] shadow-2xl shadow-asap-950/40`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-gradient-to-r from-asap-900 via-asap-800 to-asap-700 px-6 py-4 text-white">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{title}</h2>
            {subtitulo && <div className="mt-0.5 text-xs text-white/60">{subtitulo}</div>}
          </div>
          <button
            className="no-print flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-4 sm:p-6">{children}</div>
        {footer && (
          <div className="no-print sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white/90 px-6 py-4 backdrop-blur">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export const CORES_BADGE: Record<string, { badge: string; ponto: string }> = {
  pendente: { badge: 'bg-amber-50 text-amber-700 ring-amber-200', ponto: 'bg-amber-500' },
  andamento: { badge: 'bg-brand-50 text-brand-700 ring-brand-200', ponto: 'bg-brand-500' },
  analise: { badge: 'bg-sky-50 text-sky-700 ring-sky-200', ponto: 'bg-sky-500' },
  concluido: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', ponto: 'bg-emerald-500' },
  ok: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', ponto: 'bg-emerald-500' },
  abertura: { badge: 'bg-brand-50 text-brand-700 ring-brand-200', ponto: 'bg-brand-500' },
  alteracao: { badge: 'bg-violet-50 text-violet-700 ring-violet-200', ponto: 'bg-violet-500' },
  baixa: { badge: 'bg-rose-50 text-rose-700 ring-rose-200', ponto: 'bg-rose-500' },
  neutro: { badge: 'bg-slate-100 text-slate-600 ring-slate-200', ponto: 'bg-slate-400' },
}

export function Badge({ cor, children }: { cor: string; children: ReactNode }) {
  const c = CORES_BADGE[cor] ?? CORES_BADGE.neutro
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${c.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.ponto}`} />
      {children}
    </span>
  )
}

export function Info({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[0.6875rem] font-semibold tracking-wide text-slate-400 uppercase">{label}</div>
      <div className="mt-0.5 text-sm font-medium break-words text-slate-800">
        {value === null || value === undefined || value === '' ? <span className="text-slate-300">—</span> : value}
      </div>
    </div>
  )
}
