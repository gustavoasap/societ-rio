import { useMemo, useState } from 'react'
import { Award, Scale } from 'lucide-react'
import { Section } from '../../../components/ui'
import { apurar, type Contexto } from '../../engine/apuracao'
import { nomeMes } from '../../engine/base'
import type { BaseMensal, RegimeId } from '../../engine/tipos'
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
