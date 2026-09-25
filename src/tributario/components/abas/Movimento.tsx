import { useMemo, useState } from 'react'
import { ListTree, MapPin, RotateCcw, Table2 } from 'lucide-react'
import { Section, Select } from '../../../components/ui'
import { naturezaDe } from '../../engine/base'
import { NATUREZAS, classificarCfop, fornecedorDoSimples, type Natureza } from '../../engine/cfop'
import { agruparBases, rotuloPeriodo, type Agrupamento } from '../../engine/projecao'
import { receitaBruta, type BaseMensal, type MovimentoLinha, type Parametros, type TipoMovimento } from '../../engine/tipos'
import { moeda, pct } from '../../formatacao'
import { Segmentado } from '../comum'

type Linha = { rotulo: string; valor: (b: BaseMensal) => number; tipo?: 'titulo' | 'total' | 'sub' }

const LINHAS: Linha[] = [
  { rotulo: 'Receitas', valor: () => 0, tipo: 'titulo' },
  { rotulo: 'Vendas internas', valor: (b) => b.vendasInternas, tipo: 'sub' },
  { rotulo: 'Vendas interestaduais', valor: (b) => b.vendasInterestaduais, tipo: 'sub' },
  { rotulo: 'Serviços prestados', valor: (b) => b.servicos },
  { rotulo: 'Exportação', valor: (b) => b.exportacao },
  { rotulo: '(−) Devoluções de venda', valor: (b) => -b.devolucoesVenda },
  { rotulo: 'Receita bruta', valor: receitaBruta, tipo: 'total' },
  { rotulo: 'Outras receitas (venda de ativo etc.)', valor: (b) => b.outrasReceitas },
  { rotulo: 'Aquisições', valor: () => 0, tipo: 'titulo' },
  { rotulo: 'Compras para revenda / insumos', valor: (b) => b.compras },
  { rotulo: 'de fornecedores do Simples', valor: (b) => b.comprasFornecedorSimples, tipo: 'sub' },
  { rotulo: 'ICMS destacado nas compras (crédito)', valor: (b) => b.icmsCompras, tipo: 'sub' },
  { rotulo: 'ICMS nas compras com ST (sem crédito)', valor: (b) => b.icmsComprasSemCredito, tipo: 'sub' },
  { rotulo: '(−) Devoluções de compra', valor: (b) => -b.devolucoesCompra },
  { rotulo: 'Compras líquidas', valor: (b) => b.compras - b.devolucoesCompra, tipo: 'total' },
  { rotulo: 'Serviços tomados', valor: (b) => b.servicosTomados },
  { rotulo: 'Fretes', valor: (b) => b.fretes },
  { rotulo: 'Energia elétrica', valor: (b) => b.energia },
  { rotulo: 'Comunicação', valor: (b) => b.comunicacao },
  { rotulo: 'Uso e consumo', valor: (b) => b.usoConsumo },
  { rotulo: 'Ativo imobilizado', valor: (b) => b.ativo },
  { rotulo: 'Outras operações', valor: () => 0, tipo: 'titulo' },
  { rotulo: 'Remessas, retornos, transferências e bonificações', valor: (b) => b.neutras },
  { rotulo: 'Margem bruta aproximada (receita − compras líquidas)', valor: (b) => receitaBruta(b) - (b.compras - b.devolucoesCompra), tipo: 'total' },
]

const NOME_TIPO: Record<TipoMovimento, string> = { entrada: 'Entrada', saida: 'Saída', servico_tomado: 'Serv. tomado', servico_prestado: 'Serv. prestado' }

