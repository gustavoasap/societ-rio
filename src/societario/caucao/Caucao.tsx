import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  CalendarRange,
  FileSpreadsheet,
  FileText,
  Handshake,
  House,
  Landmark,
  List,
  LogOut,
  Plus,
  Search,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Link } from '../../lib/rotas'
import { comRetentativa } from '../../lib/retentar'
import { formatarData, formatarMoeda } from '../../lib/format'
import { baixarArquivo, gerarXlsx, TIPO_XLSX, type ColunaPlanilha, type ValorCelula } from '../../lib/planilha'
import { Select } from '../../components/ui'
import { Parceiros } from '../../components/Parceiros'
import type { Parceiro } from '../../types'
import { CaucaoForm } from './CaucaoForm'
import { Conciliacao } from './Conciliacao'
import { Juntas } from './Juntas'
import { labelCobertura, resultado, totalizar, type Caucao as CaucaoT, type Junta } from './tipos'

const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Resultado({ valor, grande = false }: { valor: number; grande?: boolean }) {
  const cor = valor > 0 ? 'text-emerald-700' : valor < 0 ? 'text-rose-600' : 'text-slate-400'
  return (
    <span
      className={`font-bold whitespace-nowrap tabular-nums ${cor} ${grande ? 'text-lg sm:text-2xl' : ''}`}
      title={valor > 0 ? 'Lucro' : valor < 0 ? 'Prejuízo' : 'Zerado'}
    >
      {formatarMoeda(valor)}
    </span>
  )
}

function Kpi({ icone: I, rotulo, children, detalhe }: { icone: typeof Wallet; rotulo: string; children: ReactNode; detalhe?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <I className="h-4 w-4 text-slate-400" />
        {rotulo}
      </div>
      <div className="mt-2 text-lg font-extrabold break-words text-slate-900 tabular-nums sm:text-2xl">{children}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </div>
  )
}

