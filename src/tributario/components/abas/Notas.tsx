import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, ReceiptText, RotateCcw, Search, XCircle } from 'lucide-react'
import { Section } from '../../../components/ui'
import { chavesNotasFiltradas, listarNotasPagina, resumoNotasImportadas, type FiltroNotas, type NotaLista, type ResumoNotasMes } from '../../dados'
import { nomeMes } from '../../engine/base'
import type { AjusteNota, NotaDetalhe, NotaResumo } from '../../engine/notas'
import type { Estabelecimento } from '../../engine/tipos'
import { moeda } from '../../formatacao'
import { Kpi } from '../comum'

const POR_PAGINA = 100
const dataBr = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '—')
const novoAjuste = (chave: string, a?: AjusteNota | null): AjusteNota => a ?? { chave, data: null, cfop: null, excluir: false, observacao: '' }
const NOME_TIPO: Record<string, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  servico_tomado: 'Serv. tomado',
  servico_prestado: 'Serv. prestado',
}

type Situacao = FiltroNotas['situacao']
const mudaCalculo = (n: NotaLista) => {
  const a = n.ajuste
  return !!a && (a.excluir || (!!a.data && a.data.slice(0, 7) !== n.competencia) || (!!a.cfop && a.cfop !== n.cfops))
}

/** Resumo por mês (entradas × saídas), como importado e depois dos ajustes. */
function porMes(linhas: ResumoNotasMes[]) {
  const vazio = () => ({ entradas: 0, valorEntradas: 0, saidas: 0, valorSaidas: 0, ajustadas: 0, excluidas: 0 })
  const m = new Map<string, { competencia: string; original: ReturnType<typeof vazio>; ajustado: ReturnType<typeof vazio> }>()
  for (const r of linhas) {
    const x = m.get(r.competencia) ?? { competencia: r.competencia, original: vazio(), ajustado: vazio() }
    const entrada = r.tipo === 'entrada' || r.tipo === 'servico_tomado'
    if (entrada) {
      x.original.entradas += r.notas
      x.original.valorEntradas += r.valor
      x.ajustado.entradas += r.notas_aj
      x.ajustado.valorEntradas += r.valor_aj
    } else {
      x.original.saidas += r.notas
      x.original.valorSaidas += r.valor
      x.ajustado.saidas += r.notas_aj
      x.ajustado.valorSaidas += r.valor_aj
    }
    x.ajustado.ajustadas += r.ajustadas
    x.ajustado.excluidas += r.excluidas
    m.set(r.competencia, x)
  }
  return [...m.values()].sort((a, b) => a.competencia.localeCompare(b.competencia))
}

