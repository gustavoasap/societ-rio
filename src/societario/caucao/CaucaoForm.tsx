import { useState, type FormEvent } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarMoeda, lerNumeroBR, moedaDigitada } from '../../lib/format'
import { Field, Modal, Select } from '../../components/ui'
import type { Parceiro } from '../../types'
import { salvarJunta } from './acoes'
import { COBERTURAS, resultado, valorResponsavel, type Caucao, type Junta } from './tipos'
import { CampoData } from '../../components/CampoData'

const brl = (v: number | null | undefined) => (v === null || v === undefined ? '' : moedaDigitada(String(v).replace('.', ',')))
const NOVA_JUNTA = '__nova__'

export function CaucaoForm({
  caucao,
  parceiros,
  juntas,
  sugestoes,
  onClose,
  onSalvo,
  onJuntaCriada,
}: {
  caucao: Caucao | null
  parceiros: Parceiro[]
  juntas: Junta[]
  sugestoes: string[]
  onClose: () => void
  onSalvo: () => void
  onJuntaCriada: () => void
}) {
  const [f, setF] = useState(() => ({
    cliente: caucao?.cliente ?? '',
    parceiro_id: caucao?.parceiro_id ?? '',
    responsavel: caucao ? valorResponsavel(caucao) : 'cliente',
    cobertura: String(caucao?.cobertura_meses ?? 0),
    valor_caucao: brl(caucao?.valor_caucao),
    data_recebimento: caucao?.data_recebimento ?? '',
    junta_uf: caucao?.junta_uf ?? '',
    taxa_junta: brl(caucao?.taxa_junta),
    data_pagamento_taxa: caucao?.data_pagamento_taxa ?? '',
    valor_certificado: brl(caucao?.valor_certificado),
    data_pagamento_certificado: caucao?.data_pagamento_certificado ?? '',
    data_apropriacao: caucao?.data_apropriacao ?? '',
    observacoes: caucao?.observacoes ?? '',
  }))
  const [novaJunta, setNovaJunta] = useState<{
    uf: string
    nome: string
    taxa: string
  } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }))
  const moedaProps = (k: 'valor_caucao' | 'taxa_junta' | 'valor_certificado') => ({
    className: 'input tabular-nums',
    placeholder: 'R$ 0,00',
    value: f[k],
    onChange: (e: { target: { value: string } }) => set(k, e.target.value),
    onBlur: (e: { target: { value: string } }) => set(k, moedaDigitada(e.target.value)),
  })

  function escolherJunta(uf: string) {
    if (uf === NOVA_JUNTA) return setNovaJunta({ uf: '', nome: '', taxa: '' })
    const j = juntas.find((x) => x.uf === uf)
    setF((x) => ({
      ...x,
      junta_uf: uf,
      taxa_junta: j ? brl(j.taxa) : x.taxa_junta,
    }))
  }

  async function criarJunta() {
    if (!novaJunta) return
    const r = await salvarJunta(novaJunta, null)
    if (r.erro || !r.junta) return setErro(r.erro ?? 'Não foi possível cadastrar a junta.')
    setErro(null)
    setF((x) => ({
      ...x,
      junta_uf: r.junta!.uf,
      taxa_junta: brl(r.junta!.taxa),
    }))
    setNovaJunta(null)
    onJuntaCriada()
  }

  const parcial = {
    valor_caucao: lerNumeroBR(f.valor_caucao),
    taxa_junta: lerNumeroBR(f.taxa_junta),
    valor_certificado: lerNumeroBR(f.valor_certificado),
  }
  const res = resultado(parcial)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (!f.cliente.trim()) return setErro('Informe o nome do cliente.')
    setSalvando(true)
    setErro(null)
    const dados = {
      cliente: f.cliente.trim().toUpperCase(),
      parceiro_id: f.parceiro_id || null,
      responsavel_tipo: f.responsavel === 'cliente' ? 'cliente' : 'parceiro',
      responsavel_parceiro_id: f.responsavel === 'cliente' ? null : f.responsavel,
      cobertura_meses: Number(f.cobertura),
      ...parcial,
      data_recebimento: f.data_recebimento || null,
      junta_uf: f.junta_uf || null,
      data_pagamento_taxa: f.data_pagamento_taxa || null,
      data_pagamento_certificado: f.data_pagamento_certificado || null,
      data_apropriacao: f.data_apropriacao || null,
      observacoes: f.observacoes.trim() || null,
    }
    const { error } = caucao ? await supabase.from('soc_caucoes').update(dados).eq('id', caucao.id) : await supabase.from('soc_caucoes').insert(dados)
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  async function excluir() {
    if (!caucao || !confirm(`Excluir o caução de "${caucao.cliente}"?`)) return
    const { error } = await supabase.from('soc_caucoes').delete().eq('id', caucao.id)
    if (error) return setErro(error.message)
    onSalvo()
  }

  const opcoesParceiros = parceiros.map((p) => ({
    value: p.id,
    label: p.nome,
  }))

  return (
    <Modal
      title={caucao ? caucao.cliente : 'Novo caução'}
      subtitulo="Caução recebido, taxa da junta e certificado digital"
      onClose={onClose}
      largura="max-w-3xl"
      footer={
        <>
          {caucao && (
            <button type="button" className="btn-secondary mr-auto text-rose-600" onClick={excluir}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-caucao" disabled={salvando}>
            <Check className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <form id="form-caucao" onSubmit={salvar} className="space-y-4">
        <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:grid-cols-2">
          <Field label="Nome do cliente *" className="sm:col-span-2">
            <input
              id="caucao-cliente"
              className="input uppercase"
              list="sugestoes-clientes"
              value={f.cliente}
              onChange={(e) => set('cliente', e.target.value.toUpperCase())}
              autoFocus={!caucao}
            />
            <datalist id="sugestoes-clientes">
              {sugestoes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          <Field label="Parceiro que indicou">
            <Select value={f.parceiro_id} onChange={(v) => set('parceiro_id', v)} opcoes={opcoesParceiros} vazio="Sem parceiro" />
          </Field>
          <Field label="Responsável pelo caução">
            <Select
              value={f.responsavel}
              onChange={(v) => set('responsavel', v)}
              opcoes={[
                { value: 'cliente', label: 'Próprio cliente' },
                ...opcoesParceiros.map((p) => ({
                  ...p,
                  label: `Parceiro: ${p.label}`,
                })),
              ]}
            />
          </Field>
          <Field label="Cobertura de contabilidade">
            <Select value={f.cobertura} onChange={(v) => set('cobertura', v)} opcoes={COBERTURAS} />
          </Field>
        </div>

        <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:grid-cols-2">
          <h3 className="text-sm font-bold text-slate-800 sm:col-span-2">Caução</h3>
          <Field label="Valor do caução">
            <input {...moedaProps('valor_caucao')} />
          </Field>
          <Field label="Data de recebimento">
            <CampoData className="input" value={f.data_recebimento} onChange={(v) => set('data_recebimento', v)} />
          </Field>

          <h3 className="pt-1 text-sm font-bold text-slate-800 sm:col-span-2">Taxa da junta comercial</h3>
          <Field label="Junta (estado)">
            <Select
              value={f.junta_uf}
              onChange={escolherJunta}
              opcoes={[
                ...juntas.map((j) => ({
                  value: j.uf,
                  label: `${j.uf} · ${j.nome} (${formatarMoeda(j.taxa)})`,
                })),
                { value: NOVA_JUNTA, label: '+ Cadastrar outro estado...' },
              ]}
              vazio="Selecione"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor da taxa">
              <input {...moedaProps('taxa_junta')} />
            </Field>
            <Field label="Data do pagamento">
              <CampoData className="input" value={f.data_pagamento_taxa} onChange={(v) => set('data_pagamento_taxa', v)} />
            </Field>
          </div>
          {novaJunta && (
            <div className="grid grid-cols-[4.5rem_1fr_8rem_auto] items-end gap-2 rounded-xl bg-brand-50/60 p-3 ring-1 ring-brand-100 sm:col-span-2">
              <Field label="UF">
                <input
                  className="input uppercase"
                  maxLength={2}
                  autoFocus
                  value={novaJunta.uf}
                  onChange={(e) =>
                    setNovaJunta({
                      ...novaJunta,
                      uf: e.target.value.replace(/[^a-z]/gi, '').toUpperCase(),
                    })
                  }
                />
              </Field>
              <Field label="Nome da junta">
                <input
                  className="input"
                  placeholder="Ex.: JUCERJA"
                  value={novaJunta.nome}
                  onChange={(e) => setNovaJunta({ ...novaJunta, nome: e.target.value })}
                />
              </Field>
              <Field label="Taxa">
                <input
                  className="input tabular-nums"
                  placeholder="R$ 0,00"
                  value={novaJunta.taxa}
                  onChange={(e) => setNovaJunta({ ...novaJunta, taxa: e.target.value })}
                  onBlur={(e) =>
                    setNovaJunta({
                      ...novaJunta,
                      taxa: moedaDigitada(e.target.value),
                    })
                  }
                />
              </Field>
              <div className="flex gap-1">
                <button type="button" className="btn-primary" onClick={criarJunta}>
                  <Plus className="h-4 w-4" />
                  Cadastrar
                </button>
                <button type="button" className="btn-secondary" onClick={() => setNovaJunta(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <h3 className="pt-1 text-sm font-bold text-slate-800 sm:col-span-2">Certificado digital</h3>
          <Field label="Valor do certificado">
            <input {...moedaProps('valor_certificado')} />
          </Field>
          <Field label="Data do pagamento">
            <CampoData className="input" value={f.data_pagamento_certificado} onChange={(v) => set('data_pagamento_certificado', v)} />
          </Field>
        </div>

        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-3 ring-1 ${res > 0 ? 'bg-emerald-50 ring-emerald-200' : res < 0 ? 'bg-rose-50 ring-rose-200' : 'bg-white ring-slate-200/70'}`}
        >
          <div className="text-sm text-slate-600">
            <b className="text-slate-800">{res < 0 ? 'Prejuízo' : 'Lucro'}</b> = Caução {formatarMoeda(parcial.valor_caucao ?? 0)} − Taxa{' '}
            {formatarMoeda(parcial.taxa_junta ?? 0)} − Certificado {formatarMoeda(parcial.valor_certificado ?? 0)}
          </div>
          <div className={`text-xl font-extrabold tabular-nums ${res > 0 ? 'text-emerald-700' : res < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
            {formatarMoeda(res)}
          </div>
        </div>

        <div className="grid items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:grid-cols-[1fr_12rem]">
          <div className="text-sm">
            <b className="text-slate-800">Baixa do saldo na contabilidade</b>
            <p className="mt-0.5 text-xs text-slate-500">
              Data em que o saldo que sobrou ({res < 0 ? 'prejuízo' : 'lucro'} de {formatarMoeda(Math.abs(res))}) saiu da conta Adiantamento de Clientes -
              Caução para o resultado. Deixe em branco enquanto o saldo continuar na conta.
            </p>
          </div>
          <Field label="Data da baixa">
            <CampoData id="caucao-apropriacao" className="input" value={f.data_apropriacao} onChange={(v) => set('data_apropriacao', v)} />
          </Field>
        </div>

        <Field label="Observações">
          <textarea className="input min-h-16" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
