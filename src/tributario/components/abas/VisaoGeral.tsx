import { useMemo } from 'react'
import { Award, Building2, Coins, LineChart, Receipt, TrendingUp } from 'lucide-react'
import { mascaraCnpj } from '../../../lib/format'
import { Section } from '../../../components/ui'
import { apurar, type Contexto } from '../../engine/apuracao'
import { montarBases, nomeMes, type DadosEstab } from '../../engine/base'
import { projetar } from '../../engine/projecao'
import { REGIMES, receitaBruta, type BaseMensal, type Estabelecimento, type MovimentoLinha, type RegimeId } from '../../engine/tipos'
import { COR_REGIME, moeda, moedaCurta, nomeRegime, pct, recomendacao } from '../../formatacao'
import { Kpi } from '../comum'
import { BarrasAgrupadas, BarrasHorizontais, Legenda } from '../graficos'

export function VisaoGeral({
  bases,
  ctx,
  regimeAtual,
  linhas,
  estabelecimentos,
  dadosEstab,
}: {
  bases: BaseMensal[]
  ctx: Contexto
  regimeAtual: RegimeId
  linhas: MovimentoLinha[]
  estabelecimentos: Estabelecimento[]
  dadosEstab: DadosEstab
}) {
  const ultimoAno = bases[bases.length - 1]?.competencia.slice(0, 4)
  const mesesAno = useMemo(() => bases.filter((b) => b.competencia.startsWith(ultimoAno ?? '')), [bases, ultimoAno])
  const hoje = useMemo(() => (['simples', 'presumido', 'real'] as RegimeId[]).map((r) => apurar(r, mesesAno, ctx)), [mesesAno, ctx])
  const anos = useMemo(() => projetar(bases, ctx), [bases, ctx])
  const porEstab = useMemo(
    () =>
      estabelecimentos.map((e) => {
        const b = montarBases(
          linhas.filter((l) => l.estabelecimento_id === e.id),
          ctx.params,
          dadosEstab,
        )
        return { e, receita: b.reduce((s, x) => s + receitaBruta(x), 0), compras: b.reduce((s, x) => s + x.compras - x.devolucoesCompra, 0) }
      }),
    [estabelecimentos, linhas, ctx.params, dadosEstab],
  )

  const atual = hoje.find((r) => r.regime === regimeAtual)!
  const rotulo = mesesAno.length ? `${nomeMes(mesesAno[0].competencia)} a ${nomeMes(mesesAno[mesesAno.length - 1].competencia)}` : ''
  const rec = recomendacao(hoje, regimeAtual, rotulo)
  const melhor = hoje.find((r) => r.regime === rec?.melhor)
  const a2033 = anos[anos.length - 1]
  const series = REGIMES.map((r) => ({ id: r.value, label: r.curto, cor: COR_REGIME[r.value] }))
  const totalReceita = porEstab.reduce((s, x) => s + x.receita, 0)

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo={`Receita bruta ${ultimoAno}`} valor={moedaCurta(atual.receita)} detalhe={rotulo} icone={<Receipt className="h-4 w-4" />} />
        <Kpi
          titulo={`Tributos no regime atual`}
          valor={moedaCurta(atual.total)}
          detalhe={`${nomeRegime(regimeAtual)} · carga ${pct(atual.carga)}`}
          icone={<Coins className="h-4 w-4" />}
          tom="violet"
        />
        <Kpi
          titulo="Melhor regime hoje"
          valor={melhor ? nomeRegime(melhor.regime) : '—'}
          detalhe={melhor && melhor.regime !== regimeAtual ? `economia de ${moedaCurta(atual.total - melhor.total)} no período` : 'o regime atual já é o mais econômico'}
          icone={<Award className="h-4 w-4" />}
          tom="emerald"
        />
        <Kpi
          titulo="Melhor regime em 2033"
          valor={a2033?.melhor ? nomeRegime(a2033.melhor) : '—'}
          detalhe={a2033?.melhor ? `carga ${pct(a2033.resultados[a2033.melhor]!.carga)} com a reforma concluída` : ''}
          icone={<TrendingUp className="h-4 w-4" />}
          tom="amber"
        />
      </div>

      {rec && <div className="rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900">{rec.texto}</div>}

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Section title={`Carga por regime — ${ultimoAno}`} icone={Coins} cor="emerald">
            <BarrasHorizontais formatar={moeda} itens={hoje.map((r) => ({ id: r.regime, rotulo: nomeRegime(r.regime), valor: r.total, cor: COR_REGIME[r.regime], detalhe: pct(r.carga) }))} />
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section title="Reforma Tributária — carga anual projetada" icone={LineChart} cor="violet" actions={<Legenda series={series} />}>
            <BarrasAgrupadas
              grupos={anos.map((a) => ({ rotulo: String(a.ano), valores: Object.fromEntries(REGIMES.map((r) => [r.value, a.resultados[r.value]?.total])) }))}
              series={series}
              formatar={moeda}
              destaque={(gi, s) => anos[gi].melhor === s}
              altura={240}
            />
          </Section>
        </div>
      </div>

      <Section title="Estabelecimentos (consolidados na apuração)" icone={Building2} cor="sky">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3">Estabelecimento</th>
                <th className="px-3 py-2.5">CNPJ</th>
                <th className="px-3 py-2.5">UF</th>
                <th className="px-3 py-2.5 text-right">Receita bruta</th>
                <th className="px-3 py-2.5 text-right">Participação</th>
                <th className="px-3 py-2.5 text-right">Compras líquidas</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {porEstab.map(({ e, receita, compras }) => (
                <tr key={e.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium text-slate-700">
                    {e.nome} {e.matriz && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">MATRIZ</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-500">{mascaraCnpj(e.cnpj)}</td>
                  <td className="px-3 py-2 text-slate-500">{e.uf}</td>
                  <td className="px-3 py-2 text-right">{moeda(receita)}</td>
                  <td className="px-3 py-2 text-right">{totalReceita ? pct(receita / totalReceita, 1) : '—'}</td>
                  <td className="px-3 py-2 text-right">{moeda(compras)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
