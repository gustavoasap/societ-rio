import { useState, type FormEvent } from 'react'
import { KeyRound, Pencil, Plus, ShieldCheck, Smartphone, Tags, Trash2, Users } from 'lucide-react'
import { Bolinha, Cabecalho, Campo, CampoValor, Erro, Modal, Segmentado } from '../components/ui'
import { COR_NATUREZA, CORES, corDe, ICONES, iconeDe } from '../components/visual'
import { useApp } from '../contexto'
import { excluir, salvar } from '../lib/dados'
import { moeda } from '../lib/formato'
import { supabase } from '../lib/supabase'
import { NATUREZAS, rotuloDe, type Categoria, type Natureza, type Pessoa } from '../tipos'

export function Ajustes({ email }: { email: string }) {
  const { categorias } = useApp()
  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa')
  const [edit, setEdit] = useState<Categoria | 'nova' | null>(null)
  const lista = categorias.filter((c) => c.tipo === tipo).sort((a, b) => Number(b.ativa) - Number(a.ativa) || a.nome.localeCompare(b.nome))

  return (
    <div className="space-y-5">
      <Cabecalho titulo="Ajustes" descricao={`Conectado como ${email}`} />

      <section className="cartao">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Tags className="h-4 w-4 text-azul-600" /> Categorias
          </h2>
          <button className="btn-primary btn-sm" onClick={() => setEdit('nova')}>
            <Plus className="h-3.5 w-3.5" /> Nova categoria
          </button>
        </div>
        <div className="mb-3 max-w-xs">
          <Segmentado
            valor={tipo}
            onChange={setTipo}
            opcoes={[
              { value: 'despesa', label: 'Despesas' },
              { value: 'receita', label: 'Receitas' },
            ]}
          />
        </div>
        <div className="grid grid-cols-1 gap-x-6 divide-y divide-slate-100 sm:grid-cols-2 sm:divide-y-0">
          {lista.map((c) => {
            const cor = corDe(c.cor)
            return (
              <div key={c.id} className={`flex items-center gap-3 py-2 ${c.ativa ? '' : 'opacity-50'}`}>
                <Bolinha icone={iconeDe(c.icone)} fundo={cor.fundo} texto={cor.texto} tamanho="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{c.nome}</div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className="h-2 w-2 rounded-sm" style={{ background: COR_NATUREZA[c.natureza] }} />
                    {rotuloDe(NATUREZAS, c.natureza)}
                    {!c.ativa ? ' · desativada' : c.orcamento_mensal ? ` · limite ${moeda(c.orcamento_mensal)}/mês` : ''}
                  </div>
                </div>
                <button className="icon-btn" onClick={() => setEdit(c)} aria-label={`Editar ${c.nome}`}>
                  <Pencil className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <Pessoas />

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <TrocarSenha />
        <section className="cartao space-y-2 text-sm text-slate-600">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <Smartphone className="h-4 w-4 text-azul-600" /> Usar como aplicativo no celular
          </h2>
          <p>
            <b>iPhone (Safari):</b> toque em Compartilhar → “Adicionar à Tela de Início”.
          </p>
          <p>
            <b>Android (Chrome):</b> menu ⋮ → “Adicionar à tela inicial” / “Instalar app”.
          </p>
          <p className="text-xs text-slate-400">O ícone com as estrelas aparece na tela e abre em tela cheia, como um app.</p>
          <h2 className="flex items-center gap-2 pt-3 text-sm font-bold text-slate-800">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Privacidade
          </h2>
          <p>Só o seu usuário (o primeiro a entrar) tem acesso aos dados. O banco recusa qualquer outro login, mesmo que alguém crie uma conta.</p>
        </section>
      </div>

      {edit && <CategoriaForm inicial={edit === 'nova' ? null : edit} tipoPadrao={tipo} onClose={() => setEdit(null)} />}
    </div>
  )
}

function TrocarSenha() {
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  async function trocar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) setErro(error.message)
    else {
      setMsg('Senha alterada.')
      setSenha('')
    }
  }
  return (
    <form onSubmit={trocar} className="cartao space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        <KeyRound className="h-4 w-4 text-azul-600" /> Trocar senha
      </h2>
      <input className="input" type="password" minLength={8} autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)" required />
      <Erro>{erro}</Erro>
      {msg && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{msg}</p>}
      <button className="btn-secondary">Salvar nova senha</button>
    </form>
  )
}

function CategoriaForm({ inicial, tipoPadrao, onClose }: { inicial: Categoria | null; tipoPadrao: 'despesa' | 'receita'; onClose: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [tipo, setTipo] = useState(inicial?.tipo ?? tipoPadrao)
  const [icone, setIcone] = useState(inicial?.icone ?? 'tag')
  const [cor, setCor] = useState(inicial?.cor ?? 'azul')
  const [limite, setLimite] = useState<number | null>(inicial?.orcamento_mensal ?? null)
  const [natureza, setNatureza] = useState<Natureza>(inicial?.natureza ?? 'variavel')
  const [ativa, setAtiva] = useState(inicial?.ativa ?? true)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    try {
      await salvar('pes_categorias', inicial?.id, { nome: nome.trim(), tipo, icone, cor, ativa, natureza, orcamento_mensal: tipo === 'despesa' && limite && limite > 0 ? limite : null })
      onClose()
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErro(m.includes('duplicate') ? 'Já existe uma categoria com esse nome.' : m)
    }
  }

  async function apagar() {
    if (!inicial || !window.confirm(`Excluir a categoria “${inicial.nome}”? Os lançamentos dela ficam “sem categoria”.`)) return
    await excluir('pes_categorias', inicial.id).then(onClose, (e: Error) => setErro(e.message))
  }

  return (
    <Modal
      titulo={inicial ? 'Editar categoria' : 'Nova categoria'}
      onClose={onClose}
      rodape={
        <>
          {inicial && (
            <button type="button" className="btn-danger btn-sm mr-auto" onClick={apagar}>
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-categoria">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-categoria" onSubmit={gravar} className="space-y-4">
        {!inicial && (
          <Segmentado
            valor={tipo}
            onChange={setTipo}
            opcoes={[
              { value: 'despesa', label: 'Despesa' },
              { value: 'receita', label: 'Receita' },
            ]}
          />
        )}
        <Campo label="Nome">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required autoFocus={!inicial} />
        </Campo>
        <Campo label="Classificação" dica={tipo === 'despesa' ? 'Fixa: todo mês, mesmo valor (aluguel). Variável: todo mês, valor muda (mercado). Eventual: de vez em quando (viagem, IPVA).' : 'Fixa: salário/pró-labore. Variável: lucros, comissões. Eventual: 13º, venda de bem.'}>
          <Segmentado valor={natureza} onChange={setNatureza} opcoes={NATUREZAS} />
        </Campo>
        {tipo === 'despesa' && (
          <Campo label="Limite mensal (orçamento, opcional)">
            <CampoValor valor={limite} onChange={setLimite} />
          </Campo>
        )}
        <Campo label="Ícone">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(ICONES).map(([k, I]) => (
              <button
                key={k}
                type="button"
                onClick={() => setIcone(k)}
                className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg ${icone === k ? 'bg-azul-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <I className="h-4.5 w-4.5" />
              </button>
            ))}
          </div>
        </Campo>
        <Campo label="Cor">
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES).map(([k, c]) => (
              <button key={k} type="button" onClick={() => setCor(k)} className={`h-8 w-8 cursor-pointer rounded-full ${c.barra} ${cor === k ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`} aria-label={c.label} />
            ))}
          </div>
        </Campo>
        {inicial && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
            Categoria ativa
          </label>
        )}
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

function Pessoas() {
  const { pessoas, nome } = useApp()
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!novo.trim()) return
    try {
      await salvar('pes_pessoas', null, { nome: novo.trim() })
      setNovo('')
      setErro(null)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setErro(m.includes('duplicate') ? 'Essa pessoa já está cadastrada.' : m)
    }
  }

  async function renomear(p: Pessoa) {
    const n = window.prompt('Nome', p.nome)?.trim()
    if (n && n !== p.nome) await salvar('pes_pessoas', p.id, { nome: n }).catch((e: Error) => setErro(e.message))
  }

  return (
    <section className="cartao">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-800">
        <Users className="h-4 w-4 text-amber-600" /> Pessoas (responsáveis por gastos)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Quem usa seu cartão ou sua conta: família, amigos, sócios. Os gastos delas ficam fora da sua DRE e aparecem em “A receber de terceiros”. O padrão é sempre você ({nome}).
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        {pessoas.map((p) => (
          <span key={p.id} className={`inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-3 text-sm ${p.ativa ? 'bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'bg-slate-100 text-slate-400 line-through'}`}>
            {p.nome}
            <button className="icon-btn h-6 w-6" onClick={() => renomear(p)} aria-label={`Renomear ${p.nome}`}>
              <Pencil className="h-3 w-3" />
            </button>
            <button className="icon-btn h-6 w-6" onClick={() => salvar('pes_pessoas', p.id, { ativa: !p.ativa })} title={p.ativa ? 'Desativar' : 'Reativar'} aria-label={p.ativa ? 'Desativar' : 'Reativar'}>
              {p.ativa ? <Trash2 className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            </button>
          </span>
        ))}
        {pessoas.length === 0 && <span className="text-sm text-slate-400">Nenhuma pessoa cadastrada.</span>}
      </div>
      <form onSubmit={adicionar} className="flex max-w-sm gap-2">
        <input className="input" value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Nome (ex.: Maria, Pai, Sócio)" />
        <button className="btn-primary px-3" aria-label="Adicionar pessoa" disabled={!novo.trim()}>
          <Plus className="h-4 w-4" />
        </button>
      </form>
      <Erro>{erro}</Erro>
    </section>
  )
}
