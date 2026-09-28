import { useState, type FormEvent } from 'react'
import { CalendarClock, Check, Flag, Pencil, Plus, Trash2, X } from 'lucide-react'
import { AbasMetas } from '../components/Abas'
import { Bolinha, Cabecalho, Campo, Carregando, Erro, Modal, Progresso, Selecao, Vazio } from '../components/ui'
import { corDe, VISUAL_AREA } from '../components/visual'
import { progressoEtapas } from '../lib/calculos'
import { diasEntre, hoje } from '../lib/datas'
import { buscarObjetivos, excluir, salvar, useDados } from '../lib/dados'
import { dataBR } from '../lib/formato'
import { AREAS, PRIORIDADES, rotuloDe, STATUS_OBJETIVO, type AreaObjetivo, type Etapa, type Objetivo, type Prioridade, type StatusObjetivo } from '../tipos'

const COR_STATUS: Record<StatusObjetivo, string> = {
  planejado: 'bg-slate-100 text-slate-600',
  andamento: 'bg-azul-100 text-azul-700',
  pausado: 'bg-amber-100 text-amber-700',
  concluido: 'bg-emerald-100 text-emerald-700',
}
const ORDEM_STATUS: Record<StatusObjetivo, number> = { andamento: 0, planejado: 1, pausado: 2, concluido: 3 }
const ORDEM_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 }

