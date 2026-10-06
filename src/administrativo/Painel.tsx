import { useMemo, type ReactNode } from 'react'
import { AlertTriangle, Archive, ArrowRight, CircleDollarSign, Clock3, ListChecks, Receipt, UserCheck } from 'lucide-react'
import { BarrasAgrupadas, BarrasHorizontais } from '../tributario/components/graficos'
import { Section } from '../components/ui'
import { ETAPAS, REGIMES, labelDe, moeda, temPendencia, type Cliente, type ParceiroResumo, type Vigente } from './tipos'

const COR_SERIE = '#2449f5' // brand-600: série única nos gráficos

type IrPara = (aba: 'painel' | 'ativos' | 'inativos', filtros?: { status?: string; pendencia?: string; parceiro?: string }) => void

function Kpi({ icone: I, rotulo, valor, detalhe, onClick }: { icone: typeof Receipt; rotulo: string; valor: string; detalhe?: ReactNode; onClick?: () => void }) {
  const corpo = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
        <I className="h-4 w-4 text-slate-400" />
        {rotulo}
      </div>
      <div className="mt-2 text-lg font-extrabold break-words text-slate-900 tabular-nums sm:text-2xl">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-slate-500">{detalhe}</div>}
    </>
  )
  const base = 'min-w-0 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-200/70 sm:p-5'
  return onClick ? (
    <button className={`${base} cursor-pointer transition hover:-translate-y-0.5 hover:ring-brand-300`} onClick={onClick}>
      {corpo}
    </button>
  ) : (
    <div className={base}>{corpo}</div>
  )
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function Painel({ clientes, vigentes, parceiros, irPara }: { clientes: Cliente[]; vigentes: Map<string, Vigente>; parceiros: ParceiroResumo[]; irPara: IrPara }) {
  const r = useMemo(() => {
    const assinados = clientes.filter((c) => c.status === 'assinado')
    const pendentes = clientes.filter((c) => c.status === 'pendente')
    const inativos = clientes.filter((c) => c.status === 'encerrado')
    const valor = (c: Cliente) => vigentes.get(c.id)?.valor ?? 0
    const soma = (l: Cliente[]) => l.reduce((s, c) => s + valor(c), 0)
    const comHonorario = assinados.filter((c) => vigentes.has(c.id))

    // Por parceiro (contratos assinados)
    const porParceiro = new Map<string, { nome: string; clientes: number; total: number; pendentes: number }>()
    for (const c of [...assinados, ...pendentes]) {
      const id = c.parceiro_id ?? 'nenhum'
      const nome = parceiros.find((p) => p.id === c.parceiro_id)?.nome ?? 'Sem parceiro'
      const item = porParceiro.get(id) ?? { nome, clientes: 0, total: 0, pendentes: 0 }
      if (c.status === 'assinado') {
        item.clientes++
        item.total += valor(c)
      } else item.pendentes++
      porParceiro.set(id, item)
    }
    const parceirosOrd = [...porParceiro.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.total - a.total)

    // Contratos assinados por mês (últimos 12 meses)
    const hoje = new Date()
    const meses = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - 11 + i, 1)
      return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, rotulo: `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, qtd: 0, valor: 0 }
    })
    for (const c of clientes) {
      const m = meses.find((x) => c.data_assinatura?.startsWith(x.chave))
      if (m) {
        m.qtd++
        m.valor += valor(c)
      }
    }

    // Faixas de honorário (assinados)
    const faixas = [
      { rotulo: 'Até R$ 200', teste: (v: number) => v > 0 && v <= 200 },
      { rotulo: 'R$ 201 a R$ 300', teste: (v: number) => v > 200 && v <= 300 },
      { rotulo: 'R$ 301 a R$ 400', teste: (v: number) => v > 300 && v <= 400 },
      { rotulo: 'Acima de R$ 400', teste: (v: number) => v > 400 },
    ].map((f) => {
      const l = comHonorario.filter((c) => f.teste(valor(c)))
      return { rotulo: f.rotulo, clientes: l.length, total: soma(l) }
    })

    // Implantação dos clientes ativos
    const ativos = [...assinados, ...pendentes]
    const etapas = ETAPAS.map((e) => ({
      ...e,
      pendente: ativos.filter((c) => c[e.campo] === 'pendente').length,
      pdf: ativos.filter((c) => c[e.campo] === 'pdf_enviado').length,
    }))

    // Regime tributário dos ativos
    const regimes = new Map<string, number>()
    for (const c of ativos) regimes.set(c.regime_tributario ?? '', (regimes.get(c.regime_tributario ?? '') ?? 0) + 1)

    const semDia = [...vigentes.values()].filter((v) => !v.dia_vencimento).length
    return {
      assinados,
      pendentes,
      inativos,
      mrr: soma(assinados),
      potencial: soma(pendentes),
      ticket: comHonorario.length ? soma(comHonorario) / comHonorario.length : 0,
      assinadosSemHonorario: assinados.length - comHonorario.length,
      parceirosOrd,
      meses,
      faixas,
      etapas,
      regimes: [...regimes.entries()].sort((a, b) => b[1] - a[1]),
      comPendencia: ativos.filter(temPendencia).length,
      semDia,
      semRegime: ativos.filter((c) => !c.regime_tributario).length,
    }
  }, [clientes, vigentes, parceiros])

  const atencao = [
    r.assinadosSemHonorario > 0 && { texto: `${r.assinadosSemHonorario} cliente(s) com contrato assinado sem honorário informado`, acao: () => irPara('ativos', { status: 'assinado' }) },
    r.semDia > 0 && { texto: `${r.semDia} honorário(s) sem dia de vencimento. Esse dado vai alimentar o fluxo de caixa.`, acao: () => irPara('ativos') },
    r.semRegime > 0 && { texto: `${r.semRegime} cliente(s) ativo(s) sem regime tributário informado`, acao: () => irPara('ativos') },
  ].filter(Boolean) as { texto: string; acao: () => void }[]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <Kpi icone={UserCheck} rotulo="Clientes ativos" valor={String(r.assinados.length)} detalhe="com contrato assinado" onClick={() => irPara('ativos', { status: 'assinado' })} />
        <Kpi icone={CircleDollarSign} rotulo="Honorários mensais" valor={moeda(r.mrr)} detalhe="contratos assinados" />
        <Kpi icone={Receipt} rotulo="Ticket médio" valor={moeda(r.ticket)} detalhe="por cliente com honorário" />
        <Kpi
          icone={Clock3}
          rotulo="Aguardando assinatura"
          valor={String(r.pendentes.length)}
          detalhe={`${moeda(r.potencial)}/mês a entrar`}
          onClick={() => irPara('ativos', { status: 'pendente' })}
        />
        <Kpi icone={Archive} rotulo="Inativos" valor={String(r.inativos.length)} detalhe="clientes encerrados" onClick={() => irPara('inativos')} />
      </div>

      {atencao.length > 0 && (
        <div className="space-y-2 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            Pontos de atenção
          </h3>
          <ul className="space-y-1">
            {atencao.map((a) => (
              <li key={a.texto}>
                <button className="flex cursor-pointer items-center gap-1 text-left text-sm text-amber-900 hover:underline" onClick={a.acao}>
                  {a.texto}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title="Honorários mensais por parceiro" icone={CircleDollarSign}>
          <BarrasHorizontais
            itens={r.parceirosOrd
              .filter((p) => p.total > 0)
              .map((p) => ({ id: p.id, rotulo: p.nome, valor: p.total, cor: COR_SERIE, detalhe: `${p.clientes} cliente(s)` }))}
            formatar={moeda}
          />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Parceiro</th>
                  <th className="px-3 py-1.5 text-right">Assinados</th>
                  <th className="px-3 py-1.5 text-right">Aguardando</th>
                  <th className="px-3 py-1.5 text-right">Mensal</th>
                  <th className="py-1.5 pl-3 text-right">% do total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {r.parceirosOrd.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2 pr-3">
                      <button className="cursor-pointer text-left font-semibold whitespace-nowrap text-slate-700 hover:text-brand-600" onClick={() => irPara('ativos', { parceiro: p.id })}>
                        {p.nome}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">{p.clientes}</td>
                    <td className="px-3 py-2 text-right text-slate-500">{p.pendentes}</td>
                    <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">{moeda(p.total)}</td>
                    <td className="py-2 pl-3 text-right">{r.mrr ? `${((p.total / r.mrr) * 100).toFixed(1).replace('.', ',')}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 font-bold tabular-nums">
                <tr>
                  <td className="py-2 pr-3">Total</td>
                  <td className="px-3 py-2 text-right">{r.assinados.length}</td>
                  <td className="px-3 py-2 text-right">{r.pendentes.length}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{moeda(r.mrr)}</td>
                  <td className="py-2 pl-3 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>

        <Section title="Honorários de novos contratos por mês" icone={UserCheck} cor="emerald">
          <BarrasAgrupadas
            grupos={r.meses.map((m) => ({ rotulo: m.rotulo, valores: { novos: m.valor }, extra: { novos: `${m.qtd} contrato(s) assinado(s)` } }))}
            series={[{ id: 'novos', label: 'Honorário mensal contratado', cor: COR_SERIE }]}
            formatar={moeda}
            altura={250}
          />
          <p className="mt-1 text-xs text-slate-400">Soma do honorário mensal dos contratos assinados em cada mês, nos últimos 12 meses.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Faixa de honorário</th>
                  <th className="px-3 py-1.5 text-right">Clientes</th>
                  <th className="py-1.5 pl-3 text-right">Mensal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {r.faixas.map((f) => (
                  <tr key={f.rotulo}>
                    <td className="py-2 pr-3 text-slate-700">{f.rotulo}</td>
                    <td className="px-3 py-2 text-right">{f.clientes}</td>
                    <td className="py-2 pl-3 text-right font-semibold">{moeda(f.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section title={`Implantação (${r.comPendencia} cliente(s) com pendência)`} icone={ListChecks} cor="amber">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Etapa</th>
                  <th className="px-3 py-1.5 text-right">Pendente</th>
                  <th className="px-3 py-1.5 text-right">PDF enviado</th>
                  <th className="py-1.5 pl-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {r.etapas.map((e) => (
                  <tr key={e.campo}>
                    <td className="py-2 pr-3 text-slate-700">{e.label}</td>
                    <td className="px-3 py-2 text-right">{e.pendente || <span className="text-slate-300">0</span>}</td>
                    <td className="px-3 py-2 text-right">{e.pdf || <span className="text-slate-300">0</span>}</td>
                    <td className="py-2 pl-3 text-right">
                      {e.pendente + e.pdf > 0 && (
                        <button className="cursor-pointer text-xs font-semibold text-brand-600 hover:underline" onClick={() => irPara('ativos', { pendencia: e.campo })}>
                          Ver clientes
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Regime tributário dos clientes ativos" icone={Receipt} cor="violet">
          <BarrasHorizontais
            itens={r.regimes.map(([k, n]) => ({ id: k || 'vazio', rotulo: labelDe(REGIMES, k) || 'Não informado', valor: n, cor: COR_SERIE }))}
            formatar={(v) => `${v} cliente(s)`}
          />
        </Section>
      </div>
    </div>
  )
}
