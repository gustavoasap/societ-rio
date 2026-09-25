import { useState, type ReactNode } from 'react'
import { Building, Landmark, Percent, Plus, ShoppingCart, Trash2, Users } from 'lucide-react'
import { Field, Section, Select } from '../../../components/ui'
import { nomeMes } from '../../engine/base'
import { ANEXOS_SIMPLES, CENARIOS_ALIQUOTA, type Anexo } from '../../engine/tabelas'
import type { MixProdutos, Parametros as P } from '../../engine/tipos'
import { pct } from '../../formatacao'

function Num({
  label,
  valor,
  onChange,
  sufixo,
  ajuda,
  vazio,
  passo = 0.01,
}: {
  label: string
  valor: number | null
  onChange: (v: number | null) => void
  sufixo?: string
  ajuda?: ReactNode
  vazio?: string
  passo?: number
}) {
  return (
    <Field label={label}>
      <div className="relative">
        <input
          className={`input ${sufixo ? 'pr-10' : ''}`}
          type="number"
          step={passo}
          value={valor ?? ''}
          placeholder={vazio}
          onChange={(e) => onChange(e.target.value === '' ? (vazio !== undefined ? null : 0) : Number(e.target.value))}
        />
        {sufixo && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{sufixo}</span>}
      </div>
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </Field>
  )
}