export function Objetivos() {
  const d = useDados(buscarObjetivos, [])
  const [area, setArea] = useState('')
  const [status, setStatus] = useState('')
  const [edit, setEdit] = useState<Objetivo | 'novo' | null>(null)

  if (d.carregando) return <Carregando />
  const etapas = d.dados?.etapas ?? []
  const lista = (d.dados?.objetivos ?? [])
    .filter((o) => (!area || o.area === area) && (status ? o.status === status : o.status !== 'concluido'))
    .sort((a, b) => ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status] || ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade] || (a.prazo ?? '9').localeCompare(b.prazo ?? '9'))
  const concluidos = (d.dados?.objetivos ?? []).filter((o) => o.status === 'concluido').length

  return (
    <div className="space-y-4">
      <AbasMetas />
      <Cabecalho
        titulo="Objetivos de vida"
        descricao="O que quero conquistar — dividido em etapas para sair do papel."
        acoes={
          <button className="btn-primary" onClick={() => setEdit('novo')}>
            <Plus className="h-4 w-4" /> Novo objetivo
          </button>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:max-w-md">
        <Selecao value={area} onChange={setArea} vazio="Todas as áreas" opcoes={AREAS} />
        <Selecao value={status} onChange={setStatus} vazio="Em aberto" opcoes={STATUS_OBJETIVO} />
      </div>
      {d.erro && <Erro>{d.erro}</Erro>}

      {lista.length === 0 ? (
        <Vazio icone={Flag}>
          <span>{status || area ? 'Nenhum objetivo com esse filtro.' : 'Nenhum objetivo em aberto. O que você quer conquistar?'}</span>
          {!status && !area && concluidos > 0 && <span className="text-xs">({concluidos} já concluído{concluidos > 1 ? 's' : ''} — filtre por “Concluído”)</span>}
        </Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((o) => (
            <CartaoObjetivo key={o.id} o={o} etapas={etapas.filter((e) => e.objetivo_id === o.id)} onEditar={() => setEdit(o)} />
          ))}
        </div>
      )}

      {edit && <ObjetivoForm inicial={edit === 'novo' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function CartaoObjetivo({ o, etapas, onEditar }: { o: Objetivo; etapas: Etapa[]; onEditar: () => void }) {
  const [nova, setNova] = useState('')
  const vis = VISUAL_AREA[o.area]
  const cor = corDe(vis.cor)
  const p = progressoEtapas(etapas)
  const hj = hoje()
  const dias = o.prazo ? diasEntre(hj, o.prazo) : null
  const atrasado = dias !== null && dias < 0 && o.status !== 'concluido'

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    if (!nova.trim()) return
    await salvar('pes_etapas', null, { objetivo_id: o.id, titulo: nova.trim(), ordem: etapas.length })
    setNova('')
  }

  return (
    <div className="cartao flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Bolinha icone={vis.icone} fundo={cor.fundo} texto={cor.texto} tamanho="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900">{o.titulo}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-semibold">
            <span className={`rounded-full px-2 py-0.5 ${COR_STATUS[o.status]}`}>{rotuloDe(STATUS_OBJETIVO, o.status)}</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{rotuloDe(AREAS, o.area)}</span>
            {o.prioridade === 'alta' && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">Prioridade alta</span>}
          </div>
        </div>
        <button className="icon-btn" onClick={onEditar} aria-label="Editar objetivo">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      {o.descricao && <p className="text-sm text-slate-600">{o.descricao}</p>}
      {o.prazo && (
        <div className={`flex items-center gap-1.5 text-xs ${atrasado ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>
          <CalendarClock className="h-3.5 w-3.5" />
          {o.status === 'concluido'
            ? `Concluído${o.concluido_em ? ` em ${dataBR(o.concluido_em)}` : ''}`
            : atrasado
              ? `Prazo passou (${dataBR(o.prazo)})`
              : `Até ${dataBR(o.prazo)}${dias !== null ? ` · ${dias === 0 ? 'hoje' : `faltam ${dias} dias`}` : ''}`}
        </div>
      )}

      {p.total > 0 && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Etapas</span>
            <span className="tabular-nums">
              {p.feitas}/{p.total}
            </span>
          </div>
          <Progresso fracao={p.fracao} cor={p.fracao >= 1 ? 'bg-emerald-500' : cor.barra} />
        </div>
      )}
      <ul className="space-y-0.5">
        {etapas.map((e) => (
          <li key={e.id} className="group flex items-center gap-2">
            <button
              className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 ${e.feita ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 text-transparent hover:border-emerald-400'}`}
              onClick={() => salvar('pes_etapas', e.id, { feita: !e.feita })}
              aria-label={e.feita ? 'Desmarcar etapa' : 'Marcar etapa como feita'}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </button>
            <span className={`flex-1 py-1 text-sm ${e.feita ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{e.titulo}</span>
            <button className="cursor-pointer p-1 text-slate-300 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100" onClick={() => excluir('pes_etapas', e.id)} aria-label="Remover etapa">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {o.status !== 'concluido' && (
        <form onSubmit={adicionar} className="mt-auto flex gap-2">
          <input className="input py-2" value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Adicionar etapa..." />
          <button className="btn-secondary px-3" aria-label="Adicionar etapa" disabled={!nova.trim()}>
            <Plus className="h-4 w-4" />
          </button>
        </form>
      )}
    </div>
  )
}

function ObjetivoForm({ inicial, onClose }: { inicial: Objetivo | null; onClose: () => void }) {
  const [titulo, setTitulo] = useState(inicial?.titulo ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [area, setArea] = useState<AreaObjetivo>(inicial?.area ?? 'pessoal')
  const [status, setStatus] = useState<StatusObjetivo>(inicial?.status ?? 'andamento')
  const [prioridade, setPrioridade] = useState<Prioridade>(inicial?.prioridade ?? 'media')
  const [prazo, setPrazo] = useState(inicial?.prazo ?? '')
  const [etapasTexto, setEtapasTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    try {
      const concluido_em = status === 'concluido' ? (inicial?.concluido_em ?? hoje()) : null
      const o = await salvar('pes_objetivos', inicial?.id, { titulo: titulo.trim(), descricao: descricao.trim() || null, area, status, prioridade, prazo: prazo || null, concluido_em })
      const novas = etapasTexto
        .split('\n')
        .map((t) => t.trim())
        .filter(Boolean)
      for (const [i, t] of novas.entries()) await salvar('pes_etapas', null, { objetivo_id: o.id, titulo: t, ordem: i })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function apagar() {
    if (!inicial || !window.confirm(`Excluir o objetivo “${inicial.titulo}” e suas etapas?`)) return
    await excluir('pes_objetivos', inicial.id).then(onClose, (e: Error) => setErro(e.message))
  }

  return (
    <Modal
      titulo={inicial ? 'Editar objetivo' : 'Novo objetivo'}
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
          <button className="btn-primary" form="form-objetivo">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-objetivo" onSubmit={gravar} className="space-y-4">
        <Campo label="Objetivo">
          <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Correr uma meia maratona" required autoFocus={!inicial} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Área da vida">
            <Selecao value={area} onChange={(v) => setArea(v as AreaObjetivo)} opcoes={AREAS} />
          </Campo>
          <Campo label="Prazo (opcional)">
            <input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
          <Campo label="Situação">
            <Selecao value={status} onChange={(v) => setStatus(v as StatusObjetivo)} opcoes={STATUS_OBJETIVO} />
          </Campo>
          <Campo label="Prioridade">
            <Selecao value={prioridade} onChange={(v) => setPrioridade(v as Prioridade)} opcoes={PRIORIDADES} />
          </Campo>
        </div>
        <Campo label="Por que isso importa? (opcional)">
          <textarea className="input min-h-16" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <Campo label={inicial ? 'Adicionar etapas (uma por linha)' : 'Etapas (uma por linha, opcional)'} dica="Você também pode marcar e incluir etapas direto no cartão.">
          <textarea className="input min-h-20" value={etapasTexto} onChange={(e) => setEtapasTexto(e.target.value)} placeholder={'Ex.:\nMontar planilha de treinos\nCorrer 10 km\nInscrever na prova'} />
        </Campo>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}
