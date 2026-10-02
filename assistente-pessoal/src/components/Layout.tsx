import { useState, type ReactNode } from 'react'
import { ArrowLeftRight, ChartColumn, Compass, ChartPie, CreditCard, Ellipsis, FileSpreadsheet, Flag, House, Landmark, LogOut, Plus, Repeat, Settings, Target, Users, X, type LucideIcon } from 'lucide-react'
import { useApp } from '../contexto'
import { Link, useRota } from '../lib/rotas'
import { supabase } from '../lib/supabase'

interface Item {
  para: string
  label: string
  icone: LucideIcon
  grupo: string
}

const ITENS: Item[] = [
  { para: '/', label: 'Resumo', icone: House, grupo: 'Visão geral' },
  { para: '/plano', label: 'Meu plano', icone: Compass, grupo: 'Visão geral' },
  { para: '/dashboard', label: 'Dashboard', icone: ChartColumn, grupo: 'Visão geral' },
  { para: '/dre', label: 'DRE', icone: FileSpreadsheet, grupo: 'Visão geral' },
  { para: '/lancamentos', label: 'Lançamentos', icone: ArrowLeftRight, grupo: 'Movimento' },
  { para: '/fixos', label: 'Fixos e salário', icone: Repeat, grupo: 'Movimento' },
  { para: '/cartoes', label: 'Cartões', icone: CreditCard, grupo: 'Movimento' },
  { para: '/terceiros', label: 'A receber de terceiros', icone: Users, grupo: 'Movimento' },
  { para: '/contas', label: 'Contas', icone: Landmark, grupo: 'Movimento' },
  { para: '/orcamento', label: 'Orçamento', icone: ChartPie, grupo: 'Planejamento' },
  { para: '/metas', label: 'Metas', icone: Target, grupo: 'Planejamento' },
  { para: '/objetivos', label: 'Objetivos', icone: Flag, grupo: 'Planejamento' },
  { para: '/ajustes', label: 'Ajustes', icone: Settings, grupo: 'Planejamento' },
]

// No celular, a barra inferior mostra os mais usados; o resto fica em "Mais"
const BARRA = ['/', '/lancamentos', '/plano']
const ANALISE = ['/plano', '/dashboard', '/dre']

