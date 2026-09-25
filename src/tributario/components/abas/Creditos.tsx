import { useMemo, useState } from 'react'
import { HandCoins, Search, Truck } from 'lucide-react'
import { Section } from '../../../components/ui'
import { mascaraCnpj } from '../../../lib/format'
import { apurar } from '../../engine/apuracao'
import { regimeDoFornecedor } from '../../engine/base'
import { tratamentoNcm } from '../../engine/ncm'
import { ANEXOS_SIMPLES, regrasDoAno } from '../../engine/tabelas'
import type { CreditosResumo, RegimeFornecedor, RegimeId, Resultado } from '../../engine/tipos'
import { moeda, moedaCurta, nomeRegime, pct } from '../../formatacao'
import { Kpi, Segmentado } from '../comum'
import type { DadosAnalise } from '../contexto'

const LINHAS: { chave: keyof CreditosResumo; rotulo: string; base: string }[] = [
  { chave: 'icms', rotulo: 'ICMS destacado nas compras', base: 'LC 87/1996, art. 20' },
  { chave: 'pisCofinsCompras', rotulo: 'PIS/COFINS — mercadorias (Lucro Real)', base: 'Lei 10.833/2003, art. 3º, I' },
  { chave: 'pisCofinsDespesas', rotulo: 'PIS/COFINS — energia, fretes, armazenagem, aluguéis', base: 'Lei 10.833/2003, art. 3º, III, IV e IX' },
  { chave: 'ibsCbsFornecedorRegular', rotulo: 'IBS/CBS — fornecedores do regime regular', base: 'LC 214/2025, art. 47' },
  { chave: 'ibsCbsFornecedorSimples', rotulo: 'IBS/CBS — fornecedores do Simples (valor do DAS)', base: 'LC 214/2025, art. 47, §9º' },
  { chave: 'ibsCbsDespesas', rotulo: 'IBS/CBS — serviços, fretes, energia, consumo e ativo', base: 'LC 214/2025, art. 47 (crédito amplo)' },
]

type Tipo = RegimeFornecedor | 'exterior'
const NOME_TIPO: Record<Tipo, string> = {
  normal: 'Regime normal',
  real: 'Lucro Real',
  presumido: 'Lucro Presumido',
  simples: 'Simples Nacional',
  mei: 'MEI',
  pf: 'Pessoa física',
  exterior: 'Exterior',
}

