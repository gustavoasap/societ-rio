import { useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, Building2, CheckCircle2, Landmark, Loader2, Plus, Search, Star, Trash2 } from 'lucide-react'
import { Field, Modal, Select } from '../../components/ui'
import { formatarData, mascaraCnpj } from '../../lib/format'
import { ANEXOS_SIMPLES, ICMS_INTERNO_UF, UFS, type Anexo } from '../engine/tabelas'
import { comPadrao, type BeneficioIcms, type Estabelecimento, type RegimeAtual } from '../engine/tipos'
import { salvarEmpresa, type EmpresaComEstab } from '../dados'
import { anexoSugerido, cnpjValido, consultarCnpj, regimeSugerido, type DadosCnpj } from '../receita'

type EstabForm = Omit<Estabelecimento, 'id'> & { id?: string; chave: string }

type Consulta = { status: 'carregando' } | { status: 'ok'; dados: DadosCnpj } | { status: 'erro'; mensagem: string }

const NOME_REGIME: Record<RegimeAtual, string> = { simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' }

const novoEstab = (matriz: boolean): EstabForm => ({ chave: crypto.randomUUID(), cnpj: '', nome: '', matriz, uf: 'SP', municipio: '', aliquota_icms: null, beneficio_icms: null })

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

  const [consultas, setConsultas] = useState<Record<string, Consulta>>({})
  const consultados = useRef<Record<string, string>>({}) // chave do estabelecimento -> último CNPJ consultado

  const alterar = (chave: string, campos: Partial<EstabForm>) => setEstabs((l) => l.map((e) => (e.chave === chave ? { ...e, ...campos } : e)))

  /** Busca o CNPJ na base pública da Receita e preenche o estabelecimento (e a empresa, quando é a matriz). */
  async function buscarCnpj(chave: string, cnpj: string) {
    const c = cnpj.replace(/\D/g, '')
    consultados.current[chave] = c
    setConsultas((x) => ({ ...x, [chave]: { status: 'carregando' } }))
    try {
      const d = await consultarCnpj(c)
      if (consultados.current[chave] !== c) return // o CNPJ mudou durante a consulta
      setConsultas((x) => ({ ...x, [chave]: { status: 'ok', dados: d } }))
      setEstabs((l) =>
        l.map((e) => {
          if (e.chave === chave)
            return {
              ...e,
              uf: d.uf || e.uf,
              municipio: d.municipio || e.municipio,
              nome: e.nome.trim() || d.nomeFantasia || (d.matriz ? 'Matriz' : `Filial ${d.municipio}`.trim()),
              matriz: d.matriz ? true : e.matriz,
            }
          return d.matriz ? { ...e, matriz: false } : e
        }),
      )
      if (d.matriz) {
        setRazao((r) => r.trim() || d.razaoSocial)
        setCnae((v) => v.trim() || d.cnae)
        setInicio((v) => v || (d.abertura ? d.abertura.slice(0, 7) : ''))
        // regime e anexo só são sugeridos no cadastro novo; na edição ficam como o contador definiu
        if (!empresa) {
          const r = regimeSugerido(d)
          if (r) setRegime(r)
          const a = anexoSugerido(d.cnae)
          if (a) setAnexo(a)
        }
      }
    } catch (e) {
      if (consultados.current[chave] !== c) return
      setConsultas((x) => ({ ...x, [chave]: { status: 'erro', mensagem: (e as Error).message } }))
    }
  }

  function digitarCnpj(chave: string, valor: string) {
    alterar(chave, { cnpj: valor })
    const c = valor.replace(/\D/g, '')
    if (c.length === 14 && cnpjValido(c) && consultados.current[chave] !== c) buscarCnpj(chave, c)
  }

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
      subtitulo="Digite o CNPJ da matriz e das filiais: os dados vêm da Receita Federal. No Simples Nacional a apuração é única (mesmo PGDAS-D)."
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
            <input className="input" value={razao} onChange={(e) => setRazao(e.target.value)} placeholder="Preenchida ao digitar o CNPJ da matriz" required />
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

        {(() => {
          const m = estabs.find((x) => x.matriz)
          const c = m ? consultas[m.chave] : undefined
          return c?.status === 'ok' ? <DadosReceita d={c.dados} razao={razao} regime={regime} novo={!empresa} onUsarRazao={() => setRazao(c.dados.razaoSocial)} /> : null
        })()}

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
                <Field label="CNPJ" className="sm:col-span-5">
                  <div className="flex gap-1.5">
                    <input className="input" value={mascaraCnpj(e.cnpj)} onChange={(ev) => digitarCnpj(e.chave, ev.target.value)} placeholder="00.000.000/0000-00" required />
                    <button
                      type="button"
                      className="btn-secondary btn-sm shrink-0 px-2.5"
                      title="Buscar dados na Receita Federal"
                      disabled={consultas[e.chave]?.status === 'carregando' || e.cnpj.replace(/\D/g, '').length !== 14}
                      onClick={() => buscarCnpj(e.chave, e.cnpj)}
                    >
                      {consultas[e.chave]?.status === 'carregando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>
                <Field label="Nome / identificação" className="sm:col-span-5">
                  <input className="input" value={e.nome} onChange={(ev) => alterar(e.chave, { nome: ev.target.value })} placeholder={e.matriz ? 'Matriz' : 'Filial'} />
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
                <Field label="UF" className="sm:col-span-2">
                  <Select value={e.uf} onChange={(v) => alterar(e.chave, { uf: v })} opcoes={UFS} />
                </Field>
                <Field label="Município" className="sm:col-span-6">
                  <input className="input" value={e.municipio ?? ''} onChange={(ev) => alterar(e.chave, { municipio: ev.target.value })} />
                </Field>
                <Field label="ICMS interno %" className="sm:col-span-4">
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
                <StatusConsulta consulta={consultas[e.chave]} cnpj={e.cnpj} />
                <RegimeEspecial valor={e.beneficio_icms ?? null} onChange={(b) => alterar(e.chave, { beneficio_icms: b })} />
              </div>
            ))}
          </div>
        </div>
        {erro && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}
      </form>
    </Modal>
  )
}

