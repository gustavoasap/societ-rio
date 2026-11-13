import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'

export interface ItemBusca {
  id: string
  codigo: number
  razao_social: string
  cnpj?: string | null
}

const GENERICAS = new Set(['ltda', 'me', 'epp', 'eireli', 'sa', 's', 'a', 'slu', 'mei', 'ss'])

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Campo para escolher um cliente digitando parte do nome, o código ou o CNPJ. */
export function BuscaCliente({
  itens,
  value,
  onChange,
  placeholder = 'Digite o nome, código ou CNPJ',
  vazio,
  className = '',
}: {
  itens: ItemBusca[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** Texto da opção "nenhum" (ex.: "Não é honorário"); sem ele, não há opção vazia */
  vazio?: string
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [ativo, setAtivo] = useState(0)
  const caixa = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const escolhido = itens.find((i) => i.id === value)
  const rotulo = (i: ItemBusca) => `${String(i.codigo).padStart(3, '0')} - ${i.razao_social}`

  const filtrados = useMemo(() => {
    const t = semAcento(texto.trim())
    const dig = t.replace(/\D/g, '')
    const ord = [...itens].sort((a, b) => a.codigo - b.codigo)
    if (!t) return ord.slice(0, 200)
    const termos = t.split(/\s+/).filter(Boolean)
    const pontuar = (i: ItemBusca) => {
      const cod = String(i.codigo).padStart(3, '0')
      if (/^\d+$/.test(t) && (cod.startsWith(t) || String(i.codigo) === t)) return 100
      if (dig.length >= 3 && (i.cnpj ?? '').replace(/\D/g, '').includes(dig)) return 90
      // Palavras do nome sem as genéricas (LTDA, ME...), para "lt" não trazer todas as LTDA
      const palavras = semAcento(i.razao_social)
        .split(/[^a-z0-9&]+/)
        .filter((w) => w && !GENERICAS.has(w))
      if (!termos.every((tt) => palavras.some((w) => w.startsWith(tt)) || (tt.length >= 4 && semAcento(i.razao_social).includes(tt)))) return 0
      if (palavras[0]?.startsWith(termos[0])) return 80
      return 50
    }
    return ord
      .map((i) => ({ i, p: pontuar(i) }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.p - a.p || a.i.codigo - b.i.codigo)
      .slice(0, 200)
      .map((x) => x.i)
  }, [itens, texto])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  useEffect(() => {
    lista.current?.querySelector<HTMLElement>(`[data-i="${ativo}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [ativo])

  function escolher(id: string) {
    onChange(id)
    setAberto(false)
    setTexto('')
  }

  return (
    <div ref={caixa} className={`relative ${className}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className="input pr-16 pl-9"
          value={aberto ? texto : escolhido ? rotulo(escolhido) : ''}
          placeholder={escolhido && aberto ? rotulo(escolhido) : placeholder}
          onFocus={() => {
            setAberto(true)
            setAtivo(0)
          }}
          onChange={(e) => {
            setTexto(e.target.value)
            setAberto(true)
            setAtivo(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setAberto(true)
              setAtivo((a) => Math.min(a + 1, filtrados.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setAtivo((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter') {
              e.preventDefault()
              if (aberto && filtrados[ativo]) escolher(filtrados[ativo].id)
            } else if (e.key === 'Escape') {
              e.stopPropagation()
              setAberto(false)
            }
          }}
          role="combobox"
          aria-expanded={aberto}
          aria-autocomplete="list"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-0.5">
          {value && vazio !== undefined && (
            <button type="button" className="icon-btn h-6 w-6" onClick={() => escolher('')} title={vazio} aria-label={vazio}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className="pointer-events-none h-4 w-4 text-slate-400" />
        </div>
      </div>
      {aberto && (
        <ul
          ref={lista}
          role="listbox"
          className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-xl bg-white py-1 text-sm shadow-xl ring-1 ring-slate-200"
        >
          {vazio !== undefined && (
            <li>
              <button
                type="button"
                className="w-full cursor-pointer px-3 py-1.5 text-left text-slate-500 hover:bg-slate-50"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher('')}
              >
                — {vazio} —
              </button>
            </li>
          )}
          {filtrados.map((i, idx) => (
            <li key={i.id}>
              <button
                type="button"
                data-i={idx}
                role="option"
                aria-selected={i.id === value}
                className={`w-full cursor-pointer px-3 py-1.5 text-left ${idx === ativo ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50'} ${i.id === value ? 'font-semibold' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setAtivo(idx)}
                onClick={() => escolher(i.id)}
              >
                <span className="font-mono text-xs text-slate-400">{String(i.codigo).padStart(3, '0')}</span> {i.razao_social}
              </button>
            </li>
          ))}
          {!filtrados.length && <li className="px-3 py-2 text-slate-400">Nenhum cliente encontrado.</li>}
        </ul>
      )}
    </div>
  )
}
