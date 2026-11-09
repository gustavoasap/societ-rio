import { useState, type ReactNode } from 'react'
import { ArrowRight, CreditCard, Users } from 'lucide-react'
import { AbasAnalise } from '../components/Abas'
import { Conta, Explicar, Origem } from '../components/Explicar'
import { GraficoMensal, Legenda } from '../components/Grafico'
import { Cabecalho, Carregando, Erro, Progresso, SeletorMes } from '../components/ui'
import { COR_NATUREZA, corDe } from '../components/visual'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { hoje, mesAtual, primeiroDia, somarMesesAoMes, ultimoDia } from '../lib/datas'
import { buscarLancamentos, useDados } from '../lib/dados'
import { aReceberDeTerceiros, despesasPorNatureza, ehMeu, faturasDoCartao, montarDre } from '../lib/financas'
import { dataBR, mesAbreviado, moeda, percentual } from '../lib/formato'
import { Link } from '../lib/rotas'
import type { Natureza } from '../tipos'

const ROTULO_NAT: Record<Natureza, string> = { fixa: 'Custos fixos', variavel: 'Custos variáveis', eventual: 'Eventuais' }

type Periodo = '1' | '3' | '6' | '12' | 'ano' | 'pers'

/** Meses ("AAAA-MM") de `de` até `ate`, em ordem (no máximo 60). */
function mesesEntre(de: string, ate: string) {
  const lista: string[] = []
  for (let m = de; m <= ate && lista.length < 60; m = somarMesesAoMes(m, 1)) lista.push(m)
  return lista
}

