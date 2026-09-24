import { useState } from 'react'
import { Percent, TableProperties } from 'lucide-react'
import { Section } from '../../../components/ui'
import { faixaSimples } from '../../engine/apuracao'
import { ANEXOS_SIMPLES, ICMS_INTERNO_UF, regrasDoAno, type TributoDas } from '../../engine/tabelas'
import { REGIMES, TRIBUTOS, type RegimeId, type Tributo } from '../../engine/tipos'
import { NOME_TRIBUTO, moeda, moedaCurta, pct } from '../../formatacao'
import { PontoRegime, Segmentado } from '../comum'
import type { DadosAnalise } from '../contexto'

const p = (v: number, c = 2) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: c })}%`

export function Aliquotas({ d }: { d: DadosAnalise }) {
  const { params } = d
  const [ano, setAno] = useState(2027)
  const a = d.anos.find((x) => x.ano === ano) ?? d.anos[0]
  const regras = regrasDoAno(ano, params.cbsReferencia, params.ibsReferencia, params.aliquotasAno[String(ano)])
  const matriz = d.estabs.find((e) => e.matriz) ?? d.estabs[0]
  const modal = matriz?.aliquota_icms ?? ICMS_INTERNO_UF[matriz?.uf ?? 'SP'] ?? 18
  const rbt12 = a ? a.receita / (1 + params.crescimentoAnual / 100) : 0
  const fx = faixaSimples(params.anexo, rbt12)
  const fator = regras.icmsIssFator
  const cpp = `${p(20)} + RAT ${p(params.ratFap)} + terceiros ${p(params.terceiros)} s/ folha; 20% s/ pró-labore`

  const regra = (regime: RegimeId, t: Tributo): string => {
    const simples = regime === 'simples' || regime === 'simples_hibrido'
    if (simples) {
      const part = fx.partilha
      const map: Partial<Record<Tributo, TributoDas | TributoDas[]>> = { IRPJ: 'IRPJ', CSLL: 'CSLL', CPP: 'CPP', ICMS: 'ICMS', ISS: 'ISS', IPI: 'IPI', PIS: 'PIS', COFINS: 'COFINS', CBS: ['PIS', 'COFINS'], IBS: 'ICMS' }
      const k = map[t]
      if (!k) return ''
      if (regime === 'simples_hibrido' && (t === 'CBS' || t === 'IBS')) return `${p((t === 'CBS' ? regras.cbs : regras.ibs) * 100, 3)} por fora, com créditos`
      if (t === 'CBS' && regras.pisCofins) return ''
      if ((t === 'PIS' || t === 'COFINS') && !regras.pisCofins) return ''
      if (t === 'IBS' && fator === 1) return ''
      const share = Array.isArray(k) ? k.reduce((s, x) => s + (part[x] ?? 0), 0) : (part[k] ?? 0)
      const ajuste = t === 'ICMS' ? fator : t === 'IBS' ? 1 - fator : 1
      if (!share) return ''
      return `${p(share * ajuste * 100)} do DAS (${p(share * ajuste * fx.efetiva * 100, 3)} da receita)`
    }
    const presumido = regime === 'presumido'
    switch (t) {
      case 'IRPJ':
        return presumido ? `15% + 10% adic. s/ presunção de ${p(params.presuncaoIrpj)} (= ${p(params.presuncaoIrpj * 0.15)} da receita)` : '15% + 10% adicional sobre o lucro real'
      case 'CSLL':
        return presumido ? `9% s/ presunção de ${p(params.presuncaoCsll)} (= ${p(params.presuncaoCsll * 0.09)})` : '9% sobre o lucro real'
      case 'PIS':
        return regras.pisCofins ? (presumido ? '0,65% cumulativo' : '1,65% não cumulativo, com créditos') : ''
      case 'COFINS':
        return regras.pisCofins ? (presumido ? '3% cumulativo' : '7,6% não cumulativo, com créditos') : ''
      case 'CPP':
        return cpp
      case 'ICMS':
        return fator ? `interna ${p(modal * fator)}; interestadual ${p(4 * fator)}/${p(7 * fator)}/${p(12 * fator)}; DIFAL` : 'extinto'
      case 'ISS':
        return fator && params.aliquotaIss ? p(params.aliquotaIss * fator) : ''
      case 'IPI':
        return regras.ipi && params.aliquotaIpi ? p(params.aliquotaIpi) : ''
      case 'CBS':
        return regras.pisCofins ? '' : `${p(regras.cbs * 100, 3)} com créditos`
      case 'IBS':
        return regras.pisCofins ? '' : `${p(regras.ibs * 100, 3)} com créditos`
    }
  }

  const colunas = REGIMES.filter((r) => a?.resultados[r.value])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Alíquotas nominais aplicadas e a alíquota efetiva resultante (tributo ÷ receita bruta) no ano projetado — receita anual de {moedaCurta(a?.receita ?? 0)}.
        </p>
        <Segmentado valor={String(ano)} onChange={(v) => setAno(Number(v))} opcoes={d.anos.map((x) => ({ value: String(x.ano), label: String(x.ano) }))} />
      </div>

      <Section title={`Alíquotas por tributo e regime — ${ano}`} icone={Percent}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3">Tributo</th>
                {colunas.map((r) => (
                  <th key={r.value} className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5">
                      <PontoRegime regime={r.value} />
                      {r.curto}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TRIBUTOS.map((t) => (
                <tr key={t} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 font-semibold text-slate-700">{NOME_TRIBUTO[t]}</td>
                  {colunas.map((r) => {
                    const res = a!.resultados[r.value]!
                    const v = res.tributos[t]
                    const txt = regra(r.value, t)
                    return (
                      <td key={r.value} className="px-3 py-2">
                        {v > 0.5 ? (
                          <>
                            <div className="font-bold text-slate-900 tabular-nums">
                              {pct(v / res.receita, 2)} <span className="text-xs font-medium text-slate-500">efetiva · {moedaCurta(v)}</span>
                            </div>
                            {txt && <div className="text-xs text-slate-500">{txt}</div>}
                            {t === 'ICMS' && res.icms.st + res.icms.antecipacao > 0.5 && (
                              <div className="text-xs text-slate-500">
                                + ST/antecipação nas entradas {moedaCurta(res.icms.st + res.icms.antecipacao)} ({pct((res.icms.st + res.icms.antecipacao) / res.receita)})
                              </div>
                            )}
                            {t === 'ICMS' && res.icms.difal > 0.5 && (
                              <div className="text-xs text-slate-500">
                                inclui DIFAL {moedaCurta(res.icms.difal)} ({pct(res.icms.difal / res.receita)})
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-300">{txt ? `${txt} — sem valor` : '—'}</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-2.5 pr-3">Carga total</td>
                {colunas.map((r) => {
                  const res = a!.resultados[r.value]!
                  return (
                    <td key={r.value} className="px-3 py-2.5 tabular-nums">
                      {pct(res.carga)} <span className="text-xs font-medium text-slate-500">· {moedaCurta(res.total)}</span>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title={`Simples Nacional — ${ANEXOS_SIMPLES[params.anexo].nome} (LC 123/2006)`} icone={TableProperties} cor="sky">
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          RBT12 projetado de {moeda(rbt12)} → faixa {fx.faixa}, alíquota efetiva {pct(fx.efetiva, 4)} = (RBT12 × nominal − parcela a deduzir) ÷ RBT12.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Faixa</th>
                <th className="px-2 py-2">RBT12 até</th>
                <th className="px-2 py-2">Nominal</th>
                <th className="px-2 py-2">Deduzir</th>
                {(['IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP', 'ICMS', 'IPI', 'ISS'] as TributoDas[]).map((t) => (
                  <th key={t} className="px-2 py-2">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {ANEXOS_SIMPLES[params.anexo].faixas.map((f, i) => (
                <tr key={f.ate} className={`border-b border-slate-100 text-right ${i + 1 === fx.faixa ? 'bg-brand-50 font-semibold' : ''}`}>
                  <td className="py-1.5 pr-3 text-left">{i + 1}ª</td>
                  <td className="px-2 py-1.5">{moedaCurta(f.ate)}</td>
                  <td className="px-2 py-1.5">{p(f.nominal * 100)}</td>
                  <td className="px-2 py-1.5">{moedaCurta(f.deduzir)}</td>
                  {(['IRPJ', 'CSLL', 'COFINS', 'PIS', 'CPP', 'ICMS', 'IPI', 'ISS'] as TributoDas[]).map((t) => (
                    <td key={t} className="px-2 py-1.5">
                      {f.partilha[t] ? p(f.partilha[t]! * 100) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Partilha do DAS entre os tributos. Na reforma: PIS+COFINS viram CBS em 2027; a parcela do ICMS/ISS migra para o IBS em 10%/20%/30%/40% de 2029 a 2032 e 100% em 2033.
        </p>
      </Section>
    </div>
  )
}
