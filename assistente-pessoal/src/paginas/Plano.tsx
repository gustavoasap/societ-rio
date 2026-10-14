import { useState, type ReactNode } from 'react'
import { AlertTriangle, CalendarRange, CircleCheck, HeartPulse, Info, Plane, Plus, Shield, Sparkles, Target, TrendingUp, Wallet } from 'lucide-react'
import { AbasAnalise } from '../components/Abas'
import { Cabecalho, Carregando, Erro, Progresso, Segmentado } from '../components/ui'
import { usePlano } from '../components/usePlano'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { hoje, somarMesesAoMes } from '../lib/datas'
import { salvarConfig } from '../lib/dados'
import { mesAbreviado, moeda, percentual } from '../lib/formato'
import { Link } from '../lib/rotas'
import { MetaForm } from './Metas'

export function Plano() {
  const { nome } = useApp()
  const p = usePlano()
  const [metaForm, setMetaForm] = useState<null | { nome: string; valor_alvo?: number; icone?: string; cor?: string; descricao?: string; prazo?: string }>(null)

  if (p.carregando || !p.dados) return p.erro ? <Erro>{p.erro}</Erro> : <Carregando />
  const { plano, config, projecao, temContaReserva } = p.dados
  const r = plano.reserva
  const semRenda = plano.renda.total === 0
  const viagem = plano.metas.find((m) => m.meta.icone === 'plane' || /viag/i.test(m.meta.nome))

  return (
    <div className="space-y-5">
      <AbasAnalise />
      <Cabecalho
        titulo="Meu plano financeiro"
        descricao={`Quanto você precisa para viver, quanto separar todo mês e para onde o seu dinheiro vai nos próximos 12 meses, ${nome}.`}
      />
      {p.erro && <Erro>{p.erro}</Erro>}

      {semRenda && (
        <Aviso tom="azul" icone={<Info className="h-5 w-5" />}>
          Para o plano funcionar, cadastre sua renda (salário, pró-labore) em{' '}
          <Link para="/fixos" className="font-bold underline">
            Fixos e salário
          </Link>
          . Os gastos do dia a dia entram pela média do que você lança; os fixos (aluguel, escola, IPVA) entram pelo que você cadastrar lá.
        </Aviso>
      )}

      {/* ------------------------------------------------ números principais */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Grande rotulo="Renda mensal" valor={plano.renda.total} sub={plano.renda.variavelMedia ? `${moeda(plano.renda.recorrente)} fixa + ${moeda(plano.renda.variavelMedia)} média variável` : 'Receitas recorrentes'} destaque />
        <Grande rotulo="Custo de vida atual" valor={plano.custoTotal} sub="Tudo que você gasta por mês" />
        <Grande rotulo="Renda mínima para viver" valor={plano.rendaMinima} sub="Só os gastos essenciais" icone={<HeartPulse className="h-4 w-4 text-rose-500" />} />
        <Grande rotulo="Renda ideal" valor={plano.rendaIdeal} sub={`Manter o padrão + metas + investir ${config.pct_investimento}%`} icone={<Sparkles className="h-4 w-4 text-amber-500" />} />
      </div>

      <RendaNecessaria
        despesas={plano.custoTotal}
        guardar={somar([plano.guardar, plano.metasTotal])}
        renda={plano.renda.total}
        margem={config.margem_folga}
        necessaria={plano.rendaNecessaria}
        comGuardar={plano.rendaNecessariaComGuardar}
        folgaAtual={plano.folgaAtual}
      />

      {/* ------------------------------------------------ separar todo mês */}
      <section className="cartao">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
            <Wallet className="h-5 w-5 text-azul-600" /> Todo mês, separe assim
          </h2>
          <span className="text-xs text-slate-500">assim que a renda cair na conta</span>
        </div>
        <p className="mb-4 text-sm text-slate-500">Pague-se primeiro: tire o que é do futuro antes de gastar. O que sobrar é o seu limite para o dia a dia.</p>
        <div className="space-y-2">
          <Caixinha
            icone={<Shield className="h-5 w-5" />}
            cor="bg-emerald-100 text-emerald-700"
            titulo="Reserva de emergência"
            valor={r.aporte}
            detalhe={r.falta > 0 ? `Até completar: faltam ${moeda(r.falta)} (${r.meses} ${r.meses === 1 ? 'mês' : 'meses'})` : 'Reserva completa: nada a separar aqui 🎉'}
          />
          <Caixinha
            icone={<TrendingUp className="h-5 w-5" />}
            cor="bg-azul-100 text-azul-700"
            titulo="Investimentos (longo prazo)"
            valor={plano.investir}
            detalhe={r.falta > 0 ? `${config.pct_investimento}% da renda = ${moeda(plano.guardar)}; enquanto a reserva não completa, parte vai para ela` : `${config.pct_investimento}% da renda`}
          />
          {plano.provisaoAnuais > 0 && (
            <Caixinha
              icone={<CalendarRange className="h-5 w-5" />}
              cor="bg-amber-100 text-amber-700"
              titulo="Despesas anuais (IPVA, IPTU, seguros...)"
              valor={plano.provisaoAnuais}
              detalhe="Guardado mês a mês para pagar à vista quando vencer"
            />
          )}
          {plano.metas.map(({ meta, porMes }) => (
            <Caixinha
              key={meta.id}
              icone={meta.icone === 'plane' ? <Plane className="h-5 w-5" /> : <Target className="h-5 w-5" />}
              cor="bg-violet-100 text-violet-700"
              titulo={meta.nome}
              valor={porMes}
              detalhe="Para chegar no prazo da meta"
            />
          ))}
          <div className="flex items-center justify-between rounded-xl bg-azul-900 px-4 py-3 text-white">
            <span className="font-bold">Total para separar</span>
            <span className="text-lg font-extrabold tabular-nums">{moeda(somar([plano.guardar, plano.provisaoAnuais, plano.metasTotal]))}</span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {!viagem && (
            <button className="btn-secondary btn-sm" onClick={() => setMetaForm({ nome: 'Viagem', icone: 'plane', cor: 'laranja', prazo: `${somarMesesAoMes(hoje().slice(0, 7), 12)}-01` })}>
              <Plane className="h-3.5 w-3.5" /> Planejar uma viagem
            </button>
          )}
          <button className="btn-secondary btn-sm" onClick={() => setMetaForm({ nome: '' })}>
            <Plus className="h-3.5 w-3.5" /> Outra meta (carro, imóvel, curso...)
          </button>
        </div>

        <div className={`mt-4 rounded-xl px-4 py-3 text-sm ${plano.livre >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
          {plano.livre >= 0 ? (
            <span className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                O plano fecha. Depois do custo de vida e de tudo que é separado, ainda sobram <b>{moeda(plano.livre)}</b> por mês de folga.
              </span>
            </span>
          ) : (
            <span className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                O plano não fecha: faltam <b>{moeda(-plano.livre)}</b> por mês. Reduza gastos variáveis (veja em Orçamento), estique o prazo das metas ou diminua o % de investimento.
              </span>
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* ------------------------------------------------ reserva */}
        <section className="cartao">
          <h2 className="mb-1 flex items-center gap-2 text-base font-extrabold text-slate-900">
            <Shield className="h-5 w-5 text-emerald-600" /> Reserva de emergência
          </h2>
          <p className="mb-3 text-sm text-slate-500">Dinheiro para viver sem renda por um tempo, guardado em aplicação de liquidez diária (ex.: CDB com liquidez, Tesouro Selic).</p>
          <div className="mb-3">
            <div className="mb-1 text-xs font-semibold text-slate-600">Quantos meses sem susto?</div>
            <Segmentado
              valor={String(config.meses_reserva)}
              onChange={(v) => salvarConfig({ meses_reserva: Number(v) })}
              opcoes={['3', '6', '9', '12'].map((v) => ({ value: v, label: `${v} meses` }))}
            />
          </div>
          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="text-xs text-slate-500">Mínimo ({config.meses_reserva} × gastos essenciais)</div>
              <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{moeda(r.alvo)}</div>
            </div>
            <div className="text-right text-xs text-slate-500">
              Confortável (padrão atual)
              <div className="text-sm font-bold text-slate-700 tabular-nums">{moeda(r.confortavel)}</div>
            </div>
          </div>
          <div className="my-2">
            <Progresso fracao={r.alvo ? r.atual / r.alvo : 0} cor="bg-emerald-500" />
          </div>
          <div className="text-sm text-slate-600">
            Você tem <b>{moeda(r.atual)}</b>
            {r.falta > 0 ? (
              <>
                {' '}· faltam <b>{moeda(r.falta)}</b>. Separando {moeda(r.aporte)}/mês, completa em {r.meses} {r.meses === 1 ? 'mês' : 'meses'}.
              </>
            ) : (
              ' · reserva completa. 🎉'
            )}
          </div>
          {!temContaReserva && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Marque em{' '}
              <Link para="/contas" className="font-bold underline">
                Contas
              </Link>{' '}
              qual conta ou aplicação é a sua reserva (opção “Faz parte da reserva de emergência”) para o app saber quanto você já tem.
            </p>
          )}
        </section>

        {/* ------------------------------------------------ investimento */}
        <section className="cartao">
          <h2 className="mb-1 flex items-center gap-2 text-base font-extrabold text-slate-900">
            <TrendingUp className="h-5 w-5 text-azul-600" /> Quanto guardar da renda
          </h2>
          <p className="mb-3 text-sm text-slate-500">Percentual da renda que vai para o futuro (reserva + investimentos). Referência comum: 20% (regra 50/30/20).</p>
          <div className="mb-4">
            <Segmentado
              valor={String(Math.round(config.pct_investimento))}
              onChange={(v) => salvarConfig({ pct_investimento: Number(v) })}
              opcoes={['10', '15', '20', '25', '30'].map((v) => ({ value: v, label: `${v}%` }))}
            />
          </div>
          <div className="mb-1 text-xs font-semibold text-slate-600">Como sua renda está dividida hoje (regra 50/30/20)</div>
          <Divisao rotulo="Necessidades (essenciais)" valor={plano.regra.necessidades} ideal={0.5} cor="bg-rose-500" />
          <Divisao rotulo="Estilo de vida (não essenciais)" valor={plano.regra.desejos} ideal={0.3} cor="bg-amber-500" />
          <Divisao rotulo="Futuro (guardar + metas)" valor={plano.regra.poupanca} ideal={0.2} cor="bg-emerald-500" minimo />
          <p className="mt-2 text-xs text-slate-400">Referência, não regra: o importante é o plano fechar com folga.</p>
        </section>
      </div>

      {/* ------------------------------------------------ custo de vida por categoria */}
      <section className="cartao">
        <h2 className="mb-1 text-base font-extrabold text-slate-900">De onde vem o custo de vida</h2>
        <p className="mb-3 text-sm text-slate-500">
          Fixos e anuais vêm de “Fixos e salário” (anuais divididos por 12). Os demais gastos usam a média {plano.historicoMeses ? `dos últimos ${plano.historicoMeses} ${plano.historicoMeses === 1 ? 'mês' : 'meses'}` : '(ainda sem histórico)'} ou o limite do Orçamento, o que for maior.
          Marque em Ajustes → Categorias quais são essenciais.
        </p>
        {plano.custos.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Cadastre seus fixos e lance alguns gastos para o app calcular.</p>
        ) : (
          <div className="divide-y divide-slate-100 text-sm">
            {plano.custos.map((x) => (
              <div key={x.categoriaId} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {x.nome}
                  {x.essencial && <span className="ml-1.5 rounded-full bg-rose-50 px-1.5 py-px text-[0.625rem] font-bold text-rose-700">essencial</span>}
                </span>
                <span className="hidden text-xs text-slate-400 sm:inline">
                  {[x.recorrente ? `fixo ${moeda(x.recorrente)}` : '', x.media ? `média ${moeda(x.media)}` : '', x.orcamento ? `limite ${moeda(x.orcamento)}` : ''].filter(Boolean).join(' · ')}
                </span>
                <span className="w-28 text-right font-semibold tabular-nums">{moeda(x.estimativa)}</span>
              </div>
            ))}
            {plano.parcelas > 0 && (
              <div className="flex items-center gap-2 py-2">
                <span className="flex-1 text-slate-700">Parcelas em andamento (mês que vem)</span>
                <span className="w-28 text-right font-semibold tabular-nums">{moeda(plano.parcelas)}</span>
              </div>
            )}
            <div className="flex items-center gap-2 py-2 font-bold">
              <span className="flex-1">Custo de vida mensal</span>
              <span className="w-28 text-right tabular-nums">{moeda(plano.custoTotal)}</span>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------ projeção */}
      <section className="cartao">
        <h2 className="mb-1 text-base font-extrabold text-slate-900">Projeção dos próximos 12 meses</h2>
        <p className="mb-3 text-sm text-slate-500">
          Com o que já está cadastrado: salário e fixos (anuais no mês em que vencem), parcelas já lançadas e a média dos gastos do dia a dia. O patrimônio inclui o que você guardar.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm tabular-nums">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="py-1.5 text-left font-semibold">Mês</th>
                <th className="py-1.5 text-right font-semibold">Entradas</th>
                <th className="py-1.5 text-right font-semibold">Saídas</th>
                <th className="py-1.5 text-right font-semibold">Sobra</th>
                <th className="py-1.5 text-right font-semibold">Patrimônio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projecao.map((m) => (
                <tr key={m.mes}>
                  <td className="py-1.5 text-slate-700 first-letter:uppercase">{mesAbreviado(m.mes)}</td>
                  <td className="py-1.5 text-right text-emerald-700">{moeda(m.entradas)}</td>
                  <td className="py-1.5 text-right text-slate-700">{moeda(m.saidas)}</td>
                  <td className={`py-1.5 text-right font-semibold ${m.resultado < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{moeda(m.resultado)}</td>
                  <td className="py-1.5 text-right font-bold text-azul-800">{moeda(m.patrimonio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {projecao.some((m) => m.resultado < 0) && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Atenção aos meses com sobra negativa: normalmente são meses de despesas anuais. Por isso vale separar a provisão todo mês.
          </p>
        )}
      </section>

      {metaForm && <MetaForm inicial={null} sugestao={metaForm} onClose={() => setMetaForm(null)} />}
    </div>
  )
}

function Grande({ rotulo, valor, sub, destaque, icone }: { rotulo: string; valor: number; sub?: string; destaque?: boolean; icone?: ReactNode }) {
  return (
    <div className={destaque ? 'rounded-2xl bg-gradient-to-br from-azul-700 to-azul-900 p-4 text-white shadow-lg shadow-azul-700/20 sm:p-5' : 'cartao'}>
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${destaque ? 'text-white/70' : 'text-slate-500'}`}>
        {icone}
        {rotulo}
      </div>
      <div className={`mt-1.5 text-lg font-extrabold tracking-tight tabular-nums sm:text-2xl ${destaque ? '' : 'text-slate-900'}`}>{moeda(valor)}</div>
      {sub && <div className={`mt-0.5 text-xs ${destaque ? 'text-white/60' : 'text-slate-400'}`}>{sub}</div>}
    </div>
  )
}

function Caixinha({ icone, cor, titulo, valor, detalhe }: { icone: ReactNode; cor: string; titulo: string; valor: number; detalhe: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cor}`}>{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-800">{titulo}</span>
        <span className="block text-xs text-slate-500">{detalhe}</span>
      </span>
      <span className="text-right text-base font-extrabold text-slate-900 tabular-nums">
        {moeda(valor)}
        <span className="block text-[0.6875rem] font-semibold text-slate-400">por mês</span>
      </span>
    </div>
  )
}

function Divisao({ rotulo, valor, ideal, cor, minimo }: { rotulo: string; valor: number; ideal: number; cor: string; minimo?: boolean }) {
  const ok = minimo ? valor >= ideal : valor <= ideal
  return (
    <div className="py-1.5">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-slate-700">{rotulo}</span>
        <span className={`font-semibold tabular-nums ${ok ? 'text-slate-900' : 'text-amber-600'}`}>
          {percentual(valor)} <span className="text-xs font-normal text-slate-400">(ref. {minimo ? 'mín.' : 'até'} {percentual(ideal)})</span>
        </span>
      </div>
      <Progresso fracao={valor} cor={cor} />
    </div>
  )
}

function Aviso({ tom, icone, children }: { tom: 'azul' | 'amarelo'; icone: ReactNode; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${tom === 'azul' ? 'bg-azul-50 text-azul-900 ring-1 ring-azul-200' : 'bg-amber-50 text-amber-900'}`}>
      <span className="mt-0.5 shrink-0">{icone}</span>
      <span>{children}</span>
    </div>
  )
}

/** Quanto preciso ganhar por mês para cobrir todas as despesas com a folga que eu escolher. */
function RendaNecessaria({
  despesas,
  guardar,
  renda,
  margem,
  necessaria,
  comGuardar,
  folgaAtual,
}: {
  despesas: number
  guardar: number
  renda: number
  margem: number
  necessaria: number
  comGuardar: number
  folgaAtual: number | null
}) {
  const [texto, setTexto] = useState(String(margem))
  const diferenca = somar([renda, -necessaria])
  const aplicar = (v: number) => {
    const n = Math.max(0, Math.min(300, Math.round(v)))
    setTexto(String(n))
    if (n !== margem) salvarConfig({ margem_folga: n })
  }
  return (
    <section className="cartao border-azul-200 ring-1 ring-azul-100">
      <h2 className="mb-1 flex items-center gap-2 text-base font-extrabold text-slate-900">
        <Target className="h-5 w-5 text-azul-600" /> Renda necessária
      </h2>
      <p className="mb-4 text-sm text-slate-500">Quanto você precisa ganhar por mês para cobrir todas as suas despesas e ainda ter uma margem de folga, que você define.</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Margem de folga sobre as despesas</div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <Segmentado
                  valor={['10', '20', '30', '50'].includes(texto) ? texto : ''}
                  onChange={(v) => aplicar(Number(v))}
                  opcoes={['10', '20', '30', '50'].map((v) => ({ value: v, label: `${v}%` }))}
                />
              </div>
              <label className="relative w-full shrink-0 sm:w-24">
                <input
                  className="input pr-7 text-right tabular-nums"
                  inputMode="numeric"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  onBlur={() => aplicar(Number(texto || 0))}
                  onKeyDown={(e) => e.key === 'Enter' && aplicar(Number(texto || 0))}
                  aria-label="Margem de folga em %"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-slate-400">%</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-slate-400">Ou digite outro valor (ex.: 25) e saia do campo para salvar.</p>
          </div>
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Despesas por mês (custo de vida)</span>
              <b className="tabular-nums">{moeda(despesas)}</b>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">(+) Margem de {margem}%</span>
              <b className="tabular-nums">{moeda(somar([necessaria, -despesas]))}</b>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base">
              <span className="font-bold text-slate-800">(=) Renda necessária</span>
              <b className="text-azul-800 tabular-nums">{moeda(necessaria)}</b>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-gradient-to-br from-azul-700 to-azul-900 p-4 text-white">
            <div className="text-xs font-semibold text-white/70">Você precisa ganhar por mês</div>
            <div className="text-3xl font-extrabold tracking-tight tabular-nums">{moeda(necessaria)}</div>
            <div className="mt-1 text-xs text-white/70">
              para pagar tudo e sobrar {margem}% de folga · contando também o que quer guardar ({moeda(guardar)}/mês): <b className="text-white">{moeda(comGuardar)}</b>
            </div>
          </div>
          {renda > 0 ? (
            <div className={`rounded-xl px-4 py-3 text-sm ${diferenca >= 0 ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
              Sua renda hoje é <b>{moeda(renda)}</b>
              {folgaAtual !== null && <> ({folgaAtual >= 0 ? 'folga' : 'déficit'} de <b>{percentual(Math.abs(folgaAtual))}</b> sobre as despesas)</>}.{' '}
              {diferenca >= 0 ? (
                <>
                  Ela cobre a renda necessária e ainda sobram <b>{moeda(diferenca)}</b>.
                </>
              ) : (
                <>
                  Faltam <b>{moeda(-diferenca)}</b> por mês para chegar à margem de {margem}%: aumente a renda ou corte despesas.
                </>
              )}
            </div>
          ) : (
            <p className="rounded-xl bg-azul-50 px-4 py-3 text-sm text-azul-900">Cadastre sua renda em Fixos e salário para comparar com a renda necessária.</p>
          )}
        </div>
      </div>
    </section>
  )
}
