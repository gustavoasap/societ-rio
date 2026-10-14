import { useState } from 'react'
import { CalendarDays, CircleCheck, CreditCard, Pencil, Plus, Wallet } from 'lucide-react'
import { LinhaLancamento } from '../components/LinhaLancamento'
import { Cabecalho, Carregando, Erro, Progresso, Vazio } from '../components/ui'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { hoje, mesAtual, primeiroDia, somarDias, somarMesesAoMes, ultimoDia } from '../lib/datas'
import { buscarLancamentos, useDados, type ContaComSaldo } from '../lib/dados'
import { datasDaFatura, faturasDoCartao, faturasPorMes, type Fatura } from '../lib/financas'
import { dataBR, mesAbreviado, mesPorExtenso, moeda } from '../lib/formato'
import { ContaForm } from './Contas'

export function Cartoes() {
  const { contas } = useApp()
  const cartoes = contas.filter((c) => c.tipo === 'cartao')
  const [edit, setEdit] = useState<ContaComSaldo | 'novo' | null>(null)
  const hj = hoje()
  const inicio = primeiroDia(somarMesesAoMes(hj.slice(0, 7), -4))
  const fim = ultimoDia(somarMesesAoMes(hj.slice(0, 7), 14))
  const lanc = useDados(() => buscarLancamentos(inicio, fim), [inicio, fim])
  const [mesSel, setMesSel] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="Cartões de crédito"
        descricao="Fatura de cada mês, quem gastou o quê, parcelas futuras e pagamento da fatura."
        acoes={
          <button className="btn-primary" onClick={() => setEdit('novo')}>
            <Plus className="h-4 w-4" /> Novo cartão
          </button>
        }
      />
      {lanc.erro && <Erro>{lanc.erro}</Erro>}
      {cartoes.length === 0 ? (
        <Vazio icone={CreditCard}>
          <span>Cadastre seu cartão com o limite e os dias de fechamento e vencimento.</span>
          <button className="btn-primary btn-sm mt-1" onClick={() => setEdit('novo')}>
            <Plus className="h-3.5 w-3.5" /> Novo cartão
          </button>
        </Vazio>
      ) : lanc.carregando ? (
        <Carregando />
      ) : (
        <>
          <FaturasMesAMes cartoes={cartoes} lancamentos={lanc.dados ?? []} mesSel={mesSel} onSel={setMesSel} />
          {cartoes.map((c) => (
            <CartaoBloco key={c.id} cartao={c} lancamentos={lanc.dados ?? []} onEditar={() => setEdit(c)} sel={mesSel} setSel={setMesSel} />
          ))}
        </>
      )}
      {edit && <ContaForm inicial={edit === 'novo' ? null : edit} tipoPadrao="cartao" onClose={() => setEdit(null)} />}
    </div>
  )
}

