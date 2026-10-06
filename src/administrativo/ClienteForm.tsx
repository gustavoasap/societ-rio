import { useEffect, useState, type FormEvent } from 'react'
import { Check, History, Plus, RotateCcw, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarData, mascaraCnpj } from '../lib/format'
import { Field, Modal, Select } from '../components/ui'
import { encerrarCliente } from './acoes'
import {
  ETAPAS,
  INSCRICOES,
  OPCOES_ETAPA,
  REGIMES,
  SEGMENTOS,
  STATUS_CLIENTE,
  hojeISO,
  moeda,
  type Cliente,
  type Honorario,
  type ParceiroResumo,
} from './tipos'

type Dados = Omit<Cliente, 'id' | 'codigo' | 'created_at'>

const VAZIO: Dados = {
  cnpj: null,
  razao_social: '',
  nome_fantasia: null,
  status: 'pendente',
  data_abertura: null,
  data_assinatura: null,
  data_encerramento: null,
  responsavel: null,
  email: null,
  telefone: null,
  parceiro_id: null,
  regime_tributario: null,
  segmento: null,
  tipo_inscricao: null,
  inscricao: null,
  procuracao: 'pendente',
  certificado_digital: null,
  onboarding: 'pendente',
  licenciamento: null,
  makrosystem: null,
  link_drive: null,
  observacoes: null,
}

const texto = (v: string) => (v.trim() ? v.trim() : null)

