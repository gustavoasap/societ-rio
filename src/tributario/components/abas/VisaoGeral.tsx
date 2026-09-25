import { useMemo, useState } from 'react'
import { Award, Building2, Coins, HandCoins, LineChart, MapPinned, MessageSquareText, Package, Receipt, ShoppingCart, TrendingUp, Truck, Users, X } from 'lucide-react'
import { mascaraCnpj } from '../../../lib/format'
import { Section } from '../../../components/ui'
import { apurar } from '../../engine/apuracao'
import { linhaConsiderada, montarBases, naturezaDe, nomeMes, somarBases } from '../../engine/base'
import { fornecedorDoSimples } from '../../engine/cfop'
import { linhasDre } from '../../engine/dre'
import { REGIMES, receitaBruta, type RegimeId } from '../../engine/tipos'
import { COR_REGIME, moeda, moedaCurta, nomeRegime, pct, recomendacao } from '../../formatacao'
import { Kpi, Segmentado } from '../comum'
import { BarrasAgrupadas, BarrasHorizontais, Legenda } from '../graficos'
import type { DadosAnalise } from '../contexto'

const SERIES = [
  { id: 'receita', label: 'Receita bruta', cor: '#2a78d6' },
  { id: 'compras', label: 'Compras líquidas', cor: '#eb6834' },
  { id: 'tributos', label: 'Tributos (regime atual)', cor: '#1baf7a' },
]

function Ranking({ titulo, icone, itens, cor, total }: { titulo: string; icone: typeof Users; itens: { id: string; rotulo: string; valor: number; sub?: string }[]; cor: string; total: number }) {
  return (
    <Section title={titulo} icone={icone} cor="sky">
      {itens.length === 0 ? (
        <p className="text-sm text-slate-400">Sem dados no período.</p>
      ) : (
        <BarrasHorizontais formatar={moedaCurta} itens={itens.map((i) => ({ ...i, cor, detalhe: total ? pct(i.valor / total, 1) : '' }))} />
      )}
    </Section>
  )
}

