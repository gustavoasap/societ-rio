import { useRef, useState } from 'react'
import { Building2, FileText, FolderSearch, Plus, Trash2, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { buscarCepPartes, mascaraCep, mascaraCpf } from '../lib/format'
import { consultarCnpj } from '../lib/cnpj'
import { consultarSerpro } from '../lib/cnpjSerpro'
import { Field, Modal, Select } from '../components/ui'
import { CORES_RACA, QUALIFICACOES, type Socio } from '../types'
import { textoDoArquivo, extrairSocios } from './contratoSocial'
import { TIPOS_DOCUMENTO, cpfValido, deProcesso, mesclarSocios, socioVazio } from './socios'
import type { SocioCadastro } from './tipos'

const digitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')
const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ')
const TIPO_PROC: Record<string, string> = { abertura: 'Abertura', alteracao: 'Alteração', baixa: 'Baixa' }

interface ProcessoAchado {
  id: string
  tipo: string
  status: string
  data_inicio: string | null
  razao_social: string | null
  cnpj: string | null
  socios: Partial<Socio>[] | null
}

/** Completa rua, bairro, cidade e UF pelo CEP (só o que estiver vazio). */
async function completarPeloCep(lista: SocioCadastro[]) {
  return Promise.all(
    lista.map(async (s) => {
      if (digitos(s.cep).length !== 8 || (s.rua && s.bairro && s.cidade && s.uf)) return s
      const e = await buscarCepPartes(s.cep ?? '')
      return e ? { ...s, rua: s.rua || e.rua, bairro: s.bairro || e.bairro, cidade: s.cidade || e.cidade, uf: s.uf || e.uf } : s
    }),
  )
}

/**
 * Sócios da empresa (nome, CPF, endereço, cor/raça e documento). Pode trazer os dados da Receita Federal,
 * do Contrato Social (PDF/Word) ou de um processo em Processos Societários — sempre completando só o que está vazio.
 */
export function SociosEditor({
  socios,
  onChange,
  cnpj,
  razaoSocial,
}: {
  socios: SocioCadastro[]
  onChange: (s: SocioCadastro[]) => void
  cnpj?: string | null
  razaoSocial?: string | null
}) {
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [procurando, setProcurando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  const alterar = (i: number, campo: keyof SocioCadastro, v: string) => onChange(socios.map((s, j) => (j === i ? { ...s, [campo]: v } : s)))

  async function juntar(novos: SocioCadastro[], origem: string) {
    if (!novos.length) {
      setErro(`Nenhum sócio encontrado em ${origem}.`)
      return
    }
    const completos = await completarPeloCep(novos)
    const antes = socios.length
    const r = mesclarSocios(
      socios.filter((s) => s.nome.trim() || digitos(s.cpf)),
      completos,
    )
    onChange(r)
    const incluidos = r.length - socios.filter((s) => s.nome.trim() || digitos(s.cpf)).length
    setAviso(
      `${origem}: ${novos.length} sócio(s) encontrado(s)${incluidos > 0 ? `, ${incluidos} incluído(s)` : ''}${antes ? '; nos já existentes, só os campos vazios foram completados' : ''}. Confira antes de salvar.`,
    )
  }

  async function daReceita() {
    const c = digitos(cnpj)
    if (c.length !== 14) return setErro('Informe o CNPJ do cliente para buscar os sócios na Receita.')
    setErro(null)
    setAviso(null)
    setOcupado('receita')
    try {
      const d = await consultarCnpj(c, undefined, { serpro: consultarSerpro })
      await juntar(
        d.socios.map((s) => ({ ...socioVazio(), nome: s.nome.trim().toUpperCase(), qualificacao: s.qualificacao ?? '' })),
        'Receita Federal',
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(null)
    }
  }

  async function doContrato(f: File) {
    setErro(null)
    setAviso(null)
    setOcupado('contrato')
    try {
      const texto = await textoDoArquivo(f)
      if (texto.replace(/\s/g, '').length < 50)
        throw new Error('Não encontrei texto no arquivo. Ele parece ser uma imagem escaneada; envie o PDF original (com texto) ou o Word.')
      await juntar(extrairSocios(texto), 'Contrato Social')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(null)
      if (arquivo.current) arquivo.current.value = ''
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={daReceita}
          disabled={!!ocupado}
          title="Nome completo e qualificação dos sócios na Receita"
        >
          <Building2 className="h-3.5 w-3.5" />
          {ocupado === 'receita' ? 'Consultando...' : 'Receita Federal'}
        </button>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => arquivo.current?.click()}
          disabled={!!ocupado}
          title="Lê nome, CPF, documento e endereço do primeiro parágrafo do contrato"
        >
          <FileText className="h-3.5 w-3.5" />
          {ocupado === 'contrato' ? 'Lendo contrato...' : 'Contrato Social (PDF/Word)'}
        </button>
        <input
          ref={arquivo}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && doContrato(e.target.files[0])}
        />
        <button type="button" className="btn-secondary btn-sm" onClick={() => setProcurando(true)} disabled={!!ocupado}>
          <FolderSearch className="h-3.5 w-3.5" />
          Processos Societários
        </button>
        <span className="flex-1" />
        <button type="button" className="btn-secondary btn-sm" onClick={() => onChange([...socios, socioVazio()])}>
          <Plus className="h-3.5 w-3.5" />
          Adicionar sócio
        </button>
      </div>
      {aviso && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{aviso}</p>}
      {erro && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600">{erro}</p>}

      <div className="mt-3 space-y-3">
        {socios.map((s, i) => {
          const cpfRuim = digitos(s.cpf).length > 0 && !cpfValido(s.cpf ?? '')
          return (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-violet-700 uppercase">
                  <UserRound className="h-3.5 w-3.5" />
                  Sócio {i + 1}
                  {s.nome ? ` — ${s.nome}` : ''}
                </span>
                <button
                  type="button"
                  className="icon-btn h-7 w-7 hover:text-rose-600"
                  onClick={() => onChange(socios.filter((_, j) => j !== i))}
                  title="Remover sócio"
                  aria-label={`Remover sócio ${i + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-12">
                <Field label="Nome completo" className="col-span-2 sm:col-span-6">
                  <input className="input" value={s.nome} onChange={(e) => alterar(i, 'nome', e.target.value.toUpperCase())} />
                </Field>
                <Field label={cpfRuim ? 'CPF (inválido)' : 'CPF'} className="col-span-1 sm:col-span-3">
                  <input
                    className={`input font-mono ${cpfRuim ? 'ring-2 ring-rose-300' : ''}`}
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={s.cpf ?? ''}
                    onChange={(e) => alterar(i, 'cpf', mascaraCpf(e.target.value))}
                  />
                </Field>
                <Field label="Qualificação" className="col-span-1 sm:col-span-3">
                  <input
                    className="input"
                    list="qualificacoes-socio"
                    value={s.qualificacao ?? ''}
                    onChange={(e) => alterar(i, 'qualificacao', e.target.value)}
                  />
                </Field>
                <Field label="CEP" className="col-span-1 sm:col-span-2">
                  <input
                    className="input font-mono"
                    inputMode="numeric"
                    placeholder="00000-000"
                    value={s.cep ?? ''}
                    onChange={(e) => alterar(i, 'cep', mascaraCep(e.target.value))}
                    onBlur={async () => {
                      const [c] = await completarPeloCep([s])
                      if (c !== s) onChange(socios.map((x, j) => (j === i ? c : x)))
                    }}
                  />
                </Field>
                <Field label="Rua" className="col-span-2 sm:col-span-5">
                  <input className="input" value={s.rua ?? ''} onChange={(e) => alterar(i, 'rua', e.target.value)} />
                </Field>
                <Field label="Número" className="col-span-1 sm:col-span-2">
                  <input className="input" value={s.numero ?? ''} onChange={(e) => alterar(i, 'numero', e.target.value)} />
                </Field>
                <Field label="Complemento" className="col-span-1 sm:col-span-3">
                  <input className="input" value={s.complemento ?? ''} onChange={(e) => alterar(i, 'complemento', e.target.value)} />
                </Field>
                <Field label="Bairro" className="col-span-1 sm:col-span-3">
                  <input className="input" value={s.bairro ?? ''} onChange={(e) => alterar(i, 'bairro', e.target.value)} />
                </Field>
                <Field label="Cidade" className="col-span-1 sm:col-span-4">
                  <input className="input" value={s.cidade ?? ''} onChange={(e) => alterar(i, 'cidade', e.target.value)} />
                </Field>
                <Field label="Estado" className="col-span-1 sm:col-span-2">
                  <Select value={s.uf ?? ''} onChange={(v) => alterar(i, 'uf', v)} opcoes={UFS} vazio="--" />
                </Field>
                <Field label="Cor/Raça" className="col-span-1 sm:col-span-3">
                  <Select value={s.cor_raca ?? ''} onChange={(v) => alterar(i, 'cor_raca', v)} opcoes={CORES_RACA} vazio="Selecione" />
                </Field>
                <Field label="Documento" className="col-span-1 sm:col-span-3">
                  <Select value={s.doc_tipo ?? ''} onChange={(v) => alterar(i, 'doc_tipo', v)} opcoes={TIPOS_DOCUMENTO} vazio="Selecione" />
                </Field>
                <Field label="Número do documento" className="col-span-1 sm:col-span-5">
                  <input className="input font-mono" value={s.doc_numero ?? ''} onChange={(e) => alterar(i, 'doc_numero', e.target.value)} />
                </Field>
                <Field label="Órgão emissor" className="col-span-2 sm:col-span-4">
                  <input
                    className="input"
                    placeholder="Ex.: SSP/SP"
                    value={s.doc_orgao ?? ''}
                    onChange={(e) => alterar(i, 'doc_orgao', e.target.value.toUpperCase())}
                  />
                </Field>
              </div>
            </div>
          )
        })}
        {!socios.length && (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-400">
            Nenhum sócio. Traga da Receita, do Contrato Social ou de Processos Societários, ou clique em “Adicionar sócio”.
          </p>
        )}
      </div>
      <datalist id="qualificacoes-socio">
        {[...QUALIFICACOES, 'Titular', 'Empresário'].map((q) => (
          <option key={q} value={q} />
        ))}
      </datalist>

      {procurando && (
        <BuscarProcesso
          cnpj={cnpj}
          razaoSocial={razaoSocial}
          onClose={() => setProcurando(false)}
          onEscolher={(p) => {
            setProcurando(false)
            juntar((p.socios ?? []).filter((x) => x.nome?.trim()).map(deProcesso), `Processo de ${TIPO_PROC[p.tipo] ?? p.tipo}`)
          }}
        />
      )}
    </div>
  )
}

/** Procura processos societários pelo CNPJ ou pelo nome da empresa. */
function BuscarProcesso({
  cnpj,
  razaoSocial,
  onClose,
  onEscolher,
}: {
  cnpj?: string | null
  razaoSocial?: string | null
  onClose: () => void
  onEscolher: (p: ProcessoAchado) => void
}) {
  const [termo, setTermo] = useState(() =>
    (razaoSocial ?? '')
      .replace(/\b(LTDA|EIRELI|ME|EPP|S\/?A|SLU)\b\.?/gi, '')
      .replace(/[^\p{L}\p{N}&\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  const [lista, setLista] = useState<ProcessoAchado[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscar() {
    setCarregando(true)
    setErro(null)
    const campos = 'id, tipo, status, data_inicio, razao_social, cnpj, socios'
    const c = digitos(cnpj)
    const t = termo.replace(/[%,()]/g, ' ').trim()
    const [porCnpj, porNome] = await Promise.all([
      c.length === 14
        ? supabase
            .from('soc_processos')
            .select(campos)
            .in('cnpj', [c, c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')])
        : Promise.resolve({ data: [], error: null }),
      t.length >= 2 ? supabase.from('soc_processos').select(campos).ilike('razao_social', `%${t}%`).limit(30) : Promise.resolve({ data: [], error: null }),
    ])
    setCarregando(false)
    if (porCnpj.error || porNome.error) return setErro((porCnpj.error ?? porNome.error)!.message)
    const todos = new Map<string, ProcessoAchado>()
    for (const p of [...((porCnpj.data as ProcessoAchado[]) ?? []), ...((porNome.data as ProcessoAchado[]) ?? [])]) todos.set(p.id, p)
    setLista([...todos.values()].sort((a, b) => (b.data_inicio ?? '').localeCompare(a.data_inicio ?? '')))
  }

  return (
    <Modal
      title="Trazer sócios de Processos Societários"
      subtitulo="Procure pelo nome da empresa (ou pelo CNPJ do cliente)"
      onClose={onClose}
      largura="max-w-3xl"
    >
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              buscar()
            }
          }}
          placeholder="Nome da empresa"
          autoFocus
        />
        <button type="button" className="btn-primary" onClick={buscar} disabled={carregando}>
          <FolderSearch className="h-4 w-4" />
          {carregando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>
      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{erro}</p>}
      {lista && (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl bg-white ring-1 ring-slate-200/70">
          {lista.map((p) => {
            const n = (p.socios ?? []).filter((s) => s.nome?.trim()).length
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                <div>
                  <div className="font-semibold text-slate-800">{(p.razao_social ?? 'Sem razão social').toUpperCase()}</div>
                  <div className="text-xs text-slate-500">
                    {TIPO_PROC[p.tipo] ?? p.tipo}
                    {p.data_inicio ? ` de ${p.data_inicio.split('-').reverse().join('/')}` : ''} · {n} sócio(s)
                    {n
                      ? `: ${(p.socios ?? [])
                          .map((s) => s.nome)
                          .filter(Boolean)
                          .join(', ')}`
                      : ''}
                  </div>
                </div>
                <button type="button" className="btn-secondary btn-sm" disabled={!n} onClick={() => onEscolher(p)}>
                  Usar estes sócios
                </button>
              </div>
            )
          })}
          {!lista.length && <p className="p-6 text-center text-sm text-slate-400">Nenhum processo encontrado.</p>}
        </div>
      )}
    </Modal>
  )
}
