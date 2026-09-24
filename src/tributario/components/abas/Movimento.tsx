import { useMemo, useState } from 'react'
import { ListTree, RotateCcw, Table2 } from 'lucide-react'
import { Section, Select } from '../../../components/ui'
import { naturezaDe } from '../../engine/base'
import { NATUREZAS, classificarCfop, type Natureza } from '../../engine/cfop'
import { agruparBases, rotuloPeriodo, type Agrupamento } from '../../engine/projecao'
import { receitaBruta, type BaseMensal, type MovimentoLinha, type Parametros, type TipoMovimento } from '../../engine/tipos'
import { moeda } from '../../formatacao'
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
  { rotulo: 'ICMS destacado nas compras', valor: (b) => b.icmsCompras, tipo: 'sub' },
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
              <tr className="border-b border-slate-200 text-right text-[11px] font-bold tracking-wider text-slate-400 uppercase">
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
                    <td colSpan={colunas.length + 1} className="sticky left-0 bg-slate-50 px-2 py-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
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

      <Section title="Classificação dos CFOPs e serviços" icone={ListTree} cor="violet">
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          O sistema classifica cada CFOP pela tabela do Ajuste SINIEF 07/2001. Revise principalmente os valores altos marcados como neutros (remessas, retornos, "outros") — por
          exemplo, entradas em venda à ordem (x923) sem a nota de compra (x121) correspondente. Alterações valem para todos os cálculos desta empresa.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
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
                  <tr key={c.chave} className="border-b border-slate-100">
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
