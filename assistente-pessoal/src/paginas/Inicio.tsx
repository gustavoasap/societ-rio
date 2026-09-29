import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarClock, CreditCard, Eye, EyeOff, Flag, Landmark, Scale, Target, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { GraficoMensal, Legenda } from '../components/Grafico'
import { LinhaLancamento } from '../components/LinhaLancamento'
import { Bolinha, Carregando, Progresso, Vazio } from '../components/ui'
import { COR_NATUREZA, corDe, iconeDe, VISUAL_AREA } from '../components/visual'
import { useApp } from '../contexto'
import { contasEmAberto, despesasPorCategoria, progressoEtapas, progressoMeta, resumo, resumoPorMes, somar } from '../lib/calculos'
import { hoje, mesAtual, mesDe, primeiroDia, somarDias, somarMesesAoMes, ultimoDia } from '../lib/datas'
import { buscarLancamentos, buscarMetas, buscarObjetivos, useDados } from '../lib/dados'
import { aReceberDeTerceiros, despesasPorNatureza, ehMeu, faturasDoCartao } from '../lib/financas'
import { dataBR, moeda, percentual } from '../lib/formato'
import { Link } from '../lib/rotas'

function Titulo({ children, para, rotulo = 'Ver tudo' }: { children: ReactNode; para?: string; rotulo?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-slate-800">{children}</h2>
      {para && (
        <Link para={para} className="flex shrink-0 items-center gap-1 text-xs font-semibold whitespace-nowrap text-azul-600 hover:underline">
          {rotulo} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}

export function Inicio() {
  const { contas, categorias, pessoas, abrirLancamento } = useApp()
  const [oculto, setOculto] = useState(() => {
    try {
      return localStorage.getItem('pes-ocultar-valores') === '1'
    } catch {
      return false
    }
  })
  const mes = mesAtual()
  const hj = hoje()
  const inicio = primeiroDia(somarMesesAoMes(mes, -5))
  const fim = [ultimoDia(mes), somarDias(hj, 10)].sort()[1]
  const lanc = useDados(() => buscarLancamentos(inicio, fim), [inicio, fim])
  const metas = useDados(buscarMetas, [])
  const objetivos = useDados(buscarObjetivos, [])

  if (lanc.carregando) return <Carregando />
  const todos = lanc.dados ?? []
  // números do mês: só o que é meu (gastos de terceiros ficam em "A receber de terceiros")
  const meus = todos.filter(ehMeu)
  const doMes = meus.filter((l) => mesDe(l.data) === mes)
  const r = resumo(doMes)
  const nat = despesasPorNatureza(doMes, categorias)
  const meses = Array.from({ length: 6 }, (_, i) => somarMesesAoMes(mes, i - 5))
  const serie = resumoPorMes(meus, meses)
  const terceiros = aReceberDeTerceiros(todos.filter((l) => l.data <= hj))
  const totalTerceiros = somar([...terceiros.values()].map((t) => t.total))
  const cartoes = contas.filter((c) => c.tipo === 'cartao' && c.ativa)
  const proximasFaturas = cartoes
    .map((c) => ({ c, f: faturasDoCartao(c, todos).find((f) => (f.vencimento ?? ultimoDia(f.mes)) >= hj && f.total - f.pago > 0.009) }))
    .filter((x) => x.f)
  const patrimonio = somar(contas.filter((c) => c.ativa).map((c) => c.saldo))
  const emAberto = contasEmAberto(todos, hj)
  const topCategorias = despesasPorCategoria(doMes).slice(0, 5)
  const v = (n: number) => (oculto ? 'R$ •••••' : moeda(n))

  function alternarOculto() {
    setOculto(!oculto)
    try {
      localStorage.setItem('pes-ocultar-valores', oculto ? '0' : '1')
    } catch {
      /* navegador sem armazenamento: só não lembra a escolha */
    }
  }

  const metasAtivas = (metas.dados?.metas ?? []).filter((m) => !m.concluida).slice(0, 3)
  const objAtivos = (objetivos.dados?.objetivos ?? []).filter((o) => o.status === 'andamento').slice(0, 4)

  return (
    <div className="space-y-5">
      {lanc.erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{lanc.erro}</p>}

      {/* Números do mês */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Numero rotulo="Patrimônio" valor={v(patrimonio)} icone={<Landmark className="h-4 w-4" />} destaque acao={
          <button className="icon-btn -m-2 text-white/70 hover:bg-white/10 hover:text-white" onClick={alternarOculto} aria-label={oculto ? 'Mostrar valores' : 'Ocultar valores'}>
            {oculto ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        } />
        <Numero rotulo="Receitas do mês" valor={v(r.receitas)} icone={<ArrowUpRight className="h-4 w-4 text-emerald-600" />} sub={r.aReceber ? `${v(r.aReceber)} a receber` : undefined} />
        <Numero rotulo="Despesas do mês" valor={v(r.despesas)} icone={<ArrowDownRight className="h-4 w-4 text-orange-600" />} sub={r.aPagar ? `${v(r.aPagar)} a pagar` : undefined} />
        <Numero
          rotulo="Resultado do mês"
          valor={v(r.resultado)}
          icone={<Scale className="h-4 w-4" />}
          sub={r.receitas > 0 ? `${r.resultado >= 0 ? 'Sobra' : 'Falta'} de ${percentual(Math.abs(r.resultado) / r.receitas)} da receita` : undefined}
          negativo={r.resultado < 0}
        />
      </div>

      {/* Classificação das despesas do mês, faturas e terceiros */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Link para="/dre" className="cartao block transition hover:ring-2 hover:ring-azul-200">
          <div className="mb-2 text-xs font-semibold text-slate-500">Despesas do mês por classificação</div>
          {(['fixa', 'variavel', 'eventual'] as const).map((k) => (
            <div key={k} className="flex items-center gap-2 py-0.5 text-sm">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_NATUREZA[k] }} />
              <span className="flex-1 text-slate-600">{k === 'fixa' ? 'Fixas' : k === 'variavel' ? 'Variáveis' : 'Eventuais'}</span>
              <span className="font-semibold tabular-nums">{v(nat[k])}</span>
            </div>
          ))}
        </Link>
        <Link para="/cartoes" className="cartao block transition hover:ring-2 hover:ring-azul-200">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <CreditCard className="h-3.5 w-3.5 text-violet-600" /> Próximas faturas
          </div>
          {proximasFaturas.length === 0 ? (
            <p className="text-sm text-slate-400">{cartoes.length ? 'Nenhuma fatura em aberto.' : 'Nenhum cartão cadastrado.'}</p>
          ) : (
            proximasFaturas.map(({ c, f }) => (
              <div key={c.id} className="flex justify-between py-0.5 text-sm">
                <span className="truncate text-slate-600">
                  {c.nome}
                  {f!.vencimento && <span className="text-xs text-slate-400"> · vence {dataBR(f!.vencimento)}</span>}
                </span>
                <span className="font-semibold tabular-nums">{v(f!.total - f!.pago)}</span>
              </div>
            ))
          )}
        </Link>
        <Link para="/terceiros" className="cartao block transition hover:ring-2 hover:ring-azul-200">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <Users className="h-3.5 w-3.5 text-amber-600" /> A receber de terceiros
          </div>
          <div className="text-xl font-extrabold text-slate-900 tabular-nums">{v(totalTerceiros)}</div>
          <div className="text-xs text-slate-400">
            {terceiros.size ? [...terceiros.keys()].map((id) => pessoas.find((p) => p.id === id)?.nome ?? '?').join(', ') : 'Ninguém te deve nada.'}
          </div>
        </Link>
      </div>

      {contas.length === 0 && (
        <div className="cartao flex flex-wrap items-center gap-3 border-azul-200 bg-azul-50">
          <p className="flex-1 text-sm text-azul-900">
            <b>Primeiro passo:</b> cadastre suas contas (banco, carteira, cartão, investimentos) com o saldo de hoje.
          </p>
          <Link para="/contas" className="btn-primary btn-sm">
            Cadastrar contas
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="cartao">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-800">Últimos 6 meses</h2>
            <Legenda />
          </div>
          <GraficoMensal meses={serie} />
        </section>

        <section className="cartao">
          <Titulo para="/lancamentos">
            <span className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-amber-600" /> Contas a pagar e receber
            </span>
          </Titulo>
          {emAberto.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Nada vencido nem vencendo nos próximos 10 dias. 👏</p>
          ) : (
            <div className="-my-1 divide-y divide-slate-100">
              {emAberto.slice(0, 6).map((l) => (
                <LinhaLancamento key={l.id} l={l} mostrarData />
              ))}
              {emAberto.length > 6 && <p className="pt-2 text-xs text-slate-400">+ {emAberto.length - 6} outros</p>}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="cartao">
          <Titulo para="/orcamento">Onde o dinheiro foi este mês</Titulo>
          {topCategorias.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Sem despesas lançadas neste mês.</p>
          ) : (
            <div className="space-y-3">
              {topCategorias.map((t) => {
                const c = categorias.find((x) => x.id === t.categoriaId)
                const cor = corDe(c?.cor)
                const limite = c?.orcamento_mensal
                return (
                  <div key={t.categoriaId}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-slate-700">{c?.nome ?? 'Sem categoria'}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{v(t.total)}</span>
                    </div>
                    <Progresso fracao={limite ? t.total / limite : t.total / topCategorias[0].total} cor={cor.barra} alerta={!!limite && t.total > limite} />
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="cartao">
          <Titulo para="/metas">
            <span className="flex items-center gap-2">
              <Target className="h-4 w-4 text-azul-600" /> Metas
            </span>
          </Titulo>
          {metasAtivas.length === 0 ? (
            <Vazio icone={Target}>
              <span>Nenhuma meta ainda.</span>
              <Link para="/metas" className="font-semibold text-azul-600 hover:underline">
                Criar minha primeira meta
              </Link>
            </Vazio>
          ) : (
            <div className="space-y-4">
              {metasAtivas.map((m) => {
                const p = progressoMeta(m, metas.dados?.aportes ?? [], hj)
                const cor = corDe(m.cor)
                return (
                  <div key={m.id} className="flex items-center gap-3">
                    <Bolinha icone={iconeDe(m.icone)} fundo={cor.fundo} texto={cor.texto} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-slate-800">{m.nome}</span>
                        <span className="text-xs font-bold text-slate-500 tabular-nums">{percentual(p.fracao)}</span>
                      </div>
                      <Progresso fracao={p.fracao} cor={cor.barra} />
                      <div className="mt-0.5 text-xs text-slate-400">
                        {v(p.acumulado)} de {v(m.valor_alvo)}
                        {p.porMes ? ` · guardar ${v(p.porMes)}/mês` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="cartao">
          <Titulo para="/objetivos">
            <span className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-azul-600" /> Objetivos em andamento
            </span>
          </Titulo>
          {objAtivos.length === 0 ? (
            <Vazio icone={Flag}>
              <span>Nenhum objetivo em andamento.</span>
              <Link para="/objetivos" className="font-semibold text-azul-600 hover:underline">
                Definir objetivos
              </Link>
            </Vazio>
          ) : (
            <div className="space-y-4">
              {objAtivos.map((o) => {
                const p = progressoEtapas((objetivos.dados?.etapas ?? []).filter((e) => e.objetivo_id === o.id))
                const vis = VISUAL_AREA[o.area]
                const cor = corDe(vis.cor)
                return (
                  <div key={o.id} className="flex items-center gap-3">
                    <Bolinha icone={vis.icone} fundo={cor.fundo} texto={cor.texto} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-800">{o.titulo}</div>
                      {p.total > 0 && <Progresso fracao={p.fracao} cor={cor.barra} />}
                      <div className="mt-0.5 text-xs text-slate-400">
                        {p.total > 0 ? `${p.feitas} de ${p.total} etapas` : 'Sem etapas'}
                        {o.prazo ? ` · até ${dataBR(o.prazo)}` : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:hidden">
        <button className="btn-secondary" onClick={() => abrirLancamento({ tipo: 'receita' })}>
          <ArrowUpRight className="h-4 w-4 text-emerald-600" /> Receita
        </button>
        <button className="btn-secondary" onClick={() => abrirLancamento({ tipo: 'despesa' })}>
          <ArrowDownRight className="h-4 w-4 text-orange-600" /> Despesa
        </button>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, icone, sub, destaque, negativo, acao }: { rotulo: string; valor: string; icone: ReactNode; sub?: string; destaque?: boolean; negativo?: boolean; acao?: ReactNode }) {
  return (
    <div className={destaque ? 'rounded-2xl bg-gradient-to-br from-azul-700 to-azul-900 p-4 text-white shadow-lg shadow-azul-700/20 sm:p-5' : 'cartao'}>
      <div className={`flex items-center justify-between gap-2 text-xs font-semibold ${destaque ? 'text-white/70' : 'text-slate-500'}`}>
        <span className="flex items-center gap-1.5">
          {icone}
          {rotulo}
        </span>
        {acao}
      </div>
      <div className={`mt-2 text-lg font-extrabold tracking-tight tabular-nums sm:text-2xl ${negativo ? 'text-rose-600' : destaque ? 'text-white' : 'text-slate-900'}`}>{valor}</div>
      {sub && <div className={`mt-0.5 text-xs ${destaque ? 'text-white/60' : 'text-slate-400'}`}>{sub}</div>}
    </div>
  )
}