export function Creditos({ d }: { d: DadosAnalise }) {
  const { params } = d
  const [ano, setAno] = useState<number>(2026)
  const [busca, setBusca] = useState('')
  const regimes: RegimeId[] = ano >= 2027 ? ['simples_hibrido', 'presumido', 'real'] : ['presumido', 'real']

  const resultados: Resultado[] = useMemo(() => {
    if (ano === 2026) return (['presumido', 'real'] as RegimeId[]).map((r) => apurar(r, d.bases, d.ctx))
    const a = d.anos.find((x) => x.ano === ano)
    return a ? (['simples_hibrido', 'presumido', 'real'] as RegimeId[]).map((r) => a.resultados[r]!).filter(Boolean) : []
  }, [ano, d.bases, d.ctx, d.anos])

  // Fornecedores: crédito potencial por fornecedor com as regras do ano escolhido (IBS/CBS a partir de 2027)
  const anoIbs = Math.max(ano, 2027)
  const regras = regrasDoAno(anoIbs, params.cbsReferencia, params.ibsReferencia, params.aliquotasAno[String(anoIbs)])
  const aliq = regras.cbs + regras.ibs
  const partilha = ANEXOS_SIMPLES.I.faixas[2].partilha
  const aliqSimples = (params.aliquotaFornecedoresSimples / 100) * ((partilha.PIS ?? 0) + (partilha.COFINS ?? 0) + (partilha.ICMS ?? 0) * (1 - regras.icmsIssFator))
  const dentro = params.premissaPreco === 'preco_mantido'

  const fornecedores = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; tipo: Tipo; valor: number; icms: number; pisCofins: number; ibsCbs: number; ibsCbsIntegral: number }>()
    for (const l of d.linhas) {
      const compra = d.eCompra(l)
      const servico = l.tipo === 'servico_tomado'
      if (!compra && !servico) continue
      const tipo: Tipo = l.cfop.startsWith('3') ? 'exterior' : regimeDoFornecedor(l, params)
      const chave = l.parceiro || (tipo === 'pf' ? 'PF' : `sem-${tipo}`)
      const nome = d.parceiros.get(l.parceiro)?.nome || (tipo === 'pf' ? 'Pessoas físicas' : '(não identificado)')
      const x = m.get(chave) ?? { chave, nome, tipo, valor: 0, icms: 0, pisCofins: 0, ibsCbs: 0, ibsCbsIntegral: 0 }
      const v = l.valor_contabil
      const baseLiquida = Math.max(0, v - l.icms - l.ipi - l.icms_st)
      // repasse: o preço do fornecedor perde o PIS/COFINS embutido (3,65% Presumido; % dos parâmetros para Real/não informado)
      const pcForn = tipo === 'presumido' ? 0.0365 : params.pisCofinsFornecedores / 100
      const integral = ((dentro ? baseLiquida / (1 + aliq) : baseLiquida * (1 - pcForn)) * aliq) || 0
      x.valor += v
      if (!servico && ['normal', 'real', 'presumido', 'exterior'].includes(tipo)) x.icms += l.icms
      const mono = l.ncm ? tratamentoNcm(l.ncm, params.ncms).monofasico : false
      if (!servico && !mono && tipo !== 'pf') x.pisCofins += Math.max(0, v - l.icms) * 0.0925
      x.ibsCbsIntegral += integral
      x.ibsCbs += tipo === 'pf' || tipo === 'mei' ? 0 : tipo === 'simples' ? v * aliqSimples : integral
      m.set(chave, x)
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor)
  }, [d.linhas, d.eCompra, d.parceiros, params, aliq, aliqSimples, dentro])

  const termo = busca.trim().toLowerCase()
  const lista = fornecedores.filter((f) => !termo || f.nome.toLowerCase().includes(termo) || f.chave.includes(termo.replace(/\D/g, '') || '§'))
  const perdido = fornecedores.reduce((s, f) => s + (f.ibsCbsIntegral - f.ibsCbs), 0)
  const principal = resultados.find((r) => r.regime === 'real') ?? resultados[0]
  const totalCred = (c: CreditosResumo) => LINHAS.reduce((s, l) => s + c[l.chave], 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Créditos que a empresa aproveitaria em cada regime. {ano === 2026 ? 'Período importado com a legislação atual.' : `Ano projetado ${ano} (cronograma da reforma).`}
        </p>
        <Segmentado valor={String(ano)} onChange={(v) => setAno(Number(v))} opcoes={d.anos.map((a) => ({ value: String(a.ano), label: String(a.ano) }))} />
      </div>

      {principal && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi titulo={`Créditos — ${nomeRegime(principal.regime)}`} valor={moedaCurta(totalCred(principal.creditos))} detalhe="total aproveitado no período" icone={<HandCoins className="h-4 w-4" />} />
          <Kpi titulo="Crédito de ICMS" valor={moedaCurta(principal.creditos.icms)} detalhe="compras de contribuintes do regime normal" icone={<HandCoins className="h-4 w-4" />} tom="violet" />
          <Kpi
            titulo="IBS/CBS perdido com fornecedores do Simples"
            valor={moedaCurta(ano >= 2027 ? principal.creditos.ibsCbsPerdidoSimples : perdido)}
            detalhe={ano >= 2027 ? 'diferença para o crédito integral' : `estimativa a partir de ${anoIbs}`}
            icone={<Truck className="h-4 w-4" />}
            tom="amber"
          />
          <Kpi
            titulo="Saldo credor de IBS/CBS"
            valor={moedaCurta(principal.saldoCredor)}
            detalhe="créditos acima dos débitos (ressarcimento previsto na LC 214/2025)"
            icone={<HandCoins className="h-4 w-4" />}
            tom="emerald"
          />
        </div>
      )}

      <Section title="Créditos por origem e regime" icone={HandCoins}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[45rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3 text-left">Crédito</th>
                <th className="px-3 py-2.5 text-left">Fundamento</th>
                {regimes.map((r) => (
                  <th key={r} className="px-3 py-2.5">
                    {nomeRegime(r)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {LINHAS.map((l) => (
                <tr key={l.chave} className="border-b border-slate-100 text-right">
                  <td className="py-2 pr-3 text-left font-medium text-slate-700">{l.rotulo}</td>
                  <td className="px-3 py-2 text-left text-xs text-slate-400">{l.base}</td>
                  {regimes.map((r) => {
                    const x = resultados.find((y) => y.regime === r)
                    const v = x?.creditos[l.chave] ?? 0
                    return (
                      <td key={r} className="px-3 py-2">
                        {v > 0.005 ? moeda(v) : <span className="text-slate-300">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="text-right font-bold">
                <td className="py-2.5 pr-3 text-left">Total de créditos</td>
                <td />
                {regimes.map((r) => {
                  const x = resultados.find((y) => y.regime === r)
                  return (
                    <td key={r} className="px-3 py-2.5">
                      {x ? moeda(totalCred(x.creditos)) : '—'}
                      {x && x.receita > 0 && <div className="text-xs font-medium text-slate-500">{pct(totalCred(x.creditos) / x.receita)} da receita</div>}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Simples Nacional tradicional não toma créditos (LC 123, art. 23). No Simples híbrido, apenas IBS/CBS geram crédito (LC 214, art. 41). Créditos acima dos débitos formam
          saldo credor, não reduzem outros tributos.
        </p>
      </Section>

      <Section title={`Crédito por fornecedor (IBS/CBS pelas regras de ${anoIbs})`} icone={Truck} cor="amber">
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Comprar de optante do Simples dá crédito só do IBS/CBS embutido no DAS; de pessoa física, nenhum. A coluna "perda" mostra quanto de IBS/CBS deixa de ser creditado em
          relação a um fornecedor do regime regular — base para renegociar preço ou trocar de fornecedor.
        </p>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar fornecedor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="max-h-[32.5rem] overflow-auto">
          <table className="w-full min-w-[61.25rem] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Fornecedor</th>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2">Compras</th>
                <th className="px-3 py-2">Crédito ICMS</th>
                <th className="px-3 py-2">PIS/COFINS (Real 2026)</th>
                <th className="px-3 py-2">IBS/CBS</th>
                <th className="px-3 py-2">Perda de IBS/CBS</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {lista.map((f) => (
                <tr key={f.chave} className="border-b border-slate-100 text-right">
                  <td className="max-w-72 truncate py-1.5 pr-3 text-left font-medium text-slate-700" title={f.nome}>
                    {f.nome}
                    <div className="text-[0.6875rem] font-normal text-slate-400">{/^\d{14}$/.test(f.chave) ? mascaraCnpj(f.chave) : ''}</div>
                  </td>
                  <td className="px-3 py-1.5 text-left">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${['normal', 'real', 'presumido'].includes(f.tipo) ? 'bg-emerald-50 text-emerald-700' : f.tipo === 'simples' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {NOME_TIPO[f.tipo]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">{moeda(f.valor)}</td>
                  <td className="px-3 py-1.5">{f.icms ? moeda(f.icms) : '—'}</td>
                  <td className="px-3 py-1.5">{f.pisCofins ? moeda(f.pisCofins) : '—'}</td>
                  <td className="px-3 py-1.5">{f.ibsCbs ? moeda(f.ibsCbs) : '—'}</td>
                  <td className={`px-3 py-1.5 ${f.ibsCbsIntegral - f.ibsCbs > 0.5 ? 'font-semibold text-rose-600' : 'text-slate-300'}`}>
                    {f.ibsCbsIntegral - f.ibsCbs > 0.5 ? moeda(f.ibsCbsIntegral - f.ibsCbs) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