export function Dashboard() {
  const { contas, categorias, pessoas } = useApp()
  const [periodo, setPeriodo] = useState<Periodo>('6')
  const atual = mesAtual()
  // mês final das opções de N meses (1, 3, 6, 12): escolhido pelo usuário, padrão o mês atual
  const [fimMes, setFimMes] = useState(atual)
  const [ano, setAno] = useState(Number(atual.slice(0, 4)))
  const [persDe, setPersDe] = useState(somarMesesAoMes(atual, -2))
  const [persAte, setPersAte] = useState(atual)
  const meses =
    periodo === 'ano'
      ? mesesEntre(`${ano}-01`, `${ano}` === atual.slice(0, 4) ? atual : `${ano}-12`)
      : periodo === 'pers'
        ? mesesEntre(persDe <= persAte ? persDe : persAte, persDe <= persAte ? persAte : persDe)
        : mesesEntre(somarMesesAoMes(fimMes, 1 - Number(periodo)), fimMes)
  const mes = meses[meses.length - 1]
  const inicio = primeiroDia(meses[0])
  // busca também os meses seguintes, para as faturas e parcelas futuras do cartão
  const fimBusca = ultimoDia(somarMesesAoMes(mes > atual ? mes : atual, 12))
  const lanc = useDados(() => buscarLancamentos(primeiroDia(somarMesesAoMes(meses[0], -1)), fimBusca), [inicio, fimBusca])

  if (lanc.carregando) return <Carregando />
  const todos = lanc.dados ?? []
  const noPeriodo = todos.filter((l) => l.data >= inicio && l.data <= ultimoDia(mes))
  const dre = montarDre(noPeriodo, categorias, pessoas, meses)
  const receita = somar(dre.receitaTotal)
  const despesa = somar(dre.despesaTotal)
  const resultado = somar([receita, -despesa])
  const n = meses.length
  const nat = despesasPorNatureza(noPeriodo, categorias)
  const serie = meses.map((m, i) => ({ mes: m, receitas: dre.receitaTotal[i], despesas: dre.despesaTotal[i], resultado: dre.resultado[i] }))

  // categorias que mais pesam (só despesas minhas)
  const porCat = new Map<string, number>()
  for (const l of noPeriodo) if (l.tipo === 'despesa' && ehMeu(l)) porCat.set(l.categoria_id ?? '', somar([porCat.get(l.categoria_id ?? '') ?? 0, l.valor]))
  const topCats = [...porCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  // cartões: próximas faturas e parcelas futuras comprometidas
  const hj = hoje()
  const cartoes = contas.filter((c) => c.tipo === 'cartao' && c.ativa)
  const faturas = cartoes.map((c) => ({ c, f: faturasDoCartao(c, todos).filter((f) => (f.vencimento ?? `${f.mes}-31`) >= hj) }))
  const futuroCartao = somar(todos.filter((l) => l.tipo === 'despesa' && l.data > hj && cartoes.some((c) => c.id === l.conta_id)).map((l) => l.valor))

  const terceiros = aReceberDeTerceiros(todos.filter((l) => l.data <= ultimoDia(mes)))
  const totalTerceiros = somar([...terceiros.values()].map((t) => t.total))

  return (
    <div className="space-y-5">
      <AbasAnalise />
      <Cabecalho
        titulo="Dashboard"
        descricao="Minha situação financeira no período (só o que é meu; gastos de terceiros ficam à parte)."
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {(
            [
              ['1', '1 mês'],
              ['3', '3 meses'],
              ['6', '6 meses'],
              ['12', '12 meses'],
              ['ano', 'Ano'],
              ['pers', 'Personalizado'],
            ] as const
          ).map(([v, rotulo]) => (
            <button
              key={v}
              type="button"
              onClick={() => setPeriodo(v)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition ${periodo === v ? 'bg-white text-azul-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        {['1', '3', '6', '12'].includes(periodo) && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{periodo === '1' ? 'Mês:' : 'Até:'}</span>
            <SeletorMes mes={fimMes} onChange={setFimMes} />
          </div>
        )}
        {periodo === 'ano' && (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button className="icon-btn" onClick={() => setAno(ano - 1)} aria-label="Ano anterior">
              ‹
            </button>
            <span className="min-w-16 text-center text-sm font-bold">{ano}</span>
            <button className="icon-btn" onClick={() => setAno(ano + 1)} aria-label="Próximo ano">
              ›
            </button>
          </div>
        )}
        {periodo === 'pers' && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            De <SeletorMes mes={persDe} onChange={setPersDe} /> até <SeletorMes mes={persAte} onChange={setPersAte} />
          </div>
        )}
        {meses.length > 1 && (
          <span className="text-xs font-semibold text-slate-500 first-letter:uppercase">
            {mesAbreviado(meses[0])} a {mesAbreviado(mes)} ({meses.length} meses)
          </span>
        )}
      </div>
      {lanc.erro && <Erro>{lanc.erro}</Erro>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          rotulo={n === 1 ? "Receita do mês" : "Receita média / mês"}
          valor={moeda(receita / n)}
          sub={`Total ${moeda(receita)}`}
          explica={
            <>
              <Conta
                linhas={[...meses.map((m, i) => ({ sinal: '+' as const, rotulo: mesAbreviado(m), valor: dre.receitaTotal[i] }))]}
                total={{ rotulo: `Total ÷ ${n} ${n === 1 ? 'mês' : 'meses'}`, valor: receita / n }}
              />
              <Origem>Receitas suas com data em cada mês do período (as de terceiros e transferências não entram). Meses sem lançamento entram como zero na média.</Origem>
            </>
          }
        />
        <Kpi
          rotulo={n === 1 ? "Despesa do mês" : "Despesa média / mês"}
          valor={moeda(despesa / n)}
          sub={`Total ${moeda(despesa)}`}
          explica={
            <>
              <Conta
                linhas={[...meses.map((m, i) => ({ sinal: '+' as const, rotulo: mesAbreviado(m), valor: dre.despesaTotal[i] }))]}
                total={{ rotulo: `Total ÷ ${n} ${n === 1 ? 'mês' : 'meses'}`, valor: despesa / n }}
              />
              <Origem>Despesas suas pela data da compra (no cartão também), as mesmas da DRE. Pagamento de fatura não entra (é transferência). Meses sem lançamento entram como zero.</Origem>
            </>
          }
        />
        <Kpi
          rotulo="Taxa de poupança"
          valor={receita > 0 ? percentual(resultado / receita) : '—'}
          sub={`${resultado >= 0 ? 'Sobrou' : 'Faltou'} ${moeda(Math.abs(resultado))} no período`}
          alerta={resultado < 0}
          destaque
          explica={
            <>
              <Conta linhas={[{ rotulo: 'Receitas do período', valor: receita }, { sinal: '−', rotulo: 'Despesas do período', valor: despesa }]} total={{ rotulo: 'Sobra (resultado)', valor: resultado }} />
              <Conta linhas={[{ rotulo: 'Sobra', valor: resultado }, { sinal: '÷', rotulo: 'Receitas', valor: receita }]} total={{ rotulo: 'Taxa de poupança', valor: receita > 0 ? percentual(resultado / receita) : '—' }} />
              <Origem>Quanto da receita sobrou no período. Referência comum: 20% ou mais.</Origem>
            </>
          }
        />
        <Kpi
          rotulo="Custo fixo / receita"
          valor={receita > 0 ? percentual(nat.fixa / receita) : '—'}
          sub={`${moeda(nat.fixa / n)} por mês`}
          alerta={receita > 0 && nat.fixa / receita > 0.6}
          explica={
            <>
              <Conta linhas={[{ rotulo: 'Despesas fixas do período', valor: nat.fixa }, { sinal: '÷', rotulo: 'Receitas do período', valor: receita }]} total={{ rotulo: 'Custo fixo / receita', valor: receita > 0 ? percentual(nat.fixa / receita) : '—' }} />
              <Origem>
                “Fixa” vem da classificação do lançamento ou da categoria (Ajustes → Categorias). Mostra quanto da renda já está comprometido antes do dia a dia; acima de 60% é sinal de atenção.
                Média por mês: {moeda(nat.fixa / n)}.
              </Origem>
            </>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="cartao">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">Receitas × despesas por mês</h2>
            <Legenda />
          </div>
          <GraficoMensal meses={serie} />
        </section>

        <section className="cartao">
          <h2 className="mb-3 text-sm font-bold text-slate-800">Para onde vai o dinheiro</h2>
          {despesa === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sem despesas no período.</p>
          ) : (
            <>
              {/* barra empilhada de composição, com rótulos abaixo */}
              <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full">
                {(['fixa', 'variavel', 'eventual'] as Natureza[])
                  .filter((k) => nat[k] > 0)
                  .map((k) => (
                    <div key={k} style={{ width: `${(nat[k] / despesa) * 100}%`, background: COR_NATUREZA[k] }} title={`${ROTULO_NAT[k]}: ${moeda(nat[k])}`} />
                  ))}
              </div>
              <div className="mt-4 space-y-3">
                {(['fixa', 'variavel', 'eventual'] as Natureza[]).map((k) => (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COR_NATUREZA[k] }} />
                    <span className="flex-1 text-slate-700">{ROTULO_NAT[k]}</span>
                    <span className="font-bold text-slate-900 tabular-nums">{moeda(nat[k] / n)}</span>
                    <span className="w-24 text-right text-xs text-slate-500 tabular-nums">/mês · {percentual(nat[k] / despesa)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
                {receita > 0
                  ? `Dos ${moeda(receita / n)} que entram por mês, ${percentual(nat.fixa / receita)} já estão comprometidos com custos fixos.`
                  : 'Lance suas receitas (salário, pró-labore) para ver o comprometimento da renda.'}
              </p>
            </>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="cartao">
          <h2 className="mb-3 text-sm font-bold text-slate-800">Maiores despesas por categoria</h2>
          {topCats.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sem despesas no período.</p>
          ) : (
            <div className="space-y-3">
              {topCats.map(([id, total]) => {
                const c = categorias.find((x) => x.id === id)
                return (
                  <div key={id}>
                    <div className="mb-1 flex justify-between gap-2 text-sm">
                      <span className="truncate text-slate-700">{c?.nome ?? 'Sem categoria'}</span>
                      <span className="shrink-0 font-semibold text-slate-900 tabular-nums">{moeda(total / n)}/mês</span>
                    </div>
                    <Progresso fracao={total / topCats[0][1]} cor={corDe(c?.cor).barra} />
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="cartao">
          <Titulo icone={<CreditCard className="h-4 w-4 text-violet-600" />} para="/cartoes">
            Próximas faturas
          </Titulo>
          {cartoes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nenhum cartão cadastrado.</p>
          ) : (
            <div className="space-y-3">
              {faturas.map(({ c, f }) => (
                <div key={c.id}>
                  <div className="mb-1 text-xs font-bold text-slate-500">{c.nome}</div>
                  {f.length === 0 ? (
                    <p className="text-sm text-slate-400">Sem faturas em aberto.</p>
                  ) : (
                    f.slice(0, 3).map((x) => (
                      <div key={x.mes} className="flex justify-between py-0.5 text-sm">
                        <span className="text-slate-600">
                          {mesAbreviado(x.mes)}
                          {x.vencimento && <span className="text-xs text-slate-400"> · vence {dataBR(x.vencimento)}</span>}
                        </span>
                        <span className="font-semibold text-slate-900 tabular-nums">{moeda(x.total)}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
              <p className="rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-900">
                Parcelas e recorrências já lançadas para os próximos meses: <b>{moeda(futuroCartao)}</b>
              </p>
            </div>
          )}
        </section>

        <section className="cartao">
          <Titulo icone={<Users className="h-4 w-4 text-amber-600" />} para="/terceiros">
            A receber de terceiros
          </Titulo>
          {terceiros.size === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Ninguém te deve nada. 👍</p>
          ) : (
            <div className="space-y-2">
              {[...terceiros.entries()].map(([id, t]) => (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-slate-700">{pessoas.find((p) => p.id === id)?.nome ?? 'Outra pessoa'}</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{moeda(t.total)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-2 text-sm font-bold">
                <span>Total</span>
                <span className="tabular-nums">{moeda(totalTerceiros)}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      <p className="text-center text-xs text-slate-400">
        Período: {mesAbreviado(meses[0])} a {mesAbreviado(meses[n - 1])} · regime de competência (data do lançamento; no cartão, data da compra/parcela) ·{' '}
        <Link para="/dre" className="font-semibold text-azul-600 hover:underline">
          ver DRE detalhada
        </Link>
      </p>
    </div>
  )
}

function Titulo({ children, icone, para }: { children: ReactNode; icone: ReactNode; para: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        {icone}
        {children}
      </h2>
      <Link para={para} className="flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap text-azul-600 hover:underline">
        Abrir <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  )
}

function Kpi({ rotulo, valor, sub, alerta, destaque, explica }: { rotulo: string; valor: string; sub?: string; alerta?: boolean; destaque?: boolean; explica?: ReactNode }) {
  return (
    <div className={destaque ? 'rounded-2xl bg-gradient-to-br from-azul-700 to-azul-900 p-4 text-white shadow-lg shadow-azul-700/20 sm:p-5' : 'cartao'}>
      <div className={`flex items-center gap-1 text-xs font-semibold ${destaque ? 'text-white/70' : 'text-slate-500'}`}>
        <span className="flex-1">{rotulo}</span>
        {explica && (
          <Explicar titulo={rotulo} claro={destaque}>
            {explica}
          </Explicar>
        )}
      </div>
      <div className={`mt-1.5 text-lg font-extrabold tracking-tight tabular-nums sm:text-2xl ${alerta ? (destaque ? 'text-rose-300' : 'text-rose-600') : destaque ? 'text-white' : 'text-slate-900'}`}>{valor}</div>
      {sub && <div className={`mt-0.5 text-xs ${destaque ? 'text-white/60' : 'text-slate-400'}`}>{sub}</div>}
    </div>
  )
}