export function VisaoGeral({ d }: { d: DadosAnalise }) {
  const { params } = d
  const anosDados = useMemo(() => [...new Set(d.bases.map((b) => b.competencia.slice(0, 4)))].sort(), [d.bases])
  const [periodo, setPeriodo] = useState(anosDados[anosDados.length - 1] ?? 'tudo')
  const [mesSel, setMesSel] = useState<string | null>(null)

  const mesesPeriodo = useMemo(() => (periodo === 'tudo' ? d.bases : d.bases.filter((b) => b.competencia.startsWith(periodo))), [d.bases, periodo])
  const escopo = mesSel ? mesesPeriodo.filter((b) => b.competencia === mesSel) : mesesPeriodo

  // regime atual mês a mês (para o gráfico) e todos os regimes no escopo
  const atualPeriodo = useMemo(() => apurar(d.regimeAtual, mesesPeriodo, d.ctx), [d.regimeAtual, mesesPeriodo, d.ctx])
  const regimesEscopo = useMemo(() => (['simples', 'presumido', 'real'] as RegimeId[]).map((r) => apurar(r, escopo, d.ctx)), [escopo, d.ctx])
  const atual = regimesEscopo.find((r) => r.regime === d.regimeAtual) ?? regimesEscopo[0]
  const soma = somarBases(escopo)
  const receita = receitaBruta(soma)
  const comprasLiq = soma.compras - soma.devolucoesCompra
  const rotulo = escopo.length ? (escopo.length === 1 ? nomeMes(escopo[0].competencia) : `${nomeMes(escopo[0].competencia)} a ${nomeMes(escopo[escopo.length - 1].competencia)}`) : ''
  const rec = recomendacao(regimesEscopo, d.regimeAtual, rotulo)
  const melhor = regimesEscopo.find((r) => r.regime === rec?.melhor)
  const presumido = regimesEscopo.find((r) => r.regime === 'presumido')!
  const real = regimesEscopo.find((r) => r.regime === 'real')!
  const lucroAtual = linhasDre(atual.dre).find((l) => l.chave === 'll')?.valor ?? 0

  // rankings no escopo
  const rankings = useMemo(() => {
    const clientes = new Map<string, number>()
    const fornecedores = new Map<string, number>()
    const ncms = new Map<string, number>()
    const ufs = new Map<string, number>()
    let pf = 0
    let vendasTot = 0
    let comprasTot = 0
    let comprasSimples = 0
    let comprasPf = 0
    const noEscopo = new Set(escopo.map((b) => b.competencia))
    for (const l of d.linhas) {
      if (!noEscopo.has(l.competencia) || !linhaConsiderada(l, params)) continue
      const n = naturezaDe(l, params.cfopNatureza)
      if (l.tipo === 'saida' && n === 'venda') {
        vendasTot += l.valor_contabil
        if (l.parceiro) clientes.set(l.parceiro, (clientes.get(l.parceiro) ?? 0) + l.valor_contabil)
        else if (l.destinatario === 'PF') pf += l.valor_contabil
        if (l.ncm) ncms.set(l.ncm, (ncms.get(l.ncm) ?? 0) + l.valor_contabil)
        const uf = l.uf || (l.cfop.startsWith('5') ? (d.dadosEstab(l.estabelecimento_id).uf ?? '—') : '—')
        ufs.set(uf, (ufs.get(uf) ?? 0) + l.valor_contabil)
      }
      if ((l.tipo === 'entrada' && (n === 'compra_revenda' || n === 'compra_insumo')) || l.tipo === 'servico_tomado') {
        if (l.tipo === 'entrada') {
          comprasTot += l.valor_contabil
          if (fornecedorDoSimples(l.cst)) comprasSimples += l.valor_contabil
          if (l.destinatario === 'PF') comprasPf += l.valor_contabil
        }
        const k = l.parceiro || (l.destinatario === 'PF' ? 'PF' : '')
        if (k) fornecedores.set(k, (fornecedores.get(k) ?? 0) + l.valor_contabil)
      }
    }
    if (pf) clientes.set('PF', pf)
    const nome = (k: string) => (k === 'PF' ? 'Pessoas físicas' : d.parceiros.get(k)?.nome || mascaraCnpj(k))
    const top = (m: Map<string, number>, f: (k: string) => string) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([k, v]) => ({ id: k, rotulo: f(k), valor: v }))
    return {
      clientes: top(clientes, nome),
      fornecedores: top(fornecedores, nome),
      ncms: top(ncms, (k) => `${k} · ${(d.produtos.get(k) ?? '').slice(0, 40)}`),
      ufs: top(ufs, (k) => k),
      pf,
      vendasTot,
      comprasTot,
      comprasSimples,
      comprasPf,
      maiorCliente: [...clientes.entries()].filter(([k]) => k !== 'PF').sort((a, b) => b[1] - a[1])[0],
    }
  }, [d.linhas, d.parceiros, d.produtos, d.dadosEstab, params, escopo])

  // insights descritivos
  const insights: string[] = []
  if (receita) {
    insights.push(
      `Receita bruta de ${moeda(receita)} em ${rotulo}, com compras líquidas de ${moeda(comprasLiq)} — margem bruta aproximada de ${pct((receita - comprasLiq) / receita, 1)} antes de tributos e despesas.`,
    )
    if (rankings.pf) insights.push(`${pct(rankings.pf / (rankings.vendasTot || 1), 1)} das vendas foram para consumidor final (CPF), que não aproveita crédito de IBS/CBS — ponto a favor do Simples tradicional.`)
    if (rankings.maiorCliente)
      insights.push(`O maior cliente (${d.parceiros.get(rankings.maiorCliente[0])?.nome ?? mascaraCnpj(rankings.maiorCliente[0])}) concentra ${pct(rankings.maiorCliente[1] / (rankings.vendasTot || 1), 1)} das vendas.`)
    if (rankings.ufs[0]) insights.push(`A UF com mais vendas é ${rankings.ufs[0].rotulo} (${pct(rankings.ufs[0].valor / (rankings.vendasTot || 1), 1)}); ${rankings.ufs.length} UFs no ranking.`)
    if (presumido.icms.difal > 0)
      insights.push(
        `Se a empresa sair do Simples, o DIFAL das vendas a não contribuinte custaria ${moeda(presumido.icms.difal)} no período (${pct(presumido.icms.difal / receita)} da receita) — no Simples não há DIFAL na saída (STF, ADI 5464).`,
      )
    if (atual.icms.st + atual.icms.antecipacao > 0)
      insights.push(`ICMS de ${moeda(atual.icms.st + atual.icms.antecipacao)} nas entradas interestaduais (ST ${moeda(atual.icms.st)} + antecipação ${moeda(atual.icms.antecipacao)}).`)
    if (rankings.comprasSimples + rankings.comprasPf > 0)
      insights.push(
        `${pct((rankings.comprasSimples + rankings.comprasPf) / (rankings.comprasTot || 1), 1)} das compras vêm de fornecedores do Simples ou pessoa física — crédito de IBS/CBS reduzido ou inexistente a partir de 2027.`,
      )
    insights.push(`Créditos que o Lucro Real aproveitaria: ${moeda(Object.values(real.creditos).reduce((a, v) => a + v, 0) - real.creditos.ibsCbsPerdidoSimples)}.`)
    const a33 = d.anos[d.anos.length - 1]
    if (a33?.melhor) insights.push(`Com a reforma concluída (2033), o regime de menor carga projetado é o ${nomeRegime(a33.melhor)} (${pct(a33.resultados[a33.melhor]!.carga)}).`)
    if (!params.folhaMensal && !params.proLaboreMensal) insights.push('Folha e pró-labore ainda não informados: o INSS patronal fora do Simples está zerado — preencha em Parâmetros para uma comparação justa.')
  }

  const grupos = atualPeriodo.porMes.map((m) => {
    const b = mesesPeriodo.find((x) => x.competencia === m.competencia)!
    return { rotulo: nomeMes(m.competencia), valores: { receita: m.receita, compras: b.compras - b.devolucoesCompra, tributos: m.total } }
  })
  const idxSel = mesSel ? atualPeriodo.porMes.findIndex((m) => m.competencia === mesSel) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold text-slate-600">Período:</span>
          <Segmentado
            valor={periodo}
            onChange={(v) => {
              setPeriodo(v)
              setMesSel(null)
            }}
            opcoes={[...anosDados.map((a) => ({ value: a, label: a })), ...(anosDados.length > 1 ? [{ value: 'tudo', label: 'Tudo' }] : [])]}
          />
          {mesSel && (
            <button className="btn-secondary btn-sm" onClick={() => setMesSel(null)}>
              {nomeMes(mesSel)} <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <span className="text-xs text-slate-500">Clique em um mês do gráfico para detalhar. Exclusões de CFOP e clientes/fornecedores já aplicadas.</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Receita bruta" valor={moedaCurta(receita)} detalhe={rotulo} icone={<Receipt className="h-4 w-4" />} />
        <Kpi titulo="Compras líquidas" valor={moedaCurta(comprasLiq)} detalhe={receita ? `${pct(comprasLiq / receita, 1)} da receita` : ''} icone={<ShoppingCart className="h-4 w-4" />} tom="amber" />
        <Kpi titulo={`Tributos — ${nomeRegime(d.regimeAtual)}`} valor={moedaCurta(atual.total)} detalhe={`carga ${pct(atual.carga)}`} icone={<Coins className="h-4 w-4" />} tom="violet" />
        <Kpi titulo="Lucro líquido (DRE)" valor={moedaCurta(lucroAtual)} detalhe={receita ? `margem ${pct(lucroAtual / receita, 1)} no regime atual` : ''} icone={<TrendingUp className="h-4 w-4" />} tom="emerald" />
        <Kpi
          titulo="Melhor regime no período"
          valor={melhor ? nomeRegime(melhor.regime) : '—'}
          detalhe={melhor && melhor.regime !== d.regimeAtual ? `economia de ${moedaCurta(atual.total - melhor.total)}` : 'o regime atual já é o mais econômico'}
          icone={<Award className="h-4 w-4" />}
          tom="emerald"
        />
        <Kpi titulo="DIFAL fora do Simples" valor={moedaCurta(presumido.icms.difal)} detalhe="vendas a não contribuinte de outras UFs" icone={<MapPinned className="h-4 w-4" />} tom="amber" />
        <Kpi titulo="ICMS nas entradas" valor={moedaCurta(atual.icms.st + atual.icms.antecipacao)} detalhe="ST + antecipação (interestaduais)" icone={<Truck className="h-4 w-4" />} tom="violet" />
        <Kpi titulo="Créditos no Lucro Real" valor={moedaCurta(real.creditos.icms + real.creditos.pisCofinsCompras + real.creditos.pisCofinsDespesas)} detalhe="ICMS + PIS/COFINS" icone={<HandCoins className="h-4 w-4" />} />
      </div>

      <Section title="Evolução mensal" icone={LineChart} actions={<Legenda series={SERIES} />}>
        <BarrasAgrupadas grupos={grupos} series={SERIES} formatar={moeda} altura={260} aoClicar={(gi) => setMesSel(atualPeriodo.porMes[gi].competencia === mesSel ? null : atualPeriodo.porMes[gi].competencia)} selecionado={idxSel} />
      </Section>

      <Section title="Leitura da operação" icone={MessageSquareText} cor="violet">
        <ul className="space-y-2 text-sm text-slate-700">
          {insights.map((t) => (
            <li key={t} className="flex gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
              {t}
            </li>
          ))}
        </ul>
        {rec && <p className="mt-3 rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">{rec.texto}</p>}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Ranking titulo="Maiores clientes" icone={Users} itens={rankings.clientes} cor="#2a78d6" total={rankings.vendasTot} />
        <Ranking titulo="Maiores fornecedores" icone={Truck} itens={rankings.fornecedores} cor="#eb6834" total={rankings.comprasTot + soma.servicosTomados} />
        <Ranking titulo="Produtos mais vendidos (NCM)" icone={Package} itens={rankings.ncms} cor="#1baf7a" total={rankings.vendasTot} />
        <Ranking titulo="Vendas por UF" icone={MapPinned} itens={rankings.ufs} cor="#4a3aa7" total={rankings.vendasTot} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Section title={`Carga por regime — ${rotulo}`} icone={Coins} cor="emerald">
            <BarrasHorizontais formatar={moeda} itens={regimesEscopo.map((r) => ({ id: r.regime, rotulo: nomeRegime(r.regime), valor: r.total, cor: COR_REGIME[r.regime], detalhe: pct(r.carga) }))} />
          </Section>
        </div>
        <div className="lg:col-span-3">
          <Section title="Reforma Tributária — carga anual projetada" icone={LineChart} cor="violet" actions={<Legenda series={REGIMES.map((r) => ({ id: r.value, label: r.curto, cor: COR_REGIME[r.value] }))} />}>
            <BarrasAgrupadas
              grupos={d.anos.map((a) => ({ rotulo: String(a.ano), valores: Object.fromEntries(REGIMES.map((r) => [r.value, a.resultados[r.value]?.total])) }))}
              series={REGIMES.map((r) => ({ id: r.value, label: r.curto, cor: COR_REGIME[r.value] }))}
              formatar={moeda}
              destaque={(gi, s) => d.anos[gi].melhor === s}
              altura={240}
            />
          </Section>
        </div>
      </div>

      <Estabelecimentos d={d} />
    </div>
  )
}

