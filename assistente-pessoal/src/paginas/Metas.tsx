import { useState, type FormEvent } from 'react'
import { CalendarClock, History, Minus, Pencil, Plus, Target, Trash2, Trophy } from 'lucide-react'
import { AbasMetas } from '../components/Abas'
import { Bolinha, Cabecalho, Campo, CampoValor, Carregando, Erro, Modal, Progresso, Segmentado, Vazio } from '../components/ui'
import { CORES, corDe, ICONES, iconeDe } from '../components/visual'
import { progressoMeta } from '../lib/calculos'
import { hoje } from '../lib/datas'
import { buscarMetas, excluir, salvar, useDados } from '../lib/dados'
import { dataBR, moeda, percentual } from '../lib/formato'
import type { Aporte, Meta } from '../tipos'

const ICONES_META = ['target', 'piggy-bank', 'house', 'car', 'plane', 'graduation-cap', 'heart', 'baby', 'gift', 'smartphone', 'trophy', 'star', 'mountain', 'briefcase', 'landmark', 'trending-up']

export function Metas() {
  const d = useDados(buscarMetas, [])
  const [edit, setEdit] = useState<Meta | 'nova' | null>(null)
  const [aporte, setAporte] = useState<{ meta: Meta; resgate: boolean } | null>(null)
  const [historico, setHistorico] = useState<Meta | null>(null)
  const hj = hoje()

  if (d.carregando) return <Carregando />
  const metas = d.dados?.metas ?? []
  const aportes = d.dados?.aportes ?? []
  const ativas = metas.filter((m) => !m.concluida)
  const concluidas = metas.filter((m) => m.concluida)
  const totalGuardado = ativas.reduce((s, m) => s + progressoMeta(m, aportes, hj).acumulado, 0)
  const totalMensal = ativas.reduce((s, m) => s + (progressoMeta(m, aportes, hj).porMes ?? 0), 0)

  const cartao = (m: Meta) => {
    const p = progressoMeta(m, aportes, hj)
    const cor = corDe(m.cor)
    return (
      <div key={m.id} className={`cartao flex flex-col gap-3 ${m.concluida ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-3">
          <Bolinha icone={iconeDe(m.icone)} fundo={cor.fundo} texto={cor.texto} tamanho="h-11 w-11" />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900">{m.nome}</div>
            {m.descricao && <div className="line-clamp-2 text-xs text-slate-500">{m.descricao}</div>}
          </div>
          <button className="icon-btn" onClick={() => setEdit(m)} aria-label="Editar meta">
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        <div>
          <div className="flex items-end justify-between gap-2">
            <span className="text-lg font-extrabold text-slate-900 tabular-nums">{moeda(p.acumulado)}</span>
            <span className="text-xs font-bold text-slate-500 tabular-nums">{percentual(p.fracao)}</span>
          </div>
          <div className="my-1.5">
            <Progresso fracao={p.fracao} cor={p.fracao >= 1 ? 'bg-emerald-500' : cor.barra} />
          </div>
          <div className="text-xs text-slate-500">
            de {moeda(m.valor_alvo)}
            {p.falta > 0 ? ` · faltam ${moeda(p.falta)}` : ' · meta atingida! 🎉'}
          </div>
        </div>
        {!m.concluida && m.prazo && p.falta > 0 && (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${p.atrasada ? 'bg-rose-50 text-rose-700' : 'bg-azul-50 text-azul-800'}`}>
            <CalendarClock className="h-4 w-4 shrink-0" />
            {p.atrasada ? (
              <span>Prazo vencido em {dataBR(m.prazo)}.</span>
            ) : (
              <span>
                Guardar <b>{moeda(p.porMes)}</b> por mês até {dataBR(m.prazo)} ({p.mesesRestantes} {p.mesesRestantes === 1 ? 'mês' : 'meses'})
              </span>
            )}
          </div>
        )}
        <div className="mt-auto flex gap-2">
          {!m.concluida && (
            <>
              <button className="btn-primary btn-sm flex-1" onClick={() => setAporte({ meta: m, resgate: false })}>
                <Plus className="h-3.5 w-3.5" /> Guardar
              </button>
              <button className="btn-secondary btn-sm" onClick={() => setAporte({ meta: m, resgate: true })} title="Resgatar / retirar">
                <Minus className="h-3.5 w-3.5" /> Retirar
              </button>
            </>
          )}
          <button className="btn-secondary btn-sm" onClick={() => setHistorico(m)} title="Histórico">
            <History className="h-3.5 w-3.5" />
            <span className={m.concluida ? '' : 'sr-only'}>Histórico</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <AbasMetas />
      <Cabecalho
        titulo="Metas financeiras"
        descricao="Reserva de emergência, viagem, carro, imóvel... quanto guardar e até quando."
        acoes={
          <button className="btn-primary" onClick={() => setEdit('nova')}>
            <Plus className="h-4 w-4" /> Nova meta
          </button>
        }
      />
      {d.erro && <Erro>{d.erro}</Erro>}

      {ativas.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-gradient-to-br from-azul-700 to-azul-900 p-4 text-white">
            <div className="text-xs font-semibold text-white/70">Guardado nas metas</div>
            <div className="mt-1 text-lg font-extrabold tabular-nums sm:text-2xl">{moeda(totalGuardado)}</div>
          </div>
          <div className="cartao">
            <div className="text-xs font-semibold text-slate-500">Para cumprir os prazos</div>
            <div className="mt-1 text-lg font-extrabold text-slate-900 tabular-nums sm:text-2xl">
              {moeda(totalMensal)}
              <span className="text-sm font-semibold text-slate-400">/mês</span>
            </div>
          </div>
        </div>
      )}

      {metas.length === 0 ? (
        <Vazio icone={Target}>
          <span>Defina sua primeira meta — por exemplo, uma reserva de emergência de 6 meses de gastos.</span>
          <button className="btn-primary btn-sm mt-1" onClick={() => setEdit('nova')}>
            <Plus className="h-3.5 w-3.5" /> Nova meta
          </button>
        </Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{ativas.map(cartao)}</div>
      )}

      {concluidas.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 pt-2 text-sm font-bold text-slate-600">
            <Trophy className="h-4 w-4 text-amber-500" /> Conquistadas
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{concluidas.map(cartao)}</div>
        </>
      )}

      {edit && <MetaForm inicial={edit === 'nova' ? null : edit} onClose={() => setEdit(null)} />}
      {aporte && <AporteForm meta={aporte.meta} resgate={aporte.resgate} onClose={() => setAporte(null)} />}
      {historico && <Historico meta={historico} aportes={aportes.filter((a) => a.meta_id === historico.id)} onClose={() => setHistorico(null)} />}
    </div>
  )
}

