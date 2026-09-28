import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeftRight, Boxes, Link2, PackageX, Search, Settings2, Trash2 } from 'lucide-react'
import { Section } from '../../../components/ui'
import { nomeMes } from '../../engine/base'
import { NOME_MOV_ESTOQUE, chaveNota, movimentoEstoque, type ConfigProduto, type ItemEstoque, type MovEstoque, type ResultadoEstoque } from '../../engine/estoque'
import type { Parametros } from '../../engine/tipos'
import { moeda, moedaCurta, pct } from '../../formatacao'
import { Kpi, Segmentado } from '../comum'

const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export function Estoque({
  estoque,
  itens,
  produtos,
  params,
  onParams,
  onProduto,
}: {
  estoque: ResultadoEstoque | null
  itens: ItemEstoque[]
  produtos: Record<string, ConfigProduto>
  params: Parametros
  onParams: (p: Parametros) => void
  onProduto: (c: ConfigProduto) => void
}) {
  const meses = estoque?.meses ?? []
  const [mes, setMes] = useState(meses[meses.length - 1] ?? '')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [verNotas, setVerNotas] = useState(false)

  // CFOPs presentes nos itens, com o tratamento no estoque
  const cfops = useMemo(() => {
    const m = new Map<string, { tipo: 'entrada' | 'saida'; valor: number; qtd: number }>()
    for (const i of itens) {
      const x = m.get(i.cfop) ?? { tipo: i.tipo, valor: 0, qtd: 0 }
      x.valor += i.valor
      x.qtd += i.quantidade
      m.set(i.cfop, x)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [itens])

  // notas de compra (entradas que compõem o estoque), para tirar uma nota inteira do estoque
  const notasCompra = useMemo(() => {
    const m = new Map<string, { chave: string; competencia: string; nota: string; parceiro: string; cfops: Set<string>; qtd: number; valor: number; itens: number }>()
    for (const i of itens) {
      if (i.tipo !== 'entrada' || !i.nota || movimentoEstoque('entrada', i.cfop, params.cfopNatureza, params.cfopEstoque) !== 'compra') continue
      const k = chaveNota(i)
      const x = m.get(k) ?? { chave: k, competencia: i.competencia, nota: i.nota, parceiro: i.parceiro ?? '', cfops: new Set(), qtd: 0, valor: 0, itens: 0 }
      x.cfops.add(i.cfop)
      x.qtd += i.quantidade
      x.valor += i.valor
      x.itens++
      m.set(k, x)
    }
    return [...m.values()].sort((a, b) => a.competencia.localeCompare(b.competencia) || a.nota.localeCompare(b.nota, 'pt-BR', { numeric: true }))
  }, [itens, params.cfopNatureza, params.cfopEstoque])

  if (!estoque || !itens.length)
    return (
      <Section title="Estoque e CMV pelo custo médio ponderado" icone={Boxes}>
        <p className="text-sm text-slate-600">
          Ainda não há itens por produto. Reimporte os <strong>Registros de Entradas e de Saídas detalhados</strong> (com código, EAN e quantidade de cada item) — a
          partir deles o sistema monta o estoque mês a mês e calcula o CMV pelo custo médio ponderado, como na planilha de controle. Enquanto isso, o CMV da DRE usa as
          compras líquidas do mês.
        </p>
      </Section>
    )

  const total = meses.reduce(
    (s, m) => {
      const x = estoque.porMes[m]
      return { cmv: s.cmv + x.cmvEstimado, compras: s.compras + x.compras, sem: s.sem + x.vendasSemCusto, cobertas: s.cobertas + x.vendasCobertas }
    },
    { cmv: 0, compras: 0, sem: 0, cobertas: 0 },
  )
  const ultimo = estoque.porMes[meses[meses.length - 1]]
  const negativos = estoque.produtos.filter((p) => Object.values(p.meses).some((m) => m.negativo))
  const termo = busca.trim().toLowerCase()
  const lista = estoque.produtos.filter((p) => p.meses[mes] && (!termo || p.descricao.toLowerCase().includes(termo) || p.chave.includes(termo)))
  const somaMes = lista.reduce(
    (s, p) => {
      const m = p.meses[mes]
      return { ini: s.ini + m.inicialV, comp: s.comp + m.compraV - m.devCompraV, cmv: s.cmv + m.cmv, fim: s.fim + m.finalV }
    },
    { ini: 0, comp: 0, cmv: 0, fim: 0 },
  )
  const semEstoque = Object.values(produtos).filter((c) => c.semEstoque)
  const totalSemEstoque = meses.reduce((s, m) => s + estoque.porMes[m].vendasSemEstoque, 0)
  const fora = new Set(params.estoqueNotasFora)
  const alternarNota = (k: string) =>
    onParams({ ...params, estoqueNotasFora: fora.has(k) ? params.estoqueNotasFora.filter((x) => x !== k) : [...params.estoqueNotasFora, k] })
  const paresNotas = new Set(estoque.pares.map((p) => `entrada|${p.entrada.nota}|${p.entrada.parceiro}`))
  const opcoesProduto = estoque.produtos.map((p) => ({ chave: p.chave, rotulo: `${p.descricao.slice(0, 60)} (${p.chave})` }))

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="CMV no período (custo médio)" valor={moedaCurta(total.cmv)} detalhe={`${meses.length} meses · compras ${moedaCurta(total.compras)}`} icone={<Boxes className="h-4 w-4" />} />
        <Kpi titulo="Estoque final" valor={moedaCurta(ultimo.estoqueFinal)} detalhe={`em ${nomeMes(meses[meses.length - 1])}`} tom="emerald" icone={<Boxes className="h-4 w-4" />} />
        <Kpi
          titulo="Vendas sem custo"
          valor={moedaCurta(total.sem)}
          detalhe={`${estoque.semCusto.length} produto(s) · ${total.sem + total.cobertas ? pct(total.sem / (total.sem + total.cobertas), 1) : '—'} das vendas — DE.PARA ou “sem estoque”${totalSemEstoque ? ` · ${moedaCurta(totalSemEstoque)} em produtos sem estoque (só receita)` : ''}`}
          tom="amber"
          icone={<Link2 className="h-4 w-4" />}
        />
        <div className="rounded-2xl bg-white p-5 shadow-lg shadow-asap-900/5 ring-1 ring-slate-200/70">
          <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">CMV usado na DRE</div>
          <select className="input mt-2" value={params.metodoCmv} onChange={(e) => onParams({ ...params, metodoCmv: e.target.value as Parametros['metodoCmv'] })}>
            <option value="estoque">Custo médio ponderado (estoque)</option>
            <option value="compras">Compras líquidas do mês</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">{params.cmvPercentual !== null ? 'Atenção: há CMV em % da receita nos Parâmetros — ele prevalece.' : 'Vale para a DRE e o IRPJ/CSLL do Lucro Real.'}</p>
        </div>
      </div>

      <Section title="CMV mensal — custo médio ponderado" icone={Boxes}>
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Por produto: custo médio = (valor inicial + compras) ÷ (quantidade inicial + compras); CMV = estoque inicial + compras − estoque final (RIR/2018, art. 307; NBC TG 16).
          Devolução de venda volta pelo custo médio; devolução de compra sai pelo valor da nota. Vendas de produtos sem custo entram na estimativa pela relação CMV/venda do
          mês até o DE.PARA ser feito.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Competência</th>
                <th className="px-3 py-2">Estoque inicial</th>
                <th className="px-3 py-2">Compras líquidas</th>
                <th className="px-3 py-2">CMV (custo médio)</th>
                <th className="px-3 py-2">Vendas sem custo</th>
                <th className="px-3 py-2">CMV na DRE</th>
                <th className="px-3 py-2">Estoque final</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {meses.map((m) => {
                const x = estoque.porMes[m]
                return (
                  <tr key={m} className={`cursor-pointer border-b border-slate-100 text-right hover:bg-slate-50 ${m === mes ? 'bg-brand-50/50' : ''}`} onClick={() => setMes(m)}>
                    <td className="py-1.5 pr-3 text-left font-medium">{nomeMes(m)}</td>
                    <td className="px-3 py-1.5">{moeda(x.estoqueInicial)}</td>
                    <td className="px-3 py-1.5">{moeda(x.compras)}</td>
                    <td className="px-3 py-1.5">{moeda(x.cmv)}</td>
                    <td className={`px-3 py-1.5 ${x.vendasSemCusto ? 'text-amber-700' : 'text-slate-300'}`}>{x.vendasSemCusto ? moeda(x.vendasSemCusto) : '—'}</td>
                    <td className="px-3 py-1.5 font-semibold">{moeda(x.cmvEstimado)}</td>
                    <td className={`px-3 py-1.5 ${x.estoqueFinal < 0 ? 'font-semibold text-rose-600' : ''}`}>{moeda(x.estoqueFinal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {(estoque.semCusto.length > 0 || negativos.length > 0) && (
        <Section title="Pendências do estoque" icone={AlertTriangle} cor="amber">
          {estoque.semCusto.length > 0 && (
            <>
              <p className="-mt-2 mb-2 text-sm text-slate-600">
                <strong>Produtos vendidos sem compra nem estoque inicial</strong>. O vínculo automático já usa o EAN, o SKU (código) e a descrição; o que sobrou tem
                código/EAN diferente do da compra (anúncio, kit). Faça o <strong>DE.PARA</strong> (produto(s) comprado(s) que saem do estoque a cada unidade vendida) ou marque
                <strong> sem estoque</strong> — a venda vai direto para a receita, sem CMV.
              </p>
              <div className="mb-4 space-y-1.5">
                {estoque.semCusto.map((s) => (
                  <div key={s.chave} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50/60 px-3 py-2 text-sm ring-1 ring-amber-200">
                    <span className="min-w-0">
                      <strong className="font-semibold">{s.descricao.slice(0, 70)}</strong> <span className="text-xs text-slate-500">({s.chave})</span>
                      <span className="block text-xs text-slate-600">
                        {qtd(s.quantidade)} un. vendidas · {moeda(s.valor)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <button className="btn-secondary btn-sm" onClick={() => setEditando(s.chave)}>
                        <Link2 className="h-3.5 w-3.5" /> DE.PARA
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        title="Produto sem DE.PARA: a venda vai direto para a receita, sem passar pelo estoque e sem CMV"
                        onClick={() => onProduto({ ...(produtos[s.chave] ?? { chave: s.chave, qtdInicial: null, valorInicial: null, componentes: null }), semEstoque: true })}
                      >
                        <PackageX className="h-3.5 w-3.5" /> Sem estoque
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {negativos.length > 0 && (
            <p className="text-sm text-slate-600">
              <strong>Estoque negativo</strong> em {negativos.length} produto(s): {negativos.slice(0, 6).map((p) => p.descricao.slice(0, 40)).join(' · ')}
              {negativos.length > 6 ? '…' : ''}. Informe o estoque inicial, revise o tratamento dos CFOPs abaixo (ex.: entrada 2923 em venda à ordem) ou faça o DE.PARA.
            </p>
          )}
        </Section>
      )}

      {editando && (
        <EditorProduto
          chave={editando}
          descricao={estoque.semCusto.find((s) => s.chave === editando)?.descricao ?? estoque.produtos.find((p) => p.chave === editando)?.descricao ?? editando}
          config={produtos[editando]}
          opcoes={opcoesProduto.filter((o) => o.chave !== editando)}
          onSalvar={(c) => {
            onProduto(c)
            setEditando(null)
          }}
          onFechar={() => setEditando(null)}
        />
      )}

      <Section
        title={`Estoque por produto — ${mes ? nomeMes(mes) : ''}`}
        icone={Boxes}
        cor="sky"
        actions={<Segmentado valor={mes} onChange={setMes} opcoes={meses.slice(-8).map((m) => ({ value: m, label: nomeMes(m) }))} />}
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar produto, EAN ou código..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="max-h-[36rem] overflow-auto">
          <table className="w-full min-w-[78rem] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Produto</th>
                <th className="px-2 py-2">Qtd. inicial</th>
                <th className="px-2 py-2">Valor inicial</th>
                <th className="px-2 py-2">Qtd. compras</th>
                <th className="px-2 py-2">Valor compras</th>
                <th className="px-2 py-2">Dev. venda</th>
                <th className="px-2 py-2">Qtd. vendas</th>
                <th className="px-2 py-2">Custo médio</th>
                <th className="px-2 py-2">CMV</th>
                <th className="px-2 py-2">Qtd. final</th>
                <th className="px-2 py-2">Valor final</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {lista.map((p) => {
                const m = p.meses[mes]
                return (
                  <tr key={p.chave} className={`border-b border-slate-100 text-right ${m.negativo ? 'bg-rose-50/60' : ''}`}>
                    <td className="max-w-80 py-1.5 pr-3 text-left">
                      <span className="block truncate font-medium text-slate-800" title={p.descricao}>
                        {p.descricao}
                      </span>
                      <span className="text-[0.6875rem] text-slate-500">
                        {p.chave}
                        {produtos[p.chave]?.qtdInicial ? ' · estoque inicial informado' : ''}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">{qtd(m.inicialQ)}</td>
                    <td className="px-2 py-1.5">{moeda(m.inicialV)}</td>
                    <td className="px-2 py-1.5">{m.compraQ - m.devCompraQ ? qtd(m.compraQ - m.devCompraQ) : '—'}</td>
                    <td className="px-2 py-1.5">{m.compraV - m.devCompraV ? moeda(m.compraV - m.devCompraV) : '—'}</td>
                    <td className="px-2 py-1.5">{m.devVendaQ ? qtd(m.devVendaQ) : '—'}</td>
                    <td className="px-2 py-1.5">{m.vendaQ ? qtd(m.vendaQ) : '—'}</td>
                    <td className="px-2 py-1.5">{moeda(m.custoMedio)}</td>
                    <td className="px-2 py-1.5 font-semibold">{m.cmv ? moeda(m.cmv) : '—'}</td>
                    <td className={`px-2 py-1.5 ${m.negativo ? 'font-semibold text-rose-600' : ''}`}>{qtd(m.finalQ)}</td>
                    <td className="px-2 py-1.5">{moeda(m.finalV)}</td>
                    <td className="px-2 py-1.5">
                      <button className="icon-btn" title="Estoque inicial / DE.PARA" onClick={() => setEditando(p.chave)}>
                        <Settings2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
              <tr className="text-right font-bold">
                <td className="py-2 pr-3 text-left">Total ({lista.length} produtos)</td>
                <td />
                <td className="px-2 py-2">{moeda(somaMes.ini)}</td>
                <td />
                <td className="px-2 py-2">{moeda(somaMes.comp)}</td>
                <td colSpan={3} />
                <td className="px-2 py-2">{moeda(somaMes.cmv)}</td>
                <td />
                <td className="px-2 py-2">{moeda(somaMes.fim)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Operações fora do estoque"
        icone={ArrowLeftRight}
        cor="violet"
        actions={
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={params.estoqueParear} onChange={(e) => onParams({ ...params, estoqueParear: e.target.checked })} />
            Tirar compras devolvidas no mesmo valor
          </label>
        }
      >
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Entrada e saída do <strong>mesmo produto</strong> (EAN, SKU ou descrição), com a <strong>mesma quantidade e o mesmo valor</strong> e o mesmo fornecedor — compra
          devolvida (5202, 6949…), venda à ordem (2923 × 6118) — não compõem o estoque nem o CMV. Devolução de parte da compra pelo mesmo preço é estornada da própria
          compra. Para tirar uma nota inteira, marque-a em “Notas de compra”.
        </p>
        {estoque.pares.length === 0 ? (
          <p className="text-sm text-slate-400">{params.estoqueParear ? 'Nenhuma operação pareada.' : 'Pareamento desligado.'}</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                  <th className="py-2 pr-3">Produto</th>
                  <th className="px-2 py-2">Entrada</th>
                  <th className="px-2 py-2">Saída</th>
                  <th className="px-2 py-2 text-right">Qtd.</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {estoque.pares.map((p, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="max-w-72 truncate py-1.5 pr-3" title={p.descricao}>
                      {p.descricao}
                      {p.tipo === 'parcial' && <span className="ml-1 rounded bg-slate-100 px-1 text-[0.625rem] text-slate-500">parcial</span>}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {p.entrada.cfop} · NF {p.entrada.nota || '—'} · {nomeMes(p.entrada.competencia)}
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {p.saida.cfop} · NF {p.saida.nota || '—'} · {nomeMes(p.saida.competencia)}
                    </td>
                    <td className="px-2 py-1.5 text-right">{qtd(p.quantidade)}</td>
                    <td className="px-2 py-1.5 text-right">{moeda(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {semEstoque.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-slate-600">Produtos sem estoque (vendas direto na receita, sem CMV)</div>
            <div className="flex flex-wrap gap-2">
              {semEstoque.map((c) => (
                <span key={c.chave} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs">
                  {itens.find((i) => i.ean === c.chave || `COD:${i.codigo}` === c.chave)?.descricao.slice(0, 40) ?? c.chave}
                  <button className="font-bold text-slate-400 hover:text-rose-600" title="Voltar a controlar no estoque" onClick={() => onProduto({ ...c, semEstoque: false })}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4">
          <button className="btn-secondary btn-sm" onClick={() => setVerNotas((v) => !v)}>
            {verNotas ? 'Ocultar' : 'Ver'} notas de compra ({notasCompra.length}){params.estoqueNotasFora.length ? ` · ${params.estoqueNotasFora.length} fora do estoque` : ''}
          </button>
          {verNotas && (
            <>
              {notasCompra.length === 0 && (
                <p className="mt-2 text-sm text-slate-500">Os itens foram importados sem o número da nota — reimporte o Registro de Entradas detalhado para listar as notas.</p>
              )}
              <div className="mt-2 max-h-96 overflow-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <tbody className="tabular-nums">
                    {notasCompra.map((n) => (
                      <tr key={n.chave} className={`border-b border-slate-100 ${fora.has(n.chave) ? 'bg-slate-50 text-slate-400 line-through' : ''}`}>
                        <td className="py-1.5 pr-2">
                          <input type="checkbox" checked={!fora.has(n.chave)} onChange={() => alternarNota(n.chave)} title="Compõe o estoque" />
                        </td>
                        <td className="px-2 py-1.5">{nomeMes(n.competencia)}</td>
                        <td className="px-2 py-1.5 font-medium">NF {n.nota}</td>
                        <td className="max-w-72 truncate px-2 py-1.5">{n.parceiro}</td>
                        <td className="px-2 py-1.5 text-xs">{[...n.cfops].join(', ')}</td>
                        <td className="px-2 py-1.5 text-right">
                          {n.itens} item(ns) · {qtd(n.qtd)} un.
                        </td>
                        <td className="px-2 py-1.5 text-right">{moeda(n.valor)}</td>
                        <td className="px-2 py-1.5 text-xs text-violet-700">{paresNotas.has(n.chave) ? 'pareada' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Section>

      <Section title="CFOPs no estoque" icone={Settings2} cor="violet">
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Como cada CFOP mexe no estoque. Padrão: compras (x102, x403), bonificações e a entrada física em venda à ordem (x923) entram; vendas baixam; remessas e retornos
          (depósito, Amazon FBA) não mexem. Se a nota de faturamento da venda à ordem também for escriturada como compra, deixe uma das duas como “não mexe”.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cfops.map(([cfop, x]) => {
            const padrao = movimentoEstoque(x.tipo, cfop, params.cfopNatureza) ?? 'neutro'
            const atual = params.cfopEstoque[cfop]
            return (
              <label key={cfop} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                <span>
                  <strong>{cfop}</strong> <span className="text-xs text-slate-500">{x.tipo === 'entrada' ? 'entrada' : 'saída'} · {moedaCurta(x.valor)}</span>
                </span>
                <select
                  className={`input w-48 py-1 text-xs ${atual ? 'border-violet-300 bg-violet-50' : ''}`}
                  value={atual ?? ''}
                  onChange={(e) => {
                    const novo = { ...params.cfopEstoque }
                    if (e.target.value) novo[cfop] = e.target.value as MovEstoque
                    else delete novo[cfop]
                    onParams({ ...params, cfopEstoque: novo })
                  }}
                >
                  <option value="">Padrão: {NOME_MOV_ESTOQUE[padrao].split(' (')[0].toLowerCase()}</option>
                  {(Object.keys(NOME_MOV_ESTOQUE) as MovEstoque[]).map((k) => (
                    <option key={k} value={k}>
                      {NOME_MOV_ESTOQUE[k]}
                    </option>
                  ))}
                </select>
              </label>
            )
          })}
        </div>
      </Section>
    </div>
  )
}

/** Estoque inicial e DE.PARA (produto vendido → componentes comprados com fator), como a aba DE.PARA da planilha. */
function EditorProduto({
  chave,
  descricao,
  config,
  opcoes,
  onSalvar,
  onFechar,
}: {
  chave: string
  descricao: string
  config: ConfigProduto | undefined
  opcoes: { chave: string; rotulo: string }[]
  onSalvar: (c: ConfigProduto) => void
  onFechar: () => void
}) {
  const [qtdIni, setQtdIni] = useState(config?.qtdInicial ?? null)
  const [valIni, setValIni] = useState(config?.valorInicial ?? null)
  const [comps, setComps] = useState(config?.componentes ?? [])
  const [semEst, setSemEst] = useState(config?.semEstoque ?? false)
  const [filtro, setFiltro] = useState('')
  const num = (v: string) => (v === '' ? null : Number(v))
  const filtradas = opcoes.filter((o) => !filtro || o.rotulo.toLowerCase().includes(filtro.toLowerCase())).slice(0, 200)
  return (
    <Section title={`Configurar produto — ${descricao.slice(0, 60)}`} icone={Link2} cor="amber" actions={<button className="btn-secondary btn-sm" onClick={onFechar}>Fechar</button>}>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-600">Estoque inicial (antes do 1º mês importado)</div>
          <input className="input" type="number" step="0.001" placeholder="Quantidade" value={qtdIni ?? ''} onChange={(e) => setQtdIni(num(e.target.value))} />
          <input className="input" type="number" step="0.01" placeholder="Valor total (R$)" value={valIni ?? ''} onChange={(e) => setValIni(num(e.target.value))} />
          <p className="text-xs text-slate-500">Chave do produto: {chave}</p>
          <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-600 ring-1 ring-slate-200">
            <input type="checkbox" className="mt-0.5" checked={semEst} onChange={(e) => setSemEst(e.target.checked)} />
            <span>
              <strong>Produto sem estoque (sem DE.PARA)</strong> — as vendas vão direto para a receita, não passam pelo estoque e não geram CMV.
            </span>
          </label>
        </div>
        <div className="space-y-2 lg:col-span-2">
          <div className="text-xs font-semibold text-slate-600">DE.PARA — cada unidade vendida baixa do estoque:</div>
          {comps.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                className="input flex-1"
                value={c.chave}
                onChange={(e) => setComps((l) => l.map((x, j) => (j === i ? { ...x, chave: e.target.value } : x)))}
              >
                <option value="">— escolha o produto comprado —</option>
                {[...filtradas, ...(filtradas.some((o) => o.chave === c.chave) ? [] : opcoes.filter((o) => o.chave === c.chave))].map((o) => (
                  <option key={o.chave} value={o.chave}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
              <input
                className="input w-24"
                type="number"
                step="0.001"
                min={0}
                value={c.fator}
                title="Unidades do produto comprado por unidade vendida"
                onChange={(e) => setComps((l) => l.map((x, j) => (j === i ? { ...x, fator: Number(e.target.value) || 0 } : x)))}
              />
              <button className="icon-btn hover:text-rose-600" onClick={() => setComps((l) => l.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <input className="input w-64" placeholder="Filtrar produtos comprados..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
            <button className="btn-secondary btn-sm" onClick={() => setComps((l) => [...l, { chave: '', fator: 1 }])}>
              <Link2 className="h-3.5 w-3.5" /> Adicionar produto comprado
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Ex.: kit com 3 essências → as 3 essências com fator 1; caixa com 12 unidades vendida por unidade → fator 1/12 (0,0833). Sem DE.PARA, o produto baixa a si mesmo
            (mesmo EAN, SKU ou descrição da compra).
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          className="btn-primary"
          onClick={() => onSalvar({ chave, qtdInicial: qtdIni, valorInicial: valIni, componentes: comps.filter((c) => c.chave && c.fator > 0), semEstoque: semEst })}
        >
          Salvar
        </button>
      </div>
    </Section>
  )
}