export function Movimento({
  bases,
  linhas,
  params,
  onParams,
}: {
  bases: BaseMensal[]
  linhas: MovimentoLinha[]
  params: Parametros
  onParams: (p: Parametros) => void
}) {
  const [ag, setAg] = useState<Agrupamento>('mes')
  const grupos = useMemo(() => agruparBases(bases, ag), [bases, ag])
  const total = useMemo(() => agruparBases(bases, 'ano'), [bases])

  const cfops = useMemo(() => {
    const m = new Map<string, { chave: string; tipo: TipoMovimento; codigo: string; valor: number; itens: number; natureza: Natureza; padrao: Natureza }>()
    for (const l of linhas) {
      const codigo = l.cfop || l.servico || '(sem código)'
      const chave = l.cfop ? l.cfop : `${l.tipo === 'servico_prestado' ? 'SERV-P' : 'SERV-T'}:${l.servico}`
      const atual = m.get(chave) ?? {
        chave,
        tipo: l.tipo,
        codigo,
        valor: 0,
        itens: 0,
        natureza: naturezaDe(l, params.cfopNatureza),
        padrao: l.cfop ? classificarCfop(l.cfop) : l.tipo === 'servico_prestado' ? 'venda_servico' : 'servico_tomado',
      }
      atual.valor += l.valor_contabil
      atual.itens += l.itens
      m.set(chave, atual)
    }
    return [...m.values()].sort((a, b) => a.tipo.localeCompare(b.tipo) || b.valor - a.valor)
  }, [linhas, params.cfopNatureza])

  function mudarNatureza(chave: string, n: Natureza, padrao: Natureza) {
    const ajustes = { ...params.cfopNatureza }
    if (n === padrao) delete ajustes[chave]
    else ajustes[chave] = n
    onParams({ ...params, cfopNatureza: ajustes })
  }

  // Coluna de total quando o período cabe em um único ano
  const colunas = ag !== 'ano' && grupos.length > 1 && total.length === 1 ? [...grupos, { ...total[0], chave: 'Total' }] : grupos

  return (
    <div className="space-y-5">
      <Section
        title="Movimento do período"
        icone={Table2}
        actions={
          <Segmentado
            valor={ag}
            onChange={setAg}
            opcoes={[
              { value: 'mes', label: 'Mensal' },
              { value: 'semestre', label: 'Semestral' },
              { value: 'ano', label: 'Anual' },
            ]}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="sticky left-0 bg-white py-2.5 pr-4 text-left">Descrição</th>
                {colunas.map((g) => (
                  <th key={g.chave} className="px-3 py-2.5 whitespace-nowrap">
                    {g.chave === 'Total' ? 'Total' : rotuloPeriodo(g.chave)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {LINHAS.map((l) =>
                l.tipo === 'titulo' ? (
                  <tr key={l.rotulo}>
                    <td colSpan={colunas.length + 1} className="sticky left-0 bg-slate-50 px-2 py-1.5 text-[0.6875rem] font-bold tracking-wider text-slate-500 uppercase">
                      {l.rotulo}
                    </td>
                  </tr>
                ) : (
                  <tr key={l.rotulo} className={`border-b border-slate-100 text-right ${l.tipo === 'total' ? 'font-bold text-slate-900' : l.tipo === 'sub' ? 'text-slate-500' : 'text-slate-700'}`}>
                    <td className={`sticky left-0 bg-white py-2 pr-4 text-left whitespace-nowrap ${l.tipo === 'sub' ? 'pl-4 text-xs' : ''}`}>{l.rotulo}</td>
                    {colunas.map((g) => {
                      const v = l.valor(g.soma)
                      return (
                        <td key={g.chave} className="px-3 py-2 whitespace-nowrap">
                          {Math.abs(v) < 0.005 ? <span className="text-slate-300">—</span> : moeda(v)}
                        </td>
                      )
                    })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Destinos linhas={linhas} params={params} />

      <Section title="Classificação dos CFOPs e serviços" icone={ListTree} cor="violet">
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          O sistema classifica cada CFOP pela tabela do Ajuste SINIEF 07/2001. Revise principalmente os valores altos marcados como neutros (remessas, retornos, "outros") — por
          exemplo, entradas em venda à ordem (x923) sem a nota de compra (x121) correspondente. Desmarque "Usar" para tirar um CFOP de toda a análise. Alterações são salvas e valem para todos os cálculos desta empresa.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="w-12 py-2.5 pr-2">Usar</th>
                <th className="py-2.5 pr-3">Tipo</th>
                <th className="px-3 py-2.5">CFOP / serviço</th>
                <th className="px-3 py-2.5 text-right">Itens</th>
                <th className="px-3 py-2.5 text-right">Valor contábil</th>
                <th className="px-3 py-2.5">Tratamento no cálculo</th>
              </tr>
            </thead>
            <tbody>
              {cfops.map((c) => {
                const grupo = NATUREZAS.find((n) => n.value === c.natureza)?.grupo
                return (
                  <tr key={c.chave} className={`border-b border-slate-100 ${params.cfopsExcluidos.includes(c.chave) ? 'bg-slate-50 opacity-50' : ''}`}>
                    <td className="py-2 pr-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer"
                        title="Considerar este CFOP na análise"
                        checked={!params.cfopsExcluidos.includes(c.chave)}
                        onChange={() =>
                          onParams({
                            ...params,
                            cfopsExcluidos: params.cfopsExcluidos.includes(c.chave) ? params.cfopsExcluidos.filter((x) => x !== c.chave) : [...params.cfopsExcluidos, c.chave],
                          })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3 text-slate-500">{NOME_TIPO[c.tipo]}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{c.codigo}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{c.itens.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moeda(c.valor)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-80">
                          <Select
                            className={`input py-1.5 ${grupo === 'Receita' ? 'border-emerald-200 bg-emerald-50' : grupo === 'Neutro' ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-sky-200 bg-sky-50'}`}
                            value={c.natureza}
                            onChange={(v) => mudarNatureza(c.chave, v as Natureza, c.padrao)}
                            opcoes={NATUREZAS.map((n) => ({ value: n.value, label: `${n.label} (${n.grupo.toLowerCase()})` }))}
                          />
                        </div>
                        {c.natureza !== c.padrao && (
                          <button className="icon-btn" title="Voltar ao padrão" onClick={() => mudarNatureza(c.chave, c.padrao, c.padrao)}>
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

/** Vendas por UF de destino e tipo de cliente; compras por tipo de fornecedor. */
function Destinos({ linhas, params }: { linhas: MovimentoLinha[]; params: Parametros }) {
  const dados = useMemo(() => {
    const ufs = new Map<string, { uf: string; total: number; PF: number; PJ_C: number; PJ_N: number; semInfo: number }>()
    const forn = { regular: 0, simples: 0, pf: 0, exterior: 0 }
    let totalVendas = 0
    for (const l of linhas) {
      const n = naturezaDe(l, params.cfopNatureza)
      if (l.tipo === 'saida' && n === 'venda') {
        totalVendas += l.valor_contabil
        const uf = l.uf || (l.cfop.startsWith('5') ? 'Interna (sem UF)' : 'Interestadual (sem UF)')
        const x = ufs.get(uf) ?? { uf, total: 0, PF: 0, PJ_C: 0, PJ_N: 0, semInfo: 0 }
        x.total += l.valor_contabil
        if (l.destinatario) x[l.destinatario] += l.valor_contabil
        else x.semInfo += l.valor_contabil
        ufs.set(uf, x)
      }
      if (l.tipo === 'entrada' && (n === 'compra_revenda' || n === 'compra_insumo')) {
        if (l.cfop.startsWith('3')) forn.exterior += l.valor_contabil
        else if (l.destinatario === 'PF') forn.pf += l.valor_contabil
        else if (fornecedorDoSimples(l.cst)) forn.simples += l.valor_contabil
        else forn.regular += l.valor_contabil
      }
    }
    return { ufs: [...ufs.values()].sort((a, b) => b.total - a.total), forn, totalVendas }
  }, [linhas, params.cfopNatureza])
  const totalForn = dados.forn.regular + dados.forn.simples + dados.forn.pf + dados.forn.exterior
  if (!dados.totalVendas && !totalForn) return null
  const tot = dados.ufs.reduce((s, u) => ({ PF: s.PF + u.PF, PJ_C: s.PJ_C + u.PJ_C, PJ_N: s.PJ_N + u.PJ_N }), { PF: 0, PJ_C: 0, PJ_N: 0 })

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Section title="Vendas por UF de destino e tipo de cliente" icone={MapPin} cor="sky">
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">Consumidor final (CPF) {pct(tot.PF / (dados.totalVendas || 1), 1)}</span>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">PJ contribuinte — toma crédito {pct(tot.PJ_C / (dados.totalVendas || 1), 1)}</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-700">PJ não contribuinte {pct(tot.PJ_N / (dados.totalVendas || 1), 1)}</span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[35rem] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                  <th className="py-2 pr-3 text-left">UF</th>
                  <th className="px-3 py-2">Vendas</th>
                  <th className="px-3 py-2">%</th>
                  <th className="px-3 py-2">Pessoa física</th>
                  <th className="px-3 py-2">PJ contribuinte</th>
                  <th className="px-3 py-2">PJ não contrib.</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {dados.ufs.map((u) => (
                  <tr key={u.uf} className="border-b border-slate-100 text-right">
                    <td className="py-1.5 pr-3 text-left font-semibold text-slate-700">{u.uf}</td>
                    <td className="px-3 py-1.5">{moeda(u.total)}</td>
                    <td className="px-3 py-1.5 text-slate-500">{pct(u.total / (dados.totalVendas || 1), 1)}</td>
                    <td className="px-3 py-1.5">{u.PF ? moeda(u.PF) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5">{u.PJ_C ? moeda(u.PJ_C) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-1.5">{u.PJ_N ? moeda(u.PJ_N) : <span className="text-slate-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
      <Section title="Compras por tipo de fornecedor" icone={MapPin} cor="emerald">
        <div className="space-y-3 text-sm">
          {[
            { r: 'Regime normal', v: dados.forn.regular, d: 'crédito integral de IBS/CBS' },
            { r: 'Simples Nacional', v: dados.forn.simples, d: 'crédito limitado ao IBS/CBS do DAS' },
            { r: 'Pessoa física', v: dados.forn.pf, d: 'sem crédito' },
            { r: 'Exterior (importação)', v: dados.forn.exterior, d: 'crédito do IBS/CBS pago na importação' },
          ].map((x) => (
            <div key={x.r}>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-700">{x.r}</span>
                <span className="tabular-nums">{moeda(x.v)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${totalForn ? (x.v / totalForn) * 100 : 0}%` }} />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {totalForn ? pct(x.v / totalForn, 1) : '—'} · {x.d}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
