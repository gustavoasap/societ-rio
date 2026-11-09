import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { moeda } from '../lib/formato'
import { Modal } from './ui'

/**
 * Botãozinho ⓘ ao lado de um número: abre uma janela com a conta que gerou aquele valor e de onde vêm os dados.
 * Funciona até dentro de cartões que são links (não navega ao clicar).
 */
export function Explicar({ titulo, children, claro = false }: { titulo: string; children: ReactNode; claro?: boolean }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button
        type="button"
        className={`inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full align-middle transition ${claro ? 'text-white/70 hover:bg-white/15 hover:text-white' : 'text-slate-400 hover:bg-azul-50 hover:text-azul-700'}`}
        aria-label={`Como é calculado: ${titulo}`}
        title="Como é calculado"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setAberto(true)
        }}
      >
        <Info className="h-4 w-4" />
      </button>
      {aberto &&
        createPortal(
          // não deixa o clique "vazar" para um cartão-link que esteja em volta
          <div onClick={(e) => e.stopPropagation()}>
            <Modal
              titulo={titulo}
              onClose={() => setAberto(false)}
              rodape={
                <button type="button" className="btn-secondary" onClick={() => setAberto(false)}>
                  Entendi
                </button>
              }
            >
              <div className="space-y-3 text-sm text-slate-700">{children}</div>
            </Modal>
          </div>,
          document.body,
        )}
    </>
  )
}

export interface LinhaConta {
  rotulo: ReactNode
  valor: number | string
  /** sinal que aparece antes do rótulo: (+), (−), (×), (÷) */
  sinal?: '+' | '−' | '×' | '÷'
  dica?: ReactNode
}

/** A conta passo a passo: cada parcela com o seu sinal e o resultado no fim. */
export function Conta({ linhas, total }: { linhas: LinhaConta[]; total?: { rotulo: ReactNode; valor: number | string } }) {
  const fmt = (v: number | string) => (typeof v === 'number' ? moeda(v) : v)
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      {linhas.map((l, i) => (
        <div key={i} className="py-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-slate-600">
              {l.sinal && <span className="mr-1 font-bold text-slate-400">({l.sinal})</span>}
              {l.rotulo}
            </span>
            <b className="shrink-0 tabular-nums">{fmt(l.valor)}</b>
          </div>
          {l.dica && <div className="text-xs text-slate-400">{l.dica}</div>}
        </div>
      ))}
      {total && (
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-slate-200 pt-2 text-base">
          <span className="font-bold text-slate-800">(=) {total.rotulo}</span>
          <b className="shrink-0 text-azul-800 tabular-nums">{fmt(total.valor)}</b>
        </div>
      )}
    </div>
  )
}

/** Bloco "de onde vem / período" dentro da explicação. */
export function Origem({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-azul-50 px-3 py-2 text-xs text-azul-900">{children}</p>
}
