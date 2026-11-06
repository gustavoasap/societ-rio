import { useState } from 'react'
import { Check, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarMoeda, moedaDigitada } from '../../lib/format'
import { Field, Modal, Section } from '../../components/ui'
import { salvarJunta } from './acoes'
import type { Caucao, Junta } from './tipos'

const VAZIO = { uf: '', nome: '', taxa: '' }

export function Juntas({ juntas, caucoes, onClose, onChanged }: { juntas: Junta[]; caucoes: Caucao[]; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState(VAZIO)
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const r = await salvarJunta(form, editando)
    setSalvando(false)
    if (r.erro) return setErro(r.erro)
    setErro(null)
    setForm(VAZIO)
    setEditando(null)
    onChanged()
  }

  async function excluir(j: Junta) {
    const qtd = caucoes.filter((c) => c.junta_uf === j.uf).length
    if (!confirm(`Excluir a junta ${j.uf}?${qtd ? `\n\n${qtd} caução(ões) ficarão sem junta informada (o valor da taxa já lançado é mantido).` : ''}`)) return
    const { error } = await supabase.from('soc_caucao_juntas').delete().eq('uf', j.uf)
    if (error) return setErro(error.message)
    onChanged()
  }

  return (
    <Modal
      title="Juntas comerciais e taxas"
      subtitulo="Valor padrão da taxa de cada estado. Mudar aqui não altera os cauções já lançados."
      onClose={onClose}
      largura="max-w-2xl"
    >
      <Section icone={editando ? Pencil : Plus} title={editando ? `Editar junta ${editando}` : 'Cadastrar estado'}>
        <div className="grid grid-cols-[5rem_1fr_9rem] gap-3">
          <Field label="UF">
            <input
              className="input uppercase"
              maxLength={2}
              value={form.uf}
              onChange={(e) => setForm({ ...form, uf: e.target.value.replace(/[^a-z]/gi, '').toUpperCase() })}
            />
          </Field>
          <Field label="Nome da junta">
            <input className="input" placeholder="Ex.: JUCERJA" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Taxa">
            <input
              className="input tabular-nums"
              placeholder="R$ 0,00"
              value={form.taxa}
              onChange={(e) => setForm({ ...form, taxa: e.target.value })}
              onBlur={(e) => setForm({ ...form, taxa: moedaDigitada(e.target.value) })}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-end gap-2">
          {erro && <span className="mr-auto text-sm text-red-600">{erro}</span>}
          {editando && (
            <button
              className="btn-secondary"
              onClick={() => {
                setEditando(null)
                setForm(VAZIO)
              }}
            >
              Cancelar
            </button>
          )}
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            <Check className="h-4 w-4" />
            {editando ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      </Section>
      <Section icone={Landmark} title="Juntas cadastradas">
        <ul className="divide-y divide-slate-100">
          {juntas.map((j) => (
            <li key={j.uf} className="flex items-center gap-3 py-2.5">
              <span className="w-10 rounded-lg bg-slate-100 py-1 text-center text-sm font-bold text-slate-700">{j.uf}</span>
              <span className="flex-1 text-sm text-slate-700">{j.nome}</span>
              <span className="text-sm font-semibold text-slate-900 tabular-nums">{formatarMoeda(j.taxa)}</span>
              <button
                className="cursor-pointer p-1 text-slate-400 hover:text-brand-600"
                title="Editar"
                onClick={() => {
                  setEditando(j.uf)
                  setForm({ uf: j.uf, nome: j.nome, taxa: moedaDigitada(String(j.taxa).replace('.', ',')) })
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button className="cursor-pointer p-1 text-slate-400 hover:text-rose-600" title="Excluir" onClick={() => excluir(j)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </Section>
    </Modal>
  )
}