export function ClienteForm({
  cliente,
  parceiros,
  onClose,
  onSalvo,
}: {
  cliente: Cliente | null
  parceiros: ParceiroResumo[]
  onClose: () => void
  onSalvo: () => void
}) {
  const [d, setD] = useState<Dados>(() => (cliente ? { ...VAZIO, ...cliente } : VAZIO))
  const [honorarios, setHonorarios] = useState<Honorario[]>([])
  const [novoHonorario, setNovoHonorario] = useState({ valor: '', inicio: hojeISO(), dia: '', descricao: '' })
  const [reajustando, setReajustando] = useState(!cliente)
  const [encerrando, setEncerrando] = useState(false)
  const [dataEncerramento, setDataEncerramento] = useState(hojeISO())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!cliente) return
    supabase
      .from('adm_honorarios')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('vigencia_inicio', { ascending: false })
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        else setHonorarios((data as Honorario[]) ?? [])
      })
  }, [cliente])

  const vigente = honorarios.find((h) => !h.vigencia_fim)
  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => setD((s) => ({ ...s, [k]: v }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const cnpj = (d.cnpj ?? '').replace(/\D/g, '')
    if (cnpj && cnpj.length !== 14) return setErro('O CNPJ precisa ter 14 dígitos.')
    const valor = Number(novoHonorario.valor.replace(/\./g, '').replace(',', '.'))
    if (reajustando && novoHonorario.valor && (!Number.isFinite(valor) || valor < 0)) return setErro('Informe um honorário válido, por exemplo 360,00.')
    const dia = novoHonorario.dia ? Number(novoHonorario.dia) : null
    if (dia !== null && (dia < 1 || dia > 31)) return setErro('O dia de vencimento vai de 1 a 31.')

    setSalvando(true)
    const { id: _id, codigo: _codigo, created_at: _criado, updated_at: _atualizado, ...resto } = d as Dados & Partial<Cliente> & { updated_at?: string }
    const dados = { ...resto, cnpj: cnpj || null }
    const r = cliente
      ? await supabase.from('adm_clientes').update(dados).eq('id', cliente.id).select('id').single()
      : await supabase.from('adm_clientes').insert(dados).select('id').single()
    if (r.error) {
      setSalvando(false)
      return setErro(r.error.code === '23505' ? 'Já existe um cliente com esse CNPJ.' : r.error.message)
    }
    if (reajustando && novoHonorario.valor) {
      const h = await supabase.rpc('adm_reajustar_honorario', {
        p_cliente: r.data.id,
        p_valor: valor,
        p_inicio: novoHonorario.inicio,
        p_dia: dia,
        p_descricao: texto(novoHonorario.descricao),
      })
      if (h.error) {
        setSalvando(false)
        return setErro(h.error.message)
      }
    }
    setSalvando(false)
    onSalvo()
  }

  async function encerrar() {
    if (!cliente) return
    setSalvando(true)
    const msg = await encerrarCliente(cliente, dataEncerramento)
    setSalvando(false)
    if (msg) return setErro(msg)
    onSalvo()
  }

  async function reativar() {
    if (!cliente) return
    setSalvando(true)
    const { error } = await supabase.from('adm_clientes').update({ status: 'assinado', data_encerramento: null }).eq('id', cliente.id)
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  const titulo = cliente ? `${String(cliente.codigo).padStart(3, '0')} · ${cliente.razao_social}` : 'Novo cliente'

  return (
    <Modal
      title={titulo}
      subtitulo={cliente?.status === 'encerrado' ? `Inativo desde ${formatarData(cliente.data_encerramento)}` : undefined}
      onClose={onClose}
      largura="max-w-4xl"
      footer={
        <>
          {cliente && cliente.status !== 'encerrado' && (
            <button type="button" className="btn-danger mr-auto" onClick={() => setEncerrando(true)}>
              <XCircle className="h-4 w-4" />
              Encerrar cliente
            </button>
          )}
          {cliente?.status === 'encerrado' && (
            <button type="button" className="btn-secondary mr-auto" onClick={reativar} disabled={salvando}>
              <RotateCcw className="h-4 w-4" />
              Reativar cliente
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-cliente" disabled={salvando}>
            <Check className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      {encerrando && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <div className="min-w-0 flex-1 text-sm text-rose-800">
            <b>Encerrar este cliente?</b> Ele sai da lista de ativos e vai para Inativos. O honorário vigente é encerrado na mesma data.
          </div>
          <Field label="Data do encerramento">
            <input id="data-encerramento" type="date" className="input" value={dataEncerramento} onChange={(e) => setDataEncerramento(e.target.value)} />
          </Field>
          <button type="button" className="btn-danger" onClick={encerrar} disabled={salvando}>
            Confirmar encerramento
          </button>
          <button type="button" className="btn-ghost" onClick={() => setEncerrando(false)}>
            Voltar
          </button>
        </div>
      )}
      {erro && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{erro}</p>}

      <form id="form-cliente" onSubmit={salvar} className="space-y-4">
        <section className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 sm:grid-cols-6">
          <Field label="Razão social" className="sm:col-span-4">
            <input id="razao-social" className="input" value={d.razao_social} onChange={(e) => set('razao_social', e.target.value)} required />
          </Field>
          <Field label="CNPJ" className="sm:col-span-2">
            <input id="cnpj" className="input font-mono" value={mascaraCnpj(d.cnpj ?? '')} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Nome fantasia" className="sm:col-span-3">
            <input id="nome-fantasia" className="input" value={d.nome_fantasia ?? ''} onChange={(e) => set('nome_fantasia', texto(e.target.value))} />
          </Field>
          <Field label="Situação" className="sm:col-span-3">
            <Select
              value={d.status}
              onChange={(v) => set('status', v as Dados['status'])}
              opcoes={STATUS_CLIENTE.filter((s) => s.value !== 'encerrado' || d.status === 'encerrado')}
              disabled={d.status === 'encerrado'}
            />
          </Field>
          <Field label="Responsável" className="sm:col-span-2">
            <input id="responsavel" className="input" value={d.responsavel ?? ''} onChange={(e) => set('responsavel', texto(e.target.value))} />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <input id="email" type="email" className="input" value={d.email ?? ''} onChange={(e) => set('email', texto(e.target.value))} />
          </Field>
          <Field label="Telefone" className="sm:col-span-2">
            <input id="telefone" className="input" value={d.telefone ?? ''} onChange={(e) => set('telefone', texto(e.target.value))} />
          </Field>
          <Field label="Data de abertura" className="sm:col-span-2">
            <input id="data-abertura" type="date" className="input" value={d.data_abertura ?? ''} onChange={(e) => set('data_abertura', e.target.value || null)} />
          </Field>
          <Field label="Assinatura do contrato" className="sm:col-span-2">
            <input id="data-assinatura" type="date" className="input" value={d.data_assinatura ?? ''} onChange={(e) => set('data_assinatura', e.target.value || null)} />
          </Field>
          <Field label="Parceiro" className="sm:col-span-2">
            <Select value={d.parceiro_id ?? ''} onChange={(v) => set('parceiro_id', v || null)} opcoes={parceiros.map((p) => ({ value: p.id, label: p.nome }))} vazio="Nenhum" />
          </Field>
          <Field label="Regime tributário" className="sm:col-span-2">
            <Select value={d.regime_tributario ?? ''} onChange={(v) => set('regime_tributario', v || null)} opcoes={REGIMES} vazio="Não informado" />
          </Field>
          <Field label="Segmento" className="sm:col-span-2">
            <Select value={d.segmento ?? ''} onChange={(v) => set('segmento', v || null)} opcoes={SEGMENTOS} vazio="Não informado" />
          </Field>
          <Field label="Inscrição" className="sm:col-span-2">
            <Select value={d.tipo_inscricao ?? ''} onChange={(v) => set('tipo_inscricao', v || null)} opcoes={INSCRICOES} vazio="Não informada" />
          </Field>
          <Field label="Número da inscrição" className="sm:col-span-3">
            <input id="inscricao" className="input font-mono" value={d.inscricao ?? ''} onChange={(e) => set('inscricao', texto(e.target.value))} />
          </Field>
          <Field label="Pasta no Drive" className="sm:col-span-3">
            <input id="link-drive" className="input" value={d.link_drive ?? ''} onChange={(e) => set('link_drive', texto(e.target.value))} placeholder="https://drive.google.com/..." />
          </Field>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <h3 className="mb-3 text-sm font-bold text-slate-800">Implantação</h3>
          <div className="grid gap-4 sm:grid-cols-5">
            {ETAPAS.map((et) => (
              <Field key={et.campo} label={et.label}>
                <Select value={d[et.campo] ?? ''} onChange={(v) => set(et.campo, (v || null) as Dados['procuracao'])} opcoes={OPCOES_ETAPA} vazio="Não informado" />
              </Field>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <History className="h-4 w-4 text-slate-400" />
              Honorário mensal
              {vigente && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">vigente: {moeda(Number(vigente.valor))}</span>}
            </h3>
            {cliente && !reajustando && d.status !== 'encerrado' && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setReajustando(true)}>
                <Plus className="h-3.5 w-3.5" />
                {vigente ? 'Reajustar honorário' : 'Informar honorário'}
              </button>
            )}
          </div>
          {reajustando && (
            <div className="mb-3 grid gap-3 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100 sm:grid-cols-4">
              <Field label="Valor mensal (R$)">
                <input id="honorario-valor" className="input" inputMode="decimal" value={novoHonorario.valor} onChange={(e) => setNovoHonorario((s) => ({ ...s, valor: e.target.value }))} placeholder="360,00" />
              </Field>
              <Field label="Vale a partir de">
                <input id="honorario-inicio" type="date" className="input" value={novoHonorario.inicio} onChange={(e) => setNovoHonorario((s) => ({ ...s, inicio: e.target.value }))} />
              </Field>
              <Field label="Dia de vencimento">
                <input id="honorario-dia" type="number" min={1} max={31} className="input" value={novoHonorario.dia} onChange={(e) => setNovoHonorario((s) => ({ ...s, dia: e.target.value }))} placeholder="10" />
              </Field>
              <Field label="Observação">
                <input id="honorario-descricao" className="input" value={novoHonorario.descricao} onChange={(e) => setNovoHonorario((s) => ({ ...s, descricao: e.target.value }))} placeholder="Ex.: reajuste anual" />
              </Field>
              {vigente && <p className="text-xs text-brand-700 sm:col-span-4">O honorário atual termina na véspera da nova data, e o histórico é mantido.</p>}
            </div>
          )}
          {honorarios.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr>
                    <th className="py-1.5 pr-3">Valor</th>
                    <th className="px-3 py-1.5">Vigência</th>
                    <th className="px-3 py-1.5">Vencimento</th>
                    <th className="py-1.5 pl-3">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {honorarios.map((h) => (
                    <tr key={h.id} className={h.vigencia_fim ? 'text-slate-400' : 'text-slate-700'}>
                      <td className="py-2 pr-3 font-semibold tabular-nums">{moeda(Number(h.valor))}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {formatarData(h.vigencia_inicio)} a {h.vigencia_fim ? formatarData(h.vigencia_fim) : 'hoje'}
                      </td>
                      <td className="px-3 py-2">{h.dia_vencimento ? `dia ${h.dia_vencimento}` : '—'}</td>
                      <td className="py-2 pl-3">{h.descricao ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !reajustando && <p className="text-sm text-slate-400">Nenhum honorário informado.</p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <Field label="Observações">
            <textarea id="observacoes" className="input min-h-20" value={d.observacoes ?? ''} onChange={(e) => set('observacoes', texto(e.target.value))} />
          </Field>
        </section>
      </form>
    </Modal>
  )
}
