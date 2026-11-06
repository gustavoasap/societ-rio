import { useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'

/** "2026-11-05" → "05/11/2026" */
export const isoParaBR = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : ''

/** "05/11/2026" → "2026-11-05" (null se inválida) */
export function brParaIso(br: string): string | null {
  const m = br.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(a, mes - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d || a < 1900) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

/** Máscara DD/MM/AAAA enquanto digita. */
export function mascaraDataBR(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 8)
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

/**
 * Campo de data sempre no formato DD/MM/AAAA (independe do idioma do navegador).
 * Recebe e devolve a data em AAAA-MM-DD ('' quando vazio). O botão abre o calendário.
 */
export function CampoData({
  value,
  onChange,
  id,
  className = 'input',
  disabled,
  title,
  placeholder = 'DD/MM/AAAA',
}: {
  value: string | null | undefined
  onChange: (iso: string) => void
  id?: string
  className?: string
  disabled?: boolean
  title?: string
  placeholder?: string
}) {
  const [texto, setTexto] = useState(isoParaBR(value))
  const [ultimo, setUltimo] = useState(value ?? '')
  const seletor = useRef<HTMLInputElement>(null)

  // Valor mudou por fora (ex.: escolha de junta, recarga): atualiza o texto
  if ((value ?? '') !== ultimo) {
    setUltimo(value ?? '')
    setTexto(isoParaBR(value))
  }

  function digitar(v: string) {
    const t = mascaraDataBR(v)
    setTexto(t)
    if (!t) {
      setUltimo('')
      onChange('')
      return
    }
    const iso = brParaIso(t)
    if (iso) {
      setUltimo(iso)
      onChange(iso)
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        className={`${className} pr-9 tabular-nums`}
        inputMode="numeric"
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        value={texto}
        onChange={(e) => digitar(e.target.value)}
        onBlur={() => {
          if (texto && !brParaIso(texto)) setTexto(isoParaBR(value))
        }}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded p-1 text-slate-400 hover:text-brand-600 disabled:cursor-default"
        title="Abrir calendário"
        aria-label="Abrir calendário"
        onClick={() => {
          const el = seletor.current
          if (!el) return
          try {
            el.showPicker()
          } catch {
            el.focus()
          }
        }}
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={seletor}
        type="date"
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 h-0 w-0 opacity-0"
        value={value ?? ''}
        onChange={(e) => {
          setUltimo(e.target.value)
          setTexto(isoParaBR(e.target.value))
          onChange(e.target.value)
        }}
      />
    </div>
  )
}

const NOMES_MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** Seletor de mês (AAAA-MM) com mês e ano em português. Aceita vazio quando `vazio` é informado. */
export function CampoMes({
  value,
  onChange,
  anos,
  className = 'input py-2',
  vazio,
  title,
}: {
  value: string
  onChange: (mes: string) => void
  anos?: number[]
  className?: string
  vazio?: boolean
  title?: string
}) {
  const ok = /^\d{4}-\d{2}$/.test(value)
  const [selAno, setSelAno] = useState('')
  const [selMes, setSelMes] = useState('')
  const a = ok ? value.slice(0, 4) : selAno
  const m = ok ? String(Number(value.slice(5, 7))) : selMes
  const atual = new Date().getFullYear()
  const lista = [...new Set([...(anos ?? []), ...(ok ? [Number(a)] : []), atual - 2, atual - 1, atual, atual + 1])].sort()
  const emitir = (ano: string, mes: string) => {
    setSelAno(ano)
    setSelMes(mes)
    if (ano && mes) onChange(`${ano}-${mes.padStart(2, '0')}`)
    else if (vazio && !ano && !mes) onChange('')
  }
  return (
    <div className="flex items-center gap-1" title={title}>
      <select className={`${className} w-auto cursor-pointer`} value={m} onChange={(e) => emitir(a || String(atual), e.target.value)} aria-label="Mês">
        {(vazio || !m) && <option value="">Mês</option>}
        {NOMES_MESES.map((n, i) => (
          <option key={n} value={String(i + 1)}>
            {n}
          </option>
        ))}
      </select>
      <select
        className={`${className} w-auto cursor-pointer`}
        value={a}
        onChange={(e) => emitir(e.target.value, m || (e.target.value ? '1' : ''))}
        aria-label="Ano"
      >
        {(vazio || !a) && <option value="">Ano</option>}
        {lista.map((x) => (
          <option key={x} value={String(x)}>
            {x}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Hora no formato HH:MM (24h), independente do idioma do navegador. */
export function mascaraHora(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`
}
