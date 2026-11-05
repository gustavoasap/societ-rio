import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Columns3, Download, House, LayoutDashboard, ListChecks, LogOut, Plus, Rows3, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Link } from '../../lib/rotas'
import { comRetentativa } from '../../lib/retentar'
import { formatarData } from '../../lib/format'
import { Select } from '../../components/ui'
import { formatarCnpj, hojeISO, labelDe, moeda, type ParceiroResumo } from '../tipos'
import { GanhoModal, PerdaModal } from './Fechamento'
import { DIAS_PARADA, Funil } from './Funil'
import { OportunidadeForm } from './OportunidadeForm'
import { PainelCrm } from './PainelCrm'
import { Tarefas } from './Tarefas'
import {
  MOTIVOS_PERDA,
  ORIGENS,
  SERVICOS,
  TEMPERATURAS,
  aberta,
  diasDesdeInstante,
  etapaInfo,
  formatarDataHora,
  prazoDe,
  type Atividade,
  type EtapaCrm,
  type Membro,
  type Oportunidade,
} from './tipos'

type Aba = 'funil' | 'lista' | 'tarefas' | 'painel'

function csv(linhas: (string | number | null)[][]) {
  return linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
}

export function Crm({ session }: { session: Session }) {
  const [ops, setOps] = useState<Oportunidade[]>([])
  const [pendentes, setPendentes] = useState<Atividade[]>([])
  const [parceiros, setParceiros] = useState<ParceiroResumo[]>([])
  const [equipe, setEquipe] = useState<Membro[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('funil')
  const [busca, setBusca] = useState('')
  const [fResp, setFResp] = useState('')
  const [fOrigem, setFOrigem] = useState('')
  const [fSituacao, setFSituacao] = useState('abertas')

  const [editando, setEditando] = useState<{ op: Oportunidade | null; etapa?: EtapaCrm } | null>(null)
  const [perdendo, setPerdendo] = useState<Oportunidade | null>(null)
  const [ganhando, setGanhando] = useState<Oportunidade | null>(null)

  const carregar = useCallback(async () => {
    const [o, a, p, e] = await comRetentativa(() =>
      Promise.all([
        supabase.from('crm_oportunidades').select('*').order('updated_at', { ascending: false }),
        supabase.from('crm_atividades').select('*').eq('concluida', false).order('data_prevista', { nullsFirst: false }),
        supabase.from('soc_parceiros').select('id, nome').order('nome'),
        supabase.rpc('crm_equipe'),
      ]),
    )
    const falha = o.error ?? a.error ?? p.error ?? e.error
    setErro(falha ? falha.message : null)
    setOps(((o.data as Oportunidade[]) ?? []).map((x) => ({ ...x, valor_mensal: x.valor_mensal === null ? null : Number(x.valor_mensal), valor_avulso: x.valor_avulso === null ? null : Number(x.valor_avulso) })))
    setPendentes((a.data as Atividade[]) ?? [])
    setParceiros((p.data as ParceiroResumo[]) ?? [])
    setEquipe((e.data as Membro[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeMembro = useCallback((id: string | null) => equipe.find((m) => m.user_id === id)?.nome ?? '', [equipe])
  const nomeParceiro = useCallback((id: string | null) => parceiros.find((p) => p.id === id)?.nome ?? '', [parceiros])

  /** Próxima atividade pendente de cada oportunidade (a mais próxima; sem data por último). */
  const proximas = useMemo(() => {
    const m = new Map<string, Atividade>()
    for (const a of pendentes) if (a.tipo !== 'nota' && !m.has(a.oportunidade_id)) m.set(a.oportunidade_id, a)
    return m
  }, [pendentes])

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const dig = t.replace(/\D/g, '')
    return ops.filter((o) => {
      if (fResp && (fResp === 'nenhum' ? o.responsavel_id : o.responsavel_id !== fResp)) return false
      if (fOrigem && o.origem !== fOrigem) return false
      if (!t) return true
      const txt = [o.empresa, o.contato_nome, o.email, o.cidade, nomeParceiro(o.parceiro_id)].filter(Boolean).join(' ').toLowerCase()
      return txt.includes(t) || (dig.length >= 3 && ((o.cnpj ?? '').includes(dig) || (o.telefone ?? '').includes(dig)))
    })
  }, [ops, busca, fResp, fOrigem, nomeParceiro])

  const lista = useMemo(
    () =>
      filtradas.filter((o) =>
        fSituacao === 'abertas' ? aberta(o) : fSituacao === 'ganho' || fSituacao === 'perdido' ? o.etapa === fSituacao : fSituacao === 'paradas' ? aberta(o) && diasDesdeInstante(o.etapa_desde) >= DIAS_PARADA : fSituacao === 'sem_passo' ? aberta(o) && !proximas.has(o.id) : true,
      ),
    [filtradas, fSituacao, proximas],
  )

  const atrasadas = useMemo(() => pendentes.filter((a) => a.tipo !== 'nota' && prazoDe(a.data_prevista) === 'atrasada').length, [pendentes])
  const opsPorId = useMemo(() => new Map(filtradas.map((o) => [o.id, o])), [filtradas])

  async function mover(o: Oportunidade, etapa: EtapaCrm) {
    if (etapa === 'perdido') return setPerdendo(o)
    if (etapa === 'ganho') return setGanhando(o)
    setEditando(null)
    setOps((l) => l.map((x) => (x.id === o.id ? { ...x, etapa, etapa_desde: new Date().toISOString(), motivo_perda: null, motivo_perda_detalhe: null } : x)))
    const { error } = await supabase.from('crm_oportunidades').update({ etapa, motivo_perda: null, motivo_perda_detalhe: null }).eq('id', o.id)
    if (error) setErro(error.message)
    carregar()
  }

  async function concluir(a: Atividade) {
    setPendentes((l) => l.filter((x) => x.id !== a.id))
    const { error } = await supabase.from('crm_atividades').update({ concluida: true, concluida_em: new Date().toISOString() }).eq('id', a.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  function fecharFechamento(feito: boolean) {
    setPerdendo(null)
    setGanhando(null)
    if (feito) {
      setEditando(null)
      carregar()
    }
  }

  function exportar() {
    const cab = ['Empresa', 'CNPJ', 'Contato', 'Telefone', 'E-mail', 'Cidade/UF', 'Etapa', 'Serviço', 'Origem', 'Parceiro', 'Responsável', 'Honorário mensal', 'Valor avulso', 'Temperatura', 'Previsão', 'Motivo da perda', 'Criada em', 'Fechada em']
    const linhas = lista.map((o) => [
      o.empresa,
      formatarCnpj(o.cnpj),
      o.contato_nome,
      o.telefone,
      o.email,
      [o.cidade, o.uf].filter(Boolean).join('/'),
      etapaInfo(o.etapa).label,
      labelDe(SERVICOS, o.servico),
      labelDe(ORIGENS, o.origem),
      nomeParceiro(o.parceiro_id),
      nomeMembro(o.responsavel_id),
      o.valor_mensal?.toFixed(2).replace('.', ',') ?? '',
      o.valor_avulso?.toFixed(2).replace('.', ',') ?? '',
      labelDe(TEMPERATURAS, o.temperatura),
      formatarData(o.previsao_fechamento),
      labelDe(MOTIVOS_PERDA, o.motivo_perda),
      formatarData(o.created_at),
      o.fechado_em ? formatarData(o.fechado_em) : '',
    ])
    const blob = new Blob(['﻿' + csv([cab, ...linhas])], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `crm-${hojeISO()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const ABAS: { id: Aba; label: string; icone: typeof Columns3; n?: number; alerta?: boolean }[] = [
    { id: 'funil', label: 'Funil', icone: Columns3, n: ops.filter(aberta).length },
    { id: 'lista', label: 'Lista', icone: Rows3 },
    { id: 'tarefas', label: 'Follow-ups', icone: ListChecks, n: pendentes.filter((a) => a.tipo !== 'nota').length, alerta: atrasadas > 0 },
    { id: 'painel', label: 'Painel', icone: LayoutDashboard },
  ]

  const filtros = (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
      <div className="relative min-w-60 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input id="busca-crm" className="input pl-10" placeholder="Buscar por empresa, contato, CNPJ, telefone, cidade ou parceiro" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {aba === 'lista' && (
        <Select
          value={fSituacao}
          onChange={setFSituacao}
          opcoes={[
            { value: 'abertas', label: 'Em andamento' },
            { value: 'paradas', label: `Paradas há ${DIAS_PARADA}+ dias` },
            { value: 'sem_passo', label: 'Sem próximo passo' },
            { value: 'ganho', label: 'Ganhas' },
            { value: 'perdido', label: 'Perdidas' },
            { value: 'todas', label: 'Todas' },
          ]}
          className="input w-auto"
        />
      )}
      <Select value={fResp} onChange={setFResp} opcoes={[...equipe.map((m) => ({ value: m.user_id, label: m.nome })), { value: 'nenhum', label: 'Sem responsável' }]} vazio="Todos os responsáveis" className="input w-auto" />
      <Select value={fOrigem} onChange={setFOrigem} opcoes={ORIGENS} vazio="Todas as origens" className="input w-auto" />
      {aba === 'lista' && (
        <button className="btn-secondary" onClick={exportar} title="Baixar a lista filtrada em planilha (CSV)">
          <Download className="h-4 w-4" />
          Exportar
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative flex w-full max-w-none items-center gap-4 px-3 py-4 sm:px-4 md:px-6 lg:px-8">
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
        <div className="relative flex w-full max-w-none flex-wrap items-end justify-between gap-4 px-3 pt-4 pb-6 sm:px-4 md:px-6 lg:px-8">
          <div>
            <p className="text-sm font-medium text-cyan-300">
              <Link para="/" className="hover:underline">
                Página inicial
              </Link>{' '}
              ›{' '}
              <Link para="/d/administrativo" className="hover:underline">
                Administrativo
              </Link>{' '}
              · CRM
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">CRM · Funil de vendas</h1>
            <p className="mt-1 text-sm text-white/60">Do primeiro contato ao contrato assinado: leads, propostas e follow-ups.</p>
          </div>
          <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando({ op: null })}>
            <Plus className="h-4 w-4" />
            Nova oportunidade
          </button>
        </div>
        <nav className="relative flex w-full max-w-none gap-1 overflow-x-auto px-3 sm:px-4 md:px-6 lg:px-8" role="tablist">
          {ABAS.map(({ id, label, icone: I, n, alerta }) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`flex cursor-pointer items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${aba === id ? 'bg-[#f3f6fc] text-slate-900' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <I className="h-4 w-4" />
              {label}
              {n !== undefined && (
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${alerta ? 'bg-rose-500 text-white' : aba === id ? 'bg-slate-200 text-slate-600' : 'bg-white/15'}`} title={alerta ? `${atrasadas} atrasada(s)` : undefined}>
                  {n}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="w-full max-w-none space-y-5 px-3 py-6 sm:px-4 md:px-6 lg:px-8">
        {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
        {carregando ? (
          <p className="p-10 text-center text-sm text-slate-400">Carregando CRM...</p>
        ) : aba === 'painel' ? (
          <PainelCrm oportunidades={ops} nomeMembro={nomeMembro} />
        ) : (
          <>
            {filtros}
            {aba === 'funil' && (
              <Funil
                oportunidades={filtradas.filter(aberta)}
                proximas={proximas}
                nomeMembro={nomeMembro}
                onAbrir={(o) => setEditando({ op: o })}
                onNova={(etapa) => setEditando({ op: null, etapa })}
                onMover={mover}
              />
            )}
            {aba === 'tarefas' && (
              <Tarefas atividades={pendentes.filter((a) => a.tipo !== 'nota')} oportunidades={opsPorId} nomeMembro={nomeMembro} onConcluir={concluir} onAbrir={(o) => setEditando({ op: o })} />
            )}
            {aba === 'lista' && (
              <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                      <tr>
                        <th className="py-3 pr-3 pl-5">Empresa</th>
                        <th className="px-3 py-3">Etapa</th>
                        <th className="px-3 py-3">Serviço · origem</th>
                        <th className="px-3 py-3">Responsável</th>
                        <th className="px-3 py-3 text-right">Honorário</th>
                        <th className="px-3 py-3">Próximo passo</th>
                        <th className="py-3 pr-5 pl-3 text-right">Na etapa</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lista.map((o) => {
                        const et = etapaInfo(o.etapa)
                        const prox = proximas.get(o.id)
                        const prazo = prox ? prazoDe(prox.data_prevista) : null
                        const dias = diasDesdeInstante(o.etapa_desde)
                        return (
                          <tr key={o.id} className="cursor-pointer transition hover:bg-slate-50/70" onClick={() => setEditando({ op: o })}>
                            <td className="min-w-56 py-3 pr-3 pl-5">
                              <div className="font-semibold text-slate-900">{o.empresa}</div>
                              <div className="text-xs text-slate-400">{[o.contato_nome, o.cidade && `${o.cidade}${o.uf ? `/${o.uf}` : ''}`].filter(Boolean).join(' · ') || '—'}</div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${et.cor}`}>{et.label}</span>
                              {o.etapa === 'perdido' && o.motivo_perda && <div className="mt-0.5 text-xs text-slate-400">{labelDe(MOTIVOS_PERDA, o.motivo_perda)}</div>}
                            </td>
                            <td className="px-3 py-3">
                              <div className="whitespace-nowrap text-slate-700">{labelDe(SERVICOS, o.servico)}</div>
                              <div className="text-xs whitespace-nowrap text-slate-400">
                                {labelDe(ORIGENS, o.origem)}
                                {o.parceiro_id && ` · ${nomeParceiro(o.parceiro_id)}`}
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-slate-600">{nomeMembro(o.responsavel_id) || <span className="text-slate-300">—</span>}</td>
                            <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-slate-800 tabular-nums">{o.valor_mensal ? moeda(o.valor_mensal) : <span className="text-slate-300">—</span>}</td>
                            <td className="max-w-64 px-3 py-3 text-xs">
                              {aberta(o) ? (
                                prox ? (
                                  <>
                                    <div className={`whitespace-nowrap ${prazo === 'atrasada' ? 'font-semibold text-rose-600' : prazo === 'hoje' ? 'font-semibold text-amber-600' : 'text-slate-500'}`}>
                                      {prox.data_prevista ? formatarDataHora(prox.data_prevista) : 'Sem data'}
                                    </div>
                                    <div className="truncate text-slate-400">{prox.descricao}</div>
                                  </>
                                ) : (
                                  <span className="font-semibold text-amber-600">Nenhum agendado</span>
                                )
                              ) : (
                                <span className="text-slate-400">Fechada em {formatarData(o.fechado_em)}</span>
                              )}
                            </td>
                            <td className={`py-3 pr-5 pl-3 text-right text-xs whitespace-nowrap tabular-nums ${aberta(o) && dias >= DIAS_PARADA ? 'font-semibold text-rose-500' : 'text-slate-500'}`}>
                              {aberta(o) ? `${dias} dia${dias === 1 ? '' : 's'}` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {lista.length === 0 && <p className="p-10 text-center text-sm text-slate-400">Nenhuma oportunidade encontrada.</p>}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {editando && (
        <OportunidadeForm
          key={editando.op?.id ?? 'nova'}
          oportunidade={editando.op}
          etapaInicial={editando.etapa}
          parceiros={parceiros}
          equipe={equipe}
          usuarioId={session.user.id}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
          onMover={mover}
        />
      )}
      {perdendo && <PerdaModal oportunidade={perdendo} onClose={() => fecharFechamento(false)} onFeito={() => fecharFechamento(true)} />}
      {ganhando && <GanhoModal oportunidade={ganhando} nomeResponsavel={nomeMembro(ganhando.responsavel_id)} onClose={() => fecharFechamento(false)} onFeito={() => fecharFechamento(true)} />}
    </div>
  )
}