/** Resumo da movimentação importada, nota a nota, com os ajustes do contador (data, CFOP, considerar ou não). O resumo e a lista vêm prontos do banco. */
export function Notas({
  empresaId,
  estabelecimentos,
  ajustes,
  notasDetalhe,
  onAjustes,
}: {
  empresaId: string
  estabelecimentos: Estabelecimento[]
  ajustes: Record<string, AjusteNota>
  notasDetalhe: NotaDetalhe[]
  onAjustes: (lista: AjusteNota[]) => Promise<void>
}) {
  const [resumoBanco, setResumo] = useState<{ versao: number; linhas: ResumoNotasMes[] } | null>(null)
  const [pag, setPag] = useState<{ chave: string; notas: NotaLista[]; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [versao, setVersao] = useState(0)
  const [tipo, setTipo] = useState('')
  const [mes, setMes] = useState('')
  const [cfop, setCfop] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAtiva, setBuscaAtiva] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('todas')
  const [pagina, setPagina] = useState(0)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<string | null>(null)
  const [dataLote, setDataLote] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setBuscaAtiva(busca), 350)
    return () => clearTimeout(t)
  }, [busca])
  const filtro: FiltroNotas = useMemo(() => ({ tipo, mes, cfop, busca: buscaAtiva, situacao }), [tipo, mes, cfop, buscaAtiva, situacao])
  const chavePagina = JSON.stringify([filtro, pagina, versao])

  useEffect(() => {
    let vivo = true
    resumoNotasImportadas(empresaId)
      .then((linhas) => vivo && setResumo({ versao, linhas }))
      .catch((e: Error) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [empresaId, versao])
  useEffect(() => {
    let vivo = true
    listarNotasPagina(empresaId, filtro, pagina, POR_PAGINA)
      .then((r) => vivo && setPag({ chave: chavePagina, ...r }))
      .catch((e: Error) => vivo && setErro(e.message))
    return () => {
      vivo = false
    }
  }, [empresaId, filtro, pagina, chavePagina])

  const buscando = !pag || pag.chave !== chavePagina
  const resumo = useMemo(() => porMes(resumoBanco?.linhas ?? []), [resumoBanco])
  const visiveis = pag?.notas ?? []
  const totalFiltradas = pag?.total ?? 0
  const paginas = Math.max(1, Math.ceil(totalFiltradas / POR_PAGINA))
  const comDetalhe = new Set(notasDetalhe.map((n) => n.chave))
  const semNota = Object.keys(ajustes).filter((k) => !comDetalhe.has(k))
  const nomeEstab = (id?: string | null) => estabelecimentos.find((e) => e.id === id)?.nome ?? ''
  const meses = resumo.map((r) => r.competencia)
  const total = resumo.reduce(
    (s, r) => ({
      notas: s.notas + r.original.entradas + r.original.saidas,
      ajustadas: s.ajustadas + r.ajustado.ajustadas,
      fora: s.fora + r.ajustado.excluidas,
    }),
    { notas: 0, ajustadas: 0, fora: 0 },
  )
  
  async function salvar(lista: AjusteNota[]) {
    setSalvando(true)
    setErro(null)
    try {
      await onAjustes(lista)
      setMarcadas(new Set())
      setVersao((v) => v + 1)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }
  const emLote = async (f: (a: AjusteNota) => AjusteNota) => {
    setSalvando(true)
    try {
      const chaves = marcadas.size ? [...marcadas] : await chavesNotasFiltradas(empresaId, filtro, totalFiltradas)
      await salvar(chaves.map((k) => f(novoAjuste(k, ajustes[k]))))
    } catch (e) {
      setErro((e as Error).message)
      setSalvando(false)
    }
  }
  const alternar = (k: string) =>
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  if (erro && !resumoBanco) return <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>
  if (!resumoBanco)
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando as notas importadas...
      </div>
    )
  if (!resumo.length)
    return (
      <Section title="Notas importadas" icone={ReceiptText}>
        <p className="text-sm text-slate-600">
          Nenhuma nota disponível. As notas são guardadas na importação dos <strong>Registros de Entradas e de Saídas detalhados</strong> — reimporte-os (exclua a importação antiga
          na aba Importar e envie o arquivo de novo) para ver o resumo nota a nota e poder ajustar data, CFOP e o que entra na análise.
        </p>
      </Section>
    )

  const alvoLote = marcadas.size ? `${marcadas.size} nota(s) marcada(s)` : `${totalFiltradas.toLocaleString('pt-BR')} nota(s) filtrada(s)`

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi titulo="Notas importadas" valor={total.notas.toLocaleString('pt-BR')} detalhe={`${meses.length} competência(s)`} icone={<ReceiptText className="h-4 w-4" />} />
        <Kpi titulo="Notas ajustadas" valor={total.ajustadas.toLocaleString('pt-BR')} detalhe="data ou CFOP alterados" tom="violet" icone={<CalendarDays className="h-4 w-4" />} />
        <Kpi
          titulo="Fora da análise"
          valor={total.fora.toLocaleString('pt-BR')}
          detalhe="não entram nos tributos, DRE e estoque"
          tom="amber"
          icone={<XCircle className="h-4 w-4" />}
        />
      </div>

      <Section title="Resumo da movimentação importada" icone={ReceiptText}>
        <p className="-mt-2 mb-3 text-sm text-slate-500">
          Quantidade e valor das notas por competência, como importadas e depois dos seus ajustes. Clique no mês para ver as notas dele. Os ajustes valem para toda a ferramenta
          (apuração, DRE, ICMS, estoque e CMV) e continuam valendo se o relatório for reimportado.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-right text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-3 text-left">Competência</th>
                <th className="px-3 py-2">Entradas (notas)</th>
                <th className="px-3 py-2">Entradas (valor)</th>
                <th className="px-3 py-2">Saídas (notas)</th>
                <th className="px-3 py-2">Saídas (valor)</th>
                <th className="px-3 py-2">Ajustadas</th>
                <th className="px-3 py-2">Fora</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {resumo.map(({ competencia, original: o, ajustado: a }) => {
                const dif = (x: number, y: number, f: (v: number) => string) =>
                  Math.abs(x - y) > 0.005 ? (
                    <>
                      <span className="mr-1 text-xs text-slate-400 line-through">{f(x)}</span>
                      <span className="font-semibold text-violet-700">{f(y)}</span>
                    </>
                  ) : (
                    f(y)
                  )
                const n = (v: number) => v.toLocaleString('pt-BR')
                return (
                  <tr
                    key={competencia}
                    className={`cursor-pointer border-b border-slate-100 text-right hover:bg-slate-50 ${mes === competencia ? 'bg-brand-50/50' : ''}`}
                    onClick={() => {
                      setMes(mes === competencia ? '' : competencia)
                      setPagina(0)
                    }}
                  >
                    <td className="py-1.5 pr-3 text-left font-medium">{nomeMes(competencia)}</td>
                    <td className="px-3 py-1.5">{dif(o.entradas, a.entradas, n)}</td>
                    <td className="px-3 py-1.5">{dif(o.valorEntradas, a.valorEntradas, moeda)}</td>
                    <td className="px-3 py-1.5">{dif(o.saidas, a.saidas, n)}</td>
                    <td className="px-3 py-1.5">{dif(o.valorSaidas, a.valorSaidas, moeda)}</td>
                    <td className={`px-3 py-1.5 ${a.ajustadas ? 'text-violet-700' : 'text-slate-300'}`}>{a.ajustadas || '—'}</td>
                    <td className={`px-3 py-1.5 ${a.excluidas ? 'text-amber-700' : 'text-slate-300'}`}>{a.excluidas || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Notas" icone={ReceiptText} cor="sky" actions={salvando ? <Loader2 className="h-5 w-5 animate-spin text-brand-500" /> : undefined}>
        {erro && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</div>}
        {semNota.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {semNota.length} ajuste(s) de notas que não estão mais importadas — não mudam o cálculo.
          </div>
        )}
        <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Número da nota, fornecedor/cliente ou CNPJ..."
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(0)
              }}
            />
          </div>
          <select className="input" value={tipo} onChange={(e) => (setTipo(e.target.value), setPagina(0))}>
            <option value="">Entradas e saídas</option>
            <option value="entrada">Entradas</option>
            <option value="saida">Saídas</option>
          </select>
          <select className="input" value={mes} onChange={(e) => (setMes(e.target.value), setPagina(0))}>
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {nomeMes(m)}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input className="input" placeholder="CFOP" value={cfop} maxLength={4} onChange={(e) => (setCfop(e.target.value.replace(/\D/g, '')), setPagina(0))} />
            <select className="input" value={situacao} onChange={(e) => (setSituacao(e.target.value as Situacao), setPagina(0))}>
              <option value="todas">Todas</option>
              <option value="consideradas">Consideradas</option>
              <option value="ajustadas">Com ajuste</option>
              <option value="fora">Fora da análise</option>
            </select>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
          <span className="font-semibold text-slate-600">
            Aplicar a {alvoLote}:
          </span>
          <button className="btn-secondary btn-sm" disabled={salvando} onClick={() => emLote((a) => ({ ...a, excluir: true }))}>
            <XCircle className="h-3.5 w-3.5" /> Tirar da análise
          </button>
          <button className="btn-secondary btn-sm" disabled={salvando} onClick={() => emLote((a) => ({ ...a, excluir: false }))}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Considerar
          </button>
          <span className="flex items-center gap-1">
            <input className="input w-40 py-1" type="date" value={dataLote} onChange={(e) => setDataLote(e.target.value)} />
            <button className="btn-secondary btn-sm" disabled={salvando || !dataLote} onClick={() => emLote((a) => ({ ...a, data: dataLote }))}>
              <CalendarDays className="h-3.5 w-3.5" /> Mudar a data
            </button>
          </span>
          <button
            className="btn-secondary btn-sm"
            disabled={salvando}
            onClick={() =>
              emLote((a) => ({
                ...a,
                data: null,
                cfop: null,
                excluir: false,
                observacao: '',
              }))
            }
          >
            <RotateCcw className="h-3.5 w-3.5" /> Desfazer ajustes
          </button>
          {marcadas.size > 0 && (
            <button className="text-xs font-semibold text-slate-500 hover:text-slate-800" onClick={() => setMarcadas(new Set())}>
              limpar seleção
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className={`w-full min-w-[64rem] text-sm transition-opacity ${buscando ? 'opacity-50' : ''}`}>
            <thead>
              <tr className="border-b border-slate-200 text-left text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={visiveis.length > 0 && visiveis.every((n) => marcadas.has(n.chave))}
                    onChange={(e) =>
                      setMarcadas((s) => {
                        const n = new Set(s)
                        for (const v of visiveis) {
                          if (e.target.checked) n.add(v.chave)
                          else n.delete(v.chave)
                        }
                        return n
                      })
                    }
                  />
                </th>
                <th className="px-2 py-2">Data</th>
                <th className="px-2 py-2">Tipo</th>
                <th className="px-2 py-2">NF</th>
                <th className="px-2 py-2">Fornecedor / cliente</th>
                <th className="px-2 py-2">CFOP</th>
                <th className="px-2 py-2 text-right">Itens</th>
                <th className="px-2 py-2 text-right">Valor</th>
                <th className="px-2 py-2">Considerar</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {visiveis.map((n) => {
                const a = n.ajuste ?? undefined
                const aberta = editando === n.chave
                return (
                  <FragmentoNota
                    key={n.chave}
                    nota={n}
                    ajuste={a}
                    muda={mudaCalculo(n)}
                    aberta={aberta}
                    marcada={marcadas.has(n.chave)}
                    estab={estabelecimentos.length > 1 ? nomeEstab(n.estabelecimento_id) : ''}
                    salvando={salvando}
                    onMarcar={() => alternar(n.chave)}
                    onAbrir={() => setEditando(aberta ? null : n.chave)}
                    onSalvar={async (x) => {
                      await salvar([x])
                      setEditando(null)
                    }}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
          <span>
            {buscando ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" /> buscando...
              </span>
            ) : (
              `${totalFiltradas.toLocaleString('pt-BR')} nota(s)`
            )}
          </span>
          {paginas > 1 && (
            <span className="flex items-center gap-2">
              <button className="btn-secondary btn-sm" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              {pagina + 1} de {paginas}
              <button className="btn-secondary btn-sm" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>
                Próxima
              </button>
            </span>
          )}
        </div>
      </Section>
    </div>
  )
}

function FragmentoNota({
  nota: n,
  ajuste: a,
  muda,
  aberta,
  marcada,
  estab,
  salvando,
  onMarcar,
  onAbrir,
  onSalvar,
}: {
  nota: NotaResumo
  ajuste: AjusteNota | undefined
  muda: boolean
  aberta: boolean
  marcada: boolean
  estab: string
  salvando: boolean
  onMarcar: () => void
  onAbrir: () => void
  onSalvar: (a: AjusteNota) => Promise<void>
}) {
  const fora = !!a?.excluir
  return (
    <>
      <tr className={`border-b border-slate-100 ${fora ? 'bg-slate-50 text-slate-400' : muda ? 'bg-violet-50/50' : ''}`}>
        <td className="py-1.5 pr-2">
          <input type="checkbox" checked={marcada} onChange={onMarcar} />
        </td>
        <td className="px-2 py-1.5 whitespace-nowrap">
          {a?.data && a.data !== n.data ? (
            <>
              <span className="mr-1 text-xs line-through">{dataBr(n.data)}</span>
              <span className="font-semibold text-violet-700">{dataBr(a.data)}</span>
            </>
          ) : (
            dataBr(n.data)
          )}
        </td>
        <td className="px-2 py-1.5 text-xs">{NOME_TIPO[n.tipo] ?? n.tipo}</td>
        <td className={`px-2 py-1.5 font-medium ${fora ? 'line-through' : ''}`}>{n.nota}</td>
        <td className="max-w-72 px-2 py-1.5">
          <span className="block truncate" title={n.parceiro_nome}>
            {n.parceiro_nome || '—'}
          </span>
          {(estab || a?.observacao) && <span className="block truncate text-[0.6875rem] text-slate-500">{[estab, a?.observacao].filter(Boolean).join(' · ')}</span>}
        </td>
        <td className="px-2 py-1.5 text-xs">
          {a?.cfop ? (
            <>
              <span className="mr-1 line-through">{n.cfops}</span>
              <span className="font-semibold text-violet-700">{a.cfop}</span>
            </>
          ) : (
            n.cfops.replace(/,/g, ', ')
          )}
        </td>
        <td className="px-2 py-1.5 text-right">{n.itens}</td>
        <td className="px-2 py-1.5 text-right">{moeda(n.valor)}</td>
        <td className="px-2 py-1.5">
          <input
            type="checkbox"
            checked={!fora}
            disabled={salvando}
            title={fora ? 'Fora da análise' : 'Entra na análise'}
            onChange={() => onSalvar({ ...novoAjuste(n.chave, a), excluir: !fora })}
          />
        </td>
        <td className="px-2 py-1.5 text-right">
          <button className="text-xs font-semibold text-brand-600 hover:text-brand-800" onClick={onAbrir}>
            {aberta ? 'Fechar' : 'Ajustar'}
          </button>
        </td>
      </tr>
      {aberta && <EditorNota nota={n} ajuste={a} salvando={salvando} onSalvar={onSalvar} />}
    </>
  )
}

function EditorNota({
  nota: n,
  ajuste: a,
  salvando,
  onSalvar,
}: {
  nota: NotaResumo
  ajuste: AjusteNota | undefined
  salvando: boolean
  onSalvar: (a: AjusteNota) => Promise<void>
}) {
  const [f, setF] = useState<AjusteNota>(() => novoAjuste(n.chave, a))
  return (
    <tr className="border-b border-slate-200 bg-slate-50">
      <td />
      <td colSpan={9} className="px-2 py-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">
            Data considerada
            <input
              className="input mt-1 w-44"
              type="date"
              value={f.data ?? n.data}
              onChange={(e) =>
                setF({
                  ...f,
                  data: e.target.value && e.target.value !== n.data ? e.target.value : null,
                })
              }
            />
          </label>
          <label className="text-xs font-semibold text-slate-600">
            CFOP considerado
            <input
              className="input mt-1 w-28"
              maxLength={4}
              placeholder={n.cfops.split(',')[0]}
              value={f.cfop ?? ''}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '')
                setF({ ...f, cfop: v || null })
              }}
            />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={!f.excluir} onChange={(e) => setF({ ...f, excluir: !e.target.checked })} /> Considerar na análise
          </label>
          <label className="min-w-64 flex-1 text-xs font-semibold text-slate-600">
            Observação
            <input className="input mt-1" value={f.observacao} placeholder="Motivo do ajuste" onChange={(e) => setF({ ...f, observacao: e.target.value })} />
          </label>
          <button className="btn-primary btn-sm" disabled={salvando || (!!f.cfop && f.cfop.length !== 4)} onClick={() => onSalvar(f)}>
            Salvar
          </button>
          {a && (
            <button
              className="btn-secondary btn-sm"
              disabled={salvando}
              onClick={() =>
                onSalvar({
                  chave: n.chave,
                  data: null,
                  cfop: null,
                  excluir: false,
                  observacao: '',
                })
              }
            >
              <RotateCcw className="h-3.5 w-3.5" /> Desfazer
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          A nota sai de {nomeMes(n.competencia)} e passa para o mês da nova data; o novo CFOP vale para todos os itens dela (natureza, créditos e estoque seguem o CFOP).
        </p>
      </td>
    </tr>
  )
}
