import { useState } from 'react'
import { FileText, Layers, Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { REGEX_CNAE, mascaraCnae } from '../lib/format'
import type { BlocoCnae, ObjetoSocial } from '../types'
import { CnaesInput } from './CnaesInput'
import { Field, Modal, Section, Select } from './ui'

type Aba = 'blocos' | 'objetos'

const BLOCO_VAZIO = { nome: '', cnae_principal: '', cnaes_secundarios: [] as string[], objeto_social_id: '' }
const OBJETO_VAZIO = { nome: '', texto: '' }

export function Modelos({
  blocos,
  objetos,
  abaInicial = 'blocos',
  onClose,
  onChanged,
}: {
  blocos: BlocoCnae[]
  objetos: ObjetoSocial[]
  abaInicial?: Aba
  onClose: () => void
  onChanged: () => void
}) {
  const [aba, setAba] = useState<Aba>(abaInicial)
  const [bloco, setBloco] = useState(BLOCO_VAZIO)
  const [objeto, setObjeto] = useState(OBJETO_VAZIO)
  const [editando, setEditando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  function limpar() {
    setEditando(null)
    setBloco(BLOCO_VAZIO)
    setObjeto(OBJETO_VAZIO)
    setErro(null)
  }

  async function salvarBloco() {
    if (!bloco.nome.trim()) return setErro('Informe o nome do bloco.')
    if (bloco.cnae_principal && !REGEX_CNAE.test(bloco.cnae_principal)) return setErro('CNAE principal deve ter 7 dígitos (ex.: 4713-0-02).')
    const payload = {
      nome: bloco.nome.trim(),
      cnae_principal: bloco.cnae_principal || null,
      cnaes_secundarios: bloco.cnaes_secundarios,
      objeto_social_id: bloco.objeto_social_id || null,
    }
    setSalvando(true)
    const { error } = editando
      ? await supabase.from('soc_blocos_cnae').update(payload).eq('id', editando)
      : await supabase.from('soc_blocos_cnae').insert(payload)
    setSalvando(false)
    if (error) return setErro(error.message)
    limpar()
    onChanged()
  }

  async function salvarObjeto() {
    if (!objeto.nome.trim() || !objeto.texto.trim()) return setErro('Informe o nome e o texto do objeto social.')
    const payload = { nome: objeto.nome.trim(), texto: objeto.texto.trim() }
    setSalvando(true)
    const { error } = editando
      ? await supabase.from('soc_objetos_sociais').update(payload).eq('id', editando)
      : await supabase.from('soc_objetos_sociais').insert(payload)
    setSalvando(false)
    if (error) return setErro(error.message)
    limpar()
    onChanged()
  }

  async function excluir(tabela: 'soc_blocos_cnae' | 'soc_objetos_sociais', id: string, nome: string) {
    if (!confirm(`Excluir o modelo "${nome}"?\n\nOs processos já cadastrados não são alterados.`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', id)
    if (error) return setErro(error.message)
    if (editando === id) limpar()
    onChanged()
  }

  const abas: { id: Aba; label: string; icone: typeof Layers; qtd: number }[] = [
    { id: 'blocos', label: 'Blocos de CNAEs', icone: Layers, qtd: blocos.length },
    { id: 'objetos', label: 'Objetos Sociais', icone: FileText, qtd: objetos.length },
  ]

  return (
    <Modal title="Modelos" subtitulo="Blocos de CNAEs e objetos sociais pré-definidos" onClose={onClose} largura="max-w-4xl">
      <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/70">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setAba(a.id)
              limpar()
            }}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${aba === a.id ? 'bg-asap-900 text-white' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <a.icone className="h-4 w-4" />
            {a.label}
            <span className={`rounded-md px-1.5 text-[11px] ${aba === a.id ? 'bg-white/20' : 'bg-slate-100'}`}>{a.qtd}</span>
          </button>
        ))}
      </div>

      {aba === 'blocos' ? (
        <>
          <Section icone={editando ? Pencil : Plus} title={editando ? 'Editar bloco' : 'Novo bloco de CNAEs'}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Nome do bloco">
                <input className="input" value={bloco.nome} onChange={(e) => setBloco({ ...bloco, nome: e.target.value })} placeholder="Ex.: CNAEs WAY" />
              </Field>
              <Field label="CNAE Principal">
                <input
                  className="input font-mono"
                  value={bloco.cnae_principal}
                  onChange={(e) => setBloco({ ...bloco, cnae_principal: mascaraCnae(e.target.value) })}
                  placeholder="4713-0-02"
                />
              </Field>
              <Field label="Objeto social vinculado (opcional)">
                <Select
                  value={bloco.objeto_social_id}
                  onChange={(v) => setBloco({ ...bloco, objeto_social_id: v })}
                  opcoes={objetos.map((o) => ({ value: o.id, label: o.nome }))}
                  vazio="Nenhum"
                />
              </Field>
              <Field label="CNAEs Secundários" className="sm:col-span-3">
                <CnaesInput valores={bloco.cnaes_secundarios} onChange={(v) => setBloco({ ...bloco, cnaes_secundarios: v })} />
              </Field>
            </div>
            <Rodape erro={erro} editando={!!editando} salvando={salvando} onCancelar={limpar} onSalvar={salvarBloco} />
          </Section>

          <Section icone={Layers} cor="violet" title={`Blocos cadastrados (${blocos.length})`}>
            {blocos.length === 0 && <p className="text-sm text-slate-400">Nenhum bloco cadastrado.</p>}
            <ul className="divide-y divide-slate-100">
              {blocos.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{b.nome}</div>
                    <div className="text-xs text-slate-500">
                      Principal <span className="font-mono">{b.cnae_principal || '—'}</span> · {b.cnaes_secundarios.length} secundário(s)
                      {b.objeto_social_id && ` · objeto: ${objetos.find((o) => o.id === b.objeto_social_id)?.nome ?? '—'}`}
                    </div>
                  </div>
                  <button
                    className="icon-btn"
                    title="Editar"
                    onClick={() => {
                      setErro(null)
                      setEditando(b.id)
                      setBloco({
                        nome: b.nome,
                        cnae_principal: b.cnae_principal ?? '',
                        cnaes_secundarios: b.cnaes_secundarios,
                        objeto_social_id: b.objeto_social_id ?? '',
                      })
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Excluir" onClick={() => excluir('soc_blocos_cnae', b.id, b.nome)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      ) : (
        <>
          <Section icone={editando ? Pencil : Plus} title={editando ? 'Editar objeto social' : 'Novo objeto social'}>
            <div className="space-y-3">
              <Field label="Nome do modelo">
                <input className="input" value={objeto.nome} onChange={(e) => setObjeto({ ...objeto, nome: e.target.value })} placeholder="Ex.: Objeto Social WAY" />
              </Field>
              <Field label="Texto do objeto social">
                <textarea className="input min-h-40" value={objeto.texto} onChange={(e) => setObjeto({ ...objeto, texto: e.target.value })} />
              </Field>
            </div>
            <Rodape erro={erro} editando={!!editando} salvando={salvando} onCancelar={limpar} onSalvar={salvarObjeto} />
          </Section>

          <Section icone={FileText} cor="violet" title={`Objetos sociais cadastrados (${objetos.length})`}>
            {objetos.length === 0 && <p className="text-sm text-slate-400">Nenhum objeto social cadastrado.</p>}
            <ul className="divide-y divide-slate-100">
              {objetos.map((o) => (
                <li key={o.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{o.nome}</div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{o.texto}</p>
                  </div>
                  <button
                    className="icon-btn"
                    title="Editar"
                    onClick={() => {
                      setErro(null)
                      setEditando(o.id)
                      setObjeto({ nome: o.nome, texto: o.texto })
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Excluir" onClick={() => excluir('soc_objetos_sociais', o.id, o.nome)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </Modal>
  )
}

function Rodape({
  erro,
  editando,
  salvando,
  onCancelar,
  onSalvar,
}: {
  erro: string | null
  editando: boolean
  salvando: boolean
  onCancelar: () => void
  onSalvar: () => void
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
      {erro && <span className="mr-auto text-sm text-rose-600">{erro}</span>}
      {editando && (
        <button className="btn-secondary" onClick={onCancelar}>
          Cancelar edição
        </button>
      )}
      <button className="btn-primary" onClick={onSalvar} disabled={salvando}>
        <Save className="h-4 w-4" />
        {editando ? 'Salvar alterações' : 'Adicionar modelo'}
      </button>
    </div>
  )
}
