import { useMemo, useState, type ReactNode } from 'react'
import { FileSpreadsheet, Info } from 'lucide-react'
import { Section } from '../../../components/ui'
import { apurar } from '../../engine/apuracao'
import { nomeMes } from '../../engine/base'
import { linhasDre, ordenarDeducoes, type LinhaDre } from '../../engine/dre'
import { REGIMES, type RegimeId, type Resultado } from '../../engine/tipos'
import { COR_REGIME, moeda, moedaCurta, nomeRegime, pct } from '../../formatacao'
import { PontoRegime, Segmentado } from '../comum'
import { BarrasHorizontais } from '../graficos'
import type { DadosAnalise } from '../contexto'

type Coluna = { id: string; titulo: ReactNode; r: Resultado; regime: RegimeId }

export function Dre({ d }: { d: DadosAnalise }) {
  const anosDados = useMemo(() => [...new Set(d.bases.map((b) => b.competencia.slice(0, 4)))].sort(), [d.bases])
  const [horizonte, setHorizonte] = useState<'real' | 'projecao'>('real')
  const [periodo, setPeriodo] = useState(anosDados[anosDados.length - 1] ?? 'tudo')
  const [visao, setVisao] = useState<'regimes' | 'anos'>('regimes')
  const [anoProj, setAnoProj] = useState(2027)
  const [regime, setRegime] = useState<RegimeId>(d.regimeAtual)
  const [mostrarPct, setMostrarPct] = useState(true)

  const meses = periodo === 'tudo' ? d.bases : d.bases.filter((b) => b.competencia.startsWith(periodo))
  const reais = useMemo(() => (['simples', 'presumido', 'real'] as RegimeId[]).map((r) => apurar(r, meses, d.ctx)), [meses, d.ctx])

  let colunas: Coluna[]
  if (horizonte === 'real') colunas = reais.map((r) => ({ id: r.regime, titulo: nomeRegime(r.regime), r, regime: r.regime }))
  else if (visao === 'regimes') {
    const a = d.anos.find((x) => x.ano === anoProj) ?? d.anos[0]
    colunas = REGIMES.filter((x) => a.resultados[x.value]).map((x) => ({ id: x.value, titulo: x.curto, r: a.resultados[x.value]!, regime: x.value }))
  } else
    colunas = d.anos
      .filter((a) => a.resultados[regime])
      .map((a) => ({ id: String(a.ano), titulo: String(a.ano), r: a.resultados[regime]!, regime }))

  const tabelas = colunas.map((c) => ({ ...c, linhas: linhasDre(c.r.dre) }))
  // estrutura comum a todas as colunas: as deduções variam por regime (DAS x ICMS/PIS/COFINS/IBS/CBS)
  const deducoes = new Map<string, LinhaDre>()
  for (const t of tabelas) for (const l of t.linhas) if (l.chave.startsWith('ded-') && !deducoes.has(l.chave)) deducoes.set(l.chave, l)
  const modelo = tabelas[0]?.linhas.filter((l) => !l.chave.startsWith('ded-')) ?? []
  const pos = modelo.findIndex((l) => l.chave === 'dev') + 1
  const chaves: LinhaDre[] = [...modelo.slice(0, pos), ...ordenarDeducoes([...deducoes.values()]), ...modelo.slice(pos)]
  const valor = (t: (typeof tabelas)[number], chave: string) => t.linhas.find((l) => l.chave === chave)?.valor ?? 0
  const liquido = tabelas.map((t) => ({ t, v: valor(t, 'll') }))
  const melhor = liquido.length ? liquido.reduce((a, b) => (b.v > a.v ? b : a)) : null

  const rotuloPeriodo = horizonte === 'real' ? (meses.length ? `${nomeMes(meses[0].competencia)} a ${nomeMes(meses[meses.length - 1].competencia)}` : '') : visao === 'regimes' ? `ano projetado ${anoProj}` : `${nomeRegime(regime)} — 2026 a 2033`

  return (
    <div className="space-y-5">
      <Section
        title={`DRE por regime tributário — ${rotuloPeriodo}`}
        icone={FileSpreadsheet}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmentado
              valor={horizonte}
              onChange={setHorizonte}
              opcoes={[
                { value: 'real', label: 'Período importado' },
                { value: 'projecao', label: 'Projeção 2026–2033' },
              ]}
            />
            {horizonte === 'real' && (
              <select className="input w-auto py-1.5" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                {anosDados.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
                {anosDados.length > 1 && <option value="tudo">Todo o período</option>}
              </select>
            )}
            {horizonte === 'projecao' && (
              <>
                <Segmentado
                  valor={visao}
                  onChange={setVisao}
                  opcoes={[
                    { value: 'regimes', label: 'Regimes num ano' },
                    { value: 'anos', label: 'Um regime ano a ano' },
                  ]}
                />
                {visao === 'regimes' ? (
                  <select className="input w-auto py-1.5" value={anoProj} onChange={(e) => setAnoProj(Number(e.target.value))}>
                    {d.anos.map((a) => (
                      <option key={a.ano} value={a.ano}>
                        {a.ano}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select className="input w-auto py-1.5" value={regime} onChange={(e) => setRegime(e.target.value as RegimeId)}>
                    {REGIMES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.curto}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input type="checkbox" checked={mostrarPct} onChange={(e) => setMostrarPct(e.target.checked)} /> % da receita
            </label>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                <th className="sticky left-0 bg-white py-2.5 pr-4 text-left">Demonstração do resultado</th>
                {tabelas.map((t) => (
                  <th key={t.id} className={`px-3 py-2.5 whitespace-nowrap ${melhor?.t.id === t.id && tabelas.length > 1 && visao === 'regimes' ? 'text-emerald-700' : ''}`}>
                    <span className="inline-flex items-center gap-1.5">
                      {visao === 'regimes' || horizonte === 'real' ? <PontoRegime regime={t.regime} /> : null}
                      {t.titulo}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {chaves.map((l) => {
                const forte = l.tipo === 'subtotal' || l.tipo === 'resultado' || l.tipo === 'receita'
                return (
                  <tr
                    key={l.chave}
                    className={`border-b ${l.tipo === 'resultado' ? 'border-slate-300 bg-emerald-50/50' : l.tipo === 'subtotal' ? 'border-slate-200 bg-slate-50' : 'border-slate-100'}`}
                  >
                    <td className={`sticky left-0 py-2 pr-4 whitespace-nowrap ${l.tipo === 'resultado' ? 'bg-emerald-50' : l.tipo === 'subtotal' ? 'bg-slate-50' : 'bg-white'} ${forte ? 'font-bold text-slate-900' : 'pl-3 text-slate-600'}`}>
                      {l.rotulo}
                    </td>
                    {tabelas.map((t) => {
                      const v = valor(t, l.chave)
                      const rb = t.r.dre.receitaBruta
                      return (
                        <td key={t.id} className={`px-3 py-2 text-right whitespace-nowrap ${forte ? 'font-bold text-slate-900' : v < 0 ? 'text-slate-600' : 'text-slate-700'}`}>
                          {Math.abs(v) < 0.005 ? <span className="text-slate-300">—</span> : moeda(v)}
                          {mostrarPct && Math.abs(v) >= 0.005 && rb > 0 && <div className="text-[10px] font-medium text-slate-400">{pct(v / rb, 1)}</div>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr className="text-right text-xs text-slate-500">
                <td className="sticky left-0 bg-white py-2 pr-4 text-left">Carga tributária total (tributos ÷ receita bruta)</td>
                {tabelas.map((t) => (
                  <td key={t.id} className="px-3 py-2 font-semibold">
                    {pct(t.r.carga)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Section title="Lucro líquido" icone={FileSpreadsheet} cor="emerald">
            <BarrasHorizontais
              formatar={moeda}
              itens={liquido.map(({ t, v }) => ({
                id: t.id,
                rotulo: typeof t.titulo === 'string' ? t.titulo : t.id,
                valor: Math.max(0, v),
                cor: COR_REGIME[t.regime],
                detalhe: t.r.dre.receitaBruta ? `margem ${pct(v / t.r.dre.receitaBruta, 1)}` : '',
              }))}
            />
            {liquido.some(({ v }) => v < 0) && <p className="mt-2 text-xs text-rose-600">Colunas com prejuízo aparecem zeradas no gráfico.</p>}
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section title="Como ler esta DRE" icone={Info} cor="sky">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              <li>
                <strong>Deduções</strong> são os débitos dos tributos sobre a receita (no Simples, o DAS inteiro — que já inclui IRPJ, CSLL e CPP). Os <strong>créditos</strong> de
                ICMS, PIS/COFINS (Lucro Real) e IBS/CBS reduzem o custo e as despesas.
              </li>
              <li>
                Custo pelo valor das notas de compra {d.params.cmvPercentual !== null ? `(CMV fixado em ${d.params.cmvPercentual}% da receita nos parâmetros)` : '(estoque considerado constante — ajuste o CMV nos Parâmetros se houver variação)'}.
              </li>
              <li>
                Premissa da reforma: {d.params.premissaPreco === 'preco_mantido' ? 'preço ao cliente mantido — o IBS/CBS sai de dentro do valor atual da nota' : 'IBS/CBS repassado por fora — somado ao preço (receita e compras aumentam)'}.
              </li>
              <li>Folha, pró-labore e despesas gerais vêm dos Parâmetros. {!d.params.folhaMensal && !d.params.proLaboreMensal && <strong className="text-amber-700">Ainda não informados.</strong>}</li>
              <li>
                Lucro Real: IRPJ/CSLL calculados sobre o lucro desta DRE. Presumido: sobre a presunção (8%/12% ou 32%). Projeções usam o ano-base de {moedaCurta(d.anos[0]?.receita ?? 0)}/ano.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  )
}
