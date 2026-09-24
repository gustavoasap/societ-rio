import { useState, type FormEvent } from 'react'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEntrando(false)
    if (error) setErro(error.message === 'Invalid login credentials' ? 'E-mail ou senha inválidos.' : error.message)
  }

  async function esqueci() {
    setErro(null)
    if (!email) return setErro('Digite seu e-mail para receber o link de redefinição.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    if (error) setErro(error.message)
    else setMsg('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.')
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden flex-1 overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 p-12 text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-cyan-400/15 blur-3xl" />
        <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="relative h-12 w-auto self-start" />
        <div className="relative mt-auto max-w-md">
          <h2 className="text-4xl leading-tight font-extrabold">
            O escritório inteiro <span className="bg-gradient-to-r from-brand-300 to-cyan-300 bg-clip-text text-transparent">em um só lugar.</span>
          </h2>
          <p className="mt-4 text-white/60">Portal interno da ASAP: as ferramentas de cada departamento reunidas com um único login.</p>
          <div className="mt-8 grid grid-cols-3 gap-3 text-sm">
            {['Societário', 'Contábil', 'Fiscal'].map((t) => (
              <div key={t} className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-[#f3f6fc] p-4 lg:max-w-xl">
        <form onSubmit={entrar} className="w-full max-w-sm space-y-5">
          <div className="mb-8 rounded-2xl bg-asap-900 p-4 lg:hidden">
            <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="mx-auto h-10 w-auto" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Bem-vindo de volta</h1>
            <p className="mt-1 text-sm text-slate-500">Entre com seu usuário do escritório.</p>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">E-mail</span>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-10" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Senha</span>
            <div className="relative">
              <Lock className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-10" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </div>
          </label>
          {erro && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{erro}</p>}
          {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{msg}</p>}
          <button className="btn-primary w-full py-3" disabled={entrando}>
            {entrando ? 'Entrando...' : 'Entrar'}
            {!entrando && <ArrowRight className="h-4 w-4" />}
          </button>
          <button type="button" className="w-full cursor-pointer text-center text-sm font-medium text-brand-600 hover:underline" onClick={esqueci}>
            Esqueci minha senha
          </button>
        </form>
      </div>
    </div>
  )
}
