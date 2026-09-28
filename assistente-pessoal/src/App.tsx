import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ShieldX } from 'lucide-react'
import { Contexto, type ContextoApp } from './contexto'
import { Layout } from './components/Layout'
import { LancamentoForm } from './components/LancamentoForm'
import { Login } from './components/Login'
import { Carregando } from './components/ui'
import { buscarCategorias, buscarContas, useDados } from './lib/dados'
import { Link, useRota } from './lib/rotas'
import { supabase, supabaseConfigurado } from './lib/supabase'
import { Ajustes } from './paginas/Ajustes'
import { Contas } from './paginas/Contas'
import { Inicio } from './paginas/Inicio'
import { Lancamentos } from './paginas/Lancamentos'
import { Metas } from './paginas/Metas'
import { Objetivos } from './paginas/Objetivos'
import { Orcamento } from './paginas/Orcamento'
import type { Lancamento, TipoLancamento } from './tipos'

function NovaSenha({ onDone }: { onDone: () => void }) {
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) setErro(error.message)
    else onDone()
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-azul-950 via-azul-800 to-azul-700 p-4">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-7 shadow-2xl">
        <h1 className="text-xl font-extrabold text-slate-900">Definir nova senha</h1>
        <input className="input" type="password" minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)" required />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full">Salvar senha</button>
      </form>
    </div>
  )
}

function SemAcesso() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-azul-950 via-azul-800 to-azul-700 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-7 text-center shadow-2xl">
        <ShieldX className="mx-auto h-12 w-12 text-rose-500" />
        <h1 className="text-xl font-extrabold text-slate-900">Acesso restrito</h1>
        <p className="text-sm text-slate-500">Este assistente é pessoal e já tem dono. Seu usuário não tem acesso.</p>
        <button className="btn-secondary w-full" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </div>
    </div>
  )
}

function nomeDe(session: Session) {
  const meta = session.user.user_metadata as { nome?: string; name?: string } | undefined
  const bruto = meta?.nome || meta?.name || (session.user.email ?? '').split('@')[0].split(/[._-]/)[0]
  const primeiro = bruto.split(' ')[0]
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1)
}

function AreaDoDono({ session }: { session: Session }) {
  const rota = useRota()
  const contas = useDados(buscarContas, [])
  const categorias = useDados(buscarCategorias, [])
  const [form, setForm] = useState<Lancamento | { tipo: TipoLancamento; conta_id?: string } | null>(null)

  const ctx = useMemo<ContextoApp>(
    () => ({
      contas: contas.dados ?? [],
      categorias: categorias.dados ?? [],
      abrirLancamento: (l) => setForm(l ?? { tipo: 'despesa' }),
    }),
    [contas.dados, categorias.dados],
  )

  let pagina
  if (contas.carregando || categorias.carregando) pagina = <Carregando />
  else if (rota === '/') pagina = <Inicio />
  else if (rota === '/lancamentos') pagina = <Lancamentos />
  else if (rota === '/contas') pagina = <Contas />
  else if (rota === '/orcamento') pagina = <Orcamento />
  else if (rota === '/metas') pagina = <Metas />
  else if (rota === '/objetivos') pagina = <Objetivos />
  else if (rota === '/ajustes') pagina = <Ajustes email={session.user.email ?? ''} />
  else
    pagina = (
      <div className="py-16 text-center text-sm text-slate-500">
        Página não encontrada.{' '}
        <Link para="/" className="font-semibold text-azul-600 hover:underline">
          Voltar ao início
        </Link>
      </div>
    )

  const erro = contas.erro || categorias.erro
  return (
    <Contexto.Provider value={ctx}>
      <Layout nome={nomeDe(session)}>
        {erro && <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">Não foi possível carregar os dados: {erro}</p>}
        {pagina}
      </Layout>
      {form && <LancamentoForm key={'id' in form ? form.id : 'novo'} inicial={form} onClose={() => setForm(null)} />}
    </Contexto.Provider>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [recuperando, setRecuperando] = useState(false)
  const [dono, setDono] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setPronto(true)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      if (evento === 'PASSWORD_RECOVERY') setRecuperando(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // O primeiro login vira o dono; os demais só entram se forem o dono.
  const userId = session?.user.id
  useEffect(() => {
    setDono(null)
    if (!userId) return
    supabase.rpc('pes_reivindicar').then(({ data, error }) => setDono(!error && data === true))
  }, [userId])

  if (!supabaseConfigurado) {
    return (
      <div className="mx-auto max-w-lg p-8 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Configuração pendente</h1>
        <p>
          Defina as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> local ou Environment Variables na Vercel).
        </p>
      </div>
    )
  }

  if (!pronto) return null
  if (recuperando && session) return <NovaSenha onDone={() => setRecuperando(false)} />
  if (!session) return <Login />
  if (dono === null) return <Carregando />
  if (!dono) return <SemAcesso />
  return <AreaDoDono session={session} />
}
