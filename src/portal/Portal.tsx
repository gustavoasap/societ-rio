import { useState, type ComponentType } from 'react'
import type { Session } from '@supabase/supabase-js'
import { House, LogOut, Search, Settings, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link, useRota } from '../lib/rotas'
import { Dashboard } from '../components/Dashboard'
import { Admin } from './Admin'
import { DepartamentoForm, ModuloForm } from './Formularios'
import { corDe, iconeDe } from './icones'
import { Inicio, PaginaDepartamento, ResultadoBusca, Vazio } from './Paginas'
import type { Departamento, Modulo } from './tipos'
import { usePortal } from './usePortal'

// Ferramentas que rodam dentro do portal. O link cadastrado na ferramenta aponta para cá.
const FERRAMENTAS_INTERNAS: Record<string, ComponentType<{ session: Session }>> = {
  '/societario/processos': Dashboard,
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function Portal({ session }: { session: Session }) {
  const rota = useRota()
  const { perfil, departamentos, modulos, carregando, erro, recarregar } = usePortal(session)
  const [busca, setBusca] = useState('')
  const [editDep, setEditDep] = useState<Departamento | 'novo' | null>(null)
  const [editMod, setEditMod] = useState<{ modulo: Modulo | null; departamentoId?: string } | null>(null)

  if (carregando) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Carregando portal...</div>

  const admin = !!perfil?.admin
  const Ferramenta = FERRAMENTAS_INTERNAS[rota]
  if (Ferramenta) {
    const liberada = modulos.some((m) => m.link === rota && (m.status === 'disponivel' || admin))
    if (liberada) return <Ferramenta session={session} />
  }

  const email = session.user.email ?? ''
  const nome = perfil?.nome || email.split('@')[0].split(/[._-]/)[0]
  const nomeExibicao = nome.charAt(0).toUpperCase() + nome.slice(1)
  const primeiroNome = nomeExibicao.split(' ')[0]
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  const slugAtual = rota.startsWith('/d/') ? rota.slice(3) : null
  const depAtual = departamentos.find((d) => d.slug === slugAtual)

  let conteudo
  if (busca.trim()) conteudo = <ResultadoBusca termo={busca} departamentos={departamentos} modulos={modulos} />
  else if (rota === '/') conteudo = <Inicio departamentos={departamentos} modulos={modulos} />
  else if (depAtual)
    conteudo = (
      <PaginaDepartamento departamento={depAtual} modulos={modulos} admin={admin} onNovaFerramenta={() => setEditMod({ modulo: null, departamentoId: depAtual.id })} />
    )
  else if (rota === '/admin' && admin)
    conteudo = (
      <Admin
        meuId={session.user.id}
        departamentos={departamentos}
        modulos={modulos}
        recarregar={recarregar}
        editarDepartamento={setEditDep}
        editarModulo={(m) => setEditMod({ modulo: m === 'novo' ? null : m })}
      />
    )
  else
    conteudo = (
      <Vazio>
        <span>{Ferramenta ? 'Você não tem acesso a esta ferramenta.' : 'Página não encontrada ou sem acesso.'}</span>
        <Link para="/" className="font-semibold text-brand-600 hover:underline">
          Voltar para a página inicial
        </Link>
      </Vazio>
    )

  const itemMenu = (ativo: boolean) =>
    `flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition ${ativo ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-6">
          <Link para="/" onClick={() => setBusca('')} aria-label="Ir para a página inicial">
            <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="h-9 w-auto sm:h-10" />
          </Link>
          <label className="relative order-last w-full sm:order-none sm:ml-6 sm:w-auto sm:max-w-md sm:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-white/50" />
            <input
              id="busca-portal"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ferramenta (ex.: conciliação, estoque, CNPJ)"
              className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 pr-9 pl-10 text-sm text-white outline-none placeholder:text-white/50 focus:border-brand-400 focus:bg-white/15"
            />
            {busca && (
              <button className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-white/60 hover:text-white" onClick={() => setBusca('')} aria-label="Limpar busca">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2.5 rounded-full bg-white/10 py-1 pr-4 pl-1 ring-1 ring-white/10 md:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-cyan-400 text-sm font-bold text-asap-950">
                {nomeExibicao.charAt(0)}
              </span>
              <span className="text-sm text-white/80">
                {nomeExibicao}
                {admin && <span className="ml-1.5 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold">Admin</span>}
              </span>
            </div>
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => supabase.auth.signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>
        {rota === '/' && !busca && (
          <div className="relative mx-auto max-w-7xl px-4 pt-2 pb-8 sm:px-6">
            <p className="text-sm font-medium text-cyan-300 first-letter:uppercase">{hoje}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {saudacao()}, {primeiroNome}!
            </h1>
            <p className="mt-1 text-sm text-white/60">Portal interno da ASAP Assessoria Contábil.</p>
          </div>
        )}
      </div>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[250px_1fr]">
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:flex-col lg:self-start lg:overflow-visible" aria-label="Menu do portal">
          <Link para="/" onClick={() => setBusca('')} className={itemMenu(rota === '/' && !busca)} aria-current={rota === '/' ? 'page' : undefined}>
            <House className="h-4.5 w-4.5 shrink-0" />
            Página inicial
          </Link>
          <div className="hidden px-3 pt-4 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase lg:block">Departamentos</div>
          {departamentos.map((d) => {
            const I = iconeDe(d.icone)
            const ativo = d.slug === slugAtual && !busca
            const qtd = modulos.filter((m) => m.departamento_id === d.id).length
            return (
              <Link key={d.id} para={`/d/${d.slug}`} onClick={() => setBusca('')} className={itemMenu(ativo)} aria-current={ativo ? 'page' : undefined}>
                <I className={`h-4.5 w-4.5 shrink-0 ${ativo ? '' : corDe(d.cor).texto}`} />
                {d.nome}
                <span className="ml-auto pl-2 text-xs text-slate-400 tabular-nums">{qtd}</span>
              </Link>
            )
          })}
          {admin && (
            <>
              <div className="hidden px-3 pt-4 pb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase lg:block">Gestão</div>
              <Link para="/admin" onClick={() => setBusca('')} className={itemMenu(rota === '/admin' && !busca)}>
                <Settings className="h-4.5 w-4.5 shrink-0" />
                Administração
              </Link>
            </>
          )}
        </nav>

        <main className="min-w-0">
          {erro && (
            <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
              Não foi possível carregar o portal: {erro}
            </p>
          )}
          {conteudo}
        </main>
      </div>

      {editDep && (
        <DepartamentoForm
          inicial={editDep === 'novo' ? null : editDep}
          onClose={() => setEditDep(null)}
          onSalvo={() => {
            setEditDep(null)
            recarregar()
          }}
        />
      )}
      {editMod && (
        <ModuloForm
          inicial={editMod.modulo}
          departamentoPadrao={editMod.departamentoId}
          departamentos={departamentos}
          onClose={() => setEditMod(null)}
          onSalvo={() => {
            setEditMod(null)
            recarregar()
          }}
        />
      )}
    </div>
  )
}
