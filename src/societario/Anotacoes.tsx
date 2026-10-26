import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, CircleDollarSign, ClipboardList, House, LogOut, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/rotas'
import { comRetentativa } from '../lib/retentar'
import { formatarData, formatarMoeda, lerNumeroBR, moedaDigitada } from '../lib/format'
import { Field, Modal } from '../components/ui'

type Anotacao = {
  id: string
  titulo: string
  descricao: string | null
  valor_cobrado: number | null
  concluida: boolean
  concluida_em: string | null
  created_at: string
}

type Rascunho = { titulo: string; descricao: string; valor: string }

const vazio: Rascunho = { titulo: '', descricao: '', valor: '' }

const paraRascunho = (a: Anotacao): Rascunho => ({
  titulo: a.titulo,
  descricao: a.descricao ?? '',
  valor: a.valor_cobrado === null ? '' : moedaDigitada(String(a.valor_cobrado).replace('.', ',')),
})

const paraBanco = (r: Rascunho) => ({
  titulo: r.titulo.trim(),
  descricao: r.descricao.trim() || null,
  valor_cobrado: lerNumeroBR(r.valor),
})

function Campos({ r, set }: { r: Rascunho; set: (r: Rascunho) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <Field label="Título">
        <input className="input" value={r.titulo} onChange={(e) => set({ ...r, titulo: e.target.value })} placeholder="Ex.: Alteração - Daniel e Castiele" required autoFocus />
      </Field>
      <Field label="Valor cobrado nesse processo">
        <input
          className="input tabular-nums"
          inputMode="decimal"
          value={r.valor}
          onChange={(e) => set({ ...r, valor: e.target.value })}
          onBlur={() => set({ ...r, valor: moedaDigitada(r.valor) })}
          placeholder="R$ 0,00"
        />
      </Field>
      <Field label="O que precisa fazer (opcional)" className="sm:col-span-2">
        <textarea
          className="input min-h-20 resize-y"
          value={r.descricao}
          onChange={(e) => set({ ...r, descricao: e.target.value })}
          placeholder="Ex.: entrada de sócio, aumento de capital, pedir documentos..."
        />
      </Field>
    </div>
  )
}

