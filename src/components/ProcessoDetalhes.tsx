import { Building2, ClipboardList, Layers, ListChecks, Pencil, Printer, UserRound } from 'lucide-react'
import { formatarData, formatarMoeda, formatarNumero, listaCnaes } from '../lib/format'
import { ACOMPANHAMENTO_POR_TIPO, STATUS_PROCESSO, TIPOS, labelDe, rotuloSocio, type BlocoCnae, type Parceiro, type Processo } from '../types'
import { StatusBadge } from './StatusBadge'
import { Badge, Info, Modal, Section } from './ui'

export function ProcessoDetalhes({
  processo: p,
  parceiros,
  blocos,
  onClose,
  onEditar,
}: {
  processo: Processo
  parceiros: Parceiro[]
  blocos: BlocoCnae[]
  onClose: () => void
  onEditar: () => void
}) {
  const parceiro = parceiros.find((x) => x.id === p.parceiro_id)
  const abertura = p.tipo === 'abertura'
  const bloco = blocos.find((b) => b.id === p.bloco_cnae_id)
  const secundarios = listaCnaes(p.cnaes_secundarios)
  const extras = bloco ? secundarios.filter((c) => !bloco.cnaes_secundarios.includes(c)) : []

  return (
    <Modal
      title={
        <span className="flex flex-wrap items-center gap-2">
          {p.razao_social || 'Processo sem razão social'}
          <Badge cor={p.tipo}>{labelDe(TIPOS, p.tipo)}</Badge>
          <Badge cor={p.status}>{labelDe(STATUS_PROCESSO, p.status)}</Badge>
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-primary" onClick={onEditar}>
            <Pencil className="h-4 w-4" />
            Editar processo
          </button>
        </>
      }
    >
      <Section icone={ClipboardList} title="Processo">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Info label="Tipo" value={labelDe(TIPOS, p.tipo)} />
          <Info label="Status" value={labelDe(STATUS_PROCESSO, p.status)} />
          <Info label="Data de início" value={formatarData(p.data_inicio)} />
          <Info label="Parceiro (indicação)" value={parceiro?.nome} />
        </div>
      </Section>

      <Section icone={Building2} cor="sky" title="Empresa">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Info label="CNPJ" value={p.cnpj} />
          <Info label="Razão Social" value={p.razao_social} className="col-span-2" />
          {abertura ? <Info label="Nome Fantasia" value={p.nome_fantasia} /> : <Info label="Sócio / Responsável" value={p.responsavel} />}
          {p.tipo === 'alteracao' && (
            <Info label="Alteração a ser realizada" value={p.alteracao_descricao && <span className="whitespace-pre-line">{p.alteracao_descricao}</span>} className="col-span-2 lg:col-span-4" />
          )}
          {abertura && (
            <>
              <Info label="Município" value={p.municipio} />
              <Info label="Natureza Jurídica" value={p.natureza_juridica} />
              <Info label="Órgão de Registro" value={p.orgao_registro} />
              <Info label="Enquadramento" value={p.enquadramento} />

              <Info label="Tipo de Unidade" value={p.tipo_unidade === 'auxiliar' ? 'Auxiliar' : p.tipo_unidade === 'produtiva' ? 'Produtiva' : null} />
              <Info label="Capital Social" value={formatarMoeda(p.capital_social)} />

              <Info label="CEP" value={p.cep} />
              <Info label="Endereço" value={p.endereco} className="col-span-2" />
              <Info label="Complemento" value={p.complemento} />
              <Info label="Área do imóvel" value={formatarNumero(p.area_imovel, ' m²')} />
              <Info label="Área do estabelecimento" value={formatarNumero(p.area_estabelecimento, ' m²')} />
              <Info label="Área do terreno" value={formatarNumero(p.area_terreno, ' m²')} />
              <Info label="Quantidade de sócios" value={p.socios?.length ?? 0} />
            </>
          )}
        </div>
      </Section>

      {abertura && (
        <Section icone={Layers} cor="amber" title="Atividades (CNAEs) e Objeto Social">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Info label="CNAE Principal" value={p.cnae_principal && <span className="font-mono">{p.cnae_principal}</span>} />
            <Info label="Bloco de CNAEs" value={bloco?.nome} />
            <Info
              label="Extras fora do bloco"
              value={bloco ? (extras.length ? <span className="font-semibold text-amber-700">{extras.length} extra(s)</span> : 'Nenhum') : null}
            />
            <Info label="Qtd. de secundários" value={secundarios.length} />
            <Info
              label="CNAEs Secundários"
              className="col-span-2 lg:col-span-4"
              value={
                secundarios.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {secundarios.map((c) => {
                      const extra = extras.includes(c)
                      return (
                        <span
                          key={c}
                          className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-mono text-xs font-semibold ring-1 ring-inset ${extra ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-brand-50 text-brand-700 ring-brand-200'}`}
                        >
                          {c}
                          {extra && <span className="font-sans text-[9px] font-bold uppercase">extra</span>}
                        </span>
                      )
                    })}
                  </div>
                )
              }
            />
            <Info
              label="Objeto Social"
              className="col-span-2 lg:col-span-4"
              value={p.objeto_social && <p className="text-[13px] leading-relaxed whitespace-pre-line">{p.objeto_social}</p>}
            />
          </div>
        </Section>
      )}

      {abertura &&
        (p.socios ?? []).map((s, i) => (
          <Section key={i} icone={UserRound} cor="violet" title={`${rotuloSocio(i)}${s.nome ? ` — ${s.nome}` : ''}`}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Info label="CPF" value={s.cpf} />
              <Info label="Qualificação" value={s.qualificacao} />
              <Info label="E-mail" value={s.email} />
              <Info label="Telefone" value={s.telefone} />
              <Info label="Sexo" value={s.sexo} />
              <Info label="Cor ou raça" value={s.cor_raca} />
              <Info label="Data de nascimento" value={s.data_nascimento ? formatarData(s.data_nascimento) : null} />
              <Info label="Profissão" value={s.profissao} />
              <Info label="Nome da mãe" value={s.nome_mae} className="col-span-2" />
              <Info label="Nome do pai" value={s.nome_pai} className="col-span-2" />
              <Info label="RG" value={s.rg} />
              <Info label="Órgão emissor (RG)" value={s.rg_orgao_emissor} />
              <Info label="Emissão (RG)" value={s.rg_data_emissao ? formatarData(s.rg_data_emissao) : null} />
              <Info label="Naturalidade" value={s.naturalidade} />
              <Info label="CNH" value={s.cnh} />
              <Info label="Órgão emissor (CNH)" value={s.cnh_orgao_emissor} />
              <Info label="Estado civil" value={s.estado_civil} />
              <Info label="Regime de bens" value={s.regime_bens} />
              <Info label="CEP residencial" value={s.cep} />
              <Info label="Endereço residencial" value={s.endereco} className="col-span-2 lg:col-span-3" />
            </div>
          </Section>
        ))}

      <Section icone={ListChecks} cor="emerald" title="Acompanhamento">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {p.tipo === 'baixa' ? <Info label="Número DBE" value={p.numero_dbe} /> : <Info label="Número da Viabilidade" value={p.numero_viabilidade} />}
          {ACOMPANHAMENTO_POR_TIPO[p.tipo].map((a) => (
            <Info key={a.campo} label={a.label} value={<StatusBadge etapa={a} valor={p[a.campo]} />} />
          ))}
          <Info label="Observações" value={p.observacoes && <span className="whitespace-pre-line">{p.observacoes}</span>} className="col-span-2 lg:col-span-4" />
        </div>
      </Section>
    </Modal>
  )
}
