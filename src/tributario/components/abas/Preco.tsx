import { useMemo, useState } from 'react'
import { Award, Calculator, LineChart, Tags } from 'lucide-react'
import { Section } from '../../../components/ui'
import { lucroAntesIr } from '../../engine/apuracao'
import { tratamentoNcm } from '../../engine/ncm'
import { composicaoAoPreco, precoParaMargem, type ComposicaoPreco, type ContextoPreco, type EntradaPreco } from '../../engine/preco'
import { regimesDoAno, type AnoProjetado } from '../../engine/projecao'
import { ICMS_INTERNO_UF } from '../../engine/tabelas'
import { REGIMES, type RegimeFornecedor, type RegimeId } from '../../engine/tipos'
import { COR_REGIME, REGIMES_FORN, moeda, nomeRegime, pct } from '../../formatacao'
import { PontoRegime, Segmentado } from '../comum'
import type { DadosAnalise } from '../contexto'
import { BarrasAgrupadas, Legenda } from '../graficos'

type Modo = 'margem' | 'preco'

/** Dados da empresa no ano, tirados da projeção: RBT12 do Simples e IRPJ/CSLL efetivos do Presumido e do Real. */
function contextoPreco(d: DadosAnalise, a: AnoProjetado): ContextoPreco {
  const g = d.params.crescimentoAnual / 100
  const rbt12 = a.resultados.simples?.porMes[0]?.simples?.rbt12 ?? a.receita / (1 + g)
  const pres = a.resultados.presumido
  const real = a.resultados.real
  const irPres = pres && pres.receita ? (pres.tributos.IRPJ + pres.tributos.CSLL) / pres.receita : 0.0228
  const lair = real ? lucroAntesIr(real.dre) : 0
  const irReal = real && lair > 0 ? Math.min(0.34, Math.max(0.24, (real.tributos.IRPJ + real.tributos.CSLL) / lair)) : 0.34
  return { params: d.params, ano: a.ano, rbt12, irCsllPresumido: irPres, irCsllReal: irReal }
}

function padroes(d: DadosAnalise): EntradaPreco {
  const compras = d.bases.reduce((s, b) => s + b.compras, 0)
  const icmsCompras = d.bases.reduce((s, b) => s + b.icmsCompras, 0)
  const matriz = d.estabs.find((e) => e.matriz) ?? d.estabs[0]
  const modal = matriz?.aliquota_icms ?? ICMS_INTERNO_UF[matriz?.uf ?? 'SP'] ?? 18
  // despesas fixas em % da receita, pela DRE do Presumido no primeiro ano projetado
  const dre = d.anos[0]?.resultados.presumido?.dre
  const fixas = dre && dre.receitaBruta ? ((dre.servicosTomados + dre.despesasOperacionais + dre.pessoal + dre.encargos + dre.despesasGerais) / dre.receitaBruta) * 100 : 10
  return {
    custo: 100,
    fornecedor: 'normal',
    icmsCompra: compras ? Math.round((icmsCompras / compras) * 10000) / 100 : 12,
    stCompra: 0,
    icmsVenda: modal,
    st: false,
    monofasico: false,
    reducao: 0,
    despesasVariaveis: 3,
    despesasFixas: Math.round(fixas * 100) / 100,
    margem: 10,
  }
}

const num = (v: string) => (v === '' ? 0 : Number(v.replace(',', '.')) || 0)

