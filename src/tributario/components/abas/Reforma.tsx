import { Fragment, useMemo, useState } from 'react'
import { CalendarRange, Landmark, LineChart, Printer } from 'lucide-react'
import { Section, Select } from '../../../components/ui'
import type { Contexto } from '../../engine/apuracao'
import { montarAnoBase, projetar } from '../../engine/projecao'
import { ANOS_TRANSICAO, CENARIOS_ALIQUOTA, regrasDoAno } from '../../engine/tabelas'
import { REGIMES, type BaseMensal, type Parametros, type RegimeId } from '../../engine/tipos'
import { COR_REGIME, moeda, moedaCurta, nomeRegime, pct } from '../../formatacao'
import { Alertas, Segmentado, TabelaTributos, PontoRegime } from '../comum'
import { BarrasAgrupadas, Legenda } from '../graficos'

export function Reforma({ bases, ctx, regimeAtual, onParams }: { bases: BaseMensal[]; ctx: Contexto; regimeAtual: RegimeId; onParams: (p: Parametros) => void }) {
  const p = ctx.params
  const anos = useMemo(() => projetar(bases, ctx), [bases, ctx])
  const anoBase = useMemo(() => montarAnoBase(bases), [bases])
  const [regime, setRegime] = useState<RegimeId>(regimeAtual)
  const series = REGIMES.map((r) => ({ id: r.value, label: r.curto, cor: COR_REGIME[r.value] }))
  const alertas = [...new Set(anos.flatMap((a) => Object.values(a.resultados).flatMap((r) => r.alertas)))]

  if (!anos.length) return null
  const primeiro = anos[0]
  const ultimo = anos[anos.length - 1]
  const atual0 = primeiro.resultados[regimeAtual]
  const atualN = ultimo.resultados[regimeAtual]

  return (
    <div className="space-y-5">
      <Section
        title="Premissas da projeção"
        icone={CalendarRange}
        actions={
          <button className="btn-secondary btn-sm no-print" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        }
      >
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xs font-semibold text-slate-500">Ano-base</div>
            <div className="mt-1 font-semibold text-slate-800">
              {anoBase.mesesReais} {anoBase.mesesReais === 1 ? 'mês importado' : 'meses importados'}
              {anoBase.anualizado && ' (demais meses pela média)'}
            </div>
            <div className="text-slate-500">Receita anual: {moeda(primeiro.receita)}</div>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Alíquotas de referência IBS/CBS</span>
            <div className="mt-1">
              <Select
                value={p.cenarioAliquotas}
                onChange={(v) => {
                  const c = CENARIOS_ALIQUOTA.find((x) => x.id === v)
                  onParams(c ? { ...p, cenarioAliquotas: v, cbsReferencia: c.cbs, ibsReferencia: c.ibs } : { ...p, cenarioAliquotas: v })
                }}
                opcoes={[...CENARIOS_ALIQUOTA.map((c) => ({ value: c.id, label: c.nome })), { value: 'personalizado', label: 'Personalizado (Parâmetros)' }]}
              />
            </div>
            <span className="mt-1 block text-xs text-slate-500">
              CBS {p.cbsReferencia.toLocaleString('pt-BR')}% + IBS {p.ibsReferencia.toLocaleString('pt-BR')}%
            </span>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Crescimento da receita ao ano (%)</span>
            <input className="input mt-1" type="number" step="0.5" value={p.crescimentoAnual} onChange={(e) => onParams({ ...p, crescimentoAnual: Number(e.target.value) || 0 })} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Vendas para empresas (B2B) %</span>
            <input className="input mt-1" type="number" step="5" min={0} max={100} value={p.percentualB2B} onChange={(e) => onParams({ ...p, percentualB2B: Number(e.target.value) || 0 })} />
            <span className="mt-1 block text-xs text-slate-500">Mede o crédito de IBS/CBS que seus clientes aproveitam</span>
          </label>
        </div>
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
          Premissa: o valor das operações registrado hoje é mantido como base de cálculo; IBS e CBS são calculados "por fora" e sem ICMS/ISS/PIS/COFINS/IPI na base (LC 214/2025,
          art. 12, §2º). As alíquotas de referência definitivas serão fixadas pelo Senado — a da CBS de 2027 até 15/12/2026. {CENARIOS_ALIQUOTA.find((c) => c.id === p.cenarioAliquotas)?.fonte}
        </p>
      </Section>

      {atual0 && atualN && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <div className="text-xs font-semibold text-slate-500 uppercase">Regime atual em 2026</div>
            <div className="mt-2 flex items-center gap-2 text-2xl font-extrabold text-slate-900 tabular-nums">{moedaCurta(atual0.total)}</div>
            <div className="text-sm text-slate-500">
              {nomeRegime(regimeAtual)} · {pct(atual0.carga)}
            </div>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
            <div className="text-xs font-semibold text-slate-500 uppercase">Regime atual em 2033 (reforma completa)</div>
            <div className="mt-2 text-2xl font-extrabold text-slate-900 tabular-nums">{moedaCurta(atualN.total)}</div>
            <div className={`text-sm font-semibold ${atualN.total > atual0.total ? 'text-rose-600' : 'text-emerald-600'}`}>
              {atualN.total >= atual0.total ? '+' : ''}
              {moedaCurta(atualN.total - atual0.total)} ({atual0.total ? pct(atualN.total / atual0.total - 1, 1) : '—'})
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white shadow-lg shadow-emerald-500/30">
            <div className="text-xs font-semibold uppercase opacity-80">Melhor regime em 2033</div>
            <div className="mt-2 text-2xl font-extrabold">{ultimo.melhor ? nomeRegime(ultimo.melhor) : '—'}</div>
            <div className="text-sm opacity-90">
              {ultimo.melhor && ultimo.resultados[ultimo.melhor] && `${moedaCurta(ultimo.resultados[ultimo.melhor]!.total)} · ${pct(ultimo.resultados[ultimo.melhor]!.carga)}`}
            </div>
          </div>
        </div>
      )}

      <Section title="Carga tributária por regime, ano a ano" icone={LineChart} cor="emerald">
        <div className="mb-3">
          <Legenda series={series} />
        </div>
        <BarrasAgrupadas
          grupos={anos.map((a) => ({
            rotulo: String(a.ano),
            valores: Object.fromEntries(REGIMES.map((r) => [r.value, a.resultados[r.value]?.total])),
            extra: Object.fromEntries(REGIMES.map((r) => [r.value, a.resultados[r.value] ? `carga ${pct(a.resultados[r.value]!.carga)}${a.melhor === r.value ? ' · menor carga' : ''}` : ''])),
          }))}
          series={series}
          formatar={moeda}
          destaque={(gi, s) => anos[gi].melhor === s}
          altura={300}
        />
        <p className="mt-1 text-xs text-slate-500">● marca o regime de menor carga em cada ano. O Simples híbrido (IBS/CBS por fora do DAS) só existe a partir de 2027.</p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3 text-left">Regime</th>
                {anos.map((a) => (
                  <th key={a.ano} className="px-2 py-2.5">
                    {a.ano}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {REGIMES.map((r) => (
                <Fragment key={r.value}>
                  <tr className="border-b border-slate-100 text-right">
                    <td className="py-2 pr-3 text-left font-semibold text-slate-700">
                      <span className="flex items-center gap-2">
                        <PontoRegime regime={r.value} />
                        {r.curto}
                      </span>
                    </td>
                    {anos.map((a) => {
                      const x = a.resultados[r.value]
                      const melhor = a.melhor === r.value
                      return (
                        <td key={a.ano} className={`px-2 py-2 ${melhor ? 'bg-emerald-50 font-bold text-emerald-800' : ''} ${x && !x.elegivel ? 'text-slate-300 line-through' : ''}`}>
                          {x ? (
                            <>
                              {moedaCurta(x.total)}
                              <div className="text-[11px] font-medium text-slate-500">{pct(x.carga)}</div>
                            </>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </Fragment>
              ))}
              <tr className="text-right text-xs text-slate-500">
                <td className="py-2 pr-3 text-left">Crédito de IBS/CBS aos clientes B2B — {nomeRegime(regime)}</td>
                {anos.map((a) => (
                  <td key={a.ano} className="px-2 py-2">
                    {a.resultados[regime] ? moedaCurta(a.resultados[regime]!.creditoTransferido) : '—'}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title={`Tributos ano a ano — ${nomeRegime(regime)}`}
        icone={Landmark}
        cor="violet"
        actions={<Segmentado valor={regime} onChange={setRegime} opcoes={REGIMES.map((r) => ({ value: r.value, label: r.curto }))} />}
      >
        <TabelaTributos
          receita
          colunas={anos
            .filter((a) => a.resultados[regime])
            .map((a) => {
              const x = a.resultados[regime]!
              return { id: String(a.ano), titulo: String(a.ano), tributos: x.tributos, total: x.total, receita: x.receita }
            })}
        />
        {(regime === 'simples_hibrido' || regime === 'presumido' || regime === 'real') && (
          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
            {anos
              .filter((a) => a.resultados[regime] && a.ano >= 2027)
              .map((a) => {
                const x = a.resultados[regime]!
                return (
                  <div key={a.ano} className="rounded-lg bg-slate-50 px-3 py-2">
                    <strong>{a.ano}:</strong> créditos de IBS/CBS aproveitados {moedaCurta(x.creditosIbsCbs)}
                    {x.saldoCredor > 0 && <> · saldo credor a ressarcir {moedaCurta(x.saldoCredor)}</>}
                  </div>
                )
              })}
          </div>
        )}
      </Section>

      <Section title="Cronograma da transição aplicado" icone={CalendarRange} cor="amber">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3 text-left">Ano</th>
                <th className="px-3 py-2.5">PIS/COFINS</th>
                <th className="px-3 py-2.5">IPI</th>
                <th className="px-3 py-2.5">CBS</th>
                <th className="px-3 py-2.5">IBS</th>
                <th className="px-3 py-2.5">ICMS/ISS</th>
                <th className="px-3 py-2.5 text-left">Base legal</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ANOS_TRANSICAO.map((ano) => {
                const r = regrasDoAno(ano, p.cbsReferencia, p.ibsReferencia)
                return (
                  <tr key={ano} className="border-b border-slate-100 text-right">
                    <td className="py-2 pr-3 text-left font-semibold">{ano}</td>
                    <td className="px-3 py-2">{r.pisCofins ? 'Cobrados' : 'Extintos'}</td>
                    <td className="px-3 py-2">{r.ipi ? 'Cobrado' : 'Zero (exceto ZFM)'}</td>
                    <td className="px-3 py-2">{r.teste ? '0,9% (teste)' : pct(r.cbs)}</td>
                    <td className="px-3 py-2">{r.teste ? '0,1% (teste)' : pct(r.ibs, 3)}</td>
                    <td className="px-3 py-2">{pct(r.icmsIssFator, 0)} da alíquota</td>
                    <td className="px-3 py-2 text-left text-xs text-slate-500">
                      {ano === 2026
                        ? 'LC 214, arts. 343, 346 e 348'
                        : ano <= 2028
                          ? 'EC 132 (ADCT art. 126); LC 214, arts. 344 e 347'
                          : ano < 2033
                            ? 'EC 132 (ADCT arts. 128 e 130)'
                            : 'EC 132 (ADCT art. 129) — ICMS e ISS extintos'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Alertas itens={alertas} />
    </div>
  )
}
