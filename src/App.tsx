import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigurado } from './lib/supabase'
import { Login } from './components/Login'
import { Portal } from './portal/Portal'

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 p-4">
      <form onSubmit={salvar} className="w-full max-w-sm space-y-4 rounded-3xl bg-white p-7 shadow-2xl">
        <h1 className="text-xl font-extrabold text-slate-900">Definir nova senha</h1>
        <input className="input" type="password" minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha" required />
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <button className="btn-primary w-full">Salvar senha</button>
      </form>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [pronto, setPronto] = useState(false)
  const [recuperando, setRecuperando] = useState(false)

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

  if (!supabaseConfigurado) {
    return (
      <div className="mx-auto max-w-lg p-8 text-sm">
        <h1 className="mb-2 text-lg font-semibold">Configuração pendente</h1>
        <p>
          Defina as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (arquivo <code>.env</code> local ou
          Environment Variables na Vercel).
        </p>
      </div>
    )
  }

  if (!pronto) return null
  if (recuperando && session) return <NovaSenha onDone={() => setRecuperando(false)} />
  if (!session) return <Login />
  return <Portal session={session} />
}
