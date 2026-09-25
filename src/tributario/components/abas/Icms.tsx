import { useMemo, useState } from 'react'
import { ArrowRightLeft, Building2, FlaskConical, Landmark, MapPinned, PackageSearch } from 'lucide-react'
import { Section, Select } from '../../../components/ui'
import { apurar } from '../../engine/apuracao'
import { montarBases } from '../../engine/base'
import { icmsEntradasPorNcm, icmsVendasInternasPorAliquota, icmsVendasPorUf } from '../../engine/icms'
import { ICMS_INTERNO_UF, UFS, aliquotaInterestadual } from '../../engine/tabelas'
import type { CenarioIcms, RegimeId } from '../../engine/tipos'
import { moeda, moedaCurta, nomeRegime, pct } from '../../formatacao'
import { Kpi } from '../comum'
import type { DadosAnalise } from '../contexto'

const regimes: RegimeId[] = ['presumido', 'real']

const p2 = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export function Icms({ d }: { d: DadosAnalise }) {
  const { params } = d
  const matriz = d.estabs.find((e) => e.matriz) ?? d.estabs[0]
  const ufEmpresa = matriz?.uf ?? 'SP'
  const cen = params.cenarioIcms
  const [origemTabela, setOrigemTabela] = useState<'empresa' | 'cenario'>('empresa')

  // Situação atual (sem cenário) e cenário simulado — independentes do cenário estar aplicado nas demais telas
  const semCenario = useMemo(() => ({ ...params, cenarioIcms: { ...cen, ativo: false } }), [params, cen])
  const comCenario = useMemo(() => ({ ...params, cenarioIcms: { ...cen, ativo: true } }), [params, cen])
  const basesAtual = useMemo(() => montarBases(d.linhas, semCenario, d.dadosEstab), [d.linhas, semCenario, d.dadosEstab])
  const basesCen = useMemo(() => montarBases(d.linhas, comCenario, d.dadosEstab), [d.linhas, comCenario, d.dadosEstab])
  const atual = useMemo(() => regimes.map((r) => apurar(r, basesAtual, { ...d.ctx, params: semCenario })), [basesAtual, d.ctx, semCenario])
  const simulado = useMemo(() => regimes.map((r) => apurar(r, basesCen, { ...d.ctx, params: comCenario })), [basesCen, d.ctx, comCenario])
  const simples = useMemo(() => apurar('simples', basesAtual, { ...d.ctx, params: semCenario }), [basesAtual, d.ctx, semCenario])

  const porUf = useMemo(
    () => icmsVendasPorUf(d.linhas, semCenario, (id) => ({ uf: d.dadosEstab(id).uf, aliquotaInterna: d.dadosEstab(id).aliquota }), 'cfop', d.eVenda),
    [d.linhas, semCenario, d.dadosEstab, d.eVenda],
  )
  const porUfCen = useMemo(
    () =>
      icmsVendasPorUf(
        d.linhas,
        comCenario,
        () => ({ uf: cen.uf, aliquotaInterna: ICMS_INTERNO_UF[cen.uf] ?? 18, cargaInterna: cen.aliquotaInterna, cargaInterestadual: cen.cargaInterestadual }),
        'destino',
        d.eVenda,
      ),
    [d.linhas, comCenario, cen, d.eVenda],
  )
  const entradas = useMemo(() => icmsEntradasPorNcm(d.linhas, semCenario, d.dadosEstab, d.eCompra), [d.linhas, semCenario, d.dadosEstab, d.eCompra])

  const vendas = porUf.reduce((s, x) => s + x.vendas, 0)
  const proprio = porUf.reduce((s, x) => s + x.proprio, 0)
  const difal = porUf.reduce((s, x) => s + x.difal, 0)
  const naoContrib = porUf.reduce((s, x) => s + x.naoContribuinte, 0)
  const stEnt = entradas.reduce((s, x) => s + x.st, 0)
  const antec = entradas.reduce((s, x) => s + x.antecipacao, 0)
  const faixas = useMemo(
    () => icmsVendasInternasPorAliquota(d.linhas, semCenario, (id) => ({ uf: d.dadosEstab(id).uf, aliquotaInterna: d.dadosEstab(id).aliquota }), d.eVenda),
    [d.linhas, semCenario, d.dadosEstab, d.eVenda],
  )
  const vendasInternas = faixas.reduce((s, x) => s + x.vendas, 0)
  const setCen = (c: Partial<CenarioIcms>) => d.onParams({ ...params, cenarioIcms: { ...cen, ...c } })
  const origemTab = origemTabela === 'cenario' ? cen.uf : ufEmpresa
  const ufsVendidas = new Set(porUf.map((x) => x.uf))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="ICMS próprio nas vendas" valor={moedaCurta(proprio)} detalhe={`alíquota média ${vendas ? pct(proprio / vendas) : '—'} (regime normal)`} icone={<Landmark className="h-4 w-4" />} />
        <Kpi
          titulo="Custo de DIFAL (não contribuinte)"
          valor={moedaCurta(difal)}
          detalhe={`${vendas ? pct(naoContrib / vendas, 1) : '—'} das vendas a não contribuinte · Simples não paga (STF ADI 5464)`}
          icone={<MapPinned className="h-4 w-4" />}
          tom="amber"
        />
        <Kpi titulo="ST e antecipação nas entradas" valor={moedaCurta(stEnt + antec)} detalhe={`ST ${moedaCurta(stEnt)} · antecipação ${moedaCurta(antec)}`} icone={<PackageSearch className="h-4 w-4" />} tom="violet" />
        <Kpi titulo="ICMS no DAS (Simples)" valor={moedaCurta(simples.icms.noDas)} detalhe={`${simples.receita ? pct(simples.icms.noDas / simples.receita) : '—'} da receita`} icone={<Building2 className="h-4 w-4" />} tom="emerald" />
      </div>

      <Section title="Alíquotas de ICMS consideradas nas saídas" icone={Landmark}>
        <div className="grid gap-4 text-sm md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase">Vendas internas</div>
            {d.estabs.map((e) => (
              <div key={e.id} className="mt-1 flex justify-between">
                <span>
                  {e.nome} ({e.uf})
                </span>
                <strong>{p2(e.aliquota_icms ?? ICMS_INTERNO_UF[e.uf] ?? 18)}</strong>
              </div>
            ))}
            <p className="mt-2 text-xs text-slate-500">
              Alíquota modal da UF (editável no cadastro do estabelecimento): vale para os produtos sem alíquota própria. Mercadoria com ST não tem débito na venda interna.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase">Vendas internas por alíquota do produto</div>
            {faixas.length === 0 && <p className="mt-1 text-slate-500">Sem vendas internas no período.</p>}
            {faixas.map((f) => (
              <div key={f.st ? 'st' : f.aliquota} className="mt-1 flex items-baseline justify-between gap-2" title={`NCMs: ${f.ncms.slice(0, 12).join(', ')}${f.ncms.length > 12 ? '...' : ''}`}>
                <span>
                  <strong>{f.st ? 'ST (sem débito)' : p2(f.aliquota)}</strong>{' '}
                  <span className="text-xs text-slate-500">
                    {f.ncms.length} NCM{f.ncms.length > 1 ? 's' : ''}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {moedaCurta(f.vendas)} <span className="text-xs text-slate-500">({vendasInternas ? pct(f.vendas / vendasInternas, 0) : '—'})</span>
                </span>
              </div>
            ))}
            <p className="mt-2 text-xs text-slate-500">
              Cada produto usa a alíquota da aba Produtos (NCM): a informada pelo contador ou a que as notas mostram; sem nenhuma, a modal da UF.
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="text-xs font-bold text-slate-500 uppercase">Vendas interestaduais</div>
            <ul className="mt-1 space-y-1 text-slate-600">
              <li>
                <strong>4%</strong> — mercadoria importada (origem 1, 2, 3 ou 8) — Res. SF 13/2012
              </li>
              <li>
                <strong>7%</strong> — de S/SE (exceto ES) para N, NE, CO e ES
              </li>
              <li>
                <strong>12%</strong> — demais operações — Res. SF 22/1989
              </li>
              <li>
                <strong>DIFAL</strong> = interna do destino − interestadual (não contribuinte)
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="ICMS e DIFAL por UF de destino (situação atual, regime normal)" icone={MapPinned} cor="sky">
        <TabelaUf linhas={porUf} total={vendas} destaque={ufEmpresa} />
      </Section>

      <Section
        title="Tabela de ICMS interestadual"
        icone={ArrowRightLeft}
        cor="amber"
        actions={
          <select className="input w-auto py-1.5" value={origemTabela} onChange={(e) => setOrigemTabela(e.target.value as 'empresa' | 'cenario')}>
            <option value="empresa">Saindo de {ufEmpresa} (empresa)</option>
            <option value="cenario">Saindo de {cen.uf} (cenário)</option>
          </select>
        }
      >
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Destino</th>
                <th className="px-3 py-2">Interna do destino</th>
                <th className="px-3 py-2">Interestadual (nacional)</th>
                <th className="px-3 py-2">Interestadual (importado)</th>
                <th className="px-3 py-2">DIFAL nacional</th>
                <th className="px-3 py-2">DIFAL importado</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {UFS.map((uf) => {
                const interna = ICMS_INTERNO_UF[uf]
                const nac = uf === origemTab ? interna : aliquotaInterestadual('0', origemTab, uf)
                const imp = uf === origemTab ? interna : 4
                return (
                  <tr key={uf} className={`border-b border-slate-100 text-right ${uf === origemTab ? 'bg-brand-50/60 font-semibold' : ''} ${ufsVendidas.has(uf) ? '' : 'text-slate-500'}`}>
                    <td className="py-1.5 pr-3 text-left">
                      {uf} {uf === origemTab && <span className="text-xs text-brand-600">(interna)</span>}
                      {ufsVendidas.has(uf) && uf !== origemTab && <span className="ml-1 text-[0.625rem] font-bold text-emerald-600">vende</span>}
                    </td>
                    <td className="px-3 py-1.5">{p2(interna)}</td>
                    <td className="px-3 py-1.5">{p2(nac)}</td>
                    <td className="px-3 py-1.5">{p2(imp)}</td>
                    <td className="px-3 py-1.5">{uf === origemTab ? '—' : p2(Math.max(0, interna - nac))}</td>
                    <td className="px-3 py-1.5">{uf === origemTab ? '—' : p2(Math.max(0, interna - imp))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">Alíquotas modais internas de referência 2026 — confira a legislação de cada UF (alíquotas específicas por produto e FCP não estão incluídas).</p>
      </Section>

      <Section title="ICMS nas entradas interestaduais: ST (MVA) e antecipação" icone={PackageSearch} cor="violet">
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Sem ST: antecipação = valor × (alíquota interna do NCM − interestadual). Com ST não retida: [valor × (1 + MVA ajustada)] × interna − ICMS destacado (Conv. ICMS
          142/2018). No Simples é custo fora do DAS (LC 123, art. 13, §1º, XIII; STF Tema 517){params.antecipacaoSimples ? '' : ' — desativado nos Parâmetros'}. Informe MVA e
          alíquota por NCM na aba Produtos.
        </p>
        <div className="max-h-96 overflow-auto">
          <table className="w-full min-w-[51.25rem] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">NCM</th>
                <th className="px-3 py-2 text-left">UF fornecedor</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Interestadual</th>
                <th className="px-3 py-2">Interna</th>
                <th className="px-3 py-2">MVA ajust.</th>
                <th className="px-3 py-2">ICMS-ST</th>
                <th className="px-3 py-2">Antecipação</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {entradas.map((x) => (
                <tr key={x.chave} className="border-b border-slate-100 text-right">
                  <td className="py-1.5 pr-3 text-left font-semibold">
                    {x.chave}
                    {x.semMva && <span className="ml-1 text-[0.625rem] font-bold text-rose-600">sem MVA</span>}
                  </td>
                  <td className="px-3 py-1.5 text-left text-slate-500">{x.ufs}</td>
                  <td className="px-3 py-1.5">{moeda(x.valor)}</td>
                  <td className="px-3 py-1.5">{p2(x.aliquotaInterestadual)}</td>
                  <td className="px-3 py-1.5">{p2(x.aliquotaInterna)}</td>
                  <td className="px-3 py-1.5">{x.mvaAjustada !== null ? pct(x.mvaAjustada) : '—'}</td>
                  <td className="px-3 py-1.5">{x.st ? moeda(x.st) : '—'}</td>
                  <td className="px-3 py-1.5">{x.antecipacao ? moeda(x.antecipacao) : '—'}</td>
                </tr>
              ))}
              {entradas.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    Sem compras interestaduais para revenda no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Simulador: benefício fiscal ou mudança de estado"
        icone={FlaskConical}
        cor="emerald"
        actions={
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <input type="checkbox" checked={cen.ativo} onChange={(e) => setCen({ ativo: e.target.checked })} />
            Aplicar em todas as análises
          </label>
        }
      >
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          Simule as vendas saindo de outra UF e/ou com carga efetiva de ICMS reduzida (ex.: tratamento tributário diferenciado, crédito presumido, corredor de importação). O DIFAL
          continua devido ao destino pela alíquota interestadual nominal. Quando aplicado, o cenário passa a valer no Comparativo, na DRE e na Reforma.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Descrição</span>
            <input className="input" value={cen.descricao} placeholder="Ex.: filial em SC com TTD" onChange={(e) => setCen({ descricao: e.target.value })} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">UF de saída das mercadorias</span>
            <Select value={cen.uf} onChange={(v) => setCen({ uf: v })} opcoes={UFS} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Carga nas vendas internas (%)</span>
            <input
              className="input"
              type="number"
              step="0.01"
              value={cen.aliquotaInterna ?? ''}
              placeholder={`modal ${p2(ICMS_INTERNO_UF[cen.uf] ?? 18)}`}
              onChange={(e) => setCen({ aliquotaInterna: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Carga nas interestaduais (%)</span>
            <input
              className="input"
              type="number"
              step="0.01"
              value={cen.cargaInterestadual ?? ''}
              placeholder="sem benefício: 4/7/12%"
              onChange={(e) => setCen({ cargaInterestadual: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </label>
          <label className="flex items-end gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={cen.manterCreditos} onChange={(e) => setCen({ manterCreditos: e.target.checked })} />
            Manter créditos de entrada
          </label>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[45rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">No período importado</th>
                {regimes.map((r) => (
                  <th key={r} colSpan={3} className="px-3 py-2 text-center">
                    {nomeRegime(r)}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th />
                {regimes.map((r) => (
                  <FragmentoCab key={r} />
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ['ICMS próprio nas vendas', (x: (typeof atual)[number]) => x.icms.proprio],
                  ['DIFAL', (x: (typeof atual)[number]) => x.icms.difal],
                  ['(−) Créditos de ICMS', (x: (typeof atual)[number]) => -x.icms.credito],
                  ['ICMS-ST nas entradas', (x: (typeof atual)[number]) => x.icms.st],
                  ['ICMS a recolher', (x: (typeof atual)[number]) => x.tributos.ICMS],
                  ['PIS/COFINS/IBS/CBS (efeito da base)', (x: (typeof atual)[number]) => x.tributos.PIS + x.tributos.COFINS + x.tributos.CBS + x.tributos.IBS],
                  ['Carga tributária total', (x: (typeof atual)[number]) => x.total],
                ] as const
              ).map(([rot, f], i) => (
                <tr key={rot} className={`border-b border-slate-100 text-right ${i === 4 || i === 6 ? 'font-bold' : ''}`}>
                  <td className="py-2 pr-3 text-left">{rot}</td>
                  {regimes.map((r, k) => {
                    const a = f(atual[k])
                    const c = f(simulado[k])
                    return (
                      <FragmentoValores key={r} a={a} c={c} />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          No Simples, o ICMS continua no DAS com o mesmo percentual em qualquer UF; o que muda é a antecipação nas entradas (legislação do novo estado). Benefícios de ICMS
          terminam com a extinção do imposto em 2033 (EC 132, ADCT art. 128); até lá, os fundos de compensação da EC 132 (art. 12) preservam benefícios onerosos até 2032.
        </p>

        <div className="mt-5">
          <div className="mb-2 text-sm font-bold text-slate-700">ICMS por UF de destino no cenário (saindo de {cen.uf})</div>
          <TabelaUf linhas={porUfCen} total={porUfCen.reduce((s, x) => s + x.vendas, 0)} destaque={cen.uf} />
        </div>
      </Section>
    </div>
  )
}

function FragmentoCab() {
  return (
    <>
      <th className="px-3 py-2">Atual</th>
      <th className="px-3 py-2">Cenário</th>
      <th className="px-3 py-2">Diferença</th>
    </>
  )
}

function FragmentoValores({ a, c }: { a: number; c: number }) {
  const dif = c - a
  return (
    <>
      <td className="px-3 py-2">{moeda(a)}</td>
      <td className="px-3 py-2">{moeda(c)}</td>
      <td className={`px-3 py-2 ${dif < -0.005 ? 'text-emerald-600' : dif > 0.005 ? 'text-rose-600' : 'text-slate-400'}`}>{Math.abs(dif) < 0.005 ? '—' : moeda(dif)}</td>
    </>
  )
}

function TabelaUf({ linhas, total, destaque }: { linhas: ReturnType<typeof icmsVendasPorUf>; total: number; destaque: string }) {
  const tot = linhas.reduce((s, x) => ({ proprio: s.proprio + x.proprio, difal: s.difal + x.difal, nc: s.nc + x.naoContribuinte }), { proprio: 0, difal: 0, nc: 0 })
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full min-w-[47.5rem] text-sm">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
            <th className="py-2 pr-3 text-left">UF</th>
            <th className="px-3 py-2">Vendas</th>
            <th className="px-3 py-2">%</th>
            <th className="px-3 py-2">A não contribuinte</th>
            <th className="px-3 py-2">Alíq. aplicada</th>
            <th className="px-3 py-2">ICMS próprio</th>
            <th className="px-3 py-2">Interna destino</th>
            <th className="px-3 py-2">DIFAL</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map((x) => (
            <tr key={x.uf} className={`border-b border-slate-100 text-right ${x.uf === destaque ? 'bg-brand-50/50' : ''}`}>
              <td className="py-1.5 pr-3 text-left font-semibold">{x.uf === '—' ? 'Sem UF (resumo)' : x.uf}</td>
              <td className="px-3 py-1.5">{moeda(x.vendas)}</td>
              <td className="px-3 py-1.5 text-slate-500">{total ? pct(x.vendas / total, 1) : '—'}</td>
              <td className="px-3 py-1.5">{x.naoContribuinte ? moeda(x.naoContribuinte) : '—'}</td>
              <td className="px-3 py-1.5">{p2(x.aliquotaMedia)}</td>
              <td className="px-3 py-1.5">{moeda(x.proprio)}</td>
              <td className="px-3 py-1.5">{x.aliquotaDestino ? p2(x.aliquotaDestino) : '—'}</td>
              <td className="px-3 py-1.5 font-semibold">{x.difal ? moeda(x.difal) : '—'}</td>
            </tr>
          ))}
          <tr className="text-right font-bold">
            <td className="py-2 pr-3 text-left">Total</td>
            <td className="px-3 py-2">{moeda(total)}</td>
            <td />
            <td className="px-3 py-2">{moeda(tot.nc)}</td>
            <td className="px-3 py-2">{total ? pct(tot.proprio / total) : '—'}</td>
            <td className="px-3 py-2">{moeda(tot.proprio)}</td>
            <td />
            <td className="px-3 py-2">{moeda(tot.difal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
