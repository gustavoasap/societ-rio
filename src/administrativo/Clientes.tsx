import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowDown, ArrowUp, Archive, Download, ExternalLink, House, LayoutDashboard, LogOut, Pencil, Plus, Search, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/rotas'
import { comRetentativa } from '../lib/retentar'
import { formatarData } from '../lib/format'
import { Select } from '../components/ui'
import { ClienteForm } from './ClienteForm'
import { encerrarCliente } from './acoes'
import { Painel } from './Painel'
import {
  COR_STATUS,
  ETAPAS,
  REGIMES,
  STATUS_CLIENTE,
  formatarCnpj,
  hojeISO,
  labelDe,
  moeda,
  temPendencia,
  type Cliente,
  type Etapa,
  type ParceiroResumo,
  type StatusCliente,
  type Vigente,
} from './tipos'

type Aba = 'painel' | 'ativos' | 'inativos'
type Ordem = 'codigo' | 'razao_social' | 'honorario' | 'data_assinatura'

const COR_ETAPA: Record<Etapa | 'vazio', string> = {
  concluida: 'bg-emerald-500',
  pdf_enviado: 'bg-sky-400',
  pendente: 'bg-amber-400',
  na: 'bg-slate-300',
  vazio: 'bg-slate-200',
}
const TEXTO_ETAPA: Record<Etapa | 'vazio', string> = { concluida: 'concluída', pdf_enviado: 'PDF enviado', pendente: 'pendente', na: 'não se aplica', vazio: 'não informado' }

function csv(linhas: (string | number | null)[][]) {
  return linhas.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
}