function CartaoBloco({
  cartao: c,
  lancamentos,
  onEditar,
  sel,
  setSel,
}: {
  cartao: ContaComSaldo
  lancamentos: Parameters<typeof faturasDoCartao>[1]
  onEditar: () => void
  sel: string | null
  setSel: (m: string) => void
}) {
  const { contas, pessoas, nome, abrirLancamento } = useApp()
  const hj = hoje()
  const faturas = faturasDoCartao(c, lancamentos)
  const atualIdx = Math.max(
    0,
    faturas.findIndex((f) => (f.vencimento ?? ultimoDia(f.mes)) >= hj),
  )
  const f: Fatura | undefined = faturas.find((x) => x.mes === sel) ?? faturas[atualIdx]
  const devido = Math.max(0, -c.saldo)
  const futuras = somar(faturas.filter((x) => f && x.mes > f.mes).map((x) => x.total))

  function pagar(fat: Fatura) {
    const banco = contas.find((x) => x.ativa && x.tipo === 'corrente') ?? contas.find((x) => x.ativa && x.tipo !== 'cartao')
    abrirLancamento({
      tipo: 'transferencia',
      conta_id: banco?.id,
      conta_destino_id: c.id,
      valor: Math.max(0.01, somar([fat.total, -fat.pago])),
      descricao: `Fatura ${c.nome} ${mesAbreviado(fat.mes)}`,
      data: fat.vencimento && fat.vencimento > hj ? hj : (fat.vencimento ?? hj),
    })
  }

  // quem gastou o quê na fatura
  const porPessoa = new Map<string, number>()
  for (const l of f?.itens ?? []) {
    const k = l.pessoa_id ?? ''
    porPessoa.set(k, somar([porPessoa.get(k) ?? 0, l.tipo === 'receita' ? -l.valor : l.valor]))
  }

  const status = !f
    ? null
    : f.pago >= f.total - 0.009 && f.total > 0
      ? { rotulo: 'Paga', cls: 'bg-emerald-100 text-emerald-700' }
      : f.fechamento && f.fechamento <= hj
        ? { rotulo: f.vencimento && f.vencimento < hj ? 'Vencida' : 'Fechada', cls: f.vencimento && f.vencimento < hj ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700' }
        : { rotulo: 'Aberta', cls: 'bg-azul-100 text-azul-700' }

  return (
    <section className="cartao space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-16 w-24 shrink-0 flex-col justify-between rounded-xl bg-gradient-to-br from-violet-600 to-azul-800 p-2 text-white shadow-md">
          <CreditCard className="h-4 w-4" />
          <span className="truncate text-[0.625rem] font-bold">{c.nome}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-slate-900">{c.nome}</h2>
            <button className="icon-btn" onClick={onEditar} aria-label="Editar cartão">
              <Pencil className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-slate-500">
            {c.dia_fechamento ? `Fecha dia ${c.dia_fechamento} · vence dia ${c.dia_vencimento}` : 'Defina o dia de fechamento e vencimento (lápis) para separar as faturas.'}
          </div>
          {c.limite ? (
            <div className="mt-2 max-w-md">
              <Progresso fracao={devido / c.limite} cor="bg-violet-500" alerta={devido > c.limite * 0.9} />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>Usado {moeda(devido)}</span>
                <span>Disponível {moeda(Math.max(0, c.limite - devido))} de {moeda(c.limite)}</span>
              </div>
            </div>
          ) : null}
        </div>
        <button className="btn-secondary btn-sm" onClick={() => abrirLancamento({ tipo: 'despesa', conta_id: c.id })}>
          <Plus className="h-3.5 w-3.5" /> Nova compra
        </button>
      </div>

      {faturas.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Nenhuma compra lançada neste cartão.</p>
      ) : (
        <>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {faturas.map((x) => (
              <button
                key={x.mes}
                onClick={() => setSel(x.mes)}
                className={`shrink-0 cursor-pointer rounded-xl px-3 py-2 text-left text-xs transition ${x.mes === f?.mes ? 'bg-azul-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <div className="font-bold first-letter:uppercase">{mesAbreviado(x.mes)}</div>
                <div className="tabular-nums">{moeda(x.total)}</div>
              </button>
            ))}
          </div>

          {f && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-800 first-letter:uppercase">Fatura de {mesPorExtenso(f.mes)}</h3>
                  {status && <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${status.cls}`}>{status.rotulo}</span>}
                </div>
                <div className="divide-y divide-slate-100">
                  {f.itens.map((l) => (
                    <LinhaLancamento key={l.id} l={l} mostrarData />
                  ))}
                </div>
              </div>
              <aside className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
                <div>
                  <div className="text-xs text-slate-500">Total da fatura</div>
                  <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{moeda(f.total)}</div>
                  {f.vencimento && (
                    <div className="text-xs text-slate-500">
                      {f.fechamento && `Fecha ${dataBR(f.fechamento)} · `}vence {dataBR(f.vencimento)}
                    </div>
                  )}
                </div>
                <div className="space-y-1 border-t border-slate-200 pt-2">
                  <div className="text-xs font-bold text-slate-500">Quem gastou</div>
                  {[...porPessoa.entries()]
                    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0))
                    .map(([id, v]) => (
                      <div key={id} className="flex justify-between">
                        <span className={id ? 'font-semibold text-amber-700' : 'text-slate-700'}>{id ? (pessoas.find((p) => p.id === id)?.nome ?? '?') : `Eu (${nome})`}</span>
                        <span className="tabular-nums">{moeda(v)}</span>
                      </div>
                    ))}
                </div>
                {f.pago > 0 && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                    <CircleCheck className="h-4 w-4" /> Pagamentos registrados: {moeda(f.pago)}
                  </div>
                )}
                {f.total - f.pago > 0.009 && (
                  <button className="btn-primary w-full" onClick={() => pagar(f)}>
                    <Wallet className="h-4 w-4" /> Pagar fatura
                  </button>
                )}
                {futuras > 0 && <p className="text-xs text-slate-500">Já comprometido nas próximas faturas: <b>{moeda(futuras)}</b></p>}
              </aside>
            </div>
          )}
        </>
      )}
    </section>
  )
}

