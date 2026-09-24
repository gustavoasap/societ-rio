import { useMemo, useState } from 'react'
import { Calculator, FileText } from 'lucide-react'
import { Section } from '../../../components/ui'
import { apurar, type Contexto } from '../../engine/apuracao'
import { nomeMes } from '../../engine/base'
import { agruparBases, rotuloPeriodo, type Agrupamento } from '../../engine/projecao'
import type { BaseMensal, RegimeId } from '../../engine/tipos'
import { COR_REGIME, moeda, nomeRegime, pct } from '../../formatacao'
import { Alertas, Memoria, Segmentado, TabelaTributos } from '../comum'
import { BarrasAgrupadas } from '../graficos'

export function Apuracao({ bases, ctx, regime }: { bases: BaseMensal[]; ctx: Contexto; regime: RegimeId }) {
  const [ag, setAg] = useState<Agrupamento>('mes')
  const grupos = useMemo(() => agruparBases(bases, ag), [bases, ag])
  const resultados = useMemo(() => grupos.map((g) => ({ g, r: apurar(regime, g.meses, ctx) })), [grupos, regime, ctx])
  const geral = useMemo(() => apurar(regime, bases, ctx), [bases, regime, ctx])
  const [sel, setSel] = useState<string | null>(null)
  const selecionado = resultados.find((x) => x.g.chave === sel) ?? resultados[resultados.length - 1]

  return (
    <div className="space-y-5">
      <Section
        title={`Apuração no regime atual — ${nomeRegime(regime)}`}
        icone={Calculator}
        actions={
          <Segmentado
            valor={ag}
            onChange={(v) => {
              setAg(v)
              setSel(null)
            }}
            opcoes={[
              { value: 'mes', label: 'Mensal' },
              { value: 'semestre', label: 'Semestral' },
              { value: 'ano', label: 'Anual' },
            ]}
          />
        }
      >
        <BarrasAgrupadas
          grupos={resultados.map(({ g, r }) => ({ rotulo: rotuloPeriodo(g.chave), valores: { [regime]: r.total }, extra: { [regime]: `carga ${pct(r.carga)} da receita` } }))}
          series={[{ id: regime, label: nomeRegime(regime), cor: COR_REGIME[regime] }]}
          formatar={moeda}
          altura={220}
        />
        <div className="mt-4">
          <TabelaTributos
            receita
            colunas={resultados.map(({ g, r }) => ({ id: g.chave, titulo: rotuloPeriodo(g.chave), tributos: r.tributos, total: r.total, receita: r.receita }))}
          />
        </div>
      </Section>

      {regime.startsWith('simples') && (
        <Section title="Resumo PGDAS-D (matriz + filiais consolidadas)" icone={FileText} cor="sky">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                  <th className="py-2.5 pr-3 text-left">Competência</th>
                  <th className="px-3 py-2.5">Receita bruta</th>
                  <th className="px-3 py-2.5">RBT12</th>
                  <th className="px-3 py-2.5">Faixa</th>
                  <th className="px-3 py-2.5">Alíquota efetiva</th>
                  <th className="px-3 py-2.5">DAS</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {geral.porMes.map((m) => (
                  <tr key={m.competencia} className="border-b border-slate-100 text-right">
                    <td className="py-2 pr-3 text-left font-medium text-slate-700">{nomeMes(m.competencia)}</td>
                    <td className="px-3 py-2">{moeda(m.receita)}</td>
                    <td className="px-3 py-2">
                      {moeda(m.simples?.rbt12 ?? 0)}
                      {m.simples?.proporcional && <span className="ml-1 text-xs text-amber-600" title="Proporcionalizado (LC 123, art. 18, §2º)">*</span>}
                    </td>
                    <td className="px-3 py-2">{m.simples?.faixa}ª</td>
                    <td className="px-3 py-2">{pct(m.simples?.aliquota ?? 0, 4)}</td>
                    <td className="px-3 py-2 font-semibold">{moeda(m.simples?.das ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            * RBT12 proporcionalizado (início de atividade ou histórico incompleto). Informe as receitas anteriores em Parâmetros para refletir o RBT12 real.
          </p>
        </Section>
      )}

      <Alertas itens={geral.alertas} />

      {selecionado && (
        <Section
          title={`Memória de cálculo — ${rotuloPeriodo(selecionado.g.chave)}`}
          icone={FileText}
          cor="violet"
          actions={
            <select className="input w-auto py-1.5" value={selecionado.g.chave} onChange={(e) => setSel(e.target.value)}>
              {resultados.map(({ g }) => (
                <option key={g.chave} value={g.chave}>
                  {rotuloPeriodo(g.chave)}
                </option>
              ))}
            </select>
          }
        >
          <Memoria linhas={selecionado.r.memoria} titulo="Ver detalhamento" />
        </Section>
      )}
    </div>
  )
}