function StatusConsulta({ consulta, cnpj }: { consulta: Consulta | undefined; cnpj: string }) {
  const c = cnpj.replace(/\D/g, '')
  if (!consulta) {
    if (c.length === 14 && !cnpjValido(c)) return <p className="text-xs font-medium text-rose-600 sm:col-span-12">CNPJ inválido: confira os dígitos verificadores.</p>
    return null
  }
  if (consulta.status === 'carregando') return <p className="text-xs text-slate-500 sm:col-span-12">Consultando a Receita Federal...</p>
  if (consulta.status === 'erro') return <p className="text-xs font-medium text-rose-600 sm:col-span-12">{consulta.mensagem}</p>
  const d = consulta.dados
  const ativa = d.situacao === 'ATIVA'
  return (
    <p className={`flex flex-wrap items-center gap-x-2 text-xs sm:col-span-12 ${ativa ? 'text-emerald-700' : 'font-semibold text-rose-600'}`}>
      {ativa ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      <span>
        {d.razaoSocial} · {d.matriz ? 'Matriz' : 'Filial'} · {d.municipio}/{d.uf} · Situação: {d.situacao || '—'}
        {!ativa && ' — atenção: CNPJ não está ativo'}
      </span>
    </p>
  )
}

function DadosReceita({ d, razao, regime, novo, onUsarRazao }: { d: DadosCnpj; razao: string; regime: RegimeAtual; novo: boolean; onUsarRazao: () => void }) {
  const sugerido = regimeSugerido(d)
  const linha = (rotulo: string, valor: string) => (
    <div>
      <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{rotulo}</dt>
      <dd className="text-sm font-medium text-slate-800">{valor || '—'}</dd>
    </div>
  )
  const simples = d.simples
    ? d.simples.optante
      ? `Optante desde ${formatarData(d.simples.desde)}`
      : d.simples.excluidoEm
        ? `Não optante (excluído em ${formatarData(d.simples.excluidoEm)})`
        : 'Não optante'
    : 'Sem informação'
  return (
    <div className="rounded-2xl bg-sky-50/70 p-5 ring-1 ring-sky-200">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-bold text-sky-900">
        <Landmark className="h-4 w-4" />
        Dados da Receita Federal
        <span className="text-xs font-normal text-sky-700">— {d.fonte}</span>
      </h3>
      <dl className="grid gap-3 sm:grid-cols-4">
        {linha('Razão social', d.razaoSocial)}
        {linha('Nome fantasia', d.nomeFantasia)}
        {linha('Situação cadastral', d.situacao)}
        {linha('Início de atividade', formatarData(d.abertura))}
        {linha('CNAE principal', d.cnae ? `${d.cnae} — ${d.cnaeDescricao}` : '')}
        {linha('Natureza jurídica', d.naturezaJuridica)}
        {linha('Porte', d.porte)}
        {linha('Simples Nacional', simples)}
        {d.mei?.optante && linha('MEI', `Optante desde ${formatarData(d.mei.desde)}`)}
        {d.regimes.length > 0 &&
          linha(
            'Forma de tributação declarada',
            d.regimes
              .slice(-3)
              .map((r) => `${r.ano}: ${r.forma.toLowerCase()}`)
              .join(' · '),
          )}
      </dl>
      <div className="mt-3 space-y-1 text-xs text-sky-900">
        {razao.trim() && razao.trim().toUpperCase() !== d.razaoSocial.toUpperCase() && (
          <p>
            A razão social digitada é diferente da Receita.{' '}
            <button type="button" className="cursor-pointer font-semibold underline" onClick={onUsarRazao}>
              Usar “{d.razaoSocial}”
            </button>
          </p>
        )}
        {sugerido && sugerido !== regime && (
          <p className="font-semibold text-amber-700">
            Pelos dados públicos a empresa está no {NOME_REGIME[sugerido]}, mas o cadastro está como {NOME_REGIME[regime]}. Confira.
          </p>
        )}
        {!sugerido && <p>Não é optante do Simples e a fonte não trouxe a forma de tributação declarada: escolha entre Lucro Presumido e Lucro Real.</p>}
        {novo && sugerido && sugerido === regime && <p>Regime atual preenchido pelos dados da Receita ({NOME_REGIME[sugerido]}).</p>}
        {d.mei?.optante && <p className="font-semibold text-amber-700">Empresa enquadrada como MEI (SIMEI): o limite e o recolhimento são diferentes do Simples Nacional.</p>}
      </div>
    </div>
  )
}

/** Regime especial de ICMS do estabelecimento: carga efetiva nas saídas e (normalmente) sem créditos das entradas. */
function RegimeEspecial({ valor, onChange }: { valor: BeneficioIcms | null; onChange: (b: BeneficioIcms | null) => void }) {
  const b = valor ?? { ativo: false, descricao: '', cargaInterna: null, cargaInterestadual: null, aproveitaCreditos: false }
  const mudar = (c: Partial<BeneficioIcms>) => onChange({ ...b, ...c })
  const num = (v: string) => (v === '' ? null : Number(v))
  return (
    <div className="sm:col-span-12">
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" checked={b.ativo} onChange={(ev) => mudar({ ativo: ev.target.checked })} />
        Regime especial de ICMS (carga efetiva / crédito presumido)
      </label>
      {b.ativo && (
        <div className="mt-2 grid gap-3 rounded-lg bg-white p-3 ring-1 ring-amber-200 sm:grid-cols-12">
          <Field label="Descrição (ato concessivo)" className="sm:col-span-4">
            <input className="input" value={b.descricao} onChange={(ev) => mudar({ descricao: ev.target.value })} placeholder="Ex.: TTD 409/SC — crédito presumido" />
          </Field>
          <Field label="Carga nas vendas internas %" className="sm:col-span-2">
            <input className="input" type="number" step="0.01" value={b.cargaInterna ?? ''} placeholder="alíquota normal" onChange={(ev) => mudar({ cargaInterna: num(ev.target.value) })} />
          </Field>
          <Field label="Carga nas interestaduais %" className="sm:col-span-2">
            <input className="input" type="number" step="0.01" value={b.cargaInterestadual ?? ''} placeholder="4/7/12%" onChange={(ev) => mudar({ cargaInterestadual: num(ev.target.value) })} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700 sm:col-span-4">
            <input type="checkbox" checked={b.aproveitaCreditos} onChange={(ev) => mudar({ aproveitaCreditos: ev.target.checked })} />
            <span>
              Aproveita os créditos das entradas
              <span className="block text-xs text-slate-500">Desmarcado: o crédito presumido substitui os créditos — o ICMS das compras vira custo.</span>
            </span>
          </label>
          <p className="text-xs text-slate-500 sm:col-span-12">
            Vale para Presumido e Real (e para o Simples acima do sublimite). O DIFAL das vendas a não contribuinte continua pela alíquota interestadual nominal.
          </p>
        </div>
      )}
    </div>
  )
}
