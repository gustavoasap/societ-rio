import { useState, type FormEvent } from 'react'
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white">PS</div>
          <h1 className="text-lg font-semibold text-slate-800">Processos Societários</h1>
          <p className="text-sm text-slate-500">Entre com seu usuário do escritório</p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">E-mail</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Senha</span>
          <input className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
        <button className="btn-primary w-full" disabled={entrando}>
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
        <button type="button" className="w-full text-center text-xs text-indigo-600 hover:underline" onClick={esqueci}>
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}
