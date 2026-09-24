import { useState, type FormEvent } from 'react'
import { Building2, Plus, Star, Trash2 } from 'lucide-react'
import { Field, Modal, Select } from '../../components/ui'
import { mascaraCnpj } from '../../lib/format'
import { ANEXOS_SIMPLES, ICMS_INTERNO_UF, UFS, type Anexo } from '../engine/tabelas'
import { comPadrao, type Estabelecimento, type RegimeAtual } from '../engine/tipos'
import { salvarEmpresa, type EmpresaComEstab } from '../dados'

type EstabForm = Omit<Estabelecimento, 'id'> & { id?: string; chave: string }

const novoEstab = (matriz: boolean): EstabForm => ({ chave: crypto.randomUUID(), cnpj: '', nome: '', matriz, uf: 'SP', municipio: '', aliquota_icms: null })

export function EmpresaForm({ empresa, onClose, onSalvo }: { empresa: EmpresaComEstab | null; onClose: () => void; onSalvo: (id: string) => void }) {
  const params = comPadrao(empresa?.parametros)
  const [razao, setRazao] = useState(empresa?.razao_social ?? '')
  const [regime, setRegime] = useState<RegimeAtual>(empresa?.regime_atual ?? 'simples')
  const [cnae, setCnae] = useState(empresa?.cnae ?? '')
  const [obs, setObs] = useState(empresa?.observacoes ?? '')
  const [anexo, setAnexo] = useState<Anexo>(params.anexo)
  const [anexoServicos, setAnexoServicos] = useState<Anexo>(params.anexoServicos)
  const [inicio, setInicio] = useState(params.inicioAtividade)
  const [estabs, setEstabs] = useState<EstabForm[]>(
    empresa?.trib_estabelecimentos.length
      ? [...empresa.trib_estabelecimentos].sort((a, b) => Number(b.matriz) - Number(a.matriz)).map((e) => ({ ...e, chave: e.id }))
      : [novoEstab(true)],
  )
  const [removidos, setRemovidos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const alterar = (chave: string, campos: Partial<EstabForm>) => setEstabs((l) => l.map((e) => (e.chave === chave ? { ...e, ...campos } : e)))

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const cnpjs = estabs.map((x) => x.cnpj.replace(/\D/g, ''))
    if (cnpjs.some((c) => c.length !== 14)) return setErro('Informe o CNPJ completo (14 dígitos) de todos os estabelecimentos.')
    if (new Set(cnpjs).size !== cnpjs.length) return setErro('Há CNPJs repetidos entre os estabelecimentos.')
    const raizes = new Set(cnpjs.map((c) => c.slice(0, 8)))
    if (raizes.size > 1) return setErro('Matriz e filiais devem ter a mesma raiz de CNPJ (8 primeiros dígitos).')
    const matriz = estabs.find((x) => x.matriz) ?? estabs[0]
    setSalvando(true)
    try {
      const id = await salvarEmpresa(
        {
          id: empresa?.id,
          razao_social: razao.trim(),
          cnpj: matriz.cnpj.replace(/\D/g, ''),
          regime_atual: regime,
          cnae: cnae.trim() || null,
          observacoes: obs.trim() || null,
          parametros: { ...(empresa?.parametros ?? {}), anexo, anexoServicos, inicioAtividade: inicio },
        },
        estabs.map(({ chave, ...x }) => ({ ...x, cnpj: x.cnpj.replace(/\D/g, ''), nome: x.nome.trim() || razao.trim(), matriz: chave === matriz.chave })),
        removidos,
      )
      onSalvo(id)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      title={empresa ? 'Editar empresa' : 'Nova empresa'}
      subtitulo="Cadastre a matriz e todas as filiais — no Simples Nacional a apuração é única (mesmo PGDAS-D)."
      onClose={onClose}
      largura="max-w-4xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-empresa" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-empresa" onSubmit={salvar} className="space-y-4">
        <div className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 sm:grid-cols-6">
          <Field label="Razão social" className="sm:col-span-4">
            <input className="input" value={razao} onChange={(e) => setRazao(e.target.value)} required />
          </Field>
          <Field label="Regime tributário atual" className="sm:col-span-2">
            <Select
              value={regime}
              onChange={(v) => setRegime(v as RegimeAtual)}
              opcoes={[
                { value: 'simples', label: 'Simples Nacional' },
                { value: 'presumido', label: 'Lucro Presumido' },
                { value: 'real', label: 'Lucro Real' },
              ]}
            />
          </Field>
          <Field label="Anexo do Simples (mercadorias)" className="sm:col-span-2">
            <Select value={anexo} onChange={(v) => setAnexo(v as Anexo)} opcoes={(['I', 'II'] as Anexo[]).map((a) => ({ value: a, label: ANEXOS_SIMPLES[a].nome }))} />
          </Field>
          <Field label="Anexo do Simples (serviços)" className="sm:col-span-2">
            <Select value={anexoServicos} onChange={(v) => setAnexoServicos(v as Anexo)} opcoes={(['III', 'IV', 'V'] as Anexo[]).map((a) => ({ value: a, label: ANEXOS_SIMPLES[a].nome }))} />
          </Field>
          <Field label="CNAE principal" className="sm:col-span-1">
            <input className="input" value={cnae} onChange={(e) => setCnae(e.target.value)} placeholder="4789-0/99" />
          </Field>
          <Field label="Início de atividade" className="sm:col-span-1">
            <input className="input" type="month" value={inicio} onChange={(e) => setInicio(e.target.value)} title="Usado para proporcionalizar o RBT12 nos primeiros 12 meses" />
          </Field>
          <Field label="Observações" className="sm:col-span-6">
            <textarea className="input min-h-16" value={obs} onChange={(e) => setObs(e.target.value)} />
          </Field>
        </div>

        <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/70">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Building2 className="h-4 w-4 text-brand-600" />
              Estabelecimentos
            </h3>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEstabs((l) => [...l, novoEstab(false)])}>
              <Plus className="h-3.5 w-3.5" />
              Adicionar filial
            </button>
          </div>
          <div className="space-y-3">
            {estabs.map((e) => (
              <div key={e.chave} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70 sm:grid-cols-12">
                <Field label="CNPJ" className="sm:col-span-3">
                  <input className="input" value={mascaraCnpj(e.cnpj)} onChange={(ev) => alterar(e.chave, { cnpj: ev.target.value })} placeholder="00.000.000/0000-00" required />
                </Field>
                <Field label="Nome / identificação" className="sm:col-span-3">
                  <input className="input" value={e.nome} onChange={(ev) => alterar(e.chave, { nome: ev.target.value })} placeholder={e.matriz ? 'Matriz' : 'Filial'} />
                </Field>
                <Field label="UF" className="sm:col-span-1">
                  <Select value={e.uf} onChange={(v) => alterar(e.chave, { uf: v })} opcoes={UFS} />
                </Field>
                <Field label="Município" className="sm:col-span-2">
                  <input className="input" value={e.municipio ?? ''} onChange={(ev) => alterar(e.chave, { municipio: ev.target.value })} />
                </Field>
                <Field label="ICMS interno %" className="sm:col-span-1">
                  <input
                    className="input"
                    type="number"
                    step="0.01"
                    value={e.aliquota_icms ?? ''}
                    placeholder={String(ICMS_INTERNO_UF[e.uf] ?? 18)}
                    onChange={(ev) => alterar(e.chave, { aliquota_icms: ev.target.value === '' ? null : Number(ev.target.value) })}
                    title="Alíquota modal da UF — deixe em branco para usar o padrão"
                  />
                </Field>
                <div className="flex gap-1 sm:col-span-2 sm:justify-end">
                  <button
                    type="button"
                    className={`btn btn-sm ${e.matriz ? 'bg-amber-100 text-amber-700' : 'text-slate-500 hover:bg-slate-100'}`}
                    onClick={() => setEstabs((l) => l.map((x) => ({ ...x, matriz: x.chave === e.chave })))}
                    title="Marcar como matriz"
                  >
                    <Star className="h-3.5 w-3.5" />
                    {e.matriz ? 'Matriz' : 'Filial'}
                  </button>
                  {estabs.length > 1 && (
                    <button
                      type="button"
                      className="icon-btn hover:text-rose-600"
                      title="Remover"
                      onClick={() => {
                        if (e.id && !confirm('Remover este estabelecimento? Os movimentos importados dele também serão excluídos.')) return
                        if (e.id) setRemovidos((r) => [...r, e.id!])
                        setEstabs((l) => l.filter((x) => x.chave !== e.chave))
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        {erro && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}
      </form>
    </Modal>
  )
}