function Estabelecimentos({ d }: { d: DadosAnalise }) {
  const porEstab = useMemo(
    () =>
      d.estabs.map((e) => {
        const b = montarBases(
          d.linhas.filter((l) => l.estabelecimento_id === e.id),
          d.params,
          d.dadosEstab,
        )
        return { e, receita: b.reduce((s, x) => s + receitaBruta(x), 0), compras: b.reduce((s, x) => s + x.compras - x.devolucoesCompra, 0) }
      }),
    [d.estabs, d.linhas, d.params, d.dadosEstab],
  )
  const total = porEstab.reduce((s, x) => s + x.receita, 0)
  return (
    <Section title="Estabelecimentos (consolidados na apuração)" icone={Building2} cor="sky">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[35rem] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
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
                  {e.nome} {e.matriz && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[0.625rem] font-bold text-amber-700">MATRIZ</span>}
                </td>
                <td className="px-3 py-2 text-slate-500">{mascaraCnpj(e.cnpj)}</td>
                <td className="px-3 py-2 text-slate-500">{e.uf}</td>
                <td className="px-3 py-2 text-right">{moeda(receita)}</td>
                <td className="px-3 py-2 text-right">{total ? pct(receita / total, 1) : '—'}</td>
                <td className="px-3 py-2 text-right">{moeda(compras)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
