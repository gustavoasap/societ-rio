import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { useApp } from '../contexto'
import { salvar } from '../lib/dados'
import { Selecao } from './ui'

const NOVA = '__nova__'

/** Quem é o responsável pelo gasto: eu (vazio) ou outra pessoa. Permite cadastrar a pessoa na hora. */
export function SeletorPessoa({ valor, onChange }: { valor: string; onChange: (id: string) => void }) {
  const { pessoas, nome } = useApp()
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function criar() {
    const n = novoNome.trim()
    if (!n) return
    const existente = pessoas.find((p) => p.nome.toLowerCase() === n.toLowerCase())
    if (existente) {
      onChange(existente.id)
      setCriando(false)
      return
    }
    try {
      const p = await salvar('pes_pessoas', null, { nome: n })
      onChange(p.id)
      setCriando(false)
      setNovoNome('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  if (criando)
    return (
      <div>
        <div className="flex gap-1.5">
          <input
            className="input"
            autoFocus
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                criar()
              }
            }}
            placeholder="Nome da pessoa"
          />
          <button type="button" className="btn-primary px-3" onClick={criar} aria-label="Salvar pessoa">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" className="btn-secondary px-3" onClick={() => setCriando(false)} aria-label="Cancelar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {erro && <p className="mt-1 text-xs text-rose-600">{erro}</p>}
      </div>
    )

  return (
    <Selecao
      value={valor}
      onChange={(v) => (v === NOVA ? setCriando(true) : onChange(v))}
      opcoes={[
        { value: '', label: `Eu${nome ? ` (${nome})` : ''}` },
        ...pessoas.filter((p) => p.ativa || p.id === valor).map((p) => ({ value: p.id, label: p.nome })),
        { value: NOVA, label: '+ Outra pessoa...' },
      ]}
    />
  )
}
