import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, Scale } from 'lucide-react'
import { formatarData, formatarMoeda, lerNumeroBR, moedaDigitada } from '../../lib/format'
import { baixarArquivo, gerarXlsxAbas, TIPO_XLSX, type ValorCelula } from '../../lib/planilha'
import { ROTULO_MOVIMENTO, conciliarMes, limitesMes, type Caucao } from './tipos'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const mesAtual = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const somarMes = (mes: string, n: number) => {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const nomeMes = (mes: string) => {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} de ${a}`
}

/** Saldo da conta de passivo: positivo = credor (C), negativo = devedor (D). */
function Saldo({ valor, forte = false }: { valor: number; forte?: boolean }) {
  if (!valor) return <span className="text-slate-300">—</span>
  return (
    <span className={`whitespace-nowrap tabular-nums ${forte ? 'font-bold text-slate-900' : 'text-slate-700'} ${valor < 0 ? 'text-rose-600' : ''}`}>
      {formatarMoeda(Math.abs(valor))} <span className="text-[0.6875rem] font-semibold text-slate-400">{valor < 0 ? 'D' : 'C'}</span>
    </span>
  )
}

/** Movimento: crédito em verde-azulado, débito em vermelho (sem sinal, com D/C). */
function Mov({ valor }: { valor: number }) {
  if (!valor) return <span className="text-slate-300">—</span>
  return <span className={`whitespace-nowrap tabular-nums ${valor > 0 ? 'text-brand-700' : 'text-rose-600'}`}>{formatarMoeda(Math.abs(valor))}</span>
}

export function Conciliacao({ caucoes, filtrados, nomeParceiro }: { caucoes: Caucao[]; filtrados: boolean; nomeParceiro: (id: string | null) => string }) {
  const [mes, setMes] = useState(mesAtual)
  const [saldoBalancete, setSaldoBalancete] = useState('')
  const r = useMemo(() => conciliarMes(caucoes, mes), [caucoes, mes])
  const t = r.totais
  const balancete = lerNumeroBR(saldoBalancete)
  const diferenca = balancete === null ? null : Math.round((balancete - t.saldoFinal) * 100) / 100
  const debitos = Math.round((t.taxa + t.certificado + Math.min(0, t.apropriacao)) * 100) / 100
  const creditos = Math.round((t.creditos + Math.max(0, t.apropriacao)) * 100) / 100

  function exportar() {
    const sinal = (v: number): ValorCelula => (v ? Math.abs(v) : null)
    const saldoDC = (v: number) => (v < 0 ? 'D' : v > 0 ? 'C' : '')
    const resumo = r.linhas.map((l): ValorCelula[] => [
      l.caucao.cliente,
      nomeParceiro(l.caucao.parceiro_id),
      Math.abs(l.saldoAnterior),
      saldoDC(l.saldoAnterior),
      sinal(l.creditos),
      sinal(l.taxa),
      sinal(l.certificado),
      l.apropriacao < 0 ? Math.abs(l.apropriacao) : null,
      l.apropriacao > 0 ? l.apropriacao : null,
      { valor: Math.abs(l.saldoFinal), destaque: 'negrito' },
      saldoDC(l.saldoFinal),
    ])
    const lancs = r.lancamentos.map((m): ValorCelula[] => [
      m.data,
      m.cliente,
      ROTULO_MOVIMENTO[m.tipo],
      m.historico,
      m.valor < 0 ? -m.valor : null,
      m.valor > 0 ? m.valor : null,
    ])
    const arq = gerarXlsxAbas([
      {
        aba: `Resumo ${mes}`,
        colunas: [
          { titulo: 'Cliente', largura: 38 },
          { titulo: 'Parceiro', largura: 24 },
          { titulo: 'Saldo anterior', tipo: 'moeda', largura: 15 },
          { titulo: 'D/C', largura: 6 },
          { titulo: 'Caução recebido (C)', tipo: 'moeda', largura: 17 },
          { titulo: 'Taxa da junta (D)', tipo: 'moeda', largura: 16 },
          { titulo: 'Certificado digital (D)', tipo: 'moeda', largura: 17 },
          {
            titulo: 'Baixa lucro p/ resultado (D)',
            tipo: 'moeda',
            largura: 19,
          },
          { titulo: 'Baixa prejuízo (C)', tipo: 'moeda', largura: 16 },
          { titulo: 'Saldo final', tipo: 'moeda', largura: 15 },
          { titulo: 'D/C', largura: 6 },
        ],
        linhas: resumo,
        total: [
          `Total ${nomeMes(mes)}`,
          '',
          Math.abs(t.saldoAnterior),
          saldoDC(t.saldoAnterior),
          sinal(t.creditos),
          sinal(t.taxa),
          sinal(t.certificado),
          t.apropriacao < 0 ? Math.abs(t.apropriacao) : null,
          t.apropriacao > 0 ? t.apropriacao : null,
          Math.abs(t.saldoFinal),
          saldoDC(t.saldoFinal),
        ],
      },
      {
        aba: `Lançamentos ${mes}`,
        colunas: [
          { titulo: 'Data', tipo: 'data', largura: 12 },
          { titulo: 'Cliente', largura: 38 },
          { titulo: 'Tipo', largura: 28 },
          { titulo: 'Histórico', largura: 50 },
          { titulo: 'Débito', tipo: 'moeda', largura: 15 },
          { titulo: 'Crédito', tipo: 'moeda', largura: 15 },
        ],
        linhas: lancs,
        total: ['', 'Total do mês', '', '', Math.abs(debitos), creditos],
      },
    ])
    baixarArquivo(`conciliacao-caucao-${mes}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex items-center gap-1">
          <button className="btn-secondary px-2.5" onClick={() => setMes((m) => somarMes(m, -1))} title="Mês anterior" aria-label="Mês anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="month" className="input w-auto py-2" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} aria-label="Mês" />
          <button className="btn-secondary px-2.5" onClick={() => setMes((m) => somarMes(m, 1))} title="Próximo mês" aria-label="Próximo mês">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="text-sm text-slate-500">
          Conta <b className="text-slate-700">Adiantamento de Clientes - Caução</b> · {nomeMes(mes).charAt(0).toUpperCase() + nomeMes(mes).slice(1)}
        </div>
        <button className="btn-primary ml-auto from-emerald-500 to-emerald-600 shadow-emerald-500/20" onClick={exportar} disabled={!r.linhas.length}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel do mês
        </button>
      </div>

      {filtrados && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Há filtros aplicados: a conciliação considera só os cauções filtrados. Limpe os filtros para bater com o saldo total da conta.
        </p>
      )}
      {r.semData > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-800 ring-1 ring-sky-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {r.semData} caução(ões) têm valor lançado sem a data (recebimento ou pagamento). Esses valores só entram na conta quando a data for informada.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          {
            rotulo: 'Saldo anterior',
            valor: <Saldo valor={t.saldoAnterior} forte />,
          },
          {
            rotulo: '(+) Créditos no mês',
            valor: <span className="text-brand-700 tabular-nums">{formatarMoeda(creditos)}</span>,
            detalhe: 'cauções recebidos' + (t.apropriacao > 0 ? ' e baixas de prejuízo' : ''),
          },
          {
            rotulo: '(−) Débitos no mês',
            valor: <span className="text-rose-600 tabular-nums">{formatarMoeda(Math.abs(debitos))}</span>,
            detalhe: 'taxas, certificados' + (t.apropriacao < 0 ? ' e baixas p/ resultado' : ''),
          },
          {
            rotulo: 'Saldo final',
            valor: <Saldo valor={t.saldoFinal} forte />,
            detalhe: `em ${formatarData(limitesMes(mes).fim)}`,
          },
        ].map((k) => (
          <div key={k.rotulo} className="min-w-0 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 sm:p-5">
            <div className="text-sm font-medium text-slate-500">{k.rotulo}</div>
            <div className="mt-2 text-lg font-extrabold break-words sm:text-2xl">{k.valor}</div>
            {k.detalhe && <div className="mt-1 text-xs text-slate-500">{k.detalhe}</div>}
          </div>
        ))}
        <div
          className={`col-span-2 min-w-0 rounded-2xl p-4 shadow-sm ring-1 sm:p-5 lg:col-span-1 ${diferenca === null ? 'bg-white ring-slate-200/70' : diferenca === 0 ? 'bg-emerald-50 ring-emerald-200' : 'bg-rose-50 ring-rose-200'}`}
        >
          <label className="flex items-center gap-2 text-sm font-medium text-slate-500" htmlFor="saldo-balancete">
            <Scale className="h-4 w-4 text-slate-400" />
            Saldo no balancete
          </label>
          <input
            id="saldo-balancete"
            className="input mt-2 tabular-nums"
            placeholder="Digite o saldo credor"
            value={saldoBalancete}
            onChange={(e) => setSaldoBalancete(e.target.value)}
            onBlur={(e) => setSaldoBalancete(moedaDigitada(e.target.value))}
          />
          {diferenca !== null && (
            <div className={`mt-1.5 text-xs font-bold ${diferenca === 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {diferenca === 0 ? '✓ Conciliado: saldos iguais' : `Diferença: ${formatarMoeda(diferenca)}`}
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-800">Saldo por cliente</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.8125rem]">
            <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="py-3 pr-3 pl-5">Cliente</th>
                <th className="px-3 py-3 text-right">Saldo anterior</th>
                <th className="px-3 py-3 text-right">(+) Caução</th>
                <th className="px-3 py-3 text-right">(−) Taxa junta</th>
                <th className="px-3 py-3 text-right">(−) Certificado</th>
                <th className="px-3 py-3 text-right" title="Saldo restante transferido para o resultado (lucro a débito, prejuízo a crédito)">
                  Baixa p/ resultado
                </th>
                <th className="py-3 pr-5 pl-3 text-right">Saldo final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {r.linhas.map((l) => (
                <tr key={l.caucao.id}>
                  <td className="py-2.5 pr-3 pl-5 font-semibold text-slate-800">{l.caucao.cliente}</td>
                  <td className="px-3 py-2.5 text-right">
                    <Saldo valor={l.saldoAnterior} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Mov valor={l.creditos} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Mov valor={l.taxa} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Mov valor={l.certificado} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Mov valor={l.apropriacao} />
                  </td>
                  <td className="py-2.5 pr-5 pl-3 text-right">
                    <Saldo valor={l.saldoFinal} forte />
                  </td>
                </tr>
              ))}
            </tbody>
            {r.linhas.length > 0 && (
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-bold">
                <tr>
                  <td className="py-3 pr-3 pl-5 text-slate-800">Total</td>
                  <td className="px-3 py-3 text-right">
                    <Saldo valor={t.saldoAnterior} forte />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Mov valor={t.creditos} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Mov valor={t.taxa} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Mov valor={t.certificado} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Mov valor={t.apropriacao} />
                  </td>
                  <td className="py-3 pr-5 pl-3 text-right">
                    <Saldo valor={t.saldoFinal} forte />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          {!r.linhas.length && <p className="p-10 text-center text-sm text-slate-400">Sem saldo nem movimento nesta conta em {nomeMes(mes)}.</p>}
        </div>
      </div>

      {r.lancamentos.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <h3 className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-800">Lançamentos do mês (razão)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8125rem]">
              <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-3 pr-3 pl-5">Data</th>
                  <th className="px-3 py-3">Histórico</th>
                  <th className="px-3 py-3 text-right">Débito</th>
                  <th className="py-3 pr-5 pl-3 text-right">Crédito</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.lancamentos.map((m, i) => (
                  <tr key={`${m.caucaoId}-${m.tipo}-${i}`}>
                    <td className="py-2 pr-3 pl-5 whitespace-nowrap text-slate-500 tabular-nums">{formatarData(m.data)}</td>
                    <td className="px-3 py-2 text-slate-700">{m.historico}</td>
                    <td className="px-3 py-2 text-right text-rose-600 tabular-nums">{m.valor < 0 ? formatarMoeda(-m.valor) : ''}</td>
                    <td className="py-2 pr-5 pl-3 text-right text-brand-700 tabular-nums">{m.valor > 0 ? formatarMoeda(m.valor) : ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-bold">
                <tr>
                  <td className="py-3 pr-3 pl-5" colSpan={2}>
                    Total do mês
                  </td>
                  <td className="px-3 py-3 text-right text-rose-600 tabular-nums">{formatarMoeda(Math.abs(debitos))}</td>
                  <td className="py-3 pr-5 pl-3 text-right text-brand-700 tabular-nums">{formatarMoeda(creditos)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
