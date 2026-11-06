import { useMemo, useState } from 'react'
import { ArrowRightLeft, CheckCheck, ChevronDown, ChevronUp, FileSpreadsheet, Hourglass, Landmark, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData, formatarMoeda } from '../../lib/format'
import { baixarArquivo, gerarXlsxAbas, TIPO_XLSX, type ValorCelula } from '../../lib/planilha'
import { limitesMes, resumirPeriodo, type Caucao } from './tipos'

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const mesDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(0, 4)}`

function atalhos(hoje = new Date()) {
  const a = hoje.getFullYear()
  const m = hoje.getMonth()
  const tri = Math.floor(m / 3) * 3
  return [
    { rotulo: 'Este mês', de: mesDe(hoje), ate: mesDe(hoje) },
    { rotulo: 'Mês anterior', de: mesDe(new Date(a, m - 1, 1)), ate: mesDe(new Date(a, m - 1, 1)) },
    { rotulo: 'Trimestre', de: mesDe(new Date(a, tri, 1)), ate: mesDe(new Date(a, tri + 2, 1)) },
    { rotulo: 'Ano', de: `${a}-01`, ate: `${a}-12` },
  ]
}

function Valor({ v, className = '' }: { v: number; className?: string }) {
  return (
    <span className={`font-bold whitespace-nowrap tabular-nums ${v > 0 ? 'text-emerald-700' : v < 0 ? 'text-rose-600' : 'text-slate-400'} ${className}`}>
      {formatarMoeda(v)}
    </span>
  )
}

export function Resumo({
  caucoes,
  filtrados,
  nomeParceiro,
  onChanged,
}: {
  caucoes: Caucao[]
  filtrados: boolean
  nomeParceiro: (id: string | null) => string
  onChanged: () => void
}) {
  const [de, setDe] = useState(() => mesDe(new Date()))
  const [ate, setAte] = useState(() => mesDe(new Date()))
  const [expandido, setExpandido] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [dataBaixa, setDataBaixa] = useState('')
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const inicio = limitesMes(de <= ate ? de : ate).inicio
  const fim = limitesMes(de <= ate ? ate : de).fim
  const r = useMemo(() => resumirPeriodo(caucoes, inicio, fim), [caucoes, inicio, fim])
  const at = r.aTransferir
  const mov = r.movimento.totais
  const periodo = de === ate ? rotuloMes(de) : `${rotuloMes(de <= ate ? de : ate)} a ${rotuloMes(de <= ate ? ate : de)}`
  const aTransferirItens = r.itens.filter((i) => i.situacao === 'a_transferir')

  function escolherPeriodo(d: string, a: string) {
    setDe(d)
    setAte(a)
    setSelecionados(new Set())
    setDataBaixa('')
  }

  const alternar = (id: string) =>
    setSelecionados((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const todosMarcados = aTransferirItens.length > 0 && aTransferirItens.every((i) => selecionados.has(i.caucao.id))
  const somaSelecionados = aTransferirItens.filter((i) => selecionados.has(i.caucao.id)).reduce((s, i) => s + i.valor, 0)

  async function marcarTransferidos() {
    const data = dataBaixa || fim
    const ids = [...selecionados]
    if (!ids.length) return
    if (!confirm(`Registrar a transferência para o resultado de ${ids.length} cliente(s), total ${formatarMoeda(somaSelecionados)}, em ${formatarData(data)}?`))
      return
    setGravando(true)
    setErro(null)
    const { error } = await supabase.from('soc_caucoes').update({ data_apropriacao: data }).in('id', ids)
    setGravando(false)
    if (error) return setErro(error.message)
    setSelecionados(new Set())
    onChanged()
  }

  function exportar() {
    const resumo: ValorCelula[][] = [
      ['Período', periodo],
      ['Saldo inicial da conta', mov.saldoAnterior],
      ['(+) Cauções recebidos', mov.creditos],
      ['(−) Taxas da junta pagas', -mov.taxa],
      ['(−) Certificados pagos', -mov.certificado],
      ['(±) Transferências para resultado já registradas', -mov.apropriacao],
      ['Saldo final da conta', { valor: mov.saldoFinal, destaque: 'negrito' }],
      ['', null],
      ['Lucros a transferir para receita', { valor: at.lucro, destaque: 'positivo' }],
      ['Prejuízos a reconhecer', { valor: at.prejuizo, destaque: 'negativo' }],
      ['VALOR LÍQUIDO A TRANSFERIR', { valor: at.liquido, destaque: at.liquido >= 0 ? 'positivo' : 'negativo' }],
      ['   dos quais concluídos em períodos anteriores', at.anteriores || null],
      ['Saldo da conta após a transferência', mov.saldoFinal - at.liquido],
      ['', null],
      ['Já transferido no período', r.transferido.liquido || null],
      [`Aguardando taxa/certificado (${r.aguardando.qtd} cliente(s)) - saldo na conta`, r.aguardando.saldo || null],
    ]
    const porCliente = r.itens.map((i): ValorCelula[] => [
      i.caucao.cliente,
      nomeParceiro(i.caucao.parceiro_id),
      i.caucao.valor_caucao,
      i.caucao.taxa_junta,
      i.caucao.valor_certificado,
      i.conclusao,
      { valor: i.valor, destaque: i.valor > 0 ? 'positivo' : i.valor < 0 ? 'negativo' : undefined },
      i.valor > 0 ? 'Receita' : i.valor < 0 ? 'Prejuízo' : 'Zerado',
      i.situacao === 'transferido'
        ? `Transferido em ${formatarData(i.caucao.data_apropriacao)}`
        : i.anterior
          ? 'A transferir (período anterior)'
          : 'A transferir',
    ])
    const arq = gerarXlsxAbas([
      {
        aba: 'Resumo',
        colunas: [
          { titulo: `Resumo - Adiantamento de Clientes - Caução`, largura: 52 },
          { titulo: 'Valor', tipo: 'moeda', largura: 18 },
        ],
        linhas: resumo,
      },
      {
        aba: 'Receita por cliente',
        colunas: [
          { titulo: 'Cliente', largura: 38 },
          { titulo: 'Parceiro', largura: 24 },
          { titulo: 'Caução', tipo: 'moeda', largura: 14 },
          { titulo: 'Taxa da junta', tipo: 'moeda', largura: 14 },
          { titulo: 'Certificado', tipo: 'moeda', largura: 14 },
          { titulo: 'Concluído em', tipo: 'data', largura: 13 },
          { titulo: 'Receita / Prejuízo', tipo: 'moeda', largura: 17 },
          { titulo: 'Tipo', largura: 10 },
          { titulo: 'Situação', largura: 30 },
        ],
        linhas: porCliente,
        total: ['Total (a transferir + já transferido)', '', null, null, null, null, { valor: r.itens.reduce((s, i) => s + i.valor, 0), destaque: 'negrito' }, '', ''],
      },
    ])
    baixarArquivo(`resumo-caucao-${de}${de !== ate ? `-a-${ate}` : ''}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex flex-wrap gap-1">
          {atalhos().map((a) => (
            <button
              key={a.rotulo}
              onClick={() => escolherPeriodo(a.de, a.ate)}
              className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ring-inset transition ${de === a.de && ate === a.ate ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-brand-300'}`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
          De
          <input
            type="month"
            className="input w-auto py-2"
            value={de}
            onChange={(e) => e.target.value && escolherPeriodo(e.target.value, ate < e.target.value ? e.target.value : ate)}
            aria-label="Mês inicial"
          />
          até
          <input
            type="month"
            className="input w-auto py-2"
            value={ate}
            onChange={(e) => e.target.value && escolherPeriodo(de > e.target.value ? e.target.value : de, e.target.value)}
            aria-label="Mês final"
          />
        </div>
        <button className="btn-primary ml-auto from-emerald-500 to-emerald-600 shadow-emerald-500/20" onClick={exportar}>
          <FileSpreadsheet className="h-4 w-4" />
          Excel do resumo
        </button>
      </div>

      {filtrados && (
        <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
          Há filtros aplicados: o resumo considera só os cauções filtrados.
        </p>
      )}
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <section className={`rounded-2xl p-5 shadow-sm ring-1 ${at.liquido >= 0 ? 'bg-emerald-50/70 ring-emerald-200' : 'bg-rose-50/70 ring-rose-200'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <ArrowRightLeft className="h-4 w-4" />
            Valor a transferir para receita · {periodo}
          </div>
          <div className="mt-2 text-3xl font-extrabold sm:text-4xl">
            <Valor v={at.liquido} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <div className="text-xs text-slate-500">Lucros (receita)</div>
              <Valor v={at.lucro} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Prejuízos</div>
              <Valor v={at.prejuizo} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Clientes</div>
              <b className="text-slate-800 tabular-nums">{at.qtd}</b>
            </div>
          </div>
          {at.anteriores !== 0 && (
            <p className="mt-3 text-xs text-slate-600">
              Inclui <b>{formatarMoeda(at.anteriores)}</b> de cauções concluídos antes do período que ainda não foram transferidos.
            </p>
          )}
          {at.qtd > 0 && (
            <div className="mt-4 rounded-xl bg-white/80 p-3 text-xs text-slate-600 ring-1 ring-slate-200/70">
              <div className="mb-1 font-bold text-slate-700">Lançamento sugerido</div>
              {at.lucro > 0 && (
                <div>
                  D — Adiantamento de Clientes - Caução · C — Receita (caução) · <b className="tabular-nums">{formatarMoeda(at.lucro)}</b>
                </div>
              )}
              {at.prejuizo < 0 && (
                <div>
                  D — Despesa / perda com caução · C — Adiantamento de Clientes - Caução · <b className="tabular-nums">{formatarMoeda(-at.prejuizo)}</b>
                </div>
              )}
            </div>
          )}
          <button className="btn-secondary mt-4" onClick={() => setExpandido((x) => !x)} aria-expanded={expandido}>
            {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {expandido ? 'Recolher' : 'Expandir'} receita/prejuízo por cliente
          </button>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-800">
            <Landmark className="h-4 w-4 text-brand-600" />
            Conta Adiantamento de Clientes - Caução
          </div>
          <dl className="space-y-1.5 text-sm tabular-nums">
            {[
              ['Saldo inicial', mov.saldoAnterior],
              ['(+) Cauções recebidos', mov.creditos],
              ['(−) Taxas da junta', mov.taxa],
              ['(−) Certificados', mov.certificado],
              ...(mov.apropriacao ? [['(±) Já transferido p/ resultado', mov.apropriacao] as [string, number]] : []),
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-slate-700">{formatarMoeda(Math.abs(v as number))}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5 font-bold">
              <dt>Saldo final</dt>
              <dd>{formatarMoeda(mov.saldoFinal)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-slate-500">
              <dt>(−) A transferir para resultado</dt>
              <dd>{formatarMoeda(at.liquido)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5 font-bold text-brand-700">
              <dt>Saldo após a transferência</dt>
              <dd>{formatarMoeda(mov.saldoFinal - at.liquido)}</dd>
            </div>
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1 text-slate-500">
                <CheckCheck className="h-3.5 w-3.5" /> Já transferido no período
              </div>
              <Valor v={r.transferido.liquido} className="mt-1 block text-sm" />
              <div className="text-slate-400">{r.transferido.qtd} cliente(s)</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="flex items-center gap-1 text-slate-500">
                <Hourglass className="h-3.5 w-3.5" /> Aguardando taxa/certificado
              </div>
              <span className="mt-1 block text-sm font-bold text-slate-700 tabular-nums">{formatarMoeda(r.aguardando.saldo)}</span>
              <div className="text-slate-400">{r.aguardando.qtd} cliente(s) · fica na conta</div>
            </div>
          </div>
        </section>
      </div>

      {expandido && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
              <Wallet className="h-4 w-4 text-brand-600" />
              Receita ou prejuízo por cliente · {periodo}
            </h3>
            {aTransferirItens.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {selecionados.size > 0 && (
                  <span>
                    {selecionados.size} selecionado(s): <Valor v={somaSelecionados} />
                  </span>
                )}
                <label className="flex items-center gap-1.5">
                  Transferido em
                  <input type="date" className="input w-auto py-1.5 text-xs" value={dataBaixa || fim} onChange={(e) => setDataBaixa(e.target.value)} />
                </label>
                <button className="btn-primary btn-sm" onClick={marcarTransferidos} disabled={!selecionados.size || gravando}>
                  <CheckCheck className="h-4 w-4" />
                  {gravando ? 'Gravando...' : 'Marcar como transferido'}
                </button>
              </div>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8125rem]">
              <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="w-10 py-3 pl-5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={todosMarcados}
                      disabled={!aTransferirItens.length}
                      onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(aTransferirItens.map((i) => i.caucao.id)))}
                      title="Selecionar todos a transferir"
                    />
                  </th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3 text-right">Caução</th>
                  <th className="px-3 py-3 text-right">(−) Taxa</th>
                  <th className="px-3 py-3 text-right">(−) Certificado</th>
                  <th className="px-3 py-3">Concluído em</th>
                  <th className="px-3 py-3 text-right">Receita / prejuízo</th>
                  <th className="py-3 pr-5 pl-3">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {r.itens.map((i) => (
                  <tr key={i.caucao.id} className={i.situacao === 'transferido' ? 'bg-slate-50/60 text-slate-500' : ''}>
                    <td className="py-2.5 pl-5">
                      {i.situacao === 'a_transferir' && (
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={selecionados.has(i.caucao.id)}
                          onChange={() => alternar(i.caucao.id)}
                        />
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-800">{i.caucao.cliente}</div>
                      {i.caucao.parceiro_id && <div className="text-xs text-slate-400">{nomeParceiro(i.caucao.parceiro_id)}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatarMoeda(i.caucao.valor_caucao ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatarMoeda(i.caucao.taxa_junta ?? 0)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{formatarMoeda(i.caucao.valor_certificado ?? 0)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{formatarData(i.conclusao)}</td>
                    <td className="px-3 py-2.5 text-right text-sm">
                      <Valor v={i.valor} />
                      <div className="text-[0.6875rem] font-semibold text-slate-400">{i.valor > 0 ? 'receita' : i.valor < 0 ? 'prejuízo' : ''}</div>
                    </td>
                    <td className="py-2.5 pr-5 pl-3 text-xs whitespace-nowrap">
                      {i.situacao === 'transferido' ? (
                        <span className="font-semibold text-slate-500">Transferido em {formatarData(i.caucao.data_apropriacao)}</span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-200 ring-inset">
                          A transferir{i.anterior ? ' · período anterior' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {r.itens.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-bold">
                  <tr>
                    <td className="py-3 pl-5" />
                    <td className="px-3 py-3" colSpan={5}>
                      A transferir: {at.qtd} cliente(s)
                      {r.transferido.qtd > 0 && <span className="font-normal text-slate-500"> · já transferido: {formatarMoeda(r.transferido.liquido)}</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-sm">
                      <Valor v={at.liquido} />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
            {!r.itens.length && (
              <p className="p-10 text-center text-sm text-slate-400">
                Nenhum caução concluído em {periodo}. Um caução fica concluído quando o caução foi recebido e a taxa e o certificado foram pagos (use valor 0
                quando não se aplica).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
