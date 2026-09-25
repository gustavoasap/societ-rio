import { useMemo, useState } from 'react'
import { Calculator, FileText } from 'lucide-react'
import { Section } from '../../../components/ui'
import { apurar, type Contexto } from '../../engine/apuracao'
import { nomeMes } from '../../engine/base'
import { agruparBases, rotuloPeriodo, type Agrupamento } from '../../engine/projecao'
import type { BaseMensal, Parametros, RegimeId, ResultadoMes } from '../../engine/tipos'
import { COR_REGIME, moeda, nomeRegime, pct } from '../../formatacao'
import { Alertas, Memoria, Segmentado, TabelaTributos } from '../comum'
import { BarrasAgrupadas } from '../graficos'

export function Apuracao({ bases, ctx, regime, onParams }: { bases: BaseMensal[]; ctx: Contexto; regime: RegimeId; onParams: (p: Parametros) => void }) {
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

      {regime.startsWith('simples') && <ConferenciaPgdas porMes={geral.porMes} ctx={ctx} onParams={onParams} />}

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

/** Campo numérico que grava ao sair (valor declarado no PGDAS transmitido). */
function Declarado({ valor, onChange }: { valor: number | undefined; onChange: (v: number | undefined) => void }) {
  return (
    <input
      key={String(valor)}
      className={`input w-32 py-1 text-right text-sm ${valor !== undefined ? 'border-sky-300 bg-sky-50' : ''}`}
      type="number"
      step="0.01"
      defaultValue={valor ?? ''}
      placeholder="—"
      onBlur={(e) => {
        const v = e.target.value === '' ? undefined : Number(e.target.value)
        if (v !== valor) onChange(v)
      }}
    />
  )
}

/**
 * Resumo do PGDAS-D por competência com os valores do PGDAS transmitido ao lado: o RBT12 informado passa a ser usado no cálculo,
 * e as diferenças de receita e de DAS ficam destacadas para achar a origem (receita considerada, RBT12, segregações).
 */
function ConferenciaPgdas({ porMes, ctx, onParams }: { porMes: ResultadoMes[]; ctx: Contexto; onParams: (p: Parametros) => void }) {
  const p = ctx.params
  const pgdas = p.pgdas ?? {}
  const mudar = (comp: string, campo: 'receita' | 'rbt12' | 'das', v: number | undefined) => {
    const atual = { ...(pgdas[comp] ?? {}) }
    if (v === undefined) delete atual[campo]
    else atual[campo] = v
    const novo = { ...pgdas, [comp]: atual }
    if (!Object.keys(atual).length) delete novo[comp]
    onParams({ ...p, pgdas: novo })
  }
  const dif = (a: number, b: number | undefined) =>
    b === undefined ? null : (
      <span className={`block text-[0.6875rem] font-semibold ${Math.abs(a - b) < 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
        {Math.abs(a - b) < 1 ? 'confere' : `dif. ${moeda(a - b)}`}
      </span>
    )
  return (
    <Section title="PGDAS-D — cálculo e conferência com o transmitido (matriz + filiais)" icone={FileText} cor="sky">
      <p className="-mt-2 mb-3 text-sm text-slate-500">
        Digite os valores do PGDAS-D transmitido para conferir. O RBT12 informado passa a valer no cálculo do mês. Segregação: monofásico{' '}
        <strong>{p.pgdasMonofasico === 'ncm' ? 'pelo NCM' : p.pgdasMonofasico === 'notas' ? 'pela CST de PIS das notas' : 'não segregado'}</strong>, ST{' '}
        <strong>{p.pgdasSt === 'notas' ? 'pela CSOSN/CST das notas' : p.pgdasSt === 'ncm' ? 'pelo NCM' : 'não segregado'}</strong> — ajuste em Parâmetros.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[68rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
              <th className="py-2.5 pr-3 text-left">Competência</th>
              <th className="px-2 py-2.5">Receita (notas)</th>
              <th className="px-2 py-2.5">Receita PGDAS</th>
              <th className="px-2 py-2.5">RBT12 usado</th>
              <th className="px-2 py-2.5">RBT12 PGDAS</th>
              <th className="px-2 py-2.5">Faixa · alíq. efetiva</th>
              <th className="px-2 py-2.5">Segregado (mono / ST)</th>
              <th className="px-2 py-2.5">DAS calculado</th>
              <th className="px-2 py-2.5">DAS PGDAS</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {porMes.map((m) => {
              const s = m.simples
              const d = pgdas[m.competencia] ?? {}
              if (!s) return null
              return (
                <tr key={m.competencia} className="border-b border-slate-100 text-right align-top">
                  <td className="py-2 pr-3 text-left font-medium text-slate-700">{nomeMes(m.competencia)}</td>
                  <td className="px-2 py-2">
                    {moeda(m.receita)}
                    {dif(m.receita, d.receita)}
                  </td>
                  <td className="px-2 py-2">
                    <Declarado valor={d.receita} onChange={(v) => mudar(m.competencia, 'receita', v)} />
                  </td>
                  <td className="px-2 py-2">
                    {moeda(s.rbt12)}
                    <span className="block text-[0.6875rem] text-slate-500">{s.rbt12Declarado ? 'do PGDAS' : s.proporcional ? 'proporcionalizado' : '12 meses'}</span>
                  </td>
                  <td className="px-2 py-2">
                    <Declarado valor={d.rbt12} onChange={(v) => mudar(m.competencia, 'rbt12', v)} />
                  </td>
                  <td className="px-2 py-2">
                    {s.faixa}ª · {pct(s.efetiva, 4)}
                    <span className="block text-[0.6875rem] text-slate-500">DAS/receita {pct(s.aliquota, 4)}</span>
                  </td>
                  <td className="px-2 py-2 text-xs">
                    {moeda(s.receitaMonofasico)}
                    <span className="block">{moeda(s.receitaSt)}</span>
                  </td>
                  <td className="px-2 py-2 font-semibold">
                    {moeda(s.das)}
                    {dif(s.das, d.das)}
                  </td>
                  <td className="px-2 py-2">
                    <Declarado valor={d.das} onChange={(v) => mudar(m.competencia, 'das', v)} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        RBT12 no início de atividade: no 1º mês, receita do mês × 12; do 2º ao 12º mês, média dos meses anteriores × 12 (LC 123, art. 18, §2º; Resolução CGSN 140/2018, art.
        22). Receita = vendas (CFOP de venda) − devoluções do mês. A memória de cálculo de cada mês, abaixo, traz a partilha por tributo.
      </p>
    </Section>
  )
}