/** As cinco estrelas do Cruzeiro do Sul, como no escudo — só enfeite. */
export function Estrelas({ className = '' }: { className?: string }) {
  const estrela = (cx: number, cy: number, r: number) => {
    const p = Array.from({ length: 10 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = i % 2 ? r * 0.42 : r
      return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`
    }).join(' ')
    return <polygon key={`${cx}-${cy}`} points={p} />
  }
  return (
    <svg viewBox="0 0 512 512" className={className} fill="currentColor" aria-hidden>
      {estrela(256, 104, 54)}
      {estrela(256, 410, 58)}
      {estrela(142, 262, 46)}
      {estrela(360, 236, 50)}
      {estrela(304, 322, 30)}
    </svg>
  )
}

function saudacao() {
  const h = new Date().getHours()
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function Layout({ nome, primeiroNome, children }: { nome: string; primeiroNome: string; children: ReactNode }) {
  const rota = useRota()
  const { abrirLancamento } = useApp()
  const [mais, setMais] = useState(false)
  const hojeTexto = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  const ativo = (p: string) => (p === '/' ? rota === '/' : rota.startsWith(p))

  return (
    <div className="min-h-dvh">
      {/* Topo */}
      <div className="safe-top relative overflow-hidden bg-gradient-to-br from-azul-950 via-azul-800 to-azul-700 text-white">
        <Estrelas className="pointer-events-none absolute -top-6 right-2 h-40 w-40 text-white/10 sm:right-10 sm:h-52 sm:w-52" />
        <header className="relative mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
          <Link para="/" className="flex items-center gap-2.5" aria-label="Início">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <Estrelas className="h-6 w-6 text-white" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight">Assistente Pessoal</span>
              <span className="block text-[0.6875rem] text-white/60">{nome}</span>
            </span>
          </Link>
          <button className="btn btn-sm ml-auto bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => supabase.auth.signOut()} title="Sair">
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </header>
        {rota === '/' && (
          <div className="relative mx-auto max-w-7xl px-4 pt-1 pb-6 sm:px-6 sm:pb-8">
            <p className="text-sm font-medium text-azul-200 first-letter:uppercase">{hojeTexto}</p>
            <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
              {saudacao()}, {primeiroNome}!
            </h1>
          </div>
        )}
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-5 pb-menu sm:px-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:pb-10">
        {/* Menu lateral (computador) */}
        <nav className="hidden flex-col gap-1 lg:sticky lg:top-6 lg:flex lg:self-start" aria-label="Menu">
          <button className="btn-primary mb-3 w-full" onClick={() => abrirLancamento()}>
            <Plus className="h-4 w-4" /> Novo lançamento
          </button>
          {ITENS.map((it, i) => (
            <div key={it.para}>
              {ITENS[i - 1]?.grupo !== it.grupo && <div className="px-3 pt-3 pb-1 text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">{it.grupo}</div>}
              <Link
                para={it.para}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${ativo(it.para) ? 'bg-azul-100 text-azul-800' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
                aria-current={ativo(it.para) ? 'page' : undefined}
              >
                <it.icone className="h-4.5 w-4.5 shrink-0" />
                {it.label}
              </Link>
            </div>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>

      {/* Barra inferior (celular e tablet) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden" aria-label="Menu">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end px-2 pt-1.5 pb-1.5">
          {BARRA.slice(0, 2).map((p) => (
            <ItemBarra key={p} item={ITENS.find((i) => i.para === p)!} ativo={ativo(p)} />
          ))}
          <div className="flex justify-center">
            <button
              className="-mt-6 flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-gradient-to-br from-azul-700 to-azul-500 text-white shadow-lg shadow-azul-600/40 ring-4 ring-white active:scale-95"
              onClick={() => abrirLancamento()}
              aria-label="Novo lançamento"
            >
              <Plus className="h-7 w-7" />
            </button>
          </div>
          <ItemBarra item={{ ...ITENS.find((i) => i.para === '/plano')!, label: 'Plano' }} ativo={ANALISE.some(ativo)} />
          <button
            className={`flex cursor-pointer flex-col items-center gap-0.5 py-1 text-[0.6875rem] font-semibold ${![...BARRA, ...ANALISE].some(ativo) ? 'text-azul-700' : 'text-slate-400'}`}
            onClick={() => setMais(true)}
          >
            <Ellipsis className="h-6 w-6" />
            Mais
          </button>
        </div>
      </nav>

      {mais && (
        <div className="animar-fundo fixed inset-0 z-50 flex items-end bg-azul-950/60 backdrop-blur-sm lg:hidden" onClick={() => setMais(false)}>
          <div className="animar-modal safe-bottom w-full rounded-t-3xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-800">Menu</span>
              <button className="icon-btn" onClick={() => setMais(false)} aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ITENS.map((it) => (
                <Link
                  key={it.para}
                  para={it.para}
                  onClick={() => setMais(false)}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-4 text-xs font-semibold ${ativo(it.para) ? 'bg-azul-100 text-azul-800' : 'bg-slate-50 text-slate-600'}`}
                >
                  <it.icone className="h-6 w-6" />
                  {it.label}
                </Link>
              ))}
            </div>
            <button className="btn-secondary mt-3 w-full" onClick={() => supabase.auth.signOut()}>
              <LogOut className="h-4 w-4" /> Sair
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ItemBarra({ item, ativo }: { item: Item; ativo: boolean }) {
  return (
    <Link para={item.para} className={`flex flex-col items-center gap-0.5 py-1 text-[0.6875rem] font-semibold ${ativo ? 'text-azul-700' : 'text-slate-400'}`} aria-current={ativo ? 'page' : undefined}>
      <item.icone className="h-6 w-6" />
      {item.label}
    </Link>
  )
}
