import { useState } from 'react'
import { Building2, ClipboardList, Layers, ListChecks, Plus, Save, Settings2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { REGEX_CNAE, REGEX_VIABILIDADE, buscarCep, listaCnaes, mascaraCep, mascaraCnae, mascaraCnpj, mascaraViabilidade } from '../lib/format'
import { CnaesInput } from './CnaesInput'
import {
  ACOMPANHAMENTO_POR_TIPO,
  ENQUADRAMENTOS,
  NATUREZAS_JURIDICAS,
  ORGAOS_REGISTRO,
  SOCIO_VAZIO,
  STATUS_PROCESSO,
  TIPOS,
  type BlocoCnae,
  type ObjetoSocial,
  type Parceiro,
  type Processo,
  type Socio,
  type TipoProcesso,
} from '../types'
import { SocioForm } from './SocioForm'
import { Field, Modal, Section, Select } from './ui'

type CampoNumerico = 'area_imovel' | 'area_estabelecimento' | 'area_terreno' | 'capital_social'
type Rascunho = Omit<Processo, 'id' | 'created_at' | 'updated_at' | CampoNumerico> & Record<CampoNumerico, string>

const NUMERICOS: CampoNumerico[] = ['area_imovel', 'area_estabelecimento', 'area_terreno', 'capital_social']

function hoje() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

function novoRascunho(tipo: TipoProcesso): Rascunho {
  return {
    tipo,
    status: 'pendente',
    data_inicio: hoje(),
    parceiro_id: null,
    cnpj: '',
    razao_social: '',
    responsavel: '',
    alteracao_descricao: '',
    municipio: '',
    natureza_juridica: '',
    orgao_registro: '',
    enquadramento: '',
    cnae_principal: '',
    cnaes_secundarios: '',
    objeto_social: '',
    bloco_cnae_id: null,
    tipo_unidade: 'produtiva',
    nome_fantasia: '',
    cep: '',
    endereco: '',
    complemento: '',
    area_imovel: '',
    area_estabelecimento: '',
    area_terreno: '',
    capital_social: '',
    socios: [{ ...SOCIO_VAZIO }],
    numero_viabilidade: '',
    numero_dbe: '',
    status_viabilidade: 'pendente',
    status_dbe: 'pendente',
    status_integrador: 'pendente',
    status_taxa: 'pendente',
    status_contrato_social: 'pendente_envio',
    status_registro_digital: 'pendente_envio',
    status_contrato_servicos: 'pendente_envio',
    status_documento_baixa: 'pendente',
    status_distrato: 'pendente_envio',
    status_declaracoes_baixa: 'pendente_envio',
    observacoes: '',
  }
}

function paraRascunho(p: Processo): Rascunho {
  const { id: _id, created_at: _c, updated_at: _u, ...resto } = p
  const r = { ...novoRascunho(p.tipo) } as Rascunho
  for (const [k, v] of Object.entries(resto)) {
    ;(r as Record<string, unknown>)[k] = v ?? (typeof (r as Record<string, unknown>)[k] === 'string' ? '' : v)
  }
  for (const k of NUMERICOS) r[k] = p[k] === null || p[k] === undefined ? '' : String(p[k]).replace('.', ',')
  r.socios = (p.socios ?? []).map((s) => ({ ...SOCIO_VAZIO, ...s }))
  if (r.socios.length === 0) r.socios = [{ ...SOCIO_VAZIO }]
  return r
}

function paraNumero(v: string): number | null {
  const limpo = v.replace(/\s|R\$/g, '').replace(/\./g, '').replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

export function ProcessoForm({
  processo,
  parceiros,
  onClose,
  onSaved,
  onGerenciarParceiros,
  blocos,
  objetos,
  onGerenciarModelos,
}: {
  processo: Processo | null
  parceiros: Parceiro[]
  onClose: () => void
  onSaved: () => void
  onGerenciarParceiros: () => void
  blocos: BlocoCnae[]
  objetos: ObjetoSocial[]
  onGerenciarModelos: () => void
}) {
  const [r, setR] = useState<Rascunho>(() => (processo ? paraRascunho(processo) : novoRascunho('abertura')))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)

  const set = <K extends keyof Rascunho>(k: K, v: Rascunho[K]) => setR((prev) => ({ ...prev, [k]: v }))
  const abertura = r.tipo === 'abertura'
  const baixa = r.tipo === 'baixa'
  const etapas = ACOMPANHAMENTO_POR_TIPO[r.tipo]
  const blocoAtual = blocos.find((b) => b.id === r.bloco_cnae_id)
  const secundarios = listaCnaes(r.cnaes_secundarios)
  const setSecundarios = (lista: string[]) => set('cnaes_secundarios', lista.join('\n'))

  function aplicarBloco(id: string) {
    const novo = blocos.find((b) => b.id === id)
    if (!novo) return set('bloco_cnae_id', null)
    setR((prev) => {
      const anterior = blocos.find((b) => b.id === prev.bloco_cnae_id)
      // Mantém os CNAEs extras (que não vieram do bloco anterior) e troca os do bloco
      const extras = listaCnaes(prev.cnaes_secundarios).filter((c) => !(anterior?.cnaes_secundarios ?? []).includes(c))
      const lista = [...novo.cnaes_secundarios, ...extras.filter((c) => !novo.cnaes_secundarios.includes(c))]
      const objetoDoBloco = objetos.find((o) => o.id === novo.objeto_social_id)?.texto
      const objetoAnterior = objetos.find((o) => o.id === anterior?.objeto_social_id)?.texto
      const podeTrocarObjeto = !prev.objeto_social || prev.objeto_social === objetoAnterior
      return {
        ...prev,
        bloco_cnae_id: novo.id,
        cnae_principal: novo.cnae_principal || prev.cnae_principal,
        cnaes_secundarios: lista.join('\n'),
        objeto_social: objetoDoBloco && podeTrocarObjeto ? objetoDoBloco : prev.objeto_social,
      }
    })
  }

  function usarObjeto(id: string) {
    const modelo = objetos.find((o) => o.id === id)
    if (!modelo) return
    if (r.objeto_social && r.objeto_social !== modelo.texto && !confirm('Substituir o objeto social atual pelo modelo selecionado?')) return
    set('objeto_social', modelo.texto)
  }

  const viabilidadeInvalida = !baixa && Boolean(r.numero_viabilidade) && !REGEX_VIABILIDADE.test(r.numero_viabilidade ?? '')

  function mudarTipo(tipo: TipoProcesso) {
    setR((prev) => {
      const novo = { ...prev, tipo }
      // Valores que não existem nas etapas do novo tipo voltam para a primeira opção
      for (const e of ACOMPANHAMENTO_POR_TIPO[tipo]) {
        if (!e.opcoes.some((o) => o.value === novo[e.campo])) novo[e.campo] = e.opcoes[0].value
      }
      return novo
    })
  }

  function setQuantidadeSocios(qtd: number) {
    setR((prev) => {
      const socios = prev.socios.slice(0, qtd)
      while (socios.length < qtd) socios.push({ ...SOCIO_VAZIO })
      return { ...prev, socios }
    })
  }

  function setSocio(i: number, s: Socio) {
    setR((prev) => ({ ...prev, socios: prev.socios.map((x, j) => (j === i ? s : x)) }))
  }

  async function aoSairDoCep() {
    setBuscandoCep(true)
    const res = await buscarCep(r.cep ?? '')
    setBuscandoCep(false)
    if (!res) return
    setR((prev) => ({
      ...prev,
      endereco: prev.endereco || res.endereco,
      municipio: prev.municipio || res.municipio,
    }))
  }

  async function salvar() {
    setErro(null)
    if (!r.razao_social?.trim()) {
      setErro('Informe a Razão Social.')
      return
    }
    if (abertura && r.cnae_principal && !REGEX_CNAE.test(r.cnae_principal)) {
      setErro('CNAE Principal deve ter 7 dígitos (ex.: 4713-0-02).')
      return
    }
    if (viabilidadeInvalida) {
      setErro('Número da Viabilidade deve ter 13 caracteres: 3 letras + 10 números (ex.: SPN2633893093).')
      return
    }
    const payload: Record<string, unknown> = { ...r }
    for (const k of NUMERICOS) payload[k] = paraNumero(r[k])
    for (const [k, v] of Object.entries(payload)) if (v === '') payload[k] = null
    payload.parceiro_id = r.parceiro_id || null
    payload.socios = abertura ? r.socios : []
    payload.data_inicio = r.data_inicio || hoje()

    setSalvando(true)
    const { error } = processo
      ? await supabase.from('soc_processos').update(payload).eq('id', processo.id)
      : await supabase.from('soc_processos').insert(payload)
    setSalvando(false)
    if (error) {
      setErro(error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal
      title={processo ? 'Editar processo' : 'Novo processo'}
      subtitulo={processo ? processo.razao_social : 'Preencha os dados do processo societário'}
      onClose={onClose}
      footer={
        <>
          {erro && <span className="mr-auto self-center text-sm text-red-600">{erro}</span>}
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            <Save className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar processo'}
          </button>
        </>
      }
    >
      <Section icone={ClipboardList} title="Processo">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Tipo de processo">
            <Select value={r.tipo} onChange={(v) => mudarTipo(v as TipoProcesso)} opcoes={TIPOS} />
          </Field>
          <Field label="Status do processo">
            <Select value={r.status} onChange={(v) => set('status', v as Rascunho['status'])} opcoes={STATUS_PROCESSO} />
          </Field>
          <Field label="Data de início">
            <input type="date" className="input" value={r.data_inicio} onChange={(e) => set('data_inicio', e.target.value)} />
          </Field>
          <Field label="Parceiro (indicação)">
            <div className="flex gap-1.5">
              <Select
                value={r.parceiro_id ?? ''}
                onChange={(v) => set('parceiro_id', v || null)}
                opcoes={parceiros.map((p) => ({ value: p.id, label: p.nome }))}
                vazio="Sem parceiro"
              />
              <button type="button" className="btn-secondary shrink-0 px-3" title="Cadastrar parceiros" onClick={onGerenciarParceiros}>
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </Field>
        </div>
      </Section>

      <Section icone={Building2} cor="sky" title={abertura ? 'Dados da empresa' : 'Identificação da empresa'}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={abertura ? 'CNPJ (quando liberado)' : 'Número do CNPJ'}>
            <input className="input" value={r.cnpj ?? ''} onChange={(e) => set('cnpj', mascaraCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
          </Field>
          <Field label="Razão Social" className={abertura ? 'sm:col-span-2' : 'sm:col-span-1 lg:col-span-2'}>
            <input className="input" value={r.razao_social ?? ''} onChange={(e) => set('razao_social', e.target.value)} />
          </Field>
          {abertura ? (
            <Field label="Nome Fantasia">
              <input className="input" value={r.nome_fantasia ?? ''} onChange={(e) => set('nome_fantasia', e.target.value)} />
            </Field>
          ) : (
            <Field label="Sócio / Responsável">
              <input className="input" value={r.responsavel ?? ''} onChange={(e) => set('responsavel', e.target.value)} />
            </Field>
          )}

          {r.tipo === 'alteracao' && (
            <Field label="Alteração que será realizada" className="sm:col-span-2 lg:col-span-4">
              <textarea
                className="input min-h-24"
                value={r.alteracao_descricao ?? ''}
                onChange={(e) => set('alteracao_descricao', e.target.value)}
                placeholder="Ex.: alteração de endereço, inclusão de CNAE, entrada/saída de sócio, aumento de capital..."
              />
            </Field>
          )}

          {abertura && (
            <>
              <Field label="Município de abertura">
                <input className="input" value={r.municipio ?? ''} onChange={(e) => set('municipio', e.target.value)} placeholder="Ex.: Belo Horizonte/MG" />
              </Field>
              <Field label="Natureza Jurídica">
                <input className="input" list="naturezas" value={r.natureza_juridica ?? ''} onChange={(e) => set('natureza_juridica', e.target.value)} />
                <datalist id="naturezas">
                  {NATUREZAS_JURIDICAS.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field label="Órgão de Registro">
                <input className="input" list="orgaos" value={r.orgao_registro ?? ''} onChange={(e) => set('orgao_registro', e.target.value)} />
                <datalist id="orgaos">
                  {ORGAOS_REGISTRO.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </Field>
              <Field label="Enquadramento">
                <Select value={r.enquadramento ?? ''} onChange={(v) => set('enquadramento', v)} opcoes={ENQUADRAMENTOS} vazio="Selecione" />
              </Field>

              <Field label="Tipo de Unidade" className="sm:col-span-1 lg:col-span-2">
                <Select
                  value={r.tipo_unidade ?? ''}
                  onChange={(v) => set('tipo_unidade', v)}
                  opcoes={[
                    { value: 'produtiva', label: 'Produtiva' },
                    { value: 'auxiliar', label: 'Auxiliar' },
                  ]}
                />
              </Field>
              <Field label="Capital Social (R$)" className="sm:col-span-1 lg:col-span-2">
                <input className="input" inputMode="decimal" value={r.capital_social} onChange={(e) => set('capital_social', e.target.value)} placeholder="10.000,00" />
              </Field>

              <Field label={`CEP da empresa${buscandoCep ? ' (buscando...)' : ''}`}>
                <input className="input" value={r.cep ?? ''} onChange={(e) => set('cep', mascaraCep(e.target.value))} onBlur={aoSairDoCep} placeholder="00000-000" />
              </Field>
              <Field label="Endereço da empresa (com número)" className="sm:col-span-2">
                <input className="input" value={r.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)} />
              </Field>
              <Field label="Complemento">
                <input className="input" value={r.complemento ?? ''} onChange={(e) => set('complemento', e.target.value)} />
              </Field>

              <Field label="Área do imóvel (m²)">
                <input className="input" inputMode="decimal" value={r.area_imovel} onChange={(e) => set('area_imovel', e.target.value)} />
              </Field>
              <Field label="Área do estabelecimento (m²)">
                <input className="input" inputMode="decimal" value={r.area_estabelecimento} onChange={(e) => set('area_estabelecimento', e.target.value)} />
              </Field>
              <Field label="Área do terreno (m²)">
                <input className="input" inputMode="decimal" value={r.area_terreno} onChange={(e) => set('area_terreno', e.target.value)} />
              </Field>
              <Field label="Quantidade de sócios">
                <Select value={String(r.socios.length)} onChange={(v) => setQuantidadeSocios(Number(v))} opcoes={['1', '2', '3', '4', '5']} />
              </Field>
            </>
          )}
        </div>
      </Section>

      {abertura && (
        <Section
          icone={Layers}
          cor="amber"
          title="Atividades (CNAEs) e Objeto Social"
          actions={
            <button type="button" className="btn-ghost btn-sm" onClick={onGerenciarModelos}>
              <Settings2 className="h-3.5 w-3.5" />
              Gerenciar modelos
            </button>
          }
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Bloco de CNAEs pré-definido" className="sm:col-span-1 lg:col-span-2">
              <Select
                value={r.bloco_cnae_id ?? ''}
                onChange={aplicarBloco}
                opcoes={blocos.map((b) => ({ value: b.id, label: `${b.nome} (${b.cnaes_secundarios.length + (b.cnae_principal ? 1 : 0)} CNAEs)` }))}
                vazio="Nenhum — informar manualmente"
              />
            </Field>
            <Field label="CNAE Principal" className="sm:col-span-1 lg:col-span-2">
              <input
                className={`input font-mono ${r.cnae_principal && !REGEX_CNAE.test(r.cnae_principal) ? 'border-rose-300' : ''}`}
                value={r.cnae_principal ?? ''}
                onChange={(e) => set('cnae_principal', mascaraCnae(e.target.value))}
                placeholder="4713-0-02"
              />
            </Field>
            <Field label={`CNAEs Secundários${blocoAtual ? ` — bloco ${blocoAtual.nome} (em amarelo, os extras pedidos pelo cliente)` : ''}`} className="sm:col-span-2 lg:col-span-4">
              <CnaesInput valores={secundarios} onChange={setSecundarios} doBloco={blocoAtual?.cnaes_secundarios} />
            </Field>

            <div className="sm:col-span-2 lg:col-span-4">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-600">Objeto Social</span>
                {objetos.length > 0 && (
                  <div className="w-64">
                    <Select
                      value=""
                      onChange={usarObjeto}
                      opcoes={objetos.map((o) => ({ value: o.id, label: o.nome }))}
                      vazio="Usar um modelo pronto..."
                      className="input py-1.5 text-xs"
                    />
                  </div>
                )}
              </div>
              <textarea
                className="input min-h-32 text-[13px] leading-relaxed"
                value={r.objeto_social ?? ''}
                onChange={(e) => set('objeto_social', e.target.value)}
                placeholder="Escolha um modelo pronto acima ou escreva o objeto social da empresa."
              />
              <span className="mt-1 block text-right text-[11px] text-slate-400">{(r.objeto_social ?? '').length} caracteres</span>
            </div>
          </div>
        </Section>
      )}

      {abertura && r.socios.map((s, i) => <SocioForm key={i} indice={i} socio={s} onChange={(novo) => setSocio(i, novo)} />)}

      <Section icone={ListChecks} cor="emerald" title="Acompanhamento">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {baixa ? (
            <Field label="Número DBE">
              <input
                className="input font-mono tracking-wider"
                value={r.numero_dbe ?? ''}
                onChange={(e) => set('numero_dbe', e.target.value.toUpperCase())}
              />
            </Field>
          ) : (
            <Field label="Número da Viabilidade">
              <input
                className={`input font-mono tracking-wider ${viabilidadeInvalida ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-100' : ''}`}
                value={r.numero_viabilidade ?? ''}
                onChange={(e) => set('numero_viabilidade', mascaraViabilidade(e.target.value))}
                placeholder="SPN2633893093"
                maxLength={13}
              />
              <span className={`mt-1 block text-[11px] ${viabilidadeInvalida ? 'text-rose-600' : 'text-slate-400'}`}>
                {viabilidadeInvalida ? `Faltam ${13 - (r.numero_viabilidade ?? '').length} caractere(s): 3 letras + 10 números` : '3 letras + 10 números'}
              </span>
            </Field>
          )}
          {etapas.map((a) => (
            <Field key={a.campo} label={a.label}>
              <Select value={r[a.campo]} onChange={(v) => set(a.campo, v)} opcoes={a.opcoes} />
            </Field>
          ))}
          <Field label="Observações" className="sm:col-span-2 lg:col-span-4">
            <textarea className="input min-h-20" value={r.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} />
          </Field>
        </div>
      </Section>
    </Modal>
  )
}