export function Clientes({ session }: { session: Session }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [vigentes, setVigentes] = useState<Map<string, Vigente>>(new Map())
  const [parceiros, setParceiros] = useState<ParceiroResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('painel')
  const [busca, setBusca] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fParceiro, setFParceiro] = useState('')
  const [fRegime, setFRegime] = useState('')
  const [fPendencia, setFPendencia] = useState('')
  const [ordem, setOrdem] = useState<{ campo: Ordem; asc: boolean }>({ campo: 'codigo', asc: true })
  const [editando, setEditando] = useState<Cliente | 'novo' | null>(null)
  const [encerrando, setEncerrando] = useState<Cliente | null>(null)
  const [dataEnc, setDataEnc] = useState(hojeISO())

  const carregar = useCallback(async () => {
    const [c, h, p] = await comRetentativa(() =>
      Promise.all([
        supabase.from('adm_clientes').select('*').order('codigo'),
        supabase.from('adm_clientes_honorario_atual').select('cliente_id, valor, dia_vencimento'),
        supabase.from('soc_parceiros').select('id, nome').order('nome'),
      ]),
    )
    const falha = c.error ?? h.error ?? p.error
    setErro(falha ? falha.message : null)
    setClientes((c.data as Cliente[]) ?? [])
    setVigentes(new Map(((h.data as Vigente[]) ?? []).map((v) => [v.cliente_id, { ...v, valor: Number(v.valor) }])))
    setParceiros((p.data as ParceiroResumo[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeParceiro = useCallback((id: string | null) => parceiros.find((p) => p.id === id)?.nome ?? '', [parceiros])
  const ativos = useMemo(() => clientes.filter((c) => c.status !== 'encerrado'), [clientes])
  const inativos = useMemo(() => clientes.filter((c) => c.status === 'encerrado'), [clientes])

  const lista = useMemo(() => {
    const base = aba === 'inativos' ? inativos : ativos
    const t = busca.trim().toLowerCase()
    const dig = t.replace(/\D/g, '')
    const filtrada = base.filter((c) => {
      if (fStatus && c.status !== fStatus) return false
      if (fParceiro && (fParceiro === 'nenhum' ? c.parceiro_id : c.parceiro_id !== fParceiro)) return false
      if (fRegime && (fRegime === 'nao_informado' ? c.regime_tributario : c.regime_tributario !== fRegime)) return false
      if (fPendencia) {
        const etapa = fPendencia === 'qualquer' ? null : c[fPendencia as (typeof ETAPAS)[number]['campo']]
        if (fPendencia === 'qualquer' ? !temPendencia(c) : etapa !== 'pendente' && etapa !== 'pdf_enviado') return false
      }
      if (!t) return true
      const txt = [c.razao_social, c.nome_fantasia, c.responsavel, c.email, String(c.codigo)].filter(Boolean).join(' ').toLowerCase()
      return txt.includes(t) || (dig.length >= 3 && (c.cnpj ?? '').includes(dig))
    })
    const val = (c: Cliente) =>
      ordem.campo === 'honorario' ? (vigentes.get(c.id)?.valor ?? -1) : ordem.campo === 'codigo' ? c.codigo : ordem.campo === 'razao_social' ? c.razao_social : (c.data_assinatura ?? '')
    return [...filtrada].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
      return ordem.asc ? r : -r
    })
  }, [aba, ativos, inativos, busca, fStatus, fParceiro, fRegime, fPendencia, ordem, vigentes])

  const totalLista = lista.reduce((s, c) => s + (vigentes.get(c.id)?.valor ?? 0), 0)

  async function mudarStatus(c: Cliente, status: StatusCliente) {
    if (status === 'encerrado') {
      setDataEnc(hojeISO())
      return setEncerrando(c)
    }
    setClientes((l) => l.map((x) => (x.id === c.id ? { ...x, status } : x)))
    const { error } = await supabase.from('adm_clientes').update({ status }).eq('id', c.id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function confirmarEncerramento() {
    if (!encerrando) return
    const msg = await encerrarCliente(encerrando, dataEnc)
    setEncerrando(null)
    if (msg) setErro(msg)
    carregar()
  }

  function irPara(a: Aba, filtros: { status?: string; pendencia?: string; parceiro?: string } = {}) {
    setAba(a)
    setFStatus(filtros.status ?? '')
    setFPendencia(filtros.pendencia ?? '')
    setFParceiro(filtros.parceiro ?? '')
    setFRegime('')
    setBusca('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function exportar() {
    const cab = ['Código', 'CNPJ', 'Razão social', 'Situação', 'Abertura', 'Assinatura', 'Encerramento', 'Responsável', 'E-mail', 'Telefone', 'Parceiro', 'Regime', 'Honorário mensal', 'Dia vencimento', ...ETAPAS.map((e) => e.label), 'Drive']
    const linhas = lista.map((c) => {
      const v = vigentes.get(c.id)
      return [
        c.codigo,
        formatarCnpj(c.cnpj),
        c.razao_social,
        labelDe(STATUS_CLIENTE, c.status),
        formatarData(c.data_abertura),
        formatarData(c.data_assinatura),
        formatarData(c.data_encerramento),
        c.responsavel,
        c.email,
        c.telefone,
        nomeParceiro(c.parceiro_id),
        labelDe(REGIMES, c.regime_tributario),
        v ? v.valor.toFixed(2).replace('.', ',') : '',
        v?.dia_vencimento ?? '',
        ...ETAPAS.map((e) => TEXTO_ETAPA[c[e.campo] ?? 'vazio']),
        c.link_drive,
      ]
    })
    const blob = new Blob(['﻿' + csv([cab, ...linhas])], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `clientes-${aba}-${hojeISO()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const cabecalho = (campo: Ordem, children: string, className = '') => (
    <th className={`px-3 py-3 ${className}`}>
      <button
        className="inline-flex cursor-pointer items-center gap-1 tracking-wide uppercase hover:text-slate-700"
        onClick={() => setOrdem((o) => ({ campo, asc: o.campo === campo ? !o.asc : campo !== 'honorario' && campo !== 'data_assinatura' }))}
      >
        {children}
        {ordem.campo === campo && (ordem.asc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  )

  const ABAS: { id: Aba; label: string; icone: typeof Users; n?: number }[] = [
    { id: 'painel', label: 'Painel', icone: LayoutDashboard },
    { id: 'ativos', label: 'Clientes ativos', icone: Users, n: ativos.length },
    { id: 'inativos', label: 'Inativos', icone: Archive, n: inativos.length },
  ]

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
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
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 pt-4 pb-6 sm:px-6">
          <div>
            <p className="text-sm font-medium text-cyan-300">
              <Link para="/" className="hover:underline">
                Página inicial
              </Link>{' '}
              ›{' '}
              <Link para="/d/administrativo" className="hover:underline">
                Administrativo
              </Link>{' '}
              · Base de Clientes
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Base de Clientes</h1>
            <p className="mt-1 text-sm text-white/60">Cadastro, honorários e implantação dos clientes do escritório.</p>
          </div>
          <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando('novo')}>
            <Plus className="h-4 w-4" />
            Novo cliente
          </button>
        </div>
        <nav className="relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" role="tablist">
          {ABAS.map(({ id, label, icone: I, n }) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => irPara(id)}
              className={`flex cursor-pointer items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${aba === id ? 'bg-[#f3f6fc] text-slate-900' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <I className="h-4 w-4" />
              {label}
              {n !== undefined && <span className={`rounded-full px-1.5 text-xs tabular-nums ${aba === id ? 'bg-slate-200 text-slate-600' : 'bg-white/15'}`}>{n}</span>}
            </button>
          ))}
        </nav>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
        {carregando ? (
          <p className="p-10 text-center text-sm text-slate-400">Carregando clientes...</p>
        ) : aba === 'painel' ? (
          <Painel clientes={clientes} vigentes={vigentes} parceiros={parceiros} irPara={irPara} />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input id="busca-clientes" className="input pl-10" placeholder="Buscar por razão social, CNPJ, responsável, e-mail ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              {aba === 'ativos' && (
                <Select value={fStatus} onChange={setFStatus} opcoes={STATUS_CLIENTE.filter((s) => s.value !== 'encerrado')} vazio="Todas as situações" className="input w-auto" />
              )}
              <Select value={fParceiro} onChange={setFParceiro} opcoes={[...parceiros.map((p) => ({ value: p.id, label: p.nome })), { value: 'nenhum', label: 'Sem parceiro' }]} vazio="Todos os parceiros" className="input w-auto" />
              <Select value={fRegime} onChange={setFRegime} opcoes={[...REGIMES, { value: 'nao_informado', label: 'Regime não informado' }]} vazio="Todos os regimes" className="input w-auto" />
              {aba === 'ativos' && (
                <Select
                  value={fPendencia}
                  onChange={setFPendencia}
                  opcoes={[{ value: 'qualquer', label: 'Com alguma pendência' }, ...ETAPAS.map((e) => ({ value: e.campo, label: `${e.label} pendente` }))]}
                  vazio="Implantação: todas"
                  className="input w-auto"
                />
              )}
              <button className="btn-secondary" onClick={exportar} title="Baixar a lista filtrada em planilha (CSV)">
                <Download className="h-4 w-4" />
                Exportar
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold text-slate-400">
                    <tr>
                      {cabecalho('codigo', 'Cód.', 'pl-5')}
                      {cabecalho('razao_social', 'Cliente')}
                      <th className="px-3 py-3 tracking-wide uppercase">Responsável</th>
                      <th className="px-3 py-3 tracking-wide uppercase">Parceiro</th>
                      <th className="px-3 py-3 tracking-wide uppercase">Situação</th>
                      {cabecalho('data_assinatura', 'Assinatura')}
                      {cabecalho('honorario', 'Honorário', 'text-right')}
                      <th className="px-3 py-3 tracking-wide uppercase">Implantação</th>
                      <th className="py-3 pr-5 pl-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lista.map((c) => {
                      const v = vigentes.get(c.id)
                      return (
                        <tr key={c.id} className="transition hover:bg-slate-50/70">
                          <td className="py-3 pr-3 pl-5 font-mono text-xs text-slate-400 tabular-nums">{String(c.codigo).padStart(3, '0')}</td>
                          <td className="min-w-64 px-3 py-3">
                            <button className="cursor-pointer text-left font-semibold text-slate-900 hover:text-brand-600" onClick={() => setEditando(c)}>
                              {c.razao_social}
                            </button>
                            <div className="font-mono text-xs text-slate-400">{formatarCnpj(c.cnpj) || 'CNPJ não informado'}</div>
                          </td>
                          <td className="max-w-52 px-3 py-3">
                            <div className="truncate text-slate-700">{c.responsavel ?? '—'}</div>
                            <div className="truncate text-xs text-slate-400">{c.email ?? ''}</div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600">{nomeParceiro(c.parceiro_id) || <span className="text-slate-300">—</span>}</td>
                          <td className="px-3 py-3">
                            {c.status === 'encerrado' ? (
                              <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${COR_STATUS.encerrado}`}>
                                Encerrado em {formatarData(c.data_encerramento)}
                              </span>
                            ) : (
                              <Select
                                value={c.status}
                                onChange={(s) => mudarStatus(c, s as StatusCliente)}
                                opcoes={STATUS_CLIENTE}
                                className={`w-48 rounded-full border py-1 pl-3 text-xs font-semibold outline-none ${COR_STATUS[c.status]}`}
                              />
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600 tabular-nums">{formatarData(c.data_assinatura)}</td>
                          <td className="px-3 py-3 text-right font-semibold whitespace-nowrap text-slate-900 tabular-nums">
                            {v ? moeda(v.valor) : <span className="font-normal text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1">
                              {ETAPAS.map((e) => {
                                const st = c[e.campo] ?? 'vazio'
                                return <span key={e.campo} className={`h-2.5 w-2.5 rounded-full ${COR_ETAPA[st]}`} title={`${e.label}: ${TEXTO_ETAPA[st]}`} aria-label={`${e.label}: ${TEXTO_ETAPA[st]}`} />
                              })}
                            </div>
                          </td>
                          <td className="py-3 pr-5 pl-3">
                            <div className="flex justify-end gap-1">
                              {c.link_drive && (
                                <a className="icon-btn" href={c.link_drive} target="_blank" rel="noopener noreferrer" title="Abrir pasta no Drive" aria-label="Abrir pasta no Drive">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              )}
                              <button className="icon-btn" onClick={() => setEditando(c)} title="Editar" aria-label="Editar cliente">
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                    {lista.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-10 text-center text-sm text-slate-400">
                          {aba === 'inativos' ? 'Nenhum cliente inativo com esses filtros.' : 'Nenhum cliente encontrado com esses filtros.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
                <span>
                  {lista.length} de {aba === 'inativos' ? inativos.length : ativos.length} cliente(s)
                </span>
                <span className="flex flex-wrap items-center gap-3">
                  {(['concluida', 'pdf_enviado', 'pendente', 'na'] as const).map((k) => (
                    <span key={k} className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${COR_ETAPA[k]}`} />
                      {TEXTO_ETAPA[k]}
                    </span>
                  ))}
                  <span className="font-semibold text-slate-700 tabular-nums">Honorários da lista: {moeda(totalLista)}/mês</span>
                </span>
              </div>
            </div>
          </>
        )}
      </main>

      {encerrando && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-asap-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Encerrar {encerrando.razao_social}?</h2>
            <p className="text-sm text-slate-600">O cliente sai da lista de ativos e vai para Inativos. O honorário vigente é encerrado na mesma data.</p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Data do encerramento</span>
              <input id="data-encerramento-lista" type="date" className="input" value={dataEnc} onChange={(e) => setDataEnc(e.target.value)} />
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEncerrando(null)}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={confirmarEncerramento}>
                Encerrar cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {editando && (
        <ClienteForm
          cliente={editando === 'novo' ? null : editando}
          parceiros={parceiros}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </div>
  )
}
