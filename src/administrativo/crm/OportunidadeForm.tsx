import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, Check, CircleCheck, Circle, History, ListTodo, Plus, Trash2, Trophy, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { lerNumeroBR, mascaraCnpj, mascaraTelefone, moedaDigitada } from '../../lib/format'
import { Field, Modal, Select } from '../../components/ui'
import { REGIMES, SEGMENTOS, labelDe, type ParceiroResumo } from '../tipos'
import {
  ETAPAS_CRM,
  MOTIVOS_PERDA,
  ORIGENS,
  SERVICOS,
  TEMPERATURAS,
  TIPOS_ATIVIDADE,
  UFS,
  etapaInfo,
  formatarDataHora,
  prazoDe,
  type Atividade,
  type EtapaCrm,
  type Historico,
  type Membro,
  type Oportunidade,
  type TipoAtividade,
} from './tipos'

type Dados = Omit<Oportunidade, 'id' | 'etapa_desde' | 'fechado_em' | 'created_at' | 'updated_at'>

const VAZIO: Dados = {
  empresa: '',
  cnpj: null,
  contato_nome: null,
  contato_cargo: null,
  email: null,
  telefone: null,
  cidade: null,
  uf: null,
  origem: 'indicacao_parceiro',
  parceiro_id: null,
  servico: 'contabilidade',
  regime_tributario: null,
  segmento: null,
  faturamento_mensal: null,
  qtd_funcionarios: null,
  etapa: 'lead',
  valor_mensal: null,
  valor_avulso: null,
  previsao_fechamento: null,
  temperatura: 'morno',
  responsavel_id: null,
  motivo_perda: null,
  motivo_perda_detalhe: null,
  cliente_id: null,
  observacoes: null,
}

const brl = (v: number | null) => (v === null ? '' : moedaDigitada(String(v).replace('.', ',')))

