import { useState, type FormEvent } from 'react'
import { ArrowRight, Lock, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Estrelas } from './Layout'

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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-azul-950 via-azul-800 to-azul-700 p-4">
      <Estrelas className="pointer-events-none absolute -top-10 -right-10 h-80 w-80 text-white/10" />
      <Estrelas className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 text-white/5" />
      <form onSubmit={entrar} className="animar-modal relative w-full max-w-sm space-y-5 rounded-3xl bg-white p-7 shadow-2xl shadow-azul-950/40">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-azul-700 to-azul-900 shadow-lg shadow-azul-700/30">
            <Estrelas className="h-11 w-11 text-white" />
          </span>
          <h1 className="mt-4 text-xl font-extrabold text-slate-900">Assistente Pessoal</h1>
          <p className="mt-1 text-sm text-slate-500">Acesso restrito ao dono.</p>
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
        <button type="button" className="w-full cursor-pointer text-center text-sm font-medium text-azul-600 hover:underline" onClick={esqueci}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}
