import { useEffect, type ReactNode } from 'react'
import type { Opcao } from '../types'

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
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
    <select className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
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
  )
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  largura = 'max-w-5xl',
}: {
  title: ReactNode
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
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 sm:p-6">
      <div className={`relative w-full ${largura} rounded-xl bg-slate-50 shadow-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-t-xl border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button className="btn-secondary btn-sm" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="space-y-4 p-4 sm:p-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 flex justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-white px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

const CORES_STATUS: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800 ring-amber-200',
  andamento: 'bg-sky-100 text-sky-800 ring-sky-200',
  concluido: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  abertura: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  alteracao: 'bg-violet-100 text-violet-800 ring-violet-200',
  baixa: 'bg-rose-100 text-rose-800 ring-rose-200',
  ok: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  neutro: 'bg-slate-100 text-slate-700 ring-slate-200',
  analise: 'bg-sky-100 text-sky-800 ring-sky-200',
}

export function Badge({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${CORES_STATUS[cor] ?? CORES_STATUS.neutro}`}
    >
      {children}
    </span>
  )
}

export function Info({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="break-words text-sm text-slate-800">{value === null || value === undefined || value === '' ? '—' : value}</div>
    </div>
  )
}
