import { useMemo, useState } from 'react'
import { Ban, FileSpreadsheet, Plus, RotateCcw, Trash2, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData } from '../../lib/format'
import { baixarArquivo, gerarXlsx, TIPO_XLSX } from '../../lib/planilha'
import { CampoMes } from '../../components/CampoData'
import { Field, Modal } from '../../components/ui'
import { BuscaCliente } from '../../components/BuscaCliente'
import { SITUACOES, competenciaDe, fimPeriodo, mesDe, mesHoje, type ClienteHon, type Linha, type PeriodoParceiro } from './calculo'
import { mesCurto, nomeMes, salvarMensal, valorTexto } from './util'

const formatarCnpj = (c: string | null) => (c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c ?? ''))
const cod = (n: number) => String(n).padStart(3, '0')

/** Mensalidades do mês que o parceiro paga: clientes, valor e parcela (ex.: 2/6), para gerar o boleto. */
export function MensalidadesParceiro({
  nome,
  mes,
  linhas,
  onClose,
  onReceber,
  onAlterado,
}: {
  nome: string
  mes: string
  linhas: Linha[]
  onClose: () => void
  onReceber: (l: Linha[]) => void
  /** Depois de marcar/desfazer "sem mensalidade", recarrega o controle */
  onAlterado: () => void
}) {
  const ord = [...linhas].sort((a, b) => a.cliente.codigo - b.cliente.codigo)
  const total = ord.reduce((s, l) => s + l.valor, 0)
  const recebido = ord.reduce((s, l) => s + l.recebido, 0)
  const pendentes = ord.filter((l) => l.aberto > 0 && !l.mensal?.recebido_em)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const semMensalidade = (l: Linha) => l.valor === 0 && !l.mensal?.recebido_em
  // Só dá para zerar o mês de quem ainda não pagou
  const zeraveis = ord.filter((l) => !l.mensal?.recebido_em && l.valor > 0)
  const zerados = ord.filter(semMensalidade)

  async function marcarSem(ls: Linha[], sem: boolean) {
    if (!ls.length) return
    if (
      sem &&
      ls.length > 1 &&
      !confirm(
        `Marcar ${nomeMes(mes)} como SEM MENSALIDADE para ${ls.length} cliente(s) da ${nome}? O parceiro não paga e os clientes não são cobrados neste mês.`,
      )
    )
      return
    setSalvando(true)
    setErro('')
    for (const l of ls) {
      const { error } = await salvarMensal(
        l.cliente.id,
        mes,
        sem ? { valor_ajustado: 0, motivo_ajuste: `Sem mensalidade - ${nome}` } : { valor_ajustado: null, motivo_ajuste: null },
      )
      if (error) {
        setErro(`Não foi possível salvar ${l.cliente.razao_social}: ${error.message}`)
        break
      }
    }
    setSalvando(false)
    onAlterado()
  }

  function exportar() {
    const arq = gerarXlsx({
      aba: `${nome} ${mes}`,
      colunas: [
        { titulo: 'Cód.', largura: 7 },
        { titulo: 'Razão social', largura: 42 },
        { titulo: 'CNPJ', largura: 20 },
        { titulo: 'Data de abertura', tipo: 'data', largura: 14 },
        { titulo: 'Parcela', largura: 9 },
        { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        { titulo: 'Situação', largura: 16 },
      ],
      linhas: ord.map((l) => [
        cod(l.cliente.codigo),
        l.cliente.razao_social,
        formatarCnpj(l.cliente.cnpj),
        l.cliente.data_abertura ?? '',
        `${l.parceiro!.parcela}/${l.parceiro!.total}`,
        l.valor,
        semMensalidade(l) ? 'Sem mensalidade' : SITUACOES[l.situacao].label,
      ]),
      total: ['', `TOTAL (${ord.length} clientes)`, '', '', '', total, ''],
    })
    baixarArquivo(`mensalidades-${nome.toLowerCase().replace(/\W+/g, '-')}-${mes}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  return (
    <Modal
      title={`Mensalidades - ${nome}`}
      subtitulo={`Competência ${nomeMes(mes)} · ${ord.length} cliente(s) · total ${valorTexto(total)}`}
      onClose={onClose}
      largura="max-w-4xl"
      footer={
        <>
          <button className="btn-secondary" onClick={exportar}>
            <FileSpreadsheet className="h-4 w-4" />
            Excel para o boleto
          </button>
          {zeraveis.length > 0 ? (
            <button className="btn-secondary mr-auto text-slate-700" disabled={salvando} onClick={() => marcarSem(zeraveis, true)}>
              <Ban className="h-4 w-4" />
              Sem mensalidade neste mês
            </button>
          ) : (
            <button className="btn-secondary mr-auto" disabled={salvando || !zerados.length} onClick={() => marcarSem(zerados, false)}>
              <RotateCcw className="h-4 w-4" />
              Voltar a cobrar este mês
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {pendentes.length > 0 && (
            <button className="btn-primary from-emerald-500 to-emerald-600" onClick={() => onReceber(pendentes)}>
              <Wallet className="h-4 w-4" />
              Marcar {pendentes.length} como recebida(s)
            </button>
          )}
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {zerados.length > 0 && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">
          <b>
            {zerados.length} cliente(s) sem mensalidade em {nomeMes(mes)}
          </b>
          : a {nome} não paga e o cliente não é cobrado neste mês (não entra em inadimplência).
        </p>
      )}
      <div className="grid grid-cols-3 gap-3">
        {[
          { r: 'Total a cobrar do parceiro', v: valorTexto(total), c: 'text-slate-900' },
          { r: 'Recebido', v: valorTexto(recebido), c: 'text-emerald-700' },
          { r: 'Em aberto', v: valorTexto(total - recebido), c: total - recebido > 0 ? 'text-amber-700' : 'text-slate-500' },
        ].map((k) => (
          <div key={k.r} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
            <div className="text-xs font-medium text-slate-500">{k.r}</div>
            <div className={`mt-1 text-xl font-extrabold tabular-nums ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
        <table className="w-full text-sm">
          <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
            <tr className="border-b border-slate-100">
              <th className="py-2.5 pr-2 pl-4">Cliente</th>
              <th className="px-2 py-2.5">CNPJ</th>
              <th className="px-2 py-2.5">Abertura</th>
              <th className="px-2 py-2.5 text-center">Parcela</th>
              <th className="px-2 py-2.5 text-right">Valor</th>
              <th className="py-2.5 pr-4 pl-2">Situação</th>
              <th className="py-2.5 pr-4 pl-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ord.map((l) => (
              <tr key={l.cliente.id}>
                <td className="py-2 pr-2 pl-4">
                  <span className="font-mono text-xs text-slate-400">{cod(l.cliente.codigo)}</span>{' '}
                  <span className="font-semibold text-slate-800">{l.cliente.razao_social}</span>
                </td>
                <td className="px-2 py-2 font-mono text-xs text-slate-500">{formatarCnpj(l.cliente.cnpj)}</td>
                <td className="px-2 py-2 font-bold whitespace-nowrap text-slate-800">
                  {l.cliente.data_abertura ? formatarData(l.cliente.data_abertura) : '—'}
                </td>
                <td className="px-2 py-2 text-center font-bold text-violet-700 tabular-nums">
                  {l.parceiro!.parcela}/{l.parceiro!.total}
                  {l.parceiro!.parcela === l.parceiro!.total && <div className="text-[0.625rem] font-semibold text-violet-500">última</div>}
                </td>
                <td className="px-2 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{valorTexto(l.valor)}</td>
                <td className="py-2 pr-4 pl-2">
                  <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${SITUACOES[l.situacao].pill}`}>
                    {semMensalidade(l) ? 'Sem mensalidade' : SITUACOES[l.situacao].label}
                  </span>
                  {l.mensal?.recebido_em && <span className="ml-1 text-xs text-slate-500">{formatarData(l.mensal.recebido_em)}</span>}
                </td>
                <td className="py-2 pr-4 pl-2 text-right whitespace-nowrap">
                  {semMensalidade(l) ? (
                    <button
                      className="btn-secondary px-2.5 py-1 text-xs"
                      disabled={salvando}
                      onClick={() => marcarSem([l], false)}
                      title="Voltar a cobrar este mês"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Desfazer
                    </button>
                  ) : (
                    !l.mensal?.recebido_em && (
                      <button
                        className="btn-secondary px-2.5 py-1 text-xs"
                        disabled={salvando}
                        onClick={() => marcarSem([l], true)}
                        title="Neste mês o parceiro não paga e o cliente não é cobrado"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Sem mensalidade
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-bold">
              <td className="py-2.5 pl-4" colSpan={4}>
                Total ({ord.length} clientes)
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{valorTexto(total)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </Modal>
  )
}

/** Cadastro dos períodos em que o parceiro paga a mensalidade do cliente. */
export function PeriodosParceiro({
  clientes,
  parceiros,
  periodos,
  clienteInicial,
  onClose,
  onSalvo,
}: {
  clientes: ClienteHon[]
  parceiros: { id: string; nome: string }[]
  periodos: PeriodoParceiro[]
  clienteInicial?: string
  onClose: () => void
  onSalvo: () => void
}) {
  const padrao = parceiros.find((p) => /way/i.test(p.nome))?.id ?? parceiros[0]?.id ?? ''
  const [cliente, setCliente] = useState(clienteInicial ?? '')
  const [parceiro, setParceiro] = useState(padrao)
  const [inicio, setInicio] = useState(mesHoje())
  const [meses, setMeses] = useState('6')
  const [obs, setObs] = useState('')
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const nomeParceiro = useMemo(() => new Map(parceiros.map((p) => [p.id, p.nome])), [parceiros])
  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes])
  const n = Number(meses)
  const fim = Number.isInteger(n) && n > 0 ? fimPeriodo({ inicio: competenciaDe(inicio), meses: n }) : null

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return [...periodos]
      .filter((p) => {
        const c = porId.get(p.cliente_id)
        if (!t) return true
        return (
          !!c && (c.razao_social.toLowerCase().includes(t) || cod(c.codigo).includes(t) || (nomeParceiro.get(p.parceiro_id) ?? '').toLowerCase().includes(t))
        )
      })
      .sort((a, b) => (porId.get(a.cliente_id)?.codigo ?? 0) - (porId.get(b.cliente_id)?.codigo ?? 0) || a.inicio.localeCompare(b.inicio))
  }, [periodos, busca, porId, nomeParceiro])

  async function salvar() {
    if (!cliente) return setErro('Escolha o cliente.')
    if (!parceiro) return setErro('Escolha o parceiro.')
    if (!Number.isInteger(n) || n < 1 || n > 120) return setErro('Informe o número de meses (1 a 120).')
    const choque = periodos.find((p) => p.cliente_id === cliente && !(fim! < mesDe(p.inicio) || inicio > fimPeriodo(p)))
    if (choque)
      return setErro(
        `Este cliente já tem período pago por ${nomeParceiro.get(choque.parceiro_id)} de ${mesCurto(mesDe(choque.inicio))} a ${mesCurto(fimPeriodo(choque))}.`,
      )
    setSalvando(true)
    const { error } = await supabase
      .from('adm_hon_parceiro')
      .insert({ cliente_id: cliente, parceiro_id: parceiro, inicio: competenciaDe(inicio), meses: n, observacao: obs.trim() || null })
    setSalvando(false)
    if (error) return setErro(error.message)
    setCliente('')
    setObs('')
    setErro(null)
    onSalvo()
  }

  async function excluir(p: PeriodoParceiro) {
    const c = porId.get(p.cliente_id)
    if (!confirm(`Excluir o período pago por ${nomeParceiro.get(p.parceiro_id)} para ${c?.razao_social ?? 'o cliente'}?`)) return
    const { error } = await supabase.from('adm_hon_parceiro').delete().eq('id', p.id)
    if (error) return setErro(error.message)
    onSalvo()
  }

  const atual = mesHoje()
  return (
    <Modal
      title="Mensalidades pagas por parceiro"
      subtitulo="Períodos em que o parceiro é o responsável pela mensalidade do cliente"
      onClose={onClose}
      largura="max-w-5xl"
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:grid-cols-6">
        <Field label="Cliente *" className="sm:col-span-3">
          <BuscaCliente itens={clientes.filter((c) => c.status !== 'encerrado')} value={cliente} onChange={setCliente} />
          {porId.get(cliente) && (
            <span className="mt-1 block text-xs text-slate-500">
              Data de abertura:{' '}
              <b className="font-bold text-slate-800">
                {porId.get(cliente)!.data_abertura ? formatarData(porId.get(cliente)!.data_abertura!) : 'não informada'}
              </b>
            </span>
          )}
        </Field>
        <Field label="Parceiro responsável *" className="sm:col-span-3">
          <select className="input" value={parceiro} onChange={(e) => setParceiro(e.target.value)}>
            {parceiros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mês de início *" className="sm:col-span-2">
          <CampoMes value={inicio} onChange={setInicio} className="input" />
        </Field>
        <Field label="Nº de meses *">
          <input className="input" inputMode="numeric" value={meses} onChange={(e) => setMeses(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </Field>
        <Field label="Observação" className="sm:col-span-3">
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: 6 meses de contabilidade pela Way Group" />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-6">
          <span className="text-sm text-slate-600">
            {fim ? (
              <>
                Parceiro paga de <b>{mesCurto(inicio)}</b> até <b>{mesCurto(fim)}</b> ({n} parcela{n > 1 ? 's' : ''}); a partir da competência seguinte a
                cobrança volta para o cliente.
              </>
            ) : (
              'Informe o número de meses.'
            )}
          </span>
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            <Plus className="h-4 w-4" />
            Incluir período
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200/70">
        <div className="border-b border-slate-100 p-3">
          <input className="input" placeholder="Buscar cliente, código ou parceiro" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="max-h-[45vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
              <tr className="border-b border-slate-100">
                <th className="py-2 pr-2 pl-4">Cliente</th>
                <th className="px-2 py-2">Abertura</th>
                <th className="px-2 py-2">Parceiro</th>
                <th className="px-2 py-2">Período</th>
                <th className="px-2 py-2">Agora</th>
                <th className="py-2 pr-4 pl-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((p) => {
                const c = porId.get(p.cliente_id)
                const ini = mesDe(p.inicio)
                const f = fimPeriodo(p)
                const parcela =
                  atual >= ini && atual <= f
                    ? (Number(atual.slice(0, 4)) - Number(ini.slice(0, 4))) * 12 + Number(atual.slice(5)) - Number(ini.slice(5)) + 1
                    : null
                return (
                  <tr key={p.id}>
                    <td className="py-2 pr-2 pl-4">
                      <span className="font-mono text-xs text-slate-400">{c ? cod(c.codigo) : '---'}</span>{' '}
                      <span className="font-semibold text-slate-800">{c?.razao_social ?? 'Cliente inativo'}</span>
                      {p.observacao && <div className="text-xs text-slate-400">{p.observacao}</div>}
                    </td>
                    <td className="px-2 py-2 font-bold whitespace-nowrap text-slate-800">{c?.data_abertura ? formatarData(c.data_abertura) : '—'}</td>
                    <td className="px-2 py-2 font-semibold text-violet-700">{nomeParceiro.get(p.parceiro_id)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                      {mesCurto(ini)} a {mesCurto(f)} · {p.meses} meses
                    </td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      {parcela ? (
                        <span className="font-bold text-violet-700">
                          parcela {parcela}/{p.meses}
                        </span>
                      ) : atual < ini ? (
                        <span className="text-slate-500">começa em {mesCurto(ini)}</span>
                      ) : (
                        <span className="text-slate-400">encerrado</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-right">
                      <button className="icon-btn hover:text-rose-600" onClick={() => excluir(p)} title="Excluir período" aria-label="Excluir período">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!lista.length && <p className="p-8 text-center text-sm text-slate-400">Nenhum período cadastrado.</p>}
        </div>
      </div>
    </Modal>
  )
}