export function Parametros({ params, onParams, mixEstimado }: { params: P; onParams: (p: P) => void; mixEstimado: MixProdutos }) {
  const set = <K extends keyof P>(k: K, v: P[K]) => onParams({ ...params, [k]: v })
  const [novoMes, setNovoMes] = useState('')
  const [novoValor, setNovoValor] = useState('')
  const historico = Object.entries(params.receitasAnteriores).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="space-y-5">
      <Section title="Simples Nacional" icone={Building}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Anexo — mercadorias">
            <Select value={params.anexo} onChange={(v) => set('anexo', v as Anexo)} opcoes={(['I', 'II'] as Anexo[]).map((a) => ({ value: a, label: ANEXOS_SIMPLES[a].nome }))} />
          </Field>
          <Field label="Anexo — serviços">
            <Select value={params.anexoServicos} onChange={(v) => set('anexoServicos', v as Anexo)} opcoes={(['III', 'IV', 'V'] as Anexo[]).map((a) => ({ value: a, label: ANEXOS_SIMPLES[a].nome }))} />
          </Field>
          <Field label="Início de atividade">
            <input className="input" type="month" value={params.inicioAtividade} onChange={(e) => set('inicioAtividade', e.target.value)} />
            <span className="mt-1 block text-xs text-slate-500">Proporcionaliza o RBT12 no 1º ano (LC 123, art. 18, §2º)</span>
          </Field>
          <Num
            label="Vendas com ICMS-ST já retido"
            valor={params.percentualSt}
            sufixo="%"
            vazio={`automático: ${pct(mixEstimado.st, 1)}`}
            onChange={(v) => set('percentualSt', v)}
            ajuda="Pelo NCM (aba Produtos). Excluído da parcela de ICMS do DAS e do débito de ICMS."
          />
        </div>
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold text-slate-600">Receitas anteriores ao período importado (para o RBT12)</div>
          <div className="flex flex-wrap items-end gap-2">
            {historico.map(([mes, valor]) => (
              <span key={mes} className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-sm">
                <strong>{nomeMes(mes)}</strong> {valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                <button
                  className="text-slate-400 hover:text-rose-600"
                  onClick={() => {
                    const r = { ...params.receitasAnteriores }
                    delete r[mes]
                    set('receitasAnteriores', r)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
            <input className="input w-40" type="month" value={novoMes} onChange={(e) => setNovoMes(e.target.value)} />
            <input className="input w-40" type="number" step="0.01" placeholder="Receita bruta" value={novoValor} onChange={(e) => setNovoValor(e.target.value)} />
            <button
              className="btn-secondary btn-sm"
              disabled={!novoMes || novoValor === ''}
              onClick={() => {
                set('receitasAnteriores', { ...params.receitasAnteriores, [novoMes]: Number(novoValor) })
                setNovoMes('')
                setNovoValor('')
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar mês
            </button>
          </div>
        </div>
      </Section>

      <Section title="Mix de produtos" icone={ShoppingCart} cor="sky">
        <div className="grid gap-4 sm:grid-cols-3">
          <Num
            label="Vendas com PIS/COFINS monofásico"
            valor={params.percentualMonofasico}
            sufixo="%"
            vazio={`automático: ${pct(mixEstimado.monofasico, 1)}`}
            onChange={(v) => set('percentualMonofasico', v)}
            ajuda="Pelos NCM das vendas (aba Produtos). Deixe em branco para usar o cálculo automático."
          />
          <Num
            label="Redução média de IBS/CBS nas vendas"
            valor={params.percentualReducaoIbsCbs}
            sufixo="%"
            vazio={`automático: ${pct(mixEstimado.reducaoIbsCbs, 1)}`}
            onChange={(v) => set('percentualReducaoIbsCbs', v)}
            ajuda="Ex.: 60% para produtos do Anexo VIII da LC 214 (higiene e limpeza)."
          />
          <Num
            label="Alíquota efetiva do DAS dos fornecedores do Simples"
            valor={params.aliquotaFornecedoresSimples}
            sufixo="%"
            onChange={(v) => set('aliquotaFornecedoresSimples', v ?? 0)}
            ajuda={`Crédito de IBS/CBS nas compras de optantes (LC 214, art. 47, §9º). Hoje ${pct(mixEstimado.fornecedoresSimples, 1)} das compras vêm do Simples.`}
          />
        </div>
      </Section>

      <Section title="ICMS, IPI e ISS (regime regular)" icone={Percent} cor="amber">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Num label="Alíquota interestadual média" valor={params.aliquotaIcmsInterestadual} sufixo="%" onChange={(v) => set('aliquotaIcmsInterestadual', v ?? 0)} ajuda="12%, 7% ou 4% (importados)" />
          <Num
            label="Interestaduais a não contribuintes"
            valor={params.percentualNaoContribuinte}
            sufixo="%"
            onChange={(v) => set('percentualNaoContribuinte', v ?? 0)}
            ajuda="Só para notas sem destinatário identificado — com o Registro de Saídas detalhado o DIFAL é calculado nota a nota."
          />
          <Num label="Alíquota interna média no destino" valor={params.aliquotaInternaDestino} sufixo="%" onChange={(v) => set('aliquotaInternaDestino', v ?? 0)} />
          <Num label="IPI médio nas saídas" valor={params.aliquotaIpi} sufixo="%" onChange={(v) => set('aliquotaIpi', v ?? 0)} ajuda="Industrial ou importador equiparado" />
          <Num label="ISS sobre serviços prestados" valor={params.aliquotaIss} sufixo="%" onChange={(v) => set('aliquotaIss', v ?? 0)} />
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={params.excluirIcmsBasePisCofins} onChange={(e) => set('excluirIcmsBasePisCofins', e.target.checked)} />
          Excluir o ICMS da base de PIS/COFINS (STF, Tema 69)
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={params.realPisCofinsCumulativo} onChange={(e) => set('realPisCofinsCumulativo', e.target.checked)} />
          Lucro Real com PIS/COFINS cumulativo (receitas do art. 10 da Lei 10.833/2003 — até 2026)
        </label>
      </Section>

      <Section title="IRPJ / CSLL" icone={Landmark} cor="violet">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Presunção IRPJ — mercadorias" valor={params.presuncaoIrpj} sufixo="%" onChange={(v) => set('presuncaoIrpj', v ?? 0)} ajuda="8% comércio/indústria (Lei 9.249, art. 15)" />
          <Num label="Presunção CSLL — mercadorias" valor={params.presuncaoCsll} sufixo="%" onChange={(v) => set('presuncaoCsll', v ?? 0)} ajuda="12% (Lei 9.249, art. 20)" />
          <Num label="Presunção IRPJ — serviços" valor={params.presuncaoIrpjServicos} sufixo="%" onChange={(v) => set('presuncaoIrpjServicos', v ?? 0)} />
          <Num label="Presunção CSLL — serviços" valor={params.presuncaoCsllServicos} sufixo="%" onChange={(v) => set('presuncaoCsllServicos', v ?? 0)} />
          <Num
            label="CMV em % da receita (Lucro Real)"
            valor={params.cmvPercentual}
            sufixo="%"
            vazio="automático: compras líquidas"
            onChange={(v) => set('cmvPercentual', v)}
            ajuda="Use quando houver variação relevante de estoque"
          />
          <Num label="Outras despesas dedutíveis / mês" valor={params.despesasMensais} sufixo="R$" onChange={(v) => set('despesasMensais', v ?? 0)} ajuda="Aluguel, contador, sistemas, marketing..." />
          <Num
            label="Parte creditável dessas despesas / mês"
            valor={params.despesasCreditaveisMensais}
            sufixo="R$"
            onChange={(v) => set('despesasCreditaveisMensais', v ?? 0)}
            ajuda="Gera crédito de PIS/COFINS (Real) e de IBS/CBS"
          />
          <Num label="Receitas financeiras / mês" valor={params.receitasFinanceirasMensais} sufixo="R$" onChange={(v) => set('receitasFinanceirasMensais', v ?? 0)} />
        </div>
        <Field label="Serviços tomados que geram crédito de PIS/COFINS no Lucro Real (itens da LC 116)" className="mt-4">
          <input className="input" value={params.servicosCreditaveisPisCofins} onChange={(e) => set('servicosCreditaveisPisCofins', e.target.value)} />
          <span className="mt-1 block text-xs text-slate-500">Ex.: 11.04 armazenagem, 16.01/16.02 transporte, 26.01 courier (Lei 10.833, art. 3º, IX). Separe por vírgula.</span>
        </Field>
      </Section>

      <Section title="Folha de pagamento" icone={Users} cor="rose">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Num label="Folha mensal (empregados)" valor={params.folhaMensal} sufixo="R$" onChange={(v) => set('folhaMensal', v ?? 0)} />
          <Num label="Pró-labore mensal" valor={params.proLaboreMensal} sufixo="R$" onChange={(v) => set('proLaboreMensal', v ?? 0)} />
          <Num label="RAT ajustado (FAP)" valor={params.ratFap} sufixo="%" onChange={(v) => set('ratFap', v ?? 0)} />
          <Num label="Terceiros (outras entidades)" valor={params.terceiros} sufixo="%" onChange={(v) => set('terceiros', v ?? 0)} />
        </div>
        <p className="mt-3 text-xs text-slate-500">No Simples (Anexos I, II, III e V) a CPP está dentro do DAS; no Presumido, Real e Anexo IV é recolhida à parte (Lei 8.212/1991, art. 22).</p>
      </Section>

      <Section title="Reforma Tributária" icone={Landmark} cor="emerald">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Field label="Premissa de preço com IBS/CBS">
            <Select
              value={params.premissaPreco}
              onChange={(v) => set('premissaPreco', v as P['premissaPreco'])}
              opcoes={[
                { value: 'preco_mantido', label: 'Preço ao cliente mantido (IBS/CBS sai da margem)' },
                { value: 'repasse', label: 'IBS/CBS repassado por fora (preço sobe)' },
              ]}
            />
            <span className="mt-1 block text-xs text-slate-500">Define a base de cálculo e o efeito na DRE a partir de 2027.</span>
          </Field>
          <label className="flex items-start gap-2 pt-6 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={params.antecipacaoSimples} onChange={(e) => set('antecipacaoSimples', e.target.checked)} />
            <span>
              Cobrar antecipação/ICMS-ST nas entradas interestaduais do Simples
              <span className="block text-xs text-slate-500">LC 123, art. 13, §1º, XIII, "a" e "g"; STF Tema 517 — conforme a legislação da UF.</span>
            </span>
          </label>
          <Field label="Papel da empresa na ST">
            <Select
              value={params.papelSt}
              onChange={(v) => set('papelSt', v as P['papelSt'])}
              opcoes={[
                { value: 'substituido', label: 'Substituída (revenda)' },
                { value: 'substituto', label: 'Substituta (indústria/importador)' },
              ]}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Substituída: produto com ST não tem débito na venda interna nem crédito do ICMS na compra (LC 123, art. 18, §4º-A, no Simples). Substituta: mantém o ICMS
              próprio e retém a ST do cliente, cobrada por fora (LC 87/1996, arts. 6º e 8º).
            </span>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cenário de alíquotas">
            <Select
              value={params.cenarioAliquotas}
              onChange={(v) => {
                const c = CENARIOS_ALIQUOTA.find((x) => x.id === v)
                onParams(c ? { ...params, cenarioAliquotas: v, cbsReferencia: c.cbs, ibsReferencia: c.ibs } : { ...params, cenarioAliquotas: v })
              }}
              opcoes={[...CENARIOS_ALIQUOTA.map((c) => ({ value: c.id, label: c.nome })), { value: 'personalizado', label: 'Personalizado' }]}
            />
          </Field>
          <Num label="CBS de referência" valor={params.cbsReferencia} sufixo="%" onChange={(v) => onParams({ ...params, cbsReferencia: v ?? 0, cenarioAliquotas: 'personalizado' })} />
          <Num label="IBS de referência (UF + município)" valor={params.ibsReferencia} sufixo="%" onChange={(v) => onParams({ ...params, ibsReferencia: v ?? 0, cenarioAliquotas: 'personalizado' })} />
          <Num
            label="PIS/COFINS embutidos no preço dos fornecedores"
            valor={params.pisCofinsFornecedores}
            sufixo="%"
            onChange={(v) => set('pisCofinsFornecedores', v ?? 0)}
            ajuda="Premissa de repasse: sai do preço de compra em 2027 (9,25% Real; 3,65% Presumido)"
          />
          <Num label="Crescimento anual da receita" valor={params.crescimentoAnual} sufixo="%" onChange={(v) => set('crescimentoAnual', v ?? 0)} />
          <Num
            label="Vendas para empresas (B2B)"
            valor={params.percentualB2B}
            sufixo="%"
            vazio={`automático: ${pct(mixEstimado.b2b, 1)}`}
            onChange={(v) => set('percentualB2B', v)}
            ajuda="Pelo destinatário das notas (PJ com IE)"
          />
        </div>
      </Section>
    </div>
  )
}