export function OportunidadeForm({
  oportunidade,
  etapaInicial,
  parceiros,
  equipe,
  usuarioId,
  onClose,
  onSalvo,
  onMover,
}: {
  oportunidade: Oportunidade | null
  etapaInicial?: EtapaCrm
  parceiros: ParceiroResumo[]
  equipe: Membro[]
  usuarioId: string
  onClose: () => void
  onSalvo: () => void
  /** Pede a mudança de etapa (perdido/ganho abrem confirmação na tela principal). */
  onMover: (o: Oportunidade, etapa: EtapaCrm) => void
}) {
  const [d, setD] = useState<Dados>(() => {
    if (!oportunidade) return { ...VAZIO, etapa: etapaInicial ?? 'lead', responsavel_id: usuarioId }
    const { id: _i, etapa_desde: _e, fechado_em: _f, created_at: _c, updated_at: _u, ...resto } = oportunidade
    return resto
  })
  const [valores, setValores] = useState(() => ({
    mensal: brl(oportunidade?.valor_mensal ?? null),
    avulso: brl(oportunidade?.valor_avulso ?? null),
    faturamento: brl(oportunidade?.faturamento_mensal ?? null),
  }))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [atividades, setAtividades] = useState<Atividade[]>([])
  const [historico, setHistorico] = useState<Historico[]>([])
  const [nova, setNova] = useState<{ tipo: TipoAtividade; descricao: string; data: string }>({ tipo: 'ligacao', descricao: '', data: '' })

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => setD((x) => ({ ...x, [k]: v }))
  const nomeMembro = (id: string | null) => equipe.find((m) => m.user_id === id)?.nome ?? ''

  const carregarDetalhes = useCallback(async () => {
    if (!oportunidade) return
    const [a, h] = await Promise.all([
      supabase.from('crm_atividades').select('*').eq('oportunidade_id', oportunidade.id).order('concluida').order('data_prevista', { nullsFirst: false }).order('created_at', { ascending: false }),
      supabase.from('crm_historico').select('*').eq('oportunidade_id', oportunidade.id).order('em', { ascending: false }),
    ])
    setAtividades((a.data as Atividade[]) ?? [])
    setHistorico((h.data as Historico[]) ?? [])
  }, [oportunidade])

  useEffect(() => {
    carregarDetalhes()
  }, [carregarDetalhes])

  /** Grava os dados do formulário; devolve false se houve erro. */
  async function gravar() {
    if (!d.empresa.trim()) return (setErro('Informe o nome da empresa ou do interessado.'), false)
    const cnpj = (d.cnpj ?? '').replace(/\D/g, '')
    if (cnpj && cnpj.length !== 14) return (setErro('CNPJ incompleto: são 14 dígitos.'), false)
    setSalvando(true)
    setErro(null)
    const dados = {
      ...d,
      empresa: d.empresa.trim(),
      cnpj: cnpj || null,
      valor_mensal: lerNumeroBR(valores.mensal),
      valor_avulso: lerNumeroBR(valores.avulso),
      faturamento_mensal: lerNumeroBR(valores.faturamento),
      parceiro_id: d.origem === 'indicacao_parceiro' ? d.parceiro_id : null,
    }
    // A etapa só muda pelo funil (para registrar motivo de perda / conversão em cliente)
    const r = oportunidade
      ? await supabase.from('crm_oportunidades').update({ ...dados, etapa: oportunidade.etapa }).eq('id', oportunidade.id)
      : await supabase.from('crm_oportunidades').insert(dados)
    setSalvando(false)
    if (r.error) return (setErro(r.error.message), false)
    return true
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (await gravar()) onSalvo()
  }

  /** Salva o que foi editado antes de mudar de etapa, para não perder alterações. */
  async function mover(etapa: EtapaCrm) {
    if (!oportunidade || !(await gravar())) return
    onMover({ ...oportunidade, ...d, etapa: oportunidade.etapa, valor_mensal: lerNumeroBR(valores.mensal), valor_avulso: lerNumeroBR(valores.avulso) }, etapa)
  }

  async function adicionarAtividade() {
    if (!oportunidade || !nova.descricao.trim()) return
    const ehNota = nova.tipo === 'nota'
    const { error } = await supabase.from('crm_atividades').insert({
      oportunidade_id: oportunidade.id,
      tipo: nova.tipo,
      descricao: nova.descricao.trim(),
      data_prevista: nova.data ? new Date(nova.data).toISOString() : null,
      concluida: ehNota,
      concluida_em: ehNota ? new Date().toISOString() : null,
      responsavel_id: d.responsavel_id ?? usuarioId,
    })
    if (error) return setErro(error.message)
    setNova({ tipo: nova.tipo, descricao: '', data: '' })
    carregarDetalhes()
  }

  async function alternarAtividade(a: Atividade) {
    const concluida = !a.concluida
    setAtividades((l) => l.map((x) => (x.id === a.id ? { ...x, concluida } : x)))
    const { error } = await supabase
      .from('crm_atividades')
      .update({ concluida, concluida_em: concluida ? new Date().toISOString() : null })
      .eq('id', a.id)
    if (error) setErro(error.message)
    carregarDetalhes()
  }

  async function excluirAtividade(a: Atividade) {
    if (!confirm('Excluir esta atividade?')) return
    const { error } = await supabase.from('crm_atividades').delete().eq('id', a.id)
    if (error) setErro(error.message)
    carregarDetalhes()
  }

  async function excluir() {
    if (!oportunidade || !confirm(`Excluir a oportunidade "${oportunidade.empresa}" e todo o histórico dela? Para registrar que não fechou, use "Marcar como perdida".`)) return
    const { error } = await supabase.from('crm_oportunidades').delete().eq('id', oportunidade.id)
    if (error) return setErro(error.message)
    onSalvo()
  }

  const etapa = etapaInfo(oportunidade?.etapa ?? d.etapa)
  const aberta = d.etapa !== 'ganho' && d.etapa !== 'perdido'

  return (
    <Modal
      title={oportunidade ? oportunidade.empresa : 'Nova oportunidade'}
      subtitulo={
        oportunidade ? (
          <>
            Etapa: <b className="text-white/90">{etapa.label}</b>
            {oportunidade.etapa === 'perdido' && oportunidade.motivo_perda && ` · Motivo: ${labelDe(MOTIVOS_PERDA, oportunidade.motivo_perda)}${oportunidade.motivo_perda_detalhe ? ` (${oportunidade.motivo_perda_detalhe})` : ''}`}
          </>
        ) : (
          'Cadastre o interessado. Depois é só arrastar o card pelo funil.'
        )
      }
      onClose={onClose}
      largura="max-w-5xl"
      footer={
        <>
          {oportunidade && (
            <button type="button" className="btn-secondary mr-auto text-rose-600" onClick={excluir} title="Excluir oportunidade">
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">Excluir</span>
            </button>
          )}
          {oportunidade && aberta && (
            <>
              <button type="button" className="btn-secondary text-rose-600" onClick={() => mover('perdido')}>
                <XCircle className="h-4 w-4" />
                Marcar como perdida
              </button>
              <button type="button" className="btn-secondary text-emerald-700" onClick={() => mover('ganho')}>
                <Trophy className="h-4 w-4" />
                Marcar como ganha
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-oportunidade" disabled={salvando}>
            <Check className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}

      {oportunidade && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white p-3 ring-1 ring-slate-200/70">
          {ETAPAS_CRM.filter((e) => e.value !== 'perdido').map((e, i, l) => {
            const atual = e.value === oportunidade.etapa
            const idxAtual = l.findIndex((x) => x.value === oportunidade.etapa)
            const passou = idxAtual >= 0 && i < idxAtual
            return (
              <div key={e.value} className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={atual || oportunidade.etapa === 'ganho'}
                  onClick={() => mover(e.value)}
                  title={e.dica}
                  className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition disabled:cursor-default ${
                    atual ? e.cor : passou ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-white text-slate-400 ring-slate-200 hover:text-slate-700'
                  }`}
                >
                  {e.label}
                </button>
                {i < l.length - 1 && <ArrowRight className="h-3 w-3 text-slate-300" />}
              </div>
            )
          })}
          {oportunidade.etapa === 'perdido' && (
            <span className="ml-auto rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">Perdida</span>
          )}
        </div>
      )}

      <form id="form-oportunidade" onSubmit={salvar} className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <h3 className="text-sm font-bold text-slate-800">Empresa e contato</h3>
          <Field label="Empresa / interessado *">
            <input id="op-empresa" className="input" value={d.empresa} onChange={(e) => set('empresa', e.target.value)} autoFocus={!oportunidade} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="CNPJ (se já tiver)">
              <input className="input" value={mascaraCnpj(d.cnpj ?? '')} onChange={(e) => set('cnpj', e.target.value.replace(/\D/g, '').slice(0, 14) || null)} />
            </Field>
            <div className="grid grid-cols-[1fr_5.5rem] gap-2">
              <Field label="Cidade">
                <input className="input" value={d.cidade ?? ''} onChange={(e) => set('cidade', e.target.value || null)} />
              </Field>
              <Field label="UF">
                <Select value={d.uf ?? ''} onChange={(v) => set('uf', v || null)} opcoes={UFS} vazio="—" />
              </Field>
            </div>
            <Field label="Nome do contato">
              <input className="input" value={d.contato_nome ?? ''} onChange={(e) => set('contato_nome', e.target.value || null)} />
            </Field>
            <Field label="Cargo">
              <input className="input" placeholder="Sócio, financeiro..." value={d.contato_cargo ?? ''} onChange={(e) => set('contato_cargo', e.target.value || null)} />
            </Field>
            <Field label="Telefone / WhatsApp">
              <input className="input" value={mascaraTelefone(d.telefone ?? '')} onChange={(e) => set('telefone', e.target.value.replace(/\D/g, '') || null)} />
            </Field>
            <Field label="E-mail">
              <input className="input" type="email" value={d.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
            </Field>
            <Field label="Origem (como chegou)">
              <Select value={d.origem} onChange={(v) => set('origem', v)} opcoes={ORIGENS} />
            </Field>
            {d.origem === 'indicacao_parceiro' ? (
              <Field label="Parceiro que indicou">
                <Select value={d.parceiro_id ?? ''} onChange={(v) => set('parceiro_id', v || null)} opcoes={parceiros.map((p) => ({ value: p.id, label: p.nome }))} vazio="Selecione" />
              </Field>
            ) : (
              <div />
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <h3 className="text-sm font-bold text-slate-800">Negócio</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Serviço de interesse">
              <Select value={d.servico} onChange={(v) => set('servico', v)} opcoes={SERVICOS} />
            </Field>
            <Field label="Responsável na ASAP">
              <Select value={d.responsavel_id ?? ''} onChange={(v) => set('responsavel_id', v || null)} opcoes={equipe.map((m) => ({ value: m.user_id, label: m.nome }))} vazio="Ninguém" />
            </Field>
            <Field label="Honorário mensal proposto">
              <input
                className="input tabular-nums"
                placeholder="R$ 0,00"
                value={valores.mensal}
                onChange={(e) => setValores((v) => ({ ...v, mensal: e.target.value }))}
                onBlur={(e) => setValores((v) => ({ ...v, mensal: moedaDigitada(e.target.value) }))}
              />
            </Field>
            <Field label="Valor avulso (serviço único)">
              <input
                className="input tabular-nums"
                placeholder="R$ 0,00"
                value={valores.avulso}
                onChange={(e) => setValores((v) => ({ ...v, avulso: e.target.value }))}
                onBlur={(e) => setValores((v) => ({ ...v, avulso: moedaDigitada(e.target.value) }))}
              />
            </Field>
            <Field label="Previsão de fechamento">
              <input type="date" className="input" value={d.previsao_fechamento ?? ''} onChange={(e) => set('previsao_fechamento', e.target.value || null)} />
            </Field>
            <Field label="Temperatura (interesse)">
              <div className="flex gap-1">
                {TEMPERATURAS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('temperatura', t.value)}
                    className={`flex-1 cursor-pointer rounded-xl px-2 py-2 text-xs font-semibold ring-1 ring-inset transition ${d.temperatura === t.value ? t.cor : 'bg-white text-slate-400 ring-slate-200 hover:text-slate-600'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
            {!oportunidade && (
              <Field label="Etapa inicial">
                <Select value={d.etapa} onChange={(v) => set('etapa', v as EtapaCrm)} opcoes={ETAPAS_CRM.filter((e) => e.value !== 'ganho' && e.value !== 'perdido')} />
              </Field>
            )}
          </div>
          <h3 className="pt-1 text-sm font-bold text-slate-800">Perfil da empresa</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Regime tributário">
              <Select value={d.regime_tributario ?? ''} onChange={(v) => set('regime_tributario', v || null)} opcoes={REGIMES} vazio="Não informado" />
            </Field>
            <Field label="Segmento">
              <Select value={d.segmento ?? ''} onChange={(v) => set('segmento', v || null)} opcoes={SEGMENTOS} vazio="Não informado" />
            </Field>
            <Field label="Faturamento mensal aproximado">
              <input
                className="input tabular-nums"
                placeholder="R$ 0,00"
                value={valores.faturamento}
                onChange={(e) => setValores((v) => ({ ...v, faturamento: e.target.value }))}
                onBlur={(e) => setValores((v) => ({ ...v, faturamento: moedaDigitada(e.target.value) }))}
              />
            </Field>
            <Field label="Funcionários">
              <input
                type="number"
                min={0}
                className="input"
                value={d.qtd_funcionarios ?? ''}
                onChange={(e) => set('qtd_funcionarios', e.target.value === '' ? null : Math.max(0, Math.trunc(Number(e.target.value))))}
              />
            </Field>
          </div>
        </div>

        <Field label="Observações" className="lg:col-span-2">
          <textarea className="input min-h-20" value={d.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value || null)} />
        </Field>
      </form>

      {oportunidade && (
        <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
              <ListTodo className="h-4 w-4 text-brand-600" />
              Atividades e follow-ups
            </h3>
            <div className="mb-4 grid gap-2 sm:grid-cols-[8.5rem_1fr_12rem_auto]">
              <Select value={nova.tipo} onChange={(v) => setNova((n) => ({ ...n, tipo: v as TipoAtividade }))} opcoes={TIPOS_ATIVIDADE} />
              <input
                id="nova-atividade"
                className="input"
                placeholder={nova.tipo === 'nota' ? 'O que foi conversado...' : 'Ex.: ligar para apresentar a proposta'}
                value={nova.descricao}
                onChange={(e) => setNova((n) => ({ ...n, descricao: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), adicionarAtividade())}
              />
              <input
                type="datetime-local"
                className="input"
                title="Quando fazer (deixe 00:00 para o dia todo)"
                value={nova.data}
                disabled={nova.tipo === 'nota'}
                onChange={(e) => setNova((n) => ({ ...n, data: e.target.value }))}
              />
              <button type="button" className="btn-primary" onClick={adicionarAtividade} disabled={!nova.descricao.trim()}>
                <Plus className="h-4 w-4" />
                Adicionar
              </button>
            </div>
            {atividades.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Nenhuma atividade. Agende o próximo passo para não esquecer do follow-up.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {atividades.map((a) => {
                  const atrasada = !a.concluida && prazoDe(a.data_prevista) === 'atrasada'
                  return (
                    <li key={a.id} className="group flex items-start gap-3 py-2.5">
                      {a.tipo === 'nota' ? (
                        <span className="mt-0.5 h-5 w-5 shrink-0" />
                      ) : (
                        <button type="button" className="mt-0.5 cursor-pointer text-slate-300 hover:text-emerald-600" onClick={() => alternarAtividade(a)} title={a.concluida ? 'Reabrir' : 'Concluir'}>
                          {a.concluida ? <CircleCheck className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5" />}
                        </button>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className={`text-sm ${a.concluida && a.tipo !== 'nota' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{a.descricao}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-400">
                          <span className="font-semibold">{labelDe(TIPOS_ATIVIDADE, a.tipo)}</span>
                          {a.data_prevista && <span className={atrasada ? 'font-semibold text-rose-600' : ''}>{atrasada ? 'Atrasada · ' : ''}{formatarDataHora(a.data_prevista)}</span>}
                          {a.tipo === 'nota' && <span>{formatarDataHora(a.created_at)}</span>}
                          {a.responsavel_id && <span>· {nomeMembro(a.responsavel_id)}</span>}
                        </div>
                      </div>
                      <button type="button" className="cursor-pointer text-slate-300 opacity-0 group-hover:opacity-100 hover:text-rose-600" onClick={() => excluirAtividade(a)} title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
              <History className="h-4 w-4 text-brand-600" />
              Histórico de etapas
            </h3>
            <ol className="space-y-2.5 border-l-2 border-slate-100 pl-3">
              {historico.map((h) => (
                <li key={h.id} className="text-xs">
                  <div className="font-semibold text-slate-700">
                    {h.de ? `${etapaInfo(h.de).label} → ` : 'Criada em '}
                    {etapaInfo(h.para).label}
                  </div>
                  <div className="text-slate-400">
                    {formatarDataHora(h.em)}
                    {h.por && nomeMembro(h.por) ? ` · ${nomeMembro(h.por)}` : ''}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  )
}