/** Tabela das faturas de todos os cartões, mês a mês, com fechamento, vencimento e total. */
function FaturasMesAMes({
  cartoes,
  lancamentos,
  mesSel,
  onSel,
}: {
  cartoes: ContaComSaldo[]
  lancamentos: Parameters<typeof faturasDoCartao>[1]
  mesSel: string | null
  onSel: (m: string) => void
}) {
  const atual = mesAtual()
  const meses = Array.from({ length: 15 }, (_, i) => somarMesesAoMes(atual, i - 2))
  const linhas = faturasPorMes(cartoes, lancamentos, meses).filter((l) => l.total !== 0 || (l.mes >= atual && l.mes <= somarMesesAoMes(atual, 3)))
  const exemplo = cartoes.find((c) => c.dia_fechamento && c.dia_vencimento)
  const ex = exemplo ? datasDaFatura(somarMesesAoMes(atual, 1), exemplo.dia_fechamento, exemplo.dia_vencimento) : null
  const varios = cartoes.length > 1
  const doMes = linhas.find((l) => l.mes === atual)

  return (
    <section className="cartao">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
          <CalendarDays className="h-5 w-5 text-violet-600" /> Faturas mês a mês
        </h2>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800">
          Vence em {mesPorExtenso(atual).split(' de ')[0]}: {moeda(doMes?.total ?? 0)}
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        O mês da fatura é o mês em que ela <b>vence</b> (quando você paga).
        {exemplo && ex?.fechamento && ex.vencimento && (
          <>
            {' '}
            No {exemplo.nome}, a fatura de {mesPorExtenso(somarMesesAoMes(atual, 1)).split(' de ')[0]} junta as compras de {dataBR(somarDias(datasDaFatura(atual, exemplo.dia_fechamento, exemplo.dia_vencimento).fechamento!, 0))} a {dataBR(somarDias(ex.fechamento, -1))}, fecha em {dataBR(ex.fechamento)} e vence em {dataBR(ex.vencimento)}.
          </>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm tabular-nums">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="py-1.5 text-left font-semibold">Fatura de</th>
              {!varios && <th className="py-1.5 text-left font-semibold">Compras de / até</th>}
              <th className="py-1.5 text-left font-semibold">Vencimento</th>
              {varios && cartoes.map((c) => <th key={c.id} className="py-1.5 text-right font-semibold">{c.nome}</th>)}
              <th className="py-1.5 text-right font-semibold">{varios ? 'Total' : 'Valor'}</th>
              <th className="py-1.5 text-right font-semibold">Situação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.map((l) => {
              const c0 = cartoes[0]
              const d = datasDaFatura(l.mes, c0.dia_fechamento, c0.dia_vencimento)
              const anterior = datasDaFatura(somarMesesAoMes(l.mes, -1), c0.dia_fechamento, c0.dia_vencimento).fechamento
              const venceu = d.vencimento ? d.vencimento < hoje() : l.mes < atual
              const situacao = l.total <= 0 ? '—' : l.aPagar <= 0.009 ? 'Paga' : venceu ? 'Vencida' : d.fechamento && d.fechamento <= hoje() ? 'Fechada' : 'Aberta'
              const cor = situacao === 'Paga' ? 'text-emerald-700' : situacao === 'Vencida' ? 'text-rose-600' : situacao === 'Fechada' ? 'text-amber-700' : 'text-azul-700'
              return (
                <tr
                  key={l.mes}
                  onClick={() => onSel(l.mes)}
                  className={`cursor-pointer hover:bg-slate-50 ${l.mes === mesSel ? 'bg-violet-50' : ''} ${l.mes === atual ? 'font-semibold' : ''}`}
                >
                  <td className="py-2 text-slate-800 first-letter:uppercase">
                    {mesPorExtenso(l.mes)}
                    {l.mes === atual && <span className="ml-1.5 rounded-full bg-azul-100 px-1.5 text-[0.625rem] font-bold text-azul-700">este mês</span>}
                  </td>
                  {!varios && <td className="py-2 text-xs text-slate-500">{anterior && d.fechamento ? `${dataBR(anterior)} a ${dataBR(somarDias(d.fechamento, -1))}` : '—'}</td>}
                  <td className="py-2 text-slate-600">{varios ? mesAbreviado(l.mes) : d.vencimento ? dataBR(d.vencimento) : '—'}</td>
                  {varios &&
                    cartoes.map((c) => (
                      <td key={c.id} className="py-2 text-right text-slate-700">
                        {l.porCartao.get(c.id) ? moeda(l.porCartao.get(c.id)!.total) : '—'}
                      </td>
                    ))}
                  <td className="py-2 text-right font-bold text-slate-900">{moeda(l.total)}</td>
                  <td className={`py-2 text-right text-xs font-bold ${cor}`}>{situacao}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {lancamentos.every((l) => !cartoes.some((c) => c.id === l.conta_id)) && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ainda não há compras nos cartões. Em <b>Novo lançamento</b>, escolha a despesa e em “Pago com” selecione o cartão (💳). Parcelada? Use “Parcelada” e informe a parcela atual (ex.: 4 de 10): cada parcela cai
          na fatura certa dos próximos meses.
        </p>
      )}
      <p className="mt-2 text-xs text-slate-400">Toque em um mês para ver as compras daquela fatura logo abaixo.</p>
    </section>
  )
}
