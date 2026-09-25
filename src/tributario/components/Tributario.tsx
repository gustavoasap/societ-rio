import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Building2, House, Layers, LogOut, Plus, Search, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Link } from '../../lib/rotas'
import { mascaraCnpj } from '../../lib/format'
import { excluirEmpresa, listarEmpresas, type EmpresaComEstab } from '../dados'
import { EmpresaForm } from './EmpresaForm'
import { ImportarLote } from './ImportarLote'
import { Painel } from './Painel'

const NOME_REGIME = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' }

export function Tributario({ session }: { session: Session }) {
  const [empresas, setEmpresas] = useState<EmpresaComEstab[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('trib_empresa')
    } catch {
      return null
    }
  })
  const [editando, setEditando] = useState<EmpresaComEstab | 'nova' | null>(null)
  const [lote, setLote] = useState(false)

  const carregar = useCallback(async () => {
    try {
      setEmpresas(await listarEmpresas())
      setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  function abrir(id: string | null) {
    setSelecionada(id)
    try {
      if (id) sessionStorage.setItem('trib_empresa', id)
      else sessionStorage.removeItem('trib_empresa')
    } catch {
      // armazenamento indisponível: apenas não lembra a seleção
    }
  }

  async function excluir(e: EmpresaComEstab) {
    if (!confirm(`Excluir "${e.razao_social}" com todos os estabelecimentos e movimentos importados?\n\nEssa ação não pode ser desfeita.`)) return
    try {
      await excluirEmpresa(e.id)
      carregar()
    } catch (err) {
      setErro((err as Error).message)
    }
  }

  const empresa = empresas.find((e) => e.id === selecionada)
  const termo = busca.trim().toLowerCase()
  const filtradas = empresas.filter((e) => !termo || e.razao_social.toLowerCase().includes(termo) || e.trib_estabelecimentos.some((x) => x.cnpj.includes(termo.replace(/\D/g, '') || '§')))

  return (
    <div className="min-h-screen">
      <div className="no-print relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 pb-24 text-white">
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
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-4 pt-6 sm:px-6">
          <div>
            <p className="text-sm font-medium text-cyan-300">
              <Link para="/" className="hover:underline">
                Página inicial
              </Link>{' '}
              ›{' '}
              <Link para="/d/fiscal" className="hover:underline">
                Fiscal
              </Link>{' '}
              · Reforma Tributária (IBS/CBS)
            </p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Análise de regimes e Reforma Tributária</h1>
            <p className="mt-1 text-sm text-white/60">Simples Nacional, Lucro Presumido e Lucro Real — do regime atual até a transição completa para IBS/CBS em 2033.</p>
          </div>
          {!empresa && (
            <div className="flex flex-wrap gap-2">
              <button className="btn bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => setLote(true)}>
                <Layers className="h-4 w-4" />
                Importar vários clientes
              </button>
              <button className="btn-primary from-brand-500 to-cyan-500 shadow-cyan-500/30" onClick={() => setEditando('nova')}>
                <Plus className="h-4 w-4" />
                Nova empresa
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="relative mx-auto -mt-16 max-w-7xl space-y-5 px-4 pb-10 sm:px-6 print:mt-0">
        {erro && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}

        {empresa ? (
          <Painel key={`${empresa.id}-${empresa.updated_at}`} empresa={empresa} onVoltar={() => abrir(null)} onEditar={() => setEditando(empresa)} />
        ) : (
          <>
            <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-10" placeholder="Buscar empresa por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
            {carregando && <div className="py-16 text-center text-slate-400">Carregando empresas...</div>}
            {!carregando && filtradas.length === 0 && (
              <div className="rounded-2xl bg-white px-6 py-16 text-center shadow-sm ring-1 ring-slate-200/70">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-cyan-100 text-brand-600">
                  <Building2 className="h-7 w-7" />
                </div>
                <p className="mt-3 font-semibold text-slate-700">{empresas.length ? 'Nenhuma empresa encontrada' : 'Nenhuma empresa cadastrada'}</p>
                <p className="mt-1 text-sm text-slate-400">Cadastre a empresa com a matriz e as filiais para importar os relatórios.</p>
                {!empresas.length && (
                  <button className="btn-primary mt-4" onClick={() => setEditando('nova')}>
                    <Plus className="h-4 w-4" /> Nova empresa
                  </button>
                )}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtradas.map((e) => {
                const matriz = e.trib_estabelecimentos.find((x) => x.matriz) ?? e.trib_estabelecimentos[0]
                const filiais = e.trib_estabelecimentos.length - 1
                return (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrir(e.id)}
                    onKeyDown={(k) => k.key === 'Enter' && abrir(e.id)}
                    className="group cursor-pointer rounded-2xl bg-white p-5 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-xl hover:ring-brand-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/30">
                        <Building2 className="h-5 w-5" />
                      </span>
                      <button
                        className="icon-btn opacity-0 group-hover:opacity-100 hover:text-rose-600"
                        title="Excluir empresa"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          excluir(e)
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-3 font-bold text-slate-900">{e.razao_social}</div>
                    <div className="text-sm text-slate-500">{matriz ? mascaraCnpj(matriz.cnpj) : '—'}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-brand-50 px-2.5 py-1 font-semibold text-brand-700">{NOME_REGIME[e.regime_atual]}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                        {filiais > 0 ? `Matriz + ${filiais} filia${filiais > 1 ? 'is' : 'l'}` : 'Somente matriz'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>

      {lote && <ImportarLote empresas={empresas} onClose={() => setLote(false)} onConcluido={carregar} />}

      {editando && (
        <EmpresaForm
          empresa={editando === 'nova' ? null : editando}
          onClose={() => setEditando(null)}
          onSalvo={async (id) => {
            setEditando(null)
            await carregar()
            abrir(id)
          }}
        />
      )}
    </div>
  )
}
