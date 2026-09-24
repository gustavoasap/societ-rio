import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { formatarData } from '../lib/format'
import {
  ACOMPANHAMENTO,
  STATUS_PROCESSO,
  TIPOS,
  labelDe,
  type CampoAcompanhamento,
  type Parceiro,
  type Processo,
  type StatusProcesso,
} from '../types'
import { Parceiros } from './Parceiros'
import { ProcessoDetalhes } from './ProcessoDetalhes'
import { ProcessoForm } from './ProcessoForm'
import { corEtapa } from './StatusBadge'
import { Badge, Select } from './ui'

const CORES_SELECT: Record<string, string> = {
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-800',
  pendente: 'border-amber-300 bg-amber-50 text-amber-800',
  analise: 'border-sky-300 bg-sky-50 text-sky-800',
  andamento: 'border-sky-300 bg-sky-50 text-sky-800',
  concluido: 'border-emerald-300 bg-emerald-50 text-emerald-800',
}

function progresso(p: Processo) {
  return ACOMPANHAMENTO.filter((a) => p[a.campo] === a.concluido).length
}

export function Dashboard({ session }: { session: Session }) {
  const [processos, setProcessos] = useState<Processo[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusProcesso>('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroParceiro, setFiltroParceiro] = useState('')

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<Processo | 'novo' | null>(null)
  const [detalhes, setDetalhes] = useState<Processo | null>(null)
  const [mostrarParceiros, setMostrarParceiros] = useState(false)

  const carregar = useCallback(async () => {
    const [proc, parc] = await Promise.all([
      supabase.from('soc_processos').select('*').order('data_inicio', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('soc_parceiros').select('*').order('nome'),
    ])
    if (proc.error || parc.error) setErro((proc.error ?? parc.error)!.message)
    else setErro(null)
    setProcessos((proc.data as Processo[]) ?? [])
    setParceiros((parc.data as Parceiro[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const contagem = useMemo(() => {
    const c: Record<StatusProcesso, number> = { pendente: 0, andamento: 0, concluido: 0 }
    processos.forEach((p) => c[p.status]++)
    return c
  }, [processos])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const termoDigitos = termo.replace(/\D/g, '')
    return processos.filter((p) => {
      if (filtroStatus && p.status !== filtroStatus) return false
      if (filtroTipo && p.tipo !== filtroTipo) return false
      if (filtroParceiro && p.parceiro_id !== filtroParceiro) return false
      if (!termo) return true
      const texto = [p.razao_social, p.nome_fantasia, p.responsavel, p.numero_viabilidade, p.cnpj, ...(p.socios ?? []).map((s) => s.nome)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (texto.includes(termo)) return true
      return termoDigitos.length >= 3 && (p.cnpj ?? '').replace(/\D/g, '').includes(termoDigitos)
    })
  }, [processos, busca, filtroStatus, filtroTipo, filtroParceiro])

  async function atualizarCampo(p: Processo, campo: CampoAcompanhamento | 'status', valor: string) {
    setProcessos((lista) => lista.map((x) => (x.id === p.id ? { ...x, [campo]: valor } : x)))
    const { error } = await supabase.from('soc_processos').update({ [campo]: valor }).eq('id', p.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function excluir(p: Processo) {
    if (!confirm(`Excluir o processo de ${labelDe(TIPOS, p.tipo).toLowerCase()} "${p.razao_social ?? ''}"?\n\nEssa ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('soc_processos').delete().eq('id', p.id)
    if (error) return setErro(error.message)
    setProcessos((lista) => lista.filter((x) => x.id !== p.id))
  }

  function alternar(id: string) {
    setExpandidos((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const nomeParceiro = (id: string | null) => parceiros.find((x) => x.id === id)?.nome

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">PS</div>
            <div>
              <h1 className="text-base font-semibold leading-tight text-slate-800">Processos Societários</h1>
              <p className="text-xs text-slate-500">Abertura, alteração e baixa de CNPJ</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-slate-500 sm:inline">{session.user.email}</span>
            <button className="btn-secondary btn-sm" onClick={() => supabase.auth.signOut()}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STATUS_PROCESSO.map((s) => {
            const ativo = filtroStatus === s.value
            return (
              <button
                key={s.value}
                onClick={() => setFiltroStatus(ativo ? '' : (s.value as StatusProcesso))}
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow ${ativo ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-200'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600">{s.label}</span>
                  <Badge cor={s.value}>{ativo ? 'filtrando' : 'ver'}</Badge>
                </div>
                <div className="mt-1 text-3xl font-semibold text-slate-800">{contagem[s.value as StatusProcesso]}</div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <input
            className="input min-w-52 flex-1"
            placeholder="Buscar por razão social, CNPJ, viabilidade, sócio..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div className="w-40">
            <Select value={filtroTipo} onChange={setFiltroTipo} opcoes={TIPOS} vazio="Todos os tipos" />
          </div>
          <div className="w-44">
            <Select value={filtroStatus} onChange={(v) => setFiltroStatus(v as StatusProcesso | '')} opcoes={STATUS_PROCESSO} vazio="Todos os status" />
          </div>
          <div className="w-44">
            <Select
              value={filtroParceiro}
              onChange={setFiltroParceiro}
              opcoes={parceiros.map((p) => ({ value: p.id, label: p.nome }))}
              vazio="Todos os parceiros"
            />
          </div>
          <button className="btn-secondary" onClick={() => setMostrarParceiros(true)}>
            Parceiros
          </button>
          <button className="btn-primary" onClick={() => setEditando('novo')}>
            + Novo processo
          </button>
        </div>

        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</div>}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">CNPJ</th>
                  <th className="px-4 py-3">Razão Social</th>
                  <th className="px-4 py-3">Nº Viabilidade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data início</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {carregando && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      Carregando...
                    </td>
                  </tr>
                )}
                {!carregando && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      {processos.length === 0 ? 'Nenhum processo cadastrado. Clique em "+ Novo processo" para começar.' : 'Nenhum processo encontrado com esses filtros.'}
                    </td>
                  </tr>
                )}
                {filtrados.map((p) => {
                  const aberto = expandidos.has(p.id)
                  const feitos = progresso(p)
                  return (
                    <Fragment key={p.id}>
                      <tr className={`transition ${aberto ? 'bg-indigo-50/40' : 'hover:bg-slate-50'}`}>
                        <td className="px-4 py-3">
                          <Badge cor={p.tipo}>{labelDe(TIPOS, p.tipo)}</Badge>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-700">{p.cnpj || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{p.razao_social || '—'}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap text-xs text-slate-500">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200" title={`${feitos} de ${ACOMPANHAMENTO.length} etapas concluídas`}>
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(feitos / ACOMPANHAMENTO.length) * 100}%` }} />
                            </div>
                            {feitos}/{ACOMPANHAMENTO.length} etapas
                            {nomeParceiro(p.parceiro_id) && <span>· indicação: {nomeParceiro(p.parceiro_id)}</span>}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{p.numero_viabilidade || '—'}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={p.status}
                            onChange={(v) => atualizarCampo(p, 'status', v)}
                            opcoes={STATUS_PROCESSO}
                            className={`rounded-full border px-2 py-1 text-xs font-medium outline-none ${CORES_SELECT[p.status]}`}
                          />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatarData(p.data_inicio)}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1.5">
                            <button className="btn-secondary btn-sm" onClick={() => alternar(p.id)}>
                              {aberto ? 'Recolher' : 'Expandir'}
                            </button>
                            <button className="btn-secondary btn-sm" onClick={() => setEditando(p)}>
                              Editar
                            </button>
                            <button className="btn-danger btn-sm" onClick={() => excluir(p)}>
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                      {aberto && (
                        <tr className="bg-indigo-50/40">
                          <td colSpan={7} className="px-4 pb-4 pt-1">
                            <div className="rounded-lg border border-slate-200 bg-white p-4">
                              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                {ACOMPANHAMENTO.map((a) => (
                                  <label key={a.campo} className="block">
                                    <span className="mb-1 block text-xs font-medium text-slate-500">{a.label}</span>
                                    <Select
                                      value={p[a.campo]}
                                      onChange={(v) => atualizarCampo(p, a.campo, v)}
                                      opcoes={a.opcoes}
                                      className={`w-full rounded-md border px-2 py-1.5 text-sm outline-none ${CORES_SELECT[corEtapa(a, p[a.campo])]}`}
                                    />
                                  </label>
                                ))}
                                <div className="flex items-end">
                                  <button className="btn-primary w-full" onClick={() => setDetalhes(p)}>
                                    Detalhes do processo
                                  </button>
                                </div>
                              </div>
                              {(p.responsavel || p.alteracao_descricao || p.observacoes || (p.tipo === 'abertura' && p.socios?.length > 0)) && (
                                <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                                  {p.tipo === 'abertura' && p.socios?.length > 0 && (
                                    <div>
                                      <b>Sócios:</b> {p.socios.map((s) => s.nome || s.cpf || 'sem nome').join(', ')}
                                    </div>
                                  )}
                                  {p.responsavel && (
                                    <div>
                                      <b>Responsável:</b> {p.responsavel}
                                    </div>
                                  )}
                                  {p.alteracao_descricao && (
                                    <div>
                                      <b>Alteração:</b> {p.alteracao_descricao}
                                    </div>
                                  )}
                                  {p.observacoes && (
                                    <div>
                                      <b>Obs.:</b> {p.observacoes}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          {filtrados.length} de {processos.length} processo(s) exibido(s)
        </p>
      </main>

      {editando && (
        <ProcessoForm
          processo={editando === 'novo' ? null : editando}
          parceiros={parceiros}
          onClose={() => setEditando(null)}
          onGerenciarParceiros={() => setMostrarParceiros(true)}
          onSaved={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}

      {detalhes && (
        <ProcessoDetalhes
          processo={processos.find((x) => x.id === detalhes.id) ?? detalhes}
          parceiros={parceiros}
          onClose={() => setDetalhes(null)}
          onEditar={() => {
            const atual = processos.find((x) => x.id === detalhes.id) ?? detalhes
            setDetalhes(null)
            setEditando(atual)
          }}
        />
      )}

      {mostrarParceiros && (
        <Parceiros parceiros={parceiros} processos={processos} onClose={() => setMostrarParceiros(false)} onChanged={carregar} />
      )}
    </div>
  )
}
