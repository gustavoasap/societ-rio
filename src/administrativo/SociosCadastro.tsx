import { useState } from 'react'
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mascaraCpf } from '../lib/format'
import type { Cliente, SocioCadastro } from './tipos'
import { cpfValido } from './socios'

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()

interface Sugestao {
  nome: string
  qualificacao: string | null
  cpf?: string | null
}

/** Sócios digitados na Base de Clientes (nome, CPF e qualificação), editáveis nos Detalhes da Empresa. */
export function SociosCadastro({ cliente, sugestoes, onSalvo }: { cliente: Cliente; sugestoes: Sugestao[]; onSalvo: (s: SocioCadastro[]) => void }) {
  const salvos = cliente.socios ?? []
  const [editando, setEditando] = useState(false)
  const [lista, setLista] = useState<SocioCadastro[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function preencher(base: SocioCadastro[]) {
    // Completa com os sócios da Receita/contrato que ainda não estão na lista (CPF do contrato quando houver)
    const r = base.map((s) => ({ ...s }))
    for (const g of sugestoes) {
      const ja = r.find((s) => semAcento(s.nome) === semAcento(g.nome))
      if (ja) {
        if (!digitos(ja.cpf) && g.cpf) ja.cpf = mascaraCpf(g.cpf)
        if (!ja.qualificacao && g.qualificacao) ja.qualificacao = g.qualificacao
      } else if (g.nome.trim()) r.push({ nome: g.nome.trim().toUpperCase(), cpf: g.cpf ? mascaraCpf(g.cpf) : '', qualificacao: g.qualificacao ?? '' })
    }
    return r
  }

  function abrir() {
    const base = salvos.length ? salvos : preencher([])
    setLista(base.length ? base.map((s) => ({ ...s, cpf: s.cpf ? mascaraCpf(s.cpf) : '' })) : [{ nome: '', cpf: '', qualificacao: '' }])
    setErro(null)
    setEditando(true)
  }

  const alterar = (i: number, campo: keyof SocioCadastro, v: string) => setLista((l) => l.map((s, j) => (j === i ? { ...s, [campo]: v } : s)))

  async function salvar() {
    const limpos = lista
      .map((s) => ({ nome: s.nome.trim().toUpperCase(), cpf: digitos(s.cpf) ? mascaraCpf(s.cpf ?? '') : '', qualificacao: (s.qualificacao ?? '').trim() }))
      .filter((s) => s.nome || s.cpf)
    const semNome = limpos.find((s) => !s.nome)
    if (semNome) return setErro(`Informe o nome do sócio do CPF ${semNome.cpf}.`)
    const invalido = limpos.find((s) => s.cpf && !cpfValido(s.cpf))
    if (invalido) return setErro(`CPF inválido para ${invalido.nome}: ${invalido.cpf}. Confira os números.`)
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.from('adm_clientes').update({ socios: limpos }).eq('id', cliente.id)
    setSalvando(false)
    if (error) return setErro(error.message)
    setEditando(false)
    onSalvo(limpos)
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold tracking-wide text-slate-500 uppercase">Sócios no cadastro (Base de Clientes)</h4>
        {!editando && (
          <button className="btn-secondary btn-sm" onClick={abrir}>
            {salvos.length ? <Pencil className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {salvos.length ? 'Editar sócios' : 'Incluir sócios e CPF'}
          </button>
        )}
      </div>

      {!editando &&
        (salvos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Nome</th>
                  <th className="px-3 py-1.5">CPF</th>
                  <th className="py-1.5 pl-3">Qualificação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salvos.map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-semibold text-slate-800">{s.nome}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-700">{s.cpf || <span className="text-slate-300">—</span>}</td>
                    <td className="py-2 pl-3 text-slate-600">{s.qualificacao || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nenhum sócio informado no cadastro. Clique em “Incluir sócios e CPF” para digitar.</p>
        ))}

      {editando && (
        <div className="rounded-xl bg-slate-50/70 p-3 ring-1 ring-slate-200/70">
          {erro && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{erro}</p>}
          <div className="space-y-2">
            {lista.map((s, i) => {
              const cpfRuim = digitos(s.cpf).length === 11 && !cpfValido(s.cpf ?? '')
              return (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_11rem_12rem_2rem]">
                  <input
                    className="input"
                    placeholder="Nome do sócio"
                    value={s.nome}
                    onChange={(e) => alterar(i, 'nome', e.target.value.toUpperCase())}
                    aria-label="Nome do sócio"
                  />
                  <input
                    className={`input font-mono ${cpfRuim ? 'ring-2 ring-rose-300' : ''}`}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    value={s.cpf ?? ''}
                    onChange={(e) => alterar(i, 'cpf', mascaraCpf(e.target.value))}
                    aria-label="CPF do sócio"
                    title={cpfRuim ? 'CPF inválido' : undefined}
                  />
                  <input
                    className="input"
                    placeholder="Qualificação"
                    value={s.qualificacao ?? ''}
                    onChange={(e) => alterar(i, 'qualificacao', e.target.value)}
                    aria-label="Qualificação do sócio"
                  />
                  <button
                    className="icon-btn h-9 w-8 hover:text-rose-600"
                    onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
                    title="Remover sócio"
                    aria-label="Remover sócio"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setLista((l) => [...l, { nome: '', cpf: '', qualificacao: '' }])}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar sócio
            </button>
            {sugestoes.length > 0 && (
              <button className="btn-secondary btn-sm" onClick={() => setLista((l) => preencher(l.filter((s) => s.nome.trim() || digitos(s.cpf))))}>
                Trazer nomes da Receita / contrato
              </button>
            )}
            <span className="flex-1" />
            <button className="btn-secondary btn-sm" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn-primary btn-sm" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar sócios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