function MetaForm({ inicial, onClose }: { inicial: Meta | null; onClose: () => void }) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [alvo, setAlvo] = useState<number | null>(inicial?.valor_alvo ?? null)
  const [jaTenho, setJaTenho] = useState<number | null>(null)
  const [prazo, setPrazo] = useState(inicial?.prazo ?? '')
  const [icone, setIcone] = useState(inicial?.icone ?? 'target')
  const [cor, setCor] = useState(inicial?.cor ?? 'azul')
  const [concluida, setConcluida] = useState(inicial?.concluida ?? false)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    if (!alvo || alvo <= 0) return setErro('Informe o valor da meta.')
    try {
      const m = await salvar('pes_metas', inicial?.id, { nome: nome.trim(), descricao: descricao.trim() || null, valor_alvo: alvo, prazo: prazo || null, icone, cor, concluida })
      if (!inicial && jaTenho && jaTenho > 0) await salvar('pes_meta_aportes', null, { meta_id: m.id, valor: jaTenho, data: hoje(), observacao: 'Valor já guardado ao criar a meta' })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  async function apagar() {
    if (!inicial || !window.confirm(`Excluir a meta “${inicial.nome}” e todo o histórico de aportes?`)) return
    await excluir('pes_metas', inicial.id).then(onClose, (e: Error) => setErro(e.message))
  }

  return (
    <Modal
      titulo={inicial ? 'Editar meta' : 'Nova meta'}
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
          <button className="btn-primary" form="form-meta">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-meta" onSubmit={gravar} className="space-y-4">
        <Campo label="Nome da meta">
          <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Reserva de emergência" required autoFocus={!inicial} />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Quanto quero juntar">
            <CampoValor valor={alvo} onChange={setAlvo} />
          </Campo>
          <Campo label="Até quando (opcional)">
            <input className="input" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </Campo>
        </div>
        {!inicial && (
          <Campo label="Quanto já tenho guardado (opcional)">
            <CampoValor valor={jaTenho} onChange={setJaTenho} />
          </Campo>
        )}
        <Campo label="Descrição / motivação">
          <textarea className="input min-h-16" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </Campo>
        <Campo label="Ícone">
          <div className="flex flex-wrap gap-1.5">
            {ICONES_META.map((k) => {
              const I = ICONES[k]
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setIcone(k)}
                  className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl ${icone === k ? 'bg-azul-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <I className="h-5 w-5" />
                </button>
              )
            })}
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
            <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={concluida} onChange={(e) => setConcluida(e.target.checked)} />
            Meta concluída (vai para “Conquistadas”)
          </label>
        )}
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

