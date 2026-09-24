import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { buscarCep, mascaraCep, mascaraCpf, mascaraTelefone } from '../lib/format'
import { CORES_RACA, ESTADOS_CIVIS, QUALIFICACOES, REGIMES_BENS, SEXOS, type Socio } from '../types'
import { Field, Section, Select } from './ui'

export function SocioForm({ indice, socio, onChange }: { indice: number; socio: Socio; onChange: (s: Socio) => void }) {
  const [buscando, setBuscando] = useState(false)
  const set = <K extends keyof Socio>(k: K, v: Socio[K]) => onChange({ ...socio, [k]: v })
  const casado = socio.estado_civil === 'Casado(a)'

  async function aoSairDoCep() {
    setBuscando(true)
    const r = await buscarCep(socio.cep)
    setBuscando(false)
    if (r && !socio.endereco) onChange({ ...socio, endereco: r.endereco })
  }

  return (
    <Section icone={UserRound} cor="violet" title={`Sócio ${indice + 1}${socio.nome ? ` — ${socio.nome}` : ''}`}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Nome completo" className="sm:col-span-2">
          <input className="input" value={socio.nome} onChange={(e) => set('nome', e.target.value)} />
        </Field>
        <Field label="CPF">
          <input className="input" value={socio.cpf} onChange={(e) => set('cpf', mascaraCpf(e.target.value))} placeholder="000.000.000-00" />
        </Field>
        <Field label="Qualificação">
          <Select value={socio.qualificacao} onChange={(v) => set('qualificacao', v)} opcoes={QUALIFICACOES} />
        </Field>

        <Field label="E-mail" className="sm:col-span-2">
          <input type="email" className="input" value={socio.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Telefone">
          <input className="input" value={socio.telefone} onChange={(e) => set('telefone', mascaraTelefone(e.target.value))} placeholder="(00) 00000-0000" />
        </Field>
        <Field label="Data de nascimento">
          <input type="date" className="input" value={socio.data_nascimento} onChange={(e) => set('data_nascimento', e.target.value)} />
        </Field>

        <Field label="Sexo">
          <Select value={socio.sexo} onChange={(v) => set('sexo', v)} opcoes={SEXOS} vazio="Selecione" />
        </Field>
        <Field label="Cor ou raça">
          <Select value={socio.cor_raca} onChange={(v) => set('cor_raca', v)} opcoes={CORES_RACA} vazio="Selecione" />
        </Field>
        <Field label="Profissão">
          <input className="input" value={socio.profissao} onChange={(e) => set('profissao', e.target.value)} />
        </Field>
        <Field label="Naturalidade">
          <input className="input" value={socio.naturalidade} onChange={(e) => set('naturalidade', e.target.value)} placeholder="Ex.: Belo Horizonte/MG" />
        </Field>

        <Field label="Nome da mãe" className="sm:col-span-2">
          <input className="input" value={socio.nome_mae} onChange={(e) => set('nome_mae', e.target.value)} />
        </Field>
        <Field label="Nome do pai" className="sm:col-span-2">
          <input className="input" value={socio.nome_pai} onChange={(e) => set('nome_pai', e.target.value)} />
        </Field>

        <Field label="RG">
          <input className="input" value={socio.rg} onChange={(e) => set('rg', e.target.value)} />
        </Field>
        <Field label="Órgão emissor / UF (RG)">
          <input
            className="input"
            value={socio.rg_orgao_emissor}
            onChange={(e) => set('rg_orgao_emissor', e.target.value.toUpperCase())}
            placeholder="SSP/MG"
          />
        </Field>
        <Field label="Data de emissão (RG)">
          <input type="date" className="input" value={socio.rg_data_emissao} onChange={(e) => set('rg_data_emissao', e.target.value)} />
        </Field>
        <div className="hidden lg:block" />

        <Field label="Número da CNH">
          <input className="input" value={socio.cnh} onChange={(e) => set('cnh', e.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Órgão emissor (CNH)">
          <input
            className="input"
            value={socio.cnh_orgao_emissor}
            onChange={(e) => set('cnh_orgao_emissor', e.target.value.toUpperCase())}
            placeholder="DETRAN/MG"
          />
        </Field>
        <Field label="Estado civil">
          <Select
            value={socio.estado_civil}
            onChange={(v) => onChange({ ...socio, estado_civil: v, regime_bens: v === 'Casado(a)' ? socio.regime_bens : '' })}
            opcoes={ESTADOS_CIVIS}
            vazio="Selecione"
          />
        </Field>
        <Field label="Regime de bens">
          <Select
            value={socio.regime_bens}
            onChange={(v) => set('regime_bens', v)}
            opcoes={REGIMES_BENS}
            vazio={casado ? 'Selecione' : 'Somente se casado(a)'}
            disabled={!casado}
          />
        </Field>

        <Field label={`CEP residencial${buscando ? ' (buscando...)' : ''}`}>
          <input className="input" value={socio.cep} onChange={(e) => set('cep', mascaraCep(e.target.value))} onBlur={aoSairDoCep} placeholder="00000-000" />
        </Field>
        <Field label="Endereço residencial (com número e complemento)" className="sm:col-span-1 lg:col-span-3">
          <input className="input" value={socio.endereco} onChange={(e) => set('endereco', e.target.value)} />
        </Field>
      </div>
    </Section>
  )
}
