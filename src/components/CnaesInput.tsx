import { useState, type KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { REGEX_CNAE, extrairCnaes, mascaraCnae } from '../lib/format'

/** Lista de CNAEs em "etiquetas": digite um código e confirme com Enter ou "+". */
export function CnaesInput({
  valores,
  onChange,
  doBloco = [],
}: {
  valores: string[]
  onChange: (v: string[]) => void
  /** CNAEs que vieram de um bloco pré-definido; os demais aparecem como "extra". */
  doBloco?: string[]
}) {
  const [novo, setNovo] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  function adicionar(texto = novo) {
    const codigos = extrairCnaes(texto)
    if (codigos.length === 0) {
      setAviso('Informe o CNAE com 7 dígitos (ex.: 4713-0-02).')
      return
    }
    const repetidos = codigos.filter((c) => valores.includes(c))
    const inclusos = [...new Set(codigos)].filter((c) => !valores.includes(c))
    onChange([...valores, ...inclusos])
    setNovo('')
    setAviso(repetidos.length && !inclusos.length ? 'Esse CNAE já está na lista.' : null)
  }

  function tecla(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (novo) adicionar()
    }
  }

  const temBloco = doBloco.length > 0
  const extras = valores.filter((c) => !doBloco.includes(c))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex gap-2">
        <input
          className="input font-mono"
          value={novo}
          placeholder="Digite o CNAE e tecle Enter (ex.: 4713-0-02)"
          onChange={(e) => {
            setAviso(null)
            // Colar vários de uma vez adiciona todos
            if (e.target.value.length > 12) return adicionar(e.target.value)
            setNovo(mascaraCnae(e.target.value))
          }}
          onKeyDown={tecla}
        />
        <button
          type="button"
          className="btn-primary shrink-0 px-3"
          onClick={() => adicionar()}
          disabled={!REGEX_CNAE.test(novo)}
          title="Adicionar CNAE"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Adicionar</span>
        </button>
      </div>
      {aviso && <p className="mt-1.5 text-xs text-rose-600">{aviso}</p>}

      {valores.length > 0 ? (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {valores.map((c) => {
              const extra = temBloco && !doBloco.includes(c)
              return (
                <span
                  key={c}
                  className={`inline-flex items-center gap-1 rounded-lg py-1 pr-1 pl-2.5 font-mono text-xs font-semibold ring-1 ring-inset ${extra ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-brand-50 text-brand-700 ring-brand-200'}`}
                >
                  {c}
                  {extra && <span className="rounded bg-amber-200/70 px-1 font-sans text-[9px] font-bold uppercase">extra</span>}
                  <button
                    type="button"
                    className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md opacity-60 transition hover:bg-black/10 hover:opacity-100"
                    onClick={() => onChange(valores.filter((x) => x !== c))}
                    title="Remover"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>
              {valores.length} CNAE(s) secundário(s)
              {temBloco && extras.length > 0 && <span className="font-semibold text-amber-600"> · {extras.length} extra(s) fora do bloco</span>}
            </span>
            <button type="button" className="cursor-pointer font-medium text-rose-500 hover:underline" onClick={() => onChange([])}>
              Limpar todos
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-xs text-slate-400">Nenhum CNAE secundário adicionado.</p>
      )}
    </div>
  )
}
