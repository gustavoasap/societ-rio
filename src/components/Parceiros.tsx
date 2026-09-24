import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { mascaraTelefone } from '../lib/format'
import type { Parceiro, Processo } from '../types'
import { Field, Modal, Section } from './ui'

const VAZIO = { nome: '', telefone: '', email: '', observacoes: '' }

export function Parceiros({
  parceiros,
  processos,
  onClose,
  onChanged,
}: {
  parceiros: Parceiro[]
  processos: Processo[]
  onClose: () => void
  onChanged: () => void
}) {
  const [form, setForm] = useState(VAZIO)
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!form.nome.trim()) {
      setErro('Informe o nome do parceiro.')
      return
    }
    setErro(null)
    setSalvando(true)
    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      email: form.email || null,
      observacoes: form.observacoes || null,
    }
    const { error } = editando
      ? await supabase.from('soc_parceiros').update(payload).eq('id', editando)
      : await supabase.from('soc_parceiros').insert(payload)
    setSalvando(false)
    if (error) return setErro(error.message)
    setForm(VAZIO)
    setEditando(null)
    onChanged()
  }

  async function excluir(p: Parceiro) {
    const qtd = processos.filter((x) => x.parceiro_id === p.id).length
    const aviso = qtd ? `\n\n${qtd} processo(s) ficarão sem parceiro vinculado.` : ''
    if (!confirm(`Excluir o parceiro "${p.nome}"?${aviso}`)) return
    const { error } = await supabase.from('soc_parceiros').delete().eq('id', p.id)
    if (error) return setErro(error.message)
    onChanged()
  }

  return (
    <Modal title="Parceiros" onClose={onClose} largura="max-w-3xl">
      <Section title={editando ? 'Editar parceiro' : 'Novo parceiro'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Nome">
            <input className="input" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </Field>
          <Field label="Telefone">
            <input className="input" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: mascaraTelefone(e.target.value) })} />
          </Field>
          <Field label="E-mail">
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Observações" className="sm:col-span-3">
            <input className="input" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
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
              Cancelar edição
            </button>
          )}
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            {editando ? 'Salvar alterações' : 'Adicionar parceiro'}
          </button>
        </div>
      </Section>

      <Section title={`Cadastrados (${parceiros.length})`}>
        {parceiros.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum parceiro cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {parceiros.map((p) => {
              const qtd = processos.filter((x) => x.parceiro_id === p.id).length
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-800">{p.nome}</div>
                    <div className="text-xs text-slate-500">
                      {[p.telefone, p.email, `${qtd} processo(s) indicado(s)`].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => {
                      setEditando(p.id)
                      setForm({ nome: p.nome, telefone: p.telefone ?? '', email: p.email ?? '', observacoes: p.observacoes ?? '' })
                    }}
                  >
                    Editar
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => excluir(p)}>
                    Excluir
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </Modal>
  )
}
