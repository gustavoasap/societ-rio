import { useMemo, useState } from 'react'
import { Search, Users } from 'lucide-react'
import { Section } from '../../../components/ui'
import { mascaraCnpj } from '../../../lib/format'
import { naturezaDe } from '../../engine/base'
import { fornecedorDoSimples } from '../../engine/cfop'
import { moeda, pct } from '../../formatacao'
import { Segmentado } from '../comum'
import type { DadosAnalise } from '../contexto'
import type { RegimeFornecedor } from '../../engine/tipos'
import { REGIMES_FORN } from '../../formatacao'

const TIPO: Record<string, string> = { PF: 'Pessoa física', PJ_C: 'PJ contribuinte', PJ_N: 'PJ não contribuinte', '': '—' }

interface Linha {
  chave: string
  nome: string
  tipo: string
  uf: string
  vendas: number
  compras: number
  servicos: number
  outras: number
  simples: boolean
}

const nomeRegimeForn = (r: RegimeFornecedor) => REGIMES_FORN.find((x) => x.value === r)?.label ?? r

export function Parceiros({ d, onRegime }: { d: DadosAnalise; onRegime: (documento: string, regime: RegimeFornecedor | null) => void }) {
  const { params } = d
  const [filtro, setFiltro] = useState<'clientes' | 'fornecedores' | 'todos'>('clientes')
  const [busca, setBusca] = useState('')

  const lista = useMemo(() => {
    const m = new Map<string, Linha>()
    for (const l of d.linhas) {
      const chave = l.parceiro || (l.destinatario === 'PF' ? 'PF' : '')
      if (!chave) continue
      const reg = d.parceiros.get(l.parceiro)
      const x =
        m.get(chave) ??
        ({
          chave,
          nome: chave === 'PF' ? 'Pessoas físicas (consumidores finais)' : reg?.nome || '(sem nome)',
          tipo: chave === 'PF' ? 'PF' : (reg?.tipo ?? l.destinatario),
          uf: chave === 'PF' ? 'várias' : (reg?.uf ?? l.uf),
          vendas: 0,
          compras: 0,
          servicos: 0,
          outras: 0,
          simples: false,
        } as Linha)
      const n = naturezaDe(l, params.cfopNatureza)
      if (l.tipo === 'saida' && n === 'venda') x.vendas += l.valor_contabil
      else if (l.tipo === 'entrada' && (n === 'compra_revenda' || n === 'compra_insumo')) {
        x.compras += l.valor_contabil
        if (fornecedorDoSimples(l.cst)) x.simples = true
      } else if (l.tipo === 'servico_tomado') x.servicos += l.valor_contabil
      else x.outras += l.valor_contabil
      m.set(chave, x)
    }
    return [...m.values()]
  }, [d.linhas, d.parceiros, params.cfopNatureza])

  const excluidos = new Set(params.parceirosExcluidos)
  const alternar = (chave: string) => {
    const novo = excluidos.has(chave) ? params.parceirosExcluidos.filter((x) => x !== chave) : [...params.parceirosExcluidos, chave]
    d.onParams({ ...params, parceirosExcluidos: novo })
  }

  const clientes = lista.filter((x) => x.vendas > 0).sort((a, b) => b.vendas - a.vendas)
  const fornecedores = lista.filter((x) => x.compras + x.servicos > 0).sort((a, b) => b.compras + b.servicos - (a.compras + a.servicos))
  const totalVendas = clientes.reduce((s, x) => s + x.vendas, 0)
  const totalCompras = fornecedores.reduce((s, x) => s + x.compras + x.servicos, 0)
  const top5 = (arr: Linha[], f: (x: Linha) => number, tot: number) => (tot ? arr.slice(0, 5).reduce((s, x) => s + f(x), 0) / tot : 0)

  const base = filtro === 'clientes' ? clientes : filtro === 'fornecedores' ? fornecedores : [...lista].sort((a, b) => b.vendas + b.compras + b.servicos - (a.vendas + a.compras + a.servicos))
  const termo = busca.trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')
  const exibidos = base.filter((x) => !termo || x.nome.toLowerCase().includes(termo) || (digitos.length >= 3 && x.chave.includes(digitos)))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { t: 'Clientes', v: String(clientes.length), s: `top 5 = ${pct(top5(clientes, (x) => x.vendas, totalVendas), 1)} das vendas` },
          { t: 'Fornecedores', v: String(fornecedores.length), s: `top 5 = ${pct(top5(fornecedores, (x) => x.compras + x.servicos, totalCompras), 1)} das compras` },
          { t: 'Fora da análise', v: String(params.parceirosExcluidos.length), s: 'clientes/fornecedores desmarcados' },
          { t: 'Fornecedores do Simples', v: String(fornecedores.filter((x) => x.simples).length), s: 'crédito de IBS/CBS limitado' },
        ].map((k) => (
          <div key={k.t} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <div className="text-xs font-semibold text-slate-500 uppercase">{k.t}</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">{k.v}</div>
            <div className="text-xs text-slate-500">{k.s}</div>
          </div>
        ))}
      </div>

      <Section
        title="Clientes e fornecedores considerados na análise"
        icone={Users}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {params.parceirosExcluidos.length > 0 && (
              <button className="btn-secondary btn-sm" onClick={() => d.onParams({ ...params, parceirosExcluidos: [] })}>
                Considerar todos
              </button>
            )}
            <Segmentado
              valor={filtro}
              onChange={setFiltro}
              opcoes={[
                { value: 'clientes', label: 'Clientes' },
                { value: 'fornecedores', label: 'Fornecedores' },
                { value: 'todos', label: 'Todos' },
              ]}
            />
          </div>
        }
      >
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Desmarque um cliente ou fornecedor para tirá-lo de todos os cálculos (ex.: operações com partes relacionadas ou não recorrentes). Pessoas físicas ficam agrupadas.
          O <strong>regime do fornecedor</strong> define o crédito: regime normal dá crédito integral de IBS/CBS; Simples, só o IBS/CBS do DAS; MEI e pessoa física, nenhum.
          O sistema identifica o Simples pelo CSOSN das notas de entrada; prestadores de serviço e Presumido × Real precisam ser informados aqui. Tudo é salvo automaticamente.
        </p>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar por nome ou CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="max-h-[600px] overflow-auto">
          <table className="w-full min-w-[1140px] text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <th className="w-10 py-2.5 pr-2">Usar</th>
                <th className="px-2 py-2.5">Nome</th>
                <th className="px-2 py-2.5">CNPJ</th>
                <th className="px-2 py-2.5">Tipo</th>
                <th className="px-2 py-2.5">UF</th>
                <th className="px-2 py-2.5 text-right">Vendas</th>
                <th className="px-2 py-2.5 text-right">% vendas</th>
                <th className="px-2 py-2.5 text-right">Compras</th>
                <th className="px-2 py-2.5 text-right">Serviços</th>
                <th className="px-2 py-2.5">Regime do fornecedor (crédito)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {exibidos.map((x) => {
                const fora = excluidos.has(x.chave)
                return (
                  <tr key={x.chave} className={`border-b border-slate-100 ${fora ? 'bg-slate-50 text-slate-400 line-through' : ''}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={!fora} onChange={() => alternar(x.chave)} className="h-4 w-4 cursor-pointer" />
                    </td>
                    <td className="max-w-72 truncate px-2 py-2 font-medium text-slate-700" title={x.nome}>
                      {x.nome}
                      {x.simples && <span className="ml-2 rounded bg-amber-50 px-1.5 text-[10px] font-bold text-amber-700 no-underline">SIMPLES</span>}
                    </td>
                    <td className="px-2 py-2 text-slate-500">{x.chave === 'PF' ? '—' : mascaraCnpj(x.chave)}</td>
                    <td className="px-2 py-2 text-slate-500">{TIPO[x.tipo] ?? x.tipo}</td>
                    <td className="px-2 py-2 text-slate-500">{x.uf || '—'}</td>
                    <td className="px-2 py-2 text-right">{x.vendas ? moeda(x.vendas) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2 text-right text-slate-500">{x.vendas && totalVendas ? pct(x.vendas / totalVendas, 1) : ''}</td>
                    <td className="px-2 py-2 text-right">{x.compras ? moeda(x.compras) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2 text-right">{x.servicos ? moeda(x.servicos) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-2 py-2">
                      {x.chave !== 'PF' && x.compras + x.servicos > 0 ? (
                        <select
                          className={`input w-56 py-1 text-xs no-underline ${d.params.regimeFornecedores[x.chave] ? 'border-emerald-300 bg-emerald-50 font-semibold' : 'text-slate-500'}`}
                          value={d.params.regimeFornecedores[x.chave] ?? ''}
                          onChange={(e) => onRegime(x.chave, (e.target.value || null) as RegimeFornecedor | null)}
                        >
                          <option value="">Automático: {nomeRegimeForn(x.simples ? 'simples' : 'normal')}</option>
                          {REGIMES_FORN.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
              {exibidos.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-slate-400">
                    Nenhum cliente/fornecedor identificado. Reimporte os relatórios detalhados para trazer o CNPJ de cada nota.
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
