import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, Pencil, Plus, Trash2, Users, Wrench } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { corDe, iconeDe } from './icones'
import { Cabecalho, Trilha, Vazio } from './Paginas'
import type { Acesso, Departamento, Modulo, Perfil } from './tipos'

type Aba = 'departamentos' | 'ferramentas' | 'usuarios'

const ABAS: { id: Aba; label: string; icone: typeof Users }[] = [
  { id: 'departamentos', label: 'Departamentos', icone: LayoutGrid },
  { id: 'ferramentas', label: 'Ferramentas', icone: Wrench },
  { id: 'usuarios', label: 'Usuários e acessos', icone: Users },
]

const STATUS_TXT = { disponivel: 'Disponível', em_breve: 'Em breve', oculto: 'Oculto' }

function BotoesLinha({ onEditar, onExcluir }: { onEditar: () => void; onExcluir: () => void }) {
  return (
    <div className="flex shrink-0 gap-1">
      <button className="icon-btn" onClick={onEditar} title="Editar" aria-label="Editar">
        <Pencil className="h-4 w-4" />
      </button>
      <button className="icon-btn hover:bg-rose-50 hover:text-rose-600" onClick={onExcluir} title="Excluir" aria-label="Excluir">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  )
}

export function Admin({
  meuId,
  departamentos,
  modulos,
  recarregar,
  editarDepartamento,
  editarModulo,
}: {
  meuId: string
  departamentos: Departamento[]
  modulos: Modulo[]
  recarregar: () => Promise<void>
  editarDepartamento: (d: Departamento | 'novo') => void
  editarModulo: (m: Modulo | 'novo') => void
}) {
  const [aba, setAba] = useState<Aba>('departamentos')
  const [erro, setErro] = useState<string | null>(null)

  async function excluirDepartamento(d: Departamento) {
    if (modulos.some((m) => m.departamento_id === d.id)) return setErro(`O departamento "${d.nome}" ainda tem ferramentas. Mova ou exclua as ferramentas antes.`)
    if (!confirm(`Excluir o departamento "${d.nome}"?`)) return
    const { error } = await supabase.from('portal_departamentos').delete().eq('id', d.id)
    setErro(error?.message ?? null)
    recarregar()
  }

  async function excluirModulo(m: Modulo) {
    if (!confirm(`Tirar a ferramenta "${m.nome}" do portal?\n\nIsso só remove o atalho. Os dados da ferramenta continuam guardados.`)) return
    const { error } = await supabase.from('portal_modulos').delete().eq('id', m.id)
    setErro(error?.message ?? null)
    recarregar()
  }

  return (
    <div className="space-y-5">
      <Cabecalho
        trilha={<Trilha itens={[{ label: 'Página inicial', para: '/' }, { label: 'Administração' }]} />}
        titulo="Administração do portal"
        descricao="Cadastre departamentos e ferramentas e defina o que cada pessoa da equipe pode acessar."
      />

      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 ring-1 ring-slate-200/70" role="tablist">
        {ABAS.map(({ id, label, icone: I }) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${aba === id ? 'bg-asap-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
          >
            <I className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}

      {aba === 'departamentos' && (
        <section className="space-y-3">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => editarDepartamento('novo')}>
              <Plus className="h-4 w-4" />
              Novo departamento
            </button>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
            {departamentos.map((d) => {
              const I = iconeDe(d.icone)
              const cor = corDe(d.cor)
              const qtd = modulos.filter((m) => m.departamento_id === d.id).length
              return (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cor.fundo} ${cor.texto}`}>
                    <I className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900">{d.nome}</div>
                    <div className="truncate text-xs text-slate-400">
                      /d/{d.slug} · ordem {d.ordem} · {qtd} {qtd === 1 ? 'ferramenta' : 'ferramentas'}
                    </div>
                  </div>
                  <BotoesLinha onEditar={() => editarDepartamento(d)} onExcluir={() => excluirDepartamento(d)} />
                </div>
              )
            })}
            {departamentos.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Nenhum departamento cadastrado.</div>}
          </div>
        </section>
      )}

      {aba === 'ferramentas' && (
        <section className="space-y-3">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => editarModulo('novo')} disabled={departamentos.length === 0}>
              <Plus className="h-4 w-4" />
              Nova ferramenta
            </button>
          </div>
          {departamentos.map((d) => {
            const doDep = modulos.filter((m) => m.departamento_id === d.id)
            return (
              <div key={d.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
                <div className="bg-slate-50 px-4 py-2 text-xs font-bold tracking-wide text-slate-500 uppercase">{d.nome}</div>
                <div className="divide-y divide-slate-100">
                  {doDep.map((m) => {
                    const I = iconeDe(m.icone)
                    return (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <I className="h-5 w-5 shrink-0 text-slate-400" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-900">{m.nome}</div>
                          <div className="truncate text-xs text-slate-400">
                            {STATUS_TXT[m.status]} · {m.link || 'sem link'}
                          </div>
                        </div>
                        <BotoesLinha onEditar={() => editarModulo(m)} onExcluir={() => excluirModulo(m)} />
                      </div>
                    )
                  })}
                  {doDep.length === 0 && <div className="px-4 py-3 text-sm text-slate-400">Nenhuma ferramenta.</div>}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {aba === 'usuarios' && <Usuarios meuId={meuId} departamentos={departamentos} />}
    </div>
  )
}

function Chave({ ligado, onChange, desabilitado, label }: { ligado: boolean; onChange: (v: boolean) => void; desabilitado?: boolean; label: string }) {
  return (
    <label className={`flex items-center gap-2 text-sm font-medium ${desabilitado ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} text-slate-600`}>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        disabled={desabilitado}
        onClick={() => onChange(!ligado)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition ${ligado ? 'bg-brand-500' : 'bg-slate-300'} disabled:cursor-not-allowed`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${ligado ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {label}
    </label>
  )
}

function Usuarios({ meuId, departamentos }: { meuId: string; departamentos: Departamento[] }) {
  const [perfis, setPerfis] = useState<Perfil[]>([])
  const [acessos, setAcessos] = useState<Acesso[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async () => {
    const [p, a] = await Promise.all([supabase.from('portal_perfis').select('*').order('email'), supabase.from('portal_acessos').select('*')])
    setErro((p.error ?? a.error)?.message ?? null)
    setPerfis((p.data as Perfil[]) ?? [])
    setAcessos((a.data as Acesso[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function alterarPerfil(p: Perfil, campos: Partial<Perfil>) {
    setPerfis((l) => l.map((x) => (x.user_id === p.user_id ? { ...x, ...campos } : x)))
    const { error } = await supabase.from('portal_perfis').update(campos).eq('user_id', p.user_id)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function alternarAcesso(userId: string, depId: string, liberar: boolean) {
    setAcessos((l) => (liberar ? [...l, { user_id: userId, departamento_id: depId }] : l.filter((a) => !(a.user_id === userId && a.departamento_id === depId))))
    const { error } = liberar
      ? await supabase.from('portal_acessos').insert({ user_id: userId, departamento_id: depId })
      : await supabase.from('portal_acessos').delete().eq('user_id', userId).eq('departamento_id', depId)
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  if (carregando) return <div className="p-6 text-center text-sm text-slate-400">Carregando usuários...</div>

  return (
    <section className="space-y-3">
      <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-brand-100">
        Para cadastrar uma pessoa nova, crie o usuário no Supabase (Authentication → Users). Ela aparece aqui sozinha, sem acesso a nada, e você libera os
        departamentos.
      </p>
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {perfis.length === 0 && <Vazio icone={Users}>Nenhum usuário encontrado.</Vazio>}
      {perfis.map((p) => {
        const eu = p.user_id === meuId
        return (
          <div key={p.user_id} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-cyan-400 font-bold text-asap-950">
                {(p.nome || p.email).charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <input
                  className="w-full rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 font-bold text-slate-900 outline-none hover:border-slate-200 focus:border-brand-500"
                  defaultValue={p.nome ?? ''}
                  placeholder="Nome da pessoa"
                  aria-label={`Nome de ${p.email}`}
                  onBlur={(e) => e.target.value.trim() !== (p.nome ?? '') && alterarPerfil(p, { nome: e.target.value.trim() || null })}
                />
                <div className="truncate px-1.5 text-xs text-slate-400">
                  {p.email}
                  {eu && ' · você'}
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <Chave label="Administrador" ligado={p.admin} desabilitado={eu} onChange={(v) => alterarPerfil(p, { admin: v })} />
                <Chave label="Ativo" ligado={p.ativo} desabilitado={eu} onChange={(v) => alterarPerfil(p, { ativo: v })} />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-3">
              {p.admin ? (
                <p className="text-sm text-slate-500">Administradores acessam todos os departamentos.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {departamentos.map((d) => {
                    const tem = acessos.some((a) => a.user_id === p.user_id && a.departamento_id === d.id)
                    return (
                      <button
                        key={d.id}
                        aria-pressed={tem}
                        onClick={() => alternarAcesso(p.user_id, d.id, !tem)}
                        className={`cursor-pointer rounded-full px-3 py-1 text-sm font-semibold ring-1 transition ${tem ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'}`}
                      >
                        {tem ? '✓ ' : ''}
                        {d.nome}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </section>
  )
}
