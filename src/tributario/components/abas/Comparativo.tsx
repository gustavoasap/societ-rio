import { useMemo, useState } from 'react'
import { Award, Scale } from 'lucide-react'
import { Section } from '../../../components/ui'
import { apurar, type Contexto } from '../../engine/apuracao'
import { nomeMes } from '../../engine/base'
import type { BaseMensal, RegimeId, Resultado } from '../../engine/tipos'
import { linhasDre } from '../../engine/dre'
import { COR_REGIME, moeda, nomeRegime, pct, recomendacao } from '../../formatacao'
import { Alertas, Memoria, Segmentado, TabelaTributos, PontoRegime } from '../comum'
import { BarrasHorizontais } from '../graficos'

const REGIMES_HOJE: RegimeId[] = ['simples', 'presumido', 'real']

export function Comparativo({ bases, ctx, regimeAtual }: { bases: BaseMensal[]; ctx: Contexto; regimeAtual: RegimeId }) {
  const anos = useMemo(() => [...new Set(bases.map((b) => b.competencia.slice(0, 4)))].sort(), [bases])
  const [periodo, setPeriodo] = useState<string>(anos[anos.length - 1] ?? 'tudo')
  const meses = periodo === 'tudo' ? bases : bases.filter((b) => b.competencia.startsWith(periodo))
  const resultados = useMemo(() => REGIMES_HOJE.map((r) => apurar(r, meses, ctx)), [meses, ctx])
  const [detalhe, setDetalhe] = useState<RegimeId>(regimeAtual)
  if (!meses.length) return null
  const rotulo = `${nomeMes(meses[0].competencia)} a ${nomeMes(meses[meses.length - 1].competencia)}`
  const rec = recomendacao(resultados, regimeAtual, rotulo)
  const res = resultados.find((r) => r.regime === detalhe) ?? resultados[0]

  return (
    <div className="space-y-5">
      <Section
        title={`Comparativo de regimes — ${rotulo}`}
        icone={Scale}
        actions={<Segmentado valor={periodo} onChange={setPeriodo} opcoes={[...anos.map((a) => ({ value: a, label: a })), ...(anos.length > 1 ? [{ value: 'tudo', label: 'Tudo' }] : [])]} />}
      >
        <p className="-mt-2 mb-4 text-sm text-slate-500">Legislação vigente em cada competência. Para os anos da reforma (IBS/CBS, Simples híbrido), veja a aba Reforma 2026–2033.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {resultados.map((r) => {
            const melhor = rec?.melhor === r.regime
            return (
              <button
                key={r.regime}
                onClick={() => setDetalhe(r.regime)}
                className={`relative cursor-pointer rounded-2xl p-5 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-lg ${melhor ? 'bg-emerald-50/60 ring-2 ring-emerald-400' : 'bg-white ring-slate-200'} ${detalhe === r.regime ? 'shadow-lg' : ''}`}
              >
                {melhor && (
                  <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
                    <Award className="h-3.5 w-3.5" /> Recomendado
                  </span>
                )}
                <div className="flex items-center gap-2 font-bold text-slate-800">
                  <PontoRegime regime={r.regime} />
                  {nomeRegime(r.regime)}
                  {r.regime === regimeAtual && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">atual</span>}
                </div>
                <div className="mt-3 text-2xl font-extrabold text-slate-900 tabular-nums">{moeda(r.total)}</div>
                <div className="text-sm text-slate-500">
                  Carga efetiva <span className="font-semibold text-slate-800">{pct(r.carga)}</span>
                </div>
                {!r.elegivel && <div className="mt-2 text-xs font-semibold text-rose-600">{r.motivo}</div>}
              </button>
            )
          })}
        </div>
        {rec && (
          <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            <strong>Análise: </strong>
            {rec.texto}
          </div>
        )}
      </Section>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Section title="Carga total por regime" icone={Scale} cor="emerald">
            <BarrasHorizontais
              formatar={moeda}
              itens={resultados.map((r) => ({ id: r.regime, rotulo: nomeRegime(r.regime), valor: r.total, cor: COR_REGIME[r.regime], detalhe: pct(r.carga) }))}
            />
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section title="Tributos por regime" icone={Scale} cor="sky">
            <TabelaTributos
              receita
              destaque={rec?.melhor}
              colunas={resultados.map((r) => ({ id: r.regime, titulo: nomeRegime(r.regime), tributos: r.tributos, total: r.total, receita: r.receita }))}
            />
          </Section>
        </div>
      </div>

      <PisCofinsSistemas meses={meses} ctx={ctx} presumido={resultados.find((r) => r.regime === 'presumido')!} />

      <Section
        title={`Detalhamento — ${nomeRegime(res.regime)}`}
        icone={Scale}
        cor="violet"
        actions={<Segmentado valor={detalhe} onChange={setDetalhe} opcoes={REGIMES_HOJE.map((r) => ({ value: r, label: nomeRegime(r) }))} />}
      >
        <div className="space-y-3">
          <Alertas itens={res.alertas} />
          <Memoria linhas={res.memoria} />
        </div>
      </Section>
    </div>
  )
}

/**
 * PIS/COFINS cumulativo (0,65% + 3%, sem créditos — Lei 9.718/1998; Lucro Real só nas receitas do art. 10 da Lei 10.833/2003)
 * × não cumulativo (1,65% + 7,6% com créditos — Leis 10.637/2002 e 10.833/2003), pela legislação vigente em 2026.
 */
function PisCofinsSistemas({ meses, ctx, presumido }: { meses: BaseMensal[]; ctx: Contexto; presumido: Resultado }) {
  const nc = useMemo(() => apurar('real', meses, { ...ctx, params: { ...ctx.params, realPisCofinsCumulativo: false } }), [meses, ctx])
  const cu = useMemo(() => apurar('real', meses, { ...ctx, params: { ...ctx.params, realPisCofinsCumulativo: true } }), [meses, ctx])
  const colunas = [
    { id: 'pres', titulo: 'Lucro Presumido (cumulativo)', r: presumido },
    { id: 'realc', titulo: 'Lucro Real — cumulativo', r: cu },
    { id: 'realnc', titulo: 'Lucro Real — não cumulativo', r: nc },
  ]
  const debitoNc = (nc.dre.deducoes['PIS'] ?? 0) + (nc.dre.deducoes['COFINS'] ?? 0)
  const creditosNc = nc.creditos.pisCofinsCompras + nc.creditos.pisCofinsDespesas
  const razao = debitoNc ? creditosNc / debitoNc : 0
  const equilibrio = 1 - 0.0365 / 0.0925 // base de crédito ÷ base de débito a partir da qual o não cumulativo fica mais barato
  const linhas: [string, (r: Resultado) => number, boolean?][] = [
    ['Débito de PIS + COFINS', (r) => (r.dre.deducoes['PIS'] ?? 0) + (r.dre.deducoes['COFINS'] ?? 0)],
    ['(−) Créditos de PIS/COFINS', (r) => -(r.creditos.pisCofinsCompras + r.creditos.pisCofinsDespesas)],
    ['PIS + COFINS a recolher', (r) => r.tributos.PIS + r.tributos.COFINS, true],
    ['IRPJ + CSLL', (r) => r.tributos.IRPJ + r.tributos.CSLL],
    ['Carga tributária total', (r) => r.total, true],
    ['Lucro líquido (DRE)', (r) => linhasDre(r.dre).find((l) => l.chave === 'll')?.valor ?? 0, true],
  ]
  return (
    <Section title="PIS/COFINS: cumulativo × não cumulativo (legislação de 2026)" icone={Scale} cor="amber">
      <p className="-mt-2 mb-3 text-sm text-slate-500">
        Mesmo com a extinção em 2027, a escolha de hoje depende disso. Cumulativo: 0,65% + 3% sem créditos (Lei 9.718/1998) — obrigatório no Presumido e, no Lucro Real, só
        para as receitas do art. 10 da Lei 10.833/2003. Não cumulativo: 1,65% + 7,6% com créditos (Leis 10.637/2002 e 10.833/2003).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-400 uppercase">
              <th className="py-2 pr-3 text-left" />
              {colunas.map((c) => (
                <th key={c.id} className="px-3 py-2">
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {linhas.map(([rot, f, forte]) => (
              <tr key={rot} className={`border-b border-slate-100 text-right ${forte ? 'font-bold' : ''}`}>
                <td className="py-2 pr-3 text-left">{rot}</td>
                {colunas.map((c) => (
                  <td key={c.id} className="px-3 py-2">
                    {moeda(f(c.r))}
                    {forte && c.r.receita > 0 && rot !== 'Lucro líquido (DRE)' && <div className="text-[11px] font-medium text-slate-500">{pct(f(c.r) / c.r.receita)}</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        O não cumulativo fica mais barato quando a base de créditos passa de <strong>{pct(equilibrio, 1)}</strong> da base de débito (9,25% × (1 − x) &lt; 3,65%). Nesta
        empresa a base de créditos é <strong>{pct(razao, 1)}</strong> — {razao > equilibrio ? 'o não cumulativo compensa.' : 'o cumulativo sairia mais barato, mas no Lucro Real ele só vale para as receitas do art. 10.'}
      </p>
    </Section>
  )
}
