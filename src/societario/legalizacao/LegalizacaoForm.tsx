import { useEffect, useState } from 'react'
import { BadgeCheck, CalendarClock, FileSignature, FileText, Landmark, MapPin, Receipt, Save, StickyNote } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData, mascaraCnpj } from '../../lib/format'
import { Badge, Field, Modal, Section, Select } from '../../components/ui'
import { Documentos } from './Documentos'
import {
  STATUS_IM,
  STATUS_LICENCIAMENTO,
  STATUS_PROCURACAO,
  STATUS_TFE,
  UFS,
  anosTfe,
  situacaoValidade,
  type ClienteBase,
  type Legalizacao,
  type StatusTfe,
  type Tfe,
} from './tipos'

// Municípios do IBGE por UF (carregados uma vez por estado, para sugerir o nome certo)
const cacheMunicipios = new Map<string, string[]>()
async function municipiosDe(uf: string): Promise<string[]> {
  if (cacheMunicipios.has(uf)) return cacheMunicipios.get(uf)!
  try {
    const r = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`)
    const lista: string[] = ((await r.json()) as { nome: string }[]).map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    cacheMunicipios.set(uf, lista)
    return lista
  } catch {
    return []
  }
}

export function LegalizacaoForm({
  cliente,
  legalizacao,
  tfes,
  onClose,
  onSaved,
}: {
  cliente: ClienteBase
  legalizacao: Legalizacao
  tfes: Tfe[]
  onClose: () => void
  onSaved: () => void
}) {
  const [l, setL] = useState<Legalizacao>(legalizacao)
  const [tfe, setTfe] = useState<Record<number, StatusTfe>>(() => Object.fromEntries(tfes.map((t) => [t.ano, t.status])))
  const [anosExtras, setAnosExtras] = useState<number[]>([])
  const [municipios, setMunicipios] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const set = <K extends keyof Legalizacao>(k: K, v: Legalizacao[K]) => setL((p) => ({ ...p, [k]: v }))

  useEffect(() => {
    if (!l.ie_uf) return setMunicipios([])
    let ativo = true
    municipiosDe(l.ie_uf).then((m) => ativo && setMunicipios(m))
    return () => {
      ativo = false
    }
  }, [l.ie_uf])

  const anos = anosTfe(cliente.data_abertura, [...tfes.map((t) => t.ano), ...anosExtras])
  const validade = situacaoValidade(l.licenciamento_validade)

  async function salvar() {
    setErro(null)
    setSalvando(true)
    const limpo = (v: string | null) => (v && v.trim() ? v.trim() : null)
    const { error } = await supabase.from('soc_legalizacao').upsert({
      ...l,
      ie_numero: limpo(l.ie_numero),
      im_municipio: limpo(l.im_municipio),
      im_numero: limpo(l.im_numero),
      observacoes: limpo(l.observacoes),
    })
    // Grava só os anos de TFE/TFLF que foram mexidos ou já existiam
    const linhas = Object.entries(tfe).map(([ano, status]) => ({ cliente_id: cliente.id, ano: Number(ano), status }))
    const resTfe = linhas.length ? await supabase.from('soc_legalizacao_tfe').upsert(linhas) : { error: null }
    setSalvando(false)
    const e = error ?? resTfe.error
    if (e) return setErro(e.message)
    onSaved()
  }

  return (
    <Modal
      title={cliente.razao_social}
      subtitulo={[cliente.cnpj ? mascaraCnpj(cliente.cnpj) : 'CNPJ não informado', cliente.data_abertura ? `aberta em ${formatarData(cliente.data_abertura)}` : null]
        .filter(Boolean)
        .join(' · ')}
      onClose={onClose}
      largura="max-w-4xl"
      footer={
        <>
          {erro && <span className="mr-auto self-center text-sm text-rose-600">{erro}</span>}
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <Section icone={FileSignature} cor="violet" title="Procuração">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={l.procuracao_status} onChange={(v) => set('procuracao_status', v as Legalizacao['procuracao_status'])} opcoes={STATUS_PROCURACAO} />
          </Field>
        </div>
      </Section>

      <Section icone={BadgeCheck} cor="emerald" title="Licenciamento">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <Select value={l.licenciamento_status} onChange={(v) => set('licenciamento_status', v as Legalizacao['licenciamento_status'])} opcoes={STATUS_LICENCIAMENTO} />
          </Field>
          <Field label="Data de validade">
            <div className="flex items-center gap-2">
              <input type="date" className="input" value={l.licenciamento_validade ?? ''} onChange={(e) => set('licenciamento_validade', e.target.value || null)} />
              {validade === 'vencida' && <Badge cor="vencida">Vencida</Badge>}
              {validade === 'vence_em_breve' && <Badge cor="vence_em_breve">Vence em até 30 dias</Badge>}
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <FileText className="h-3.5 w-3.5" />
            Documentos do licenciamento
          </div>
          <Documentos clienteId={cliente.id} />
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icone={Landmark} cor="sky" title="Inscrição Estadual">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Field label="Estado (UF)">
              <Select
                value={l.ie_uf ?? ''}
                onChange={(v) => set('ie_uf', v || null)}
                opcoes={UFS.map((u) => ({ value: u.sigla, label: `${u.sigla} - ${u.nome}` }))}
                vazio="Selecione"
              />
            </Field>
            <Field label="Número da IE">
              <input className="input font-mono" value={l.ie_numero ?? ''} onChange={(e) => set('ie_numero', e.target.value.toUpperCase())} />
            </Field>
          </div>
        </Section>

        <Section icone={MapPin} cor="violet" title="Inscrição Municipal">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Status" className="sm:col-span-2">
              <Select value={l.im_status} onChange={(v) => set('im_status', v as Legalizacao['im_status'])} opcoes={STATUS_IM} />
            </Field>
            <Field label={`Município${l.ie_uf ? ` (${l.ie_uf})` : ''}`}>
              <input
                className="input"
                list="municipios-legalizacao"
                value={l.im_municipio ?? ''}
                onChange={(e) => set('im_municipio', e.target.value)}
                placeholder={l.ie_uf ? 'Digite para buscar' : 'Escolha o estado na IE'}
              />
              <datalist id="municipios-legalizacao">
                {municipios.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
            <Field label="Número da IM">
              <input className="input font-mono" value={l.im_numero ?? ''} onChange={(e) => set('im_numero', e.target.value.toUpperCase())} />
            </Field>
          </div>
        </Section>
      </div>

      <Section
        icone={Receipt}
        cor="amber"
        title="TFE / TFLF"
        actions={
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAnosExtras((a) => [...a, Math.min(...anos) - 1])}>
            <CalendarClock className="h-3.5 w-3.5" />
            Incluir ano anterior
          </button>
        }
      >
        <p className="mb-3 text-xs text-slate-500">
          {cliente.data_abertura
            ? `Os anos começam em ${cliente.data_abertura.slice(0, 4)}, ano de abertura da empresa na Base de Clientes.`
            : 'A empresa está sem data de abertura na Base de Clientes; por isso aparece só o ano atual. Use “Incluir ano anterior” se precisar.'}
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {anos.map((ano) => (
            <div key={ano} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2">
              <span className="w-12 shrink-0 text-center text-sm font-extrabold text-slate-700 tabular-nums">{ano}</span>
              <div className="min-w-0 flex-1">
                <Select
                  value={tfe[ano] ?? 'pendente_liberacao'}
                  onChange={(v) => setTfe((t) => ({ ...t, [ano]: v as StatusTfe }))}
                  opcoes={STATUS_TFE}
                  className="input py-1.5 text-sm"
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section icone={StickyNote} title="Observações">
        <textarea className="input min-h-20" value={l.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
      </Section>
    </Modal>
  )
}
