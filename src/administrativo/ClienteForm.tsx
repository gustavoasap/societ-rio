import { useState, type FormEvent } from 'react'
import { Check, RotateCcw, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarData, mascaraCnpj } from '../lib/format'
import { Field, Modal, Select } from '../components/ui'
import { encerrarCliente } from './acoes'
import { INSCRICOES, REGIMES, SEGMENTOS, hojeISO, type Cliente, type ParceiroResumo, EMPRESAS } from './tipos'
import { CampoData } from '../components/CampoData'

type Dados = Omit<Cliente, 'id' | 'codigo' | 'created_at'>

const VAZIO: Dados = {
  cnpj: null,
  razao_social: '',
  nome_fantasia: null,
  status: 'pendente',
  data_abertura: null,
  data_assinatura: null,
  data_encerramento: null,
  empresa: 'ASAP',
  data_inicio_servicos: null,
  carencia_meses: null,
  situacao_encerramento: null,
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
  const [encerrando, setEncerrando] = useState(false)
  const [dataEncerramento, setDataEncerramento] = useState(hojeISO())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const set = <K extends keyof Dados>(k: K, v: Dados[K]) => setD((s) => ({ ...s, [k]: v }))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const cnpj = (d.cnpj ?? '').replace(/\D/g, '')
    if (cnpj && cnpj.length !== 14) return setErro('O CNPJ precisa ter 14 dígitos.')

    setSalvando(true)
    const { id: _id, codigo: _codigo, created_at: _criado, updated_at: _atualizado, ...resto } = d as Dados & Partial<Cliente> & { updated_at?: string }
    // Contrato assinado, certificado, procuração, onboarding e data de assinatura são editados no Expandir
    const { status: _st, procuracao: _pr, certificado_digital: _cd, onboarding: _on, data_assinatura: _as, ...cadastro } = resto
    const dados = cliente ? { ...cadastro, cnpj: cnpj || null } : { ...resto, cnpj: cnpj || null }
    const r = cliente
      ? await supabase.from('adm_clientes').update(dados).eq('id', cliente.id).select('id').single()
      : await supabase.from('adm_clientes').insert(dados).select('id').single()
    if (r.error) {
      setSalvando(false)
      return setErro(r.error.code === '23505' ? 'Já existe um cliente com esse CNPJ.' : r.error.message)
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
            <CampoData id="data-encerramento" className="input" value={dataEncerramento} onChange={(v) => setDataEncerramento(v)} />
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
            <input
              id="razao-social"
              className="input uppercase"
              value={d.razao_social}
              onChange={(e) => set('razao_social', e.target.value.toUpperCase())}
              required
            />
          </Field>
          <Field label="CNPJ" className="sm:col-span-2">
            <input
              id="cnpj"
              className="input font-mono"
              value={mascaraCnpj(d.cnpj ?? '')}
              onChange={(e) => set('cnpj', e.target.value)}
              placeholder="00.000.000/0000-00"
            />
          </Field>
          <Field label="Nome fantasia" className="sm:col-span-6">
            <input
              id="nome-fantasia"
              className="input uppercase"
              value={d.nome_fantasia ?? ''}
              onChange={(e) => set('nome_fantasia', texto(e.target.value.toUpperCase()))}
            />
          </Field>
          <Field label="Responsável" className="sm:col-span-2">
            <input
              id="responsavel"
              className="input uppercase"
              value={d.responsavel ?? ''}
              onChange={(e) => set('responsavel', e.target.value.toUpperCase() || null)}
            />
          </Field>
          <Field label="E-mail" className="sm:col-span-2">
            <input id="email" type="email" className="input" value={d.email ?? ''} onChange={(e) => set('email', texto(e.target.value))} />
          </Field>
          <Field label="Telefone" className="sm:col-span-2">
            <input id="telefone" className="input" value={d.telefone ?? ''} onChange={(e) => set('telefone', texto(e.target.value))} />
          </Field>
          <Field label="Data de abertura" className="sm:col-span-2">
            <CampoData id="data-abertura" className="input" value={d.data_abertura ?? ''} onChange={(v) => set('data_abertura', v || null)} />
          </Field>
          <Field label="Início dos serviços" className="sm:col-span-2">
            <CampoData
              id="data-inicio-servicos"
              className="input"
              value={d.data_inicio_servicos ?? ''}
              onChange={(v) => set('data_inicio_servicos', v || null)}
            />
          </Field>
          <Field label="Empresa" className="sm:col-span-2">
            <Select value={d.empresa ?? ''} onChange={(v) => set('empresa', v || null)} opcoes={EMPRESAS} vazio="Não informada" />
          </Field>
          <Field label="Carência (meses)" className="sm:col-span-2">
            <input
              id="carencia"
              type="number"
              min={0}
              max={60}
              className="input"
              value={d.carencia_meses ?? ''}
              onChange={(e) => set('carencia_meses', e.target.value === '' ? null : Math.max(0, Math.min(60, Math.trunc(Number(e.target.value)))))}
            />
          </Field>
          <Field label="Situação do encerramento" className="sm:col-span-6">
            <input
              id="situacao-encerramento"
              className="input"
              list="situacoes-encerramento"
              placeholder="Ex.: Pendente Distrato, Aguardando Retorno"
              value={d.situacao_encerramento ?? ''}
              onChange={(e) => set('situacao_encerramento', e.target.value || null)}
            />
            <datalist id="situacoes-encerramento">
              <option value="Pendente Distrato" />
              <option value="Aguardando Retorno" />
            </datalist>
          </Field>
          <Field label="Parceiro" className="sm:col-span-2">
            <Select
              value={d.parceiro_id ?? ''}
              onChange={(v) => set('parceiro_id', v || null)}
              opcoes={parceiros.map((p) => ({ value: p.id, label: p.nome }))}
              vazio="Nenhum"
            />
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
            <input
              id="link-drive"
              className="input"
              value={d.link_drive ?? ''}
              onChange={(e) => set('link_drive', texto(e.target.value))}
              placeholder="https://drive.google.com/..."
            />
          </Field>
        </section>

        <p className="rounded-xl bg-brand-50 px-4 py-2.5 text-xs text-brand-800 ring-1 ring-brand-100">
          Contrato assinado, certificado digital, procuração, onboarding e honorários são informados no botão <b>Expandir</b> do cliente, na lista.
        </p>

        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <Field label="Observações">
            <textarea id="observacoes" className="input min-h-20" value={d.observacoes ?? ''} onChange={(e) => set('observacoes', texto(e.target.value))} />
          </Field>
        </section>
      </form>
    </Modal>
  )
}
