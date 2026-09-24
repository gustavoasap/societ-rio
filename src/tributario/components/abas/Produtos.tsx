import { useMemo, useState } from 'react'
import { Barcode, Search } from 'lucide-react'
import { Section } from '../../../components/ui'
import { naturezaDe } from '../../engine/base'
import { ncmMonofasico, reducaoIbsCbs, tratamentoNcm } from '../../engine/ncm'
import type { MovimentoLinha, Parametros } from '../../engine/tipos'
import type { NcmRegistro } from '../../dados'
import { moeda, pct } from '../../formatacao'

type Campos = Pick<NcmRegistro, 'monofasico' | 'st' | 'reducao'>

const mascaraNcm = (n: string) => (n.length === 8 ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : n)

function SimNao({ valor, padrao, onChange }: { valor: boolean | null; padrao: boolean; onChange: (v: boolean | null) => void }) {
  return (
    <select
      className={`input w-36 py-1.5 ${valor === null ? 'text-slate-500' : valor ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300'}`}
      value={valor === null ? '' : valor ? 's' : 'n'}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 's')}
    >
      <option value="">Padrão ({padrao ? 'sim' : 'não'})</option>
      <option value="s">Sim</option>
      <option value="n">Não</option>
    </select>
  )
}

export function Produtos({
  linhas,
  registros,
  params,
  onMudar,
}: {
  linhas: MovimentoLinha[]
  registros: NcmRegistro[]
  params: Parametros
  onMudar: (ncm: string, campos: Campos) => void
}) {
  const [busca, setBusca] = useState('')
  const [soVendidos, setSoVendidos] = useState(false)

  const lista = useMemo(() => {
    const m = new Map<string, { ncm: string; vendas: number; entradas: number }>()
    for (const l of linhas) {
      if (!l.ncm) continue
      const n = naturezaDe(l, params.cfopNatureza)
      const x = m.get(l.ncm) ?? { ncm: l.ncm, vendas: 0, entradas: 0 }
      if (l.tipo === 'saida' && n === 'venda') x.vendas += l.valor_contabil
      if (l.tipo === 'entrada' && (n === 'compra_revenda' || n === 'compra_insumo')) x.entradas += l.valor_contabil
      m.set(l.ncm, x)
    }
    for (const r of registros) if (!m.has(r.ncm)) m.set(r.ncm, { ncm: r.ncm, vendas: 0, entradas: 0 })
    const porNcm = new Map(registros.map((r) => [r.ncm, r]))
    return [...m.values()]
      .map((x) => ({ ...x, reg: porNcm.get(x.ncm), trat: tratamentoNcm(x.ncm, params.ncms) }))
      .sort((a, b) => b.vendas - a.vendas || b.entradas - a.entradas)
  }, [linhas, registros, params.cfopNatureza, params.ncms])

  const totalVendas = lista.reduce((s, x) => s + x.vendas, 0)
  const resumo = {
    mono: lista.reduce((s, x) => s + (x.trat.monofasico ? x.vendas : 0), 0),
    st: lista.reduce((s, x) => s + (x.trat.st ? x.vendas : 0), 0),
    reducao: lista.reduce((s, x) => s + x.vendas * x.trat.reducao, 0),
  }
  const termo = busca.trim().toLowerCase()
  const filtrada = lista.filter(
    (x) => (!soVendidos || x.vendas > 0) && (!termo || x.ncm.includes(termo.replace(/\D/g, '') || '§') || (x.reg?.descricao ?? '').toLowerCase().includes(termo)),
  )

  const campos = (x: (typeof lista)[number]): Campos => ({ monofasico: x.reg?.monofasico ?? null, st: x.reg?.st ?? null, reducao: x.reg?.reducao ?? null })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { t: 'NCMs da empresa', v: String(lista.length), d: `${lista.filter((x) => x.vendas > 0).length} com vendas no período` },
          { t: 'Vendas monofásicas (PIS/COFINS)', v: totalVendas ? pct(resumo.mono / totalVendas, 1) : '—', d: moeda(resumo.mono) },
          { t: 'Vendas com ICMS-ST', v: totalVendas ? pct(resumo.st / totalVendas, 1) : '—', d: moeda(resumo.st) },
          { t: 'Redução média de IBS/CBS', v: totalVendas ? pct(resumo.reducao / totalVendas, 1) : '—', d: 'ponderada pelas vendas' },
        ].map((k) => (
          <div key={k.t} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <div className="text-xs font-semibold text-slate-500 uppercase">{k.t}</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">{k.v}</div>
            <div className="text-xs text-slate-500">{k.d}</div>
          </div>
        ))}
      </div>

      <Section
        title="Tratamento tributário por NCM"
        icone={Barcode}
        actions={
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={soVendidos} onChange={(e) => setSoVendidos(e.target.checked)} /> Só NCMs vendidos
          </label>
        }
      >
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          Os NCMs chegam automaticamente de cada importação. "Padrão" é a sugestão do sistema: monofásico pelas Leis 10.147/2000, 10.485/2002 e 13.097/2015; redução de IBS/CBS
          pelo Anexo VIII (60%) e art. 147 (alíquota zero) da LC 214/2025. Ajuste o que for diferente para este cliente — vale na hora para todos os cálculos.
        </p>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar NCM ou produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3">NCM</th>
                <th className="px-3 py-2.5">Produto (exemplo)</th>
                <th className="px-3 py-2.5 text-right">Vendas</th>
                <th className="px-3 py-2.5 text-right">Compras</th>
                <th className="px-3 py-2.5">PIS/COFINS monofásico</th>
                <th className="px-3 py-2.5">ICMS-ST</th>
                <th className="px-3 py-2.5">Redução IBS/CBS</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((x) => {
                const c = campos(x)
                const padraoReducao = reducaoIbsCbs(x.ncm) * 100
                return (
                  <tr key={x.ncm} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap text-slate-800">{mascaraNcm(x.ncm)}</td>
                    <td className="max-w-72 truncate px-3 py-2 text-slate-600" title={x.reg?.descricao ?? ''}>
                      {x.reg?.descricao ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.vendas ? moeda(x.vendas) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{x.entradas ? moeda(x.entradas) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <SimNao valor={c.monofasico} padrao={ncmMonofasico(x.ncm)} onChange={(v) => onMudar(x.ncm, { ...c, monofasico: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <SimNao valor={c.st} padrao={false} onChange={(v) => onMudar(x.ncm, { ...c, st: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={`input w-40 py-1.5 ${c.reducao === null ? 'text-slate-500' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}
                        value={c.reducao === null ? '' : String(c.reducao)}
                        onChange={(e) => onMudar(x.ncm, { ...c, reducao: e.target.value === '' ? null : Number(e.target.value) })}
                      >
                        <option value="">Padrão ({padraoReducao}%)</option>
                        <option value="0">Sem redução</option>
                        <option value="30">30% (profissionais)</option>
                        <option value="40">40%</option>
                        <option value="60">60%</option>
                        <option value="100">Alíquota zero</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
              {filtrada.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    Nenhum NCM encontrado. Importe relatórios detalhados (com NCM) de entradas ou saídas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