export function Preco({ d }: { d: DadosAnalise }) {
  const [e, setE] = useState<EntradaPreco>(() => padroes(d))
  const [modo, setModo] = useState<Modo>('margem')
  const [precoInformado, setPrecoInformado] = useState(150)
  const [ano, setAno] = useState(String(d.anos.find((a) => a.ano === 2027)?.ano ?? d.anos[0]?.ano ?? 2026))
  const [ncm, setNcm] = useState('')
  const mudar = (c: Partial<EntradaPreco>) => setE((x) => ({ ...x, ...c }))

  const ncms = useMemo(() => {
    const vendidos = new Map<string, number>()
    for (const l of d.linhas) if (l.ncm && d.eVenda(l)) vendidos.set(l.ncm, (vendidos.get(l.ncm) ?? 0) + l.valor_contabil)
    return [...vendidos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300)
  }, [d])

  function escolherNcm(n: string) {
    setNcm(n)
    if (!n) return
    const t = tratamentoNcm(n, d.params.ncms)
    const matriz = d.estabs.find((x) => x.matriz) ?? d.estabs[0]
    mudar({ st: t.st, monofasico: t.monofasico, reducao: Math.round(t.reducao * 100), icmsVenda: t.aliquotaIcms ?? matriz?.aliquota_icms ?? ICMS_INTERNO_UF[matriz?.uf ?? 'SP'] ?? 18 })
  }

  const porAno = useMemo(
    () =>
      d.anos.map((a) => {
        const ctx = contextoPreco(d, a)
        const r: Partial<Record<RegimeId, ComposicaoPreco>> = {}
        for (const reg of regimesDoAno(a.ano)) r[reg] = modo === 'margem' ? precoParaMargem(reg, e, ctx) : composicaoAoPreco(reg, precoInformado, e, ctx)
        return { ano: a.ano, ctx, r }
      }),
    [d, e, modo, precoInformado],
  )
  const atual = porAno.find((x) => String(x.ano) === ano) ?? porAno[0]
  if (!atual) return null
  const lista = Object.values(atual.r).filter((x): x is ComposicaoPreco => !!x)
  const viaveis = lista.filter((x) => x.viavel)
  const menor = (f: (x: ComposicaoPreco) => number) => (viaveis.length ? viaveis.reduce((a, b) => (f(b) < f(a) ? b : a)).regime : null)
  const melhorConsumidor = modo === 'margem' ? menor((x) => x.precoFinal) : menor((x) => -x.lucro)
  const melhorEmpresa = modo === 'margem' ? menor((x) => x.custoCliente) : null
  const reforma = Number(ano) >= 2027

  const linhas: { rotulo: string; f: (x: ComposicaoPreco) => number; forte?: boolean; neg?: boolean; so?: (x: ComposicaoPreco) => boolean }[] = [
    { rotulo: 'Preço de venda (nota, tributos por dentro)', f: (x) => x.preco, forte: true },
    { rotulo: '(+) CBS/IBS destacados por fora', f: (x) => x.ibsCbsFora },
    { rotulo: '= Preço final pago pelo cliente', f: (x) => x.precoFinal, forte: true },
    { rotulo: 'Valor pago ao fornecedor (com ST e CBS/IBS)', f: (x) => x.desembolsoCompra, neg: true },
    { rotulo: '(+) Crédito de ICMS', f: (x) => x.creditoIcms },
    { rotulo: '(+) Crédito de PIS/COFINS', f: (x) => x.creditoPisCofins },
    { rotulo: '(+) Crédito de CBS/IBS', f: (x) => x.creditoIbsCbs },
    { rotulo: '= Custo líquido da mercadoria', f: (x) => x.custoLiquido, neg: true, forte: true },
    { rotulo: 'DAS', f: (x) => x.das, neg: true },
    { rotulo: 'ICMS a recolher', f: (x) => x.icms, neg: true },
    { rotulo: 'PIS + COFINS a recolher', f: (x) => x.pisCofins, neg: true },
    { rotulo: 'CBS + IBS a recolher', f: (x) => x.ibsCbs, neg: true },
    { rotulo: 'Despesas variáveis e fixas', f: (x) => x.despesas, neg: true },
    { rotulo: 'IRPJ + CSLL', f: (x) => x.irCsll, neg: true },
    { rotulo: '= Lucro líquido por unidade', f: (x) => x.lucro, forte: true },
    { rotulo: 'Crédito que um cliente contribuinte aproveita', f: (x) => x.creditoCliente },
    { rotulo: 'Custo efetivo para o cliente contribuinte', f: (x) => x.custoCliente, forte: true },
  ]
  const usadas = linhas.filter((l) => l.forte || lista.some((x) => Math.abs(l.f(x)) > 0.004))
  const series = REGIMES.map((r) => ({ id: r.value, label: r.curto, cor: COR_REGIME[r.value] }))

  const campo = (rotulo: string, valor: number, onChange: (v: number) => void, dica?: string, passo = 0.01) => (
    <label className="block">
      <span className="text-xs font-semibold text-slate-500">{rotulo}</span>
      <input className="input mt-1" type="number" step={passo} value={Number.isFinite(valor) ? valor : 0} onChange={(ev) => onChange(num(ev.target.value))} />
      {dica && <span className="mt-1 block text-[0.6875rem] text-slate-400">{dica}</span>}
    </label>
  )

  return (
    <div className="space-y-5">
      <Section
        title="Formação de preço e markup"
        icone={Tags}
        actions={
          <Segmentado
            valor={modo}
            onChange={setModo}
            opcoes={[
              { value: 'margem', label: 'Preço para a margem' },
              { value: 'preco', label: 'Margem ao preço' },
            ]}
          />
        }
      >
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          {modo === 'margem'
            ? 'Informe o custo e a margem líquida desejada: o sistema calcula o preço de venda em cada regime, com os créditos das compras e os tributos do ano escolhido.'
            : 'Informe o preço de venda praticado: o sistema mostra a margem líquida que sobra em cada regime.'}{' '}
          Tributos da empresa (alíquota do Simples, IRPJ/CSLL) vêm da projeção de cada ano.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-slate-500">Produto (NCM vendido) — opcional, preenche ST, monofásico, redução e ICMS</span>
            <select className="input mt-1" value={ncm} onChange={(ev) => escolherNcm(ev.target.value)}>
              <option value="">— informar manualmente —</option>
              {ncms.map(([n]) => (
                <option key={n} value={n}>
                  {n} {d.produtos.get(n) ? `— ${d.produtos.get(n)!.slice(0, 60)}` : ''}
                </option>
              ))}
            </select>
          </label>
          {campo('Custo de compra (valor da nota, R$)', e.custo, (v) => mudar({ custo: v }))}
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Regime do fornecedor</span>
            <select className="input mt-1" value={e.fornecedor} onChange={(ev) => mudar({ fornecedor: ev.target.value as RegimeFornecedor })}>
              {REGIMES_FORN.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {campo('ICMS destacado na compra (%)', e.icmsCompra, (v) => mudar({ icmsCompra: v }), 'média das compras importadas')}
          {campo('ICMS-ST / antecipação na entrada (% do custo)', e.stCompra, (v) => mudar({ stCompra: v }), 'custo definitivo, sem crédito')}
          {campo('ICMS na venda (%)', e.icmsVenda, (v) => mudar({ icmsVenda: v }), 'interna do NCM ou 4/7/12% interestadual')}
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Redução de CBS/IBS</span>
            <select className="input mt-1" value={e.reducao} onChange={(ev) => mudar({ reducao: Number(ev.target.value) })}>
              {[0, 30, 40, 60, 100].map((r) => (
                <option key={r} value={r}>
                  {r === 0 ? 'Sem redução' : r === 100 ? 'Alíquota zero' : `${r}%`}
                </option>
              ))}
            </select>
          </label>
          {campo('Despesas variáveis (% do preço)', e.despesasVariaveis, (v) => mudar({ despesasVariaveis: v }), 'comissão, cartão, frete de venda')}
          {campo('Despesas fixas (% do preço)', e.despesasFixas, (v) => mudar({ despesasFixas: v }), 'padrão: folha + despesas ÷ receita')}
          {modo === 'margem'
            ? campo('Margem líquida desejada (% do preço)', e.margem, (v) => mudar({ margem: v }), 'depois de IRPJ/CSLL', 0.5)
            : campo('Preço de venda praticado (R$)', precoInformado, setPrecoInformado, 'valor da nota, sem CBS/IBS por fora')}
          <div className="flex flex-col justify-center gap-2 text-sm text-slate-700">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={e.st} onChange={(ev) => mudar({ st: ev.target.checked })} /> Produto com ICMS-ST (sem débito na venda)
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={e.monofasico} onChange={(ev) => mudar({ monofasico: ev.target.checked })} /> PIS/COFINS monofásico
            </label>
          </div>
        </div>
      </Section>

      <Section
        title={`Resultado em ${ano}`}
        icone={Calculator}
        cor="emerald"
        actions={<Segmentado valor={ano} onChange={setAno} opcoes={porAno.map((x) => ({ value: String(x.ano), label: String(x.ano) }))} />}
      >
        <div className={`grid gap-4 md:grid-cols-2 ${lista.length > 3 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
          {lista.map((x) => (
            <div key={x.regime} className={`relative rounded-2xl p-5 ring-1 ${melhorConsumidor === x.regime ? 'bg-emerald-50/60 ring-2 ring-emerald-400' : 'bg-white ring-slate-200'}`}>
              {melhorConsumidor === x.regime && (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[0.6875rem] font-bold text-white shadow">
                  <Award className="h-3.5 w-3.5" /> {modo === 'margem' ? 'Menor preço final' : 'Maior lucro'}
                </span>
              )}
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <PontoRegime regime={x.regime} />
                {nomeRegime(x.regime)}
                {x.regime === d.regimeAtual && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.625rem] font-semibold text-slate-500">atual</span>}
              </div>
              {x.viavel ? (
                <>
                  <div className="mt-3 text-2xl font-extrabold text-slate-900 tabular-nums">{moeda(x.precoFinal)}</div>
                  <div className="text-xs text-slate-500">
                    {x.ibsCbsFora > 0 ? `${moeda(x.preco)} + ${moeda(x.ibsCbsFora)} de CBS/IBS por fora` : 'preço final ao cliente'}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-slate-500">Markup</dt>
                    <dd className="text-right font-semibold tabular-nums">{x.markup.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}×</dd>
                    <dt className="text-slate-500">Margem líquida</dt>
                    <dd className={`text-right font-semibold tabular-nums ${x.lucro < 0 ? 'text-rose-600' : ''}`}>{pct(x.margem)}</dd>
                    <dt className="text-slate-500">Lucro/unidade</dt>
                    <dd className="text-right font-semibold tabular-nums">{moeda(x.lucro)}</dd>
                    <dt className="text-slate-500">Carga tributária</dt>
                    <dd className="text-right font-semibold tabular-nums">{pct(x.cargaTributaria)}</dd>
                    <dt className="text-slate-500">Custo p/ cliente PJ</dt>
                    <dd className={`text-right font-semibold tabular-nums ${melhorEmpresa === x.regime ? 'text-emerald-600' : ''}`}>{moeda(x.custoCliente)}</dd>
                  </dl>
                </>
              ) : (
                <div className="mt-3 text-sm font-semibold text-rose-600">{x.observacoes[0]}</div>
              )}
            </div>
          ))}
        </div>
        {modo === 'margem' && melhorEmpresa && melhorEmpresa !== melhorConsumidor && (
          <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
            Para clientes <strong>contribuintes</strong> (que tomam crédito de CBS/IBS), o menor custo efetivo é no <strong>{nomeRegime(melhorEmpresa)}</strong>: o preço final é
            maior, mas o crédito integral compensa. Para consumidor final vale o preço final.
          </p>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[45rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Composição por unidade</th>
                {lista.map((x) => (
                  <th key={x.regime} className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <PontoRegime regime={x.regime} /> {nomeRegime(x.regime)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {usadas.map((l) => (
                <tr key={l.rotulo} className={`border-b border-slate-100 text-right ${l.forte ? 'font-bold text-slate-900' : 'text-slate-700'}`}>
                  <td className="py-1.5 pr-3 text-left">{l.rotulo}</td>
                  {lista.map((x) => (
                    <td key={x.regime} className="px-3 py-1.5">
                      {!x.viavel || Math.abs(l.f(x)) < 0.005 ? <span className="text-slate-300">—</span> : moeda(l.neg ? -l.f(x) : l.f(x))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {[...new Set(lista.flatMap((x) => (x.viavel ? x.observacoes : [])))].map((o) => (
          <p key={o} className="mt-2 text-xs text-amber-700">
            • {o}
          </p>
        ))}
      </Section>

      <Section title={modo === 'margem' ? 'Preço final ao cliente, ano a ano' : 'Lucro por unidade, ano a ano'} icone={LineChart} cor="violet">
        <div className="mb-3">
          <Legenda series={series} />
        </div>
        <BarrasAgrupadas
          series={series}
          formatar={moeda}
          aoClicar={(i) => setAno(String(porAno[i].ano))}
          selecionado={porAno.findIndex((x) => String(x.ano) === ano)}
          grupos={porAno.map((x) => ({
            rotulo: String(x.ano),
            valores: Object.fromEntries(Object.values(x.r).map((c) => [c!.regime, c!.viavel ? (modo === 'margem' ? c!.precoFinal : Math.max(0, c!.lucro)) : undefined])),
          }))}
        />
        <p className="mt-3 text-xs text-slate-500">
          {reforma
            ? 'Com a reforma, o preço do regime regular aparece com a CBS/IBS por fora; o Simples tradicional mantém tudo dentro do DAS.'
            : 'Em 2026 a CBS (0,9%) e o IBS (0,1%) são de teste e compensáveis: não alteram o preço.'}{' '}
          Premissa de preço dos fornecedores: {d.params.premissaPreco === 'repasse' ? 'repasse (tiram o PIS/COFINS e somam CBS/IBS por fora)' : 'preço mantido (CBS/IBS contida no valor pago)'} — ajuste em
          Parâmetros.
        </p>
      </Section>

      <Section title="Como o preço é formado" icone={Calculator} cor="sky">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-600">
          <li>
            <strong>Tributos por dentro</strong> (ICMS, PIS/COFINS, DAS) estão contidos no preço da nota; a <strong>CBS/IBS é por fora</strong>, calculada sobre o preço sem ICMS,
            ISS, PIS e COFINS (LC 214/2025, art. 12, §2º).
          </li>
          <li>
            <strong>Créditos na compra</strong>: ICMS pela não cumulatividade (LC 87/1996, art. 20); PIS/COFINS de 9,25% no Lucro Real não cumulativo, sem o ICMS destacado (Lei
            10.833/2003, art. 3º; Lei 14.592/2023), exceto compra de pessoa física; CBS/IBS integral de fornecedor do regime regular e limitado ao DAS de fornecedor do Simples (LC
            214/2025, art. 47); MEI e PF sem crédito de CBS/IBS.
          </li>
          <li>
            <strong>IRPJ/CSLL</strong>: Presumido pelo percentual efetivo da empresa sobre a receita ({pct(atual.ctx.irCsllPresumido)}); Real sobre o lucro (
            {pct(atual.ctx.irCsllReal, 0)}); Simples dentro do DAS, pela alíquota efetiva do RBT12 de {moeda(atual.ctx.rbt12)}.
          </li>
          <li>
            <strong>Markup</strong> = preço de nota ÷ custo de compra. A margem é o lucro líquido depois de IRPJ/CSLL sobre o preço de nota.
          </li>
        </ul>
      </Section>
    </div>
  )
}
