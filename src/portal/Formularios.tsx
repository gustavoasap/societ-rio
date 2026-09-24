import { useState, type FormEvent } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Field, Modal, Select } from '../components/ui'
import { CORES, ICONES, corDe } from './icones'
import { STATUS_MODULO, slugify, type Departamento, type Modulo, type StatusModulo } from './tipos'

function EscolherIcone({ valor, onChange, cor }: { valor: string; onChange: (v: string) => void; cor: string }) {
  const c = corDe(cor)
  return (
    <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
      {Object.entries(ICONES).map(([nome, { icone: I, label }]) => {
        const ativo = nome === valor
        return (
          <button
            key={nome}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={ativo}
            onClick={() => onChange(nome)}
            className={`flex aspect-square cursor-pointer items-center justify-center rounded-xl ring-1 transition ${ativo ? `${c.fundo} ${c.texto} ring-2 ring-brand-500` : 'bg-white text-slate-500 ring-slate-200 hover:ring-slate-300'}`}
          >
            <I className="h-5 w-5" />
          </button>
        )
      })}
    </div>
  )
}

function Erro({ msg }: { msg: string | null }) {
  return msg ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{msg}</p> : null
}

function Rodape({ salvando, onClose, form }: { salvando: boolean; onClose: () => void; form: string }) {
  return (
    <>
      <button type="button" className="btn-secondary" onClick={onClose}>
        Cancelar
      </button>
      <button className="btn-primary" form={form} disabled={salvando}>
        <Check className="h-4 w-4" />
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
    </>
  )
}

export function DepartamentoForm({ inicial, onClose, onSalvo }: { inicial: Departamento | null; onClose: () => void; onSalvo: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [icone, setIcone] = useState(inicial?.icone ?? 'FolderOpen')
  const [cor, setCor] = useState(inicial?.cor ?? 'brand')
  const [ordem, setOrdem] = useState(String(inicial?.ordem ?? 10))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setSalvando(true)
    const dados = { nome: nome.trim(), descricao: descricao.trim() || null, icone, cor, ordem: Number(ordem) || 0 }
    const { error } = inicial
      ? await supabase.from('portal_departamentos').update(dados).eq('id', inicial.id)
      : await supabase.from('portal_departamentos').insert({ ...dados, slug: slugify(nome) || `departamento-${Date.now()}` })
    setSalvando(false)
    if (error) return setErro(error.code === '23505' ? 'Já existe um departamento com esse nome.' : error.message)
    onSalvo()
  }

  return (
    <Modal title={inicial ? 'Editar departamento' : 'Novo departamento'} onClose={onClose} largura="max-w-2xl" footer={<Rodape salvando={salvando} onClose={onClose} form="form-dep" />}>
      <form id="form-dep" onSubmit={salvar} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <Field label="Nome">
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Fiscal" required />
          </Field>
          <Field label="Ordem no menu">
            <input className="input" type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Uma frase sobre o que o departamento faz" />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Cor</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CORES).map(([k, c]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCor(k)}
                aria-pressed={cor === k}
                className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold ring-1 transition ${cor === k ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}
              >
                <span className={`h-3 w-3 rounded-full ${c.forte}`} />
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Ícone</span>
          <EscolherIcone valor={icone} onChange={setIcone} cor={cor} />
        </div>
        {!inicial && nome && <p className="text-xs text-slate-400">Endereço da página: /d/{slugify(nome)}</p>}
        <Erro msg={erro} />
      </form>
    </Modal>
  )
}

export function ModuloForm({
  inicial,
  departamentos,
  departamentoPadrao,
  onClose,
  onSalvo,
}: {
  inicial: Modulo | null
  departamentos: Departamento[]
  departamentoPadrao?: string
  onClose: () => void
  onSalvo: () => void
}) {
  const [departamentoId, setDepartamentoId] = useState(inicial?.departamento_id ?? departamentoPadrao ?? departamentos[0]?.id ?? '')
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [icone, setIcone] = useState(inicial?.icone ?? 'LayoutGrid')
  const [link, setLink] = useState(inicial?.link ?? '')
  const [status, setStatus] = useState<StatusModulo>(inicial?.status ?? 'em_breve')
  const [ordem, setOrdem] = useState(String(inicial?.ordem ?? 10))
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const cor = departamentos.find((d) => d.id === departamentoId)?.cor ?? 'brand'

  async function salvar(e: FormEvent) {
    e.preventDefault()
    const l = link.trim()
    if (l && !l.startsWith('/') && !/^https?:\/\//i.test(l)) return setErro('O link deve começar com / (página do portal) ou com https:// (outro site).')
    if (status === 'disponivel' && !l) return setErro('Para ficar disponível, a ferramenta precisa de um link.')
    setSalvando(true)
    const dados = { departamento_id: departamentoId, nome: nome.trim(), descricao: descricao.trim() || null, icone, link: l || null, status, ordem: Number(ordem) || 0 }
    const { error } = inicial
      ? await supabase.from('portal_modulos').update(dados).eq('id', inicial.id)
      : await supabase.from('portal_modulos').insert(dados)
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  return (
    <Modal title={inicial ? 'Editar ferramenta' : 'Nova ferramenta'} onClose={onClose} largura="max-w-2xl" footer={<Rodape salvando={salvando} onClose={onClose} form="form-mod" />}>
      <form id="form-mod" onSubmit={salvar} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Departamento">
            <Select value={departamentoId} onChange={setDepartamentoId} opcoes={departamentos.map((d) => ({ value: d.id, label: d.nome }))} />
          </Field>
          <Field label="Situação">
            <Select value={status} onChange={(v) => setStatus(v as StatusModulo)} opcoes={STATUS_MODULO} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <Field label="Nome">
            <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Conciliação bancária" required />
          </Field>
          <Field label="Ordem">
            <input className="input" type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Uma frase sobre o que a ferramenta faz" />
        </Field>
        <Field label="Link">
          <input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/societario/processos ou https://..." />
          <span className="mt-1 block text-xs text-slate-400">
            Começando com <b>/</b> abre dentro do portal. Começando com <b>https://</b> abre outro site em nova aba.
          </span>
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Ícone</span>
          <EscolherIcone valor={icone} onChange={setIcone} cor={cor} />
        </div>
        <Erro msg={erro} />
      </form>
    </Modal>
  )
}