export function Caucao({ session }: { session: Session }) {
  const [caucoes, setCaucoes] = useState<CaucaoT[]>([])
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [juntas, setJuntas] = useState<Junta[]>([])
  const [sugestoes, setSugestoes] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [busca, setBusca] = useState('')
  const [fParceiro, setFParceiro] = useState('')
  const [fResp, setFResp] = useState('')
  const [fJunta, setFJunta] = useState('')
  const [fResultado, setFResultado] = useState('')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')

  const [aba, setAba] = useState<'clientes' | 'mensal'>('clientes')
  const [editando, setEditando] = useState<CaucaoT | 'novo' | null>(null)
  const [verJuntas, setVerJuntas] = useState(false)
  const [verParceiros, setVerParceiros] = useState(false)

  const carregar = useCallback(async () => {
    const [c, p, j, proc, cli] = await comRetentativa(() =>
      Promise.all([
        supabase.from('soc_caucoes').select('*').order('data_recebimento', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }),
        supabase.from('soc_parceiros').select('*').order('nome'),
        supabase.from('soc_caucao_juntas').select('*').order('uf'),
        supabase.from('soc_processos').select('razao_social'),
        supabase.from('adm_clientes').select('razao_social'),
      ]),
    )
    const falha = c.error ?? p.error ?? j.error
    setErro(falha ? falha.message : null)
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    setCaucoes(
      ((c.data as CaucaoT[]) ?? []).map((x) => ({
        ...x,
        valor_caucao: num(x.valor_caucao),
        taxa_junta: num(x.taxa_junta),
        valor_certificado: num(x.valor_certificado),
      })),
    )
    setParceiros((p.data as Parceiro[]) ?? [])
    setJuntas(((j.data as Junta[]) ?? []).map((x) => ({ ...x, taxa: Number(x.taxa) })))
    const nomes = [...((proc.data as { razao_social: string | null }[]) ?? []), ...((cli.data as { razao_social: string | null }[]) ?? [])]
      .map((x) => x.razao_social?.trim())
      .filter(Boolean) as string[]
    setSugestoes([...new Set(nomes)].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const nomeParceiro = useCallback((id: string | null) => parceiros.find((p) => p.id === id)?.nome ?? '', [parceiros])
  const nomeResponsavel = useCallback(
    (c: CaucaoT) => (c.responsavel_tipo === 'cliente' ? 'Próprio cliente' : `Parceiro: ${nomeParceiro(c.responsavel_parceiro_id) || '—'}`),
    [nomeParceiro],
  )
  const nomeJunta = useCallback((uf: string | null) => (uf ? `${uf} · ${juntas.find((j) => j.uf === uf)?.nome ?? ''}`.replace(/ · $/, '') : ''), [juntas])

  const base = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return caucoes.filter((c) => {
      if (fParceiro && (fParceiro === 'nenhum' ? c.parceiro_id : c.parceiro_id !== fParceiro)) return false
      if (fResp && (fResp === 'cliente' ? c.responsavel_tipo !== 'cliente' : c.responsavel_parceiro_id !== fResp)) return false
      if (fJunta && (fJunta === 'nenhuma' ? c.junta_uf : c.junta_uf !== fJunta)) return false
      if (!t) return true
      return [c.cliente, nomeParceiro(c.parceiro_id), c.observacoes].filter(Boolean).join(' ').toLowerCase().includes(t)
    })
  }, [caucoes, busca, fParceiro, fResp, fJunta, nomeParceiro])

  // O período (data de recebimento) só vale para a lista; a conciliação tem o seletor de mês
  const lista = useMemo(
    () =>
      base
        .filter((c) => {
          const r = resultado(c)
          if (fResultado === 'lucro' && r <= 0) return false
          if (fResultado === 'prejuizo' && r >= 0) return false
          return true
        })
        .filter((c) => !(de && (!c.data_recebimento || c.data_recebimento < de)) && !(ate && (!c.data_recebimento || c.data_recebimento > ate))),
    [base, de, ate, fResultado],
  )

  const tot = useMemo(() => totalizar(lista), [lista])

  // Relatório: cada campo uma coluna, cada cliente uma linha
  const COLUNAS: ColunaPlanilha[] = [
    { titulo: 'Cliente', largura: 40 },
    { titulo: 'Parceiro que indicou', largura: 26 },
    { titulo: 'Responsável pelo caução', largura: 30 },
    { titulo: 'Cobertura de contabilidade', largura: 16 },
    { titulo: 'Valor do caução', tipo: 'moeda', largura: 16 },
    { titulo: 'Data de recebimento', tipo: 'data', largura: 14 },
    { titulo: 'Junta comercial', largura: 18 },
    { titulo: 'Taxa da junta', tipo: 'moeda', largura: 15 },
    { titulo: 'Data pagamento taxa', tipo: 'data', largura: 14 },
    { titulo: 'Valor certificado digital', tipo: 'moeda', largura: 16 },
    { titulo: 'Data pagamento certificado', tipo: 'data', largura: 16 },
    { titulo: 'Lucro / Prejuízo', tipo: 'moeda', largura: 17 },
    { titulo: 'Situação', largura: 11 },
    { titulo: 'Observações', largura: 40 },
  ]
  const linhaRelatorio = (c: CaucaoT): ValorCelula[] => {
    const r = resultado(c)
    return [
      c.cliente,
      nomeParceiro(c.parceiro_id),
      nomeResponsavel(c),
      labelCobertura(c.cobertura_meses),
      c.valor_caucao,
      c.data_recebimento,
      nomeJunta(c.junta_uf),
      c.taxa_junta,
      c.data_pagamento_taxa,
      c.valor_certificado,
      c.data_pagamento_certificado,
      {
        valor: r,
        destaque: r > 0 ? 'positivo' : r < 0 ? 'negativo' : undefined,
      },
      r > 0 ? 'Lucro' : r < 0 ? 'Prejuízo' : 'Zerado',
      c.observacoes,
    ]
  }

  function exportarExcel() {
    const total: ValorCelula[] = [
      `Total (${lista.length} clientes)`,
      '',
      '',
      '',
      tot.caucao,
      null,
      '',
      tot.taxa,
      null,
      tot.certificado,
      null,
      {
        valor: tot.resultado,
        destaque: tot.resultado >= 0 ? 'positivo' : 'negativo',
      },
      tot.resultado > 0 ? 'Lucro' : tot.resultado < 0 ? 'Prejuízo' : '',
      '',
    ]
    const arq = gerarXlsx({
      aba: 'Acompanhamento de Caução',
      colunas: COLUNAS,
      linhas: lista.map(linhaRelatorio),
      total,
    })
    baixarArquivo(`acompanhamento-caucao-${hoje()}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  function exportarCsv() {
    const fmt = (v: ValorCelula, i: number): string => {
      const x = v !== null && typeof v === 'object' ? v.valor : v
      if (x === null || x === undefined) return ''
      if (typeof x === 'number') return x.toFixed(2).replace('.', ',')
      return COLUNAS[i].tipo === 'data' ? formatarData(x) : x
    }
    const linhas = [COLUNAS.map((c) => c.titulo), ...lista.map((c) => linhaRelatorio(c).map(fmt))]
    const csv = linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    baixarArquivo(`acompanhamento-caucao-${hoje()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8')
  }

  const opcoesParceiros = parceiros.map((p) => ({
    value: p.id,
    label: p.nome,
  }))
  const filtrando = !!(busca || fParceiro || fResp || fJunta || fResultado || de || ate)

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
              <Link para="/d/societario" className="hover:underline">
                Societário
              </Link>{' '}
              · Acompanhamento de Caução
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Acompanhamento de Caução</h1>
            <p className="mt-1 text-sm text-white/60">Caução recebido × taxa da junta × certificado digital: o resultado de cada cliente.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setVerParceiros(true)}>
              <Handshake className="h-4 w-4" />
              Parceiros
            </button>
            <button className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setVerJuntas(true)}>
              <Landmark className="h-4 w-4" />
              Juntas e taxas
            </button>
            <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando('novo')}>
              <Plus className="h-4 w-4" />
              Novo caução
            </button>
          </div>
        </div>
        <nav className="relative flex w-full max-w-none gap-1 overflow-x-auto px-3 sm:px-4 md:px-6 lg:px-8" role="tablist">
          {(
            [
              { id: 'clientes', label: 'Clientes', icone: List },
              {
                id: 'mensal',
                label: 'Conciliação mensal',
                icone: CalendarRange,
              },
            ] as const
          ).map(({ id, label, icone: I }) => (
            <button
              key={id}
              role="tab"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={`flex cursor-pointer items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition ${aba === id ? 'bg-[#f3f6fc] text-slate-900' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
            >
              <I className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <main className="w-full max-w-none space-y-5 px-3 py-6 sm:px-4 md:px-6 lg:px-8">
        {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}

        {aba === 'clientes' && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi icone={Wallet} rotulo="Cauções recebidos" detalhe={`${lista.length} cliente(s)${filtrando ? ' no filtro' : ''}`}>
              {formatarMoeda(tot.caucao)}
            </Kpi>
            <Kpi icone={Landmark} rotulo="Taxas da junta">
              {formatarMoeda(tot.taxa)}
            </Kpi>
            <Kpi icone={FileText} rotulo="Certificados digitais">
              {formatarMoeda(tot.certificado)}
            </Kpi>
            <Kpi
              icone={tot.resultado < 0 ? TrendingDown : TrendingUp}
              rotulo={tot.resultado < 0 ? 'Prejuízo total' : 'Lucro total'}
              detalhe="caução − taxa − certificado"
            >
              <Resultado valor={tot.resultado} grande />
            </Kpi>
            <Kpi icone={TrendingUp} rotulo="Lucro × prejuízo" detalhe="quantidade de clientes">
              <span className="text-emerald-700">{tot.comLucro}</span>
              <span className="mx-1.5 text-slate-300">×</span>
              <span className="text-rose-600">{tot.comPrejuizo}</span>
            </Kpi>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              id="busca-caucao"
              className="input pl-10"
              placeholder="Buscar cliente, parceiro ou observação"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
          <Select
            value={fParceiro}
            onChange={setFParceiro}
            opcoes={[...opcoesParceiros, { value: 'nenhum', label: 'Sem parceiro' }]}
            vazio="Parceiro: todos"
            className="input w-auto"
          />
          <Select
            value={fResp}
            onChange={setFResp}
            opcoes={[{ value: 'cliente', label: 'Próprio cliente' }, ...opcoesParceiros]}
            vazio="Responsável: todos"
            className="input w-auto"
          />
          <Select
            value={fJunta}
            onChange={setFJunta}
            opcoes={[...juntas.map((j) => ({ value: j.uf, label: j.uf })), { value: 'nenhuma', label: 'Sem junta' }]}
            vazio="Junta: todas"
            className="input w-auto"
          />
          {aba === 'clientes' && (
            <Select
              value={fResultado}
              onChange={setFResultado}
              opcoes={[
                { value: 'lucro', label: 'Com lucro' },
                { value: 'prejuizo', label: 'Com prejuízo' },
              ]}
              vazio="Resultado: todos"
              className="input w-auto"
            />
          )}
          {aba === 'clientes' && (
            <>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500" title="Período pela data de recebimento do caução">
                Recebido de
                <input type="date" className="input w-auto py-2" value={de} onChange={(e) => setDe(e.target.value)} />
                até
                <input type="date" className="input w-auto py-2" value={ate} onChange={(e) => setAte(e.target.value)} />
              </div>
              <div className="ml-auto flex gap-2">
                <button
                  className="btn-primary from-emerald-500 to-emerald-600 shadow-emerald-500/20"
                  onClick={exportarExcel}
                  disabled={!lista.length}
                  title="Relatório em Excel (.xlsx) com os filtros aplicados"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Excel
                </button>
                <button className="btn-secondary" onClick={exportarCsv} disabled={!lista.length} title="Relatório em CSV com os filtros aplicados">
                  CSV
                </button>
              </div>
            </>
          )}
        </div>

        {aba === 'mensal' ? (
          <Conciliacao caucoes={base} filtrados={!!(busca || fParceiro || fResp || fJunta)} nomeParceiro={nomeParceiro} />
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
            <div className="overflow-x-auto">
              <table className="w-full text-[0.8125rem]">
                <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="py-3 pr-3 pl-5">Cliente</th>
                    <th className="px-3 py-3">Indicação · responsável</th>
                    <th className="px-3 py-3">Cobertura</th>
                    <th className="px-3 py-3 text-right">Caução</th>
                    <th className="px-3 py-3 text-right">Taxa da junta</th>
                    <th className="px-3 py-3 text-right">Certificado</th>
                    <th className="py-3 pr-5 pl-3 text-right">Lucro / prejuízo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lista.map((c) => (
                    <tr key={c.id} className="cursor-pointer transition hover:bg-slate-50/70" onClick={() => setEditando(c)}>
                      <td className="min-w-52 py-3 pr-3 pl-5">
                        <div className="font-semibold text-slate-900">{c.cliente}</div>
                        {c.observacoes && <div className="max-w-80 truncate text-xs text-slate-400">{c.observacoes}</div>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="whitespace-nowrap text-slate-700">
                          {nomeParceiro(c.parceiro_id) || <span className="text-slate-300">Sem parceiro</span>}
                        </div>
                        <div className="text-xs whitespace-nowrap text-slate-400">Caução: {nomeResponsavel(c)}</div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${c.cobertura_meses ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-slate-100 text-slate-500 ring-slate-200'}`}
                        >
                          {labelCobertura(c.cobertura_meses)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="font-semibold text-slate-800 tabular-nums">
                          {c.valor_caucao !== null ? formatarMoeda(c.valor_caucao) : <span className="text-slate-300">—</span>}
                        </div>
                        <div className="text-xs text-slate-400">{c.data_recebimento ? `Recebido ${formatarData(c.data_recebimento)}` : 'Não recebido'}</div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="text-slate-700 tabular-nums">
                          {c.junta_uf && (
                            <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[0.6875rem] font-bold text-slate-600">{c.junta_uf}</span>
                          )}
                          {c.taxa_junta !== null ? formatarMoeda(c.taxa_junta) : <span className="text-slate-300">—</span>}
                        </div>
                        <div className="text-xs text-slate-400">{c.data_pagamento_taxa ? `Pago ${formatarData(c.data_pagamento_taxa)}` : 'Não paga'}</div>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <div className="text-slate-700 tabular-nums">
                          {c.valor_certificado !== null ? formatarMoeda(c.valor_certificado) : <span className="text-slate-300">—</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {c.data_pagamento_certificado ? `Pago ${formatarData(c.data_pagamento_certificado)}` : 'Não pago'}
                        </div>
                      </td>
                      <td className="py-3 pr-5 pl-3 text-right text-sm">
                        <Resultado valor={resultado(c)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                {lista.length > 0 && (
                  <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-bold text-slate-800">
                    <tr>
                      <td className="py-3 pr-3 pl-5" colSpan={3}>
                        Total · {lista.length} cliente(s)
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(tot.caucao)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(tot.taxa)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatarMoeda(tot.certificado)}</td>
                      <td className="py-3 pr-5 pl-3 text-right text-sm">
                        <Resultado valor={tot.resultado} />
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              {!carregando && lista.length === 0 && (
                <p className="p-10 text-center text-sm text-slate-400">
                  {caucoes.length ? 'Nenhum caução encontrado com esses filtros.' : 'Nenhum caução cadastrado. Clique em "Novo caução" para começar.'}
                </p>
              )}
              {carregando && <p className="p-10 text-center text-sm text-slate-400">Carregando...</p>}
            </div>
          </div>
        )}
      </main>

      {editando && (
        <CaucaoForm
          key={editando === 'novo' ? 'novo' : editando.id}
          caucao={editando === 'novo' ? null : editando}
          parceiros={parceiros}
          juntas={juntas}
          sugestoes={sugestoes}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
          onJuntaCriada={carregar}
        />
      )}
      {verJuntas && <Juntas juntas={juntas} caucoes={caucoes} onClose={() => setVerJuntas(false)} onChanged={carregar} />}
      {verParceiros && <Parceiros parceiros={parceiros} processos={[]} onClose={() => setVerParceiros(false)} onChanged={carregar} />}
    </div>
  )
}