export function Anotacoes({ session }: { session: Session }) {
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [nova, setNova] = useState<Rascunho>(vazio)
  const [salvando, setSalvando] = useState(false)
  const [editando, setEditando] = useState<{ id: string; r: Rascunho } | null>(null)
  const [busca, setBusca] = useState('')
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)

  const carregar = useCallback(async () => {
    const [{ data, error }] = await comRetentativa(() => Promise.all([supabase.from('soc_anotacoes').select('*').order('created_at', { ascending: false })]))
    setErro(error?.message ?? null)
    setAnotacoes((data as Anotacao[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!nova.titulo.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('soc_anotacoes').insert(paraBanco(nova))
    setSalvando(false)
    if (error) return setErro(error.message)
    setNova(vazio)
    carregar()
  }

  async function salvarEdicao(e: FormEvent) {
    e.preventDefault()
    if (!editando || !editando.r.titulo.trim()) return
    const { error } = await supabase.from('soc_anotacoes').update(paraBanco(editando.r)).eq('id', editando.id)
    if (error) return setErro(error.message)
    setEditando(null)
    carregar()
  }

  async function alternarConcluida(a: Anotacao) {
    const mudancas = { concluida: !a.concluida, concluida_em: a.concluida ? null : new Date().toISOString() }
    setAnotacoes((lista) => lista.map((x) => (x.id === a.id ? { ...x, ...mudancas } : x)))
    const { error } = await supabase.from('soc_anotacoes').update(mudancas).eq('id', a.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function excluir(a: Anotacao) {
    if (!confirm(`Excluir a anotação "${a.titulo}"?`)) return
    const { error } = await supabase.from('soc_anotacoes').delete().eq('id', a.id)
    if (error) return setErro(error.message)
    carregar()
  }

  const pendentes = useMemo(() => anotacoes.filter((a) => !a.concluida), [anotacoes])
  const totalACobrar = pendentes.reduce((s, a) => s + (a.valor_cobrado ?? 0), 0)

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return anotacoes.filter((a) => {
      if (a.concluida && !mostrarConcluidas) return false
      return !termo || `${a.titulo} ${a.descricao ?? ''}`.toLowerCase().includes(termo)
    })
  }, [anotacoes, busca, mostrarConcluidas])

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 pb-20 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative flex w-full max-w-none items-center gap-4 py-4 px-3 sm:px-4 md:px-6 lg:px-8">
          <Link para="/" aria-label="Ir para a página inicial do portal">
            <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="h-9 w-auto sm:h-10" />
          </Link>
          <Link para="/" className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20">
            <House className="h-4 w-4" />
            <span className="hidden sm:inline">Página inicial</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-white/70 md:inline">{session.user.email}</span>
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => supabase.auth.signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="relative w-full max-w-none pt-4 px-3 sm:px-4 md:px-6 lg:px-8">
          <p className="text-sm font-medium text-cyan-300">
            <Link para="/" className="hover:underline">
              Página inicial
            </Link>{' '}
            ›{' '}
            <Link para="/d/societario" className="hover:underline">
              Societário
            </Link>{' '}
            · Anotações
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Anotações - Tarefas (Rascunho)</h1>
          <p className="mt-1 text-sm text-white/60">Anote cada demanda societária assim que ela chegar, com o valor a cobrar, para não esquecer.</p>
        </div>
      </div>

      <main className="relative -mt-12 w-full max-w-none space-y-5 pb-10 px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="mt-4 text-3xl font-extrabold text-slate-900">{pendentes.length}</div>
            <div className="text-sm font-medium text-slate-500">Tarefa(s) pendente(s)</div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-lg">
              <CircleDollarSign className="h-5 w-5" />
            </span>
            <div className="mt-4 text-3xl font-extrabold text-slate-900 tabular-nums">{formatarMoeda(totalACobrar)}</div>
            <div className="text-sm font-medium text-slate-500">A cobrar nas tarefas pendentes</div>
          </div>
        </div>

        <form onSubmit={adicionar} className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
          <h2 className="text-sm font-bold text-slate-800">Nova anotação</h2>
          <Campos r={nova} set={setNova} />
          <div className="flex justify-end">
            <button className="btn-primary" disabled={salvando || !nova.titulo.trim()}>
              <Plus className="h-4 w-4" />
              {salvando ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
        </form>

        {erro && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Buscar nas anotações..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={mostrarConcluidas} onChange={(e) => setMostrarConcluidas(e.target.checked)} />
            Mostrar concluídas ({anotacoes.length - pendentes.length})
          </label>
        </div>

        {carregando ? (
          <p className="py-16 text-center text-sm text-slate-400">Carregando anotações...</p>
        ) : visiveis.length === 0 ? (
          <p className="rounded-2xl bg-white py-16 text-center text-sm text-slate-500 ring-1 ring-slate-200/70">
            {anotacoes.length === 0 ? 'Nenhuma anotação ainda. Use o quadro acima para anotar a primeira demanda.' : 'Nenhuma anotação encontrada.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visiveis.map((a) => (
              <div
                key={a.id}
                className={`flex flex-col rounded-2xl border-l-4 bg-white p-5 shadow-sm ring-1 ring-slate-200/70 ${a.concluida ? 'border-emerald-400 opacity-70' : 'border-amber-400'}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => alternarConcluida(a)}
                    title={a.concluida ? 'Reabrir tarefa' : 'Marcar como feita'}
                    aria-label={a.concluida ? 'Reabrir tarefa' : 'Marcar como feita'}
                    className={`mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition ${a.concluida ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500'}`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-bold break-words text-slate-800 ${a.concluida ? 'line-through' : ''}`}>{a.titulo}</h3>
                    {a.descricao && <p className="mt-1 text-sm whitespace-pre-line break-words text-slate-600">{a.descricao}</p>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${a.valor_cobrado === null ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-700'}`}
                    title="Valor cobrado nesse processo"
                  >
                    {a.valor_cobrado === null ? 'Sem valor' : formatarMoeda(a.valor_cobrado)}
                  </span>
                  <span className="text-xs text-slate-400">
                    {a.concluida && a.concluida_em ? `Feita em ${formatarData(a.concluida_em)}` : `Anotada em ${formatarData(a.created_at)}`}
                  </span>
                  <div className="ml-auto flex gap-1">
                    {a.concluida ? (
                      <button className="icon-btn" onClick={() => alternarConcluida(a)} title="Reabrir">
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    ) : (
                      <button className="icon-btn" onClick={() => setEditando({ id: a.id, r: paraRascunho(a) })} title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button className="icon-btn hover:text-rose-600" onClick={() => excluir(a)} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editando && (
        <Modal
          title="Editar anotação"
          largura="max-w-2xl"
          onClose={() => setEditando(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button className="btn-primary" form="editar-anotacao" disabled={!editando.r.titulo.trim()}>
                Salvar
              </button>
            </>
          }
        >
          <form id="editar-anotacao" onSubmit={salvarEdicao}>
            <Campos r={editando.r} set={(r) => setEditando({ ...editando, r })} />
          </form>
        </Modal>
      )}
    </div>
  )
}