function AporteForm({ meta, resgate: resgateInicial, onClose }: { meta: Meta; resgate: boolean; onClose: () => void }) {
  const [resgate, setResgate] = useState(resgateInicial)
  const [valor, setValor] = useState<number | null>(null)
  const [data, setData] = useState(hoje())
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    if (!valor || valor <= 0) return setErro('Informe um valor maior que zero.')
    try {
      await salvar('pes_meta_aportes', null, { meta_id: meta.id, valor: resgate ? -valor : valor, data, observacao: obs.trim() || null })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      titulo={meta.nome}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-aporte">
            {resgate ? 'Registrar retirada' : 'Guardar'}
          </button>
        </>
      }
    >
      <form id="form-aporte" onSubmit={gravar} className="space-y-4">
        <Segmentado
          valor={resgate ? 'r' : 'a'}
          onChange={(v) => setResgate(v === 'r')}
          opcoes={[
            { value: 'a', label: 'Guardar dinheiro', ativo: 'text-emerald-600' },
            { value: 'r', label: 'Retirar', ativo: 'text-rose-600' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor">
            <CampoValor valor={valor} onChange={setValor} autoFocus />
          </Campo>
          <Campo label="Data">
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
        </div>
        <Campo label="Observação">
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: sobra do mês, 13º, bônus" />
        </Campo>
        <p className="text-xs text-slate-400">Dica: se o dinheiro saiu de uma conta, lance também uma transferência para a conta de investimento.</p>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

function Historico({ meta, aportes, onClose }: { meta: Meta; aportes: Aporte[]; onClose: () => void }) {
  return (
    <Modal titulo={`Histórico · ${meta.nome}`} onClose={onClose}>
      {aportes.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">Nenhum aporte ainda.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {aportes.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-bold tabular-nums ${a.valor < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {a.valor < 0 ? '−' : '+'} {moeda(Math.abs(a.valor))}
                </div>
                <div className="truncate text-xs text-slate-500">
                  {dataBR(a.data)}
                  {a.observacao ? ` · ${a.observacao}` : ''}
                </div>
              </div>
              <button className="icon-btn hover:text-rose-600" onClick={() => window.confirm('Excluir este registro?') && excluir('pes_meta_aportes', a.id)} aria-label="Excluir">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
