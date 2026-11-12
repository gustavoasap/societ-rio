import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleCheck, FileSpreadsheet, FileUp, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData } from '../../lib/format'
import { baixarArquivo, gerarXlsxAbas, TIPO_XLSX } from '../../lib/planilha'
import { Modal } from '../../components/ui'
import { chaveMensal, hojeIso, type ClienteHon, type Linha } from './calculo'
import { decodificar, lerExtrato, sugerir, vencidosSemCredito, type ClienteRef, type Confianca, type Lancamento, type Nivel } from './extrato'
import { lerPdf } from './extratoPdf'
import { mesCurto, salvarMensal, valorTexto } from './util'

const COR: Record<Nivel, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  advertencia: 'bg-amber-50 text-amber-700 ring-amber-200',
  erro: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-slate-50 text-slate-500 ring-slate-200',
}
const ROTULO: Record<Nivel, string> = { ok: 'OK', advertencia: 'Advertência', erro: 'Erro', info: 'Informação' }

interface Item {
  lancamento: Lancamento
  cliente: ClienteRef | null
  chave: string
  marcado: boolean
  confianca: Confianca | null
  nivel: Nivel
  motivo: string
  tarifa: number
}

/**
 * Importa o extrato (PDF, OFX ou CSV) e faz a conciliação com a base: identifica o cliente de cada crédito,
 * sugere o honorário que ele paga e aponta erros e advertências.
 */
export function ImportarExtrato({
  abertos,
  usados,
  clientes,
  comHonorario,
  tarifaBoleto,
  onClose,
  onSalvo,
}: {
  abertos: Linha[]
  usados: Set<string>
  clientes: ClienteHon[]
  comHonorario: Set<string>
  /** Tarifa do boleto descontada no crédito */
  tarifaBoleto: number
  onClose: () => void
  onSalvo: () => void
}) {
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [itens, setItens] = useState<Item[]>([])
  const [ignorados, setIgnorados] = useState(0)
  const [vencidos, setVencidos] = useState<Linha[]>([])
  const [filtro, setFiltro] = useState<Nivel | ''>('')
  const [inativos, setInativos] = useState<ClienteRef[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feito, setFeito] = useState<number | null>(null)

  // Clientes inativos também entram na conciliação (para apontar quem pagou e está encerrado)
  useEffect(() => {
    supabase
      .from('adm_clientes')
      .select('id, codigo, razao_social, nome_fantasia, cnpj, responsavel, status')
      .eq('status', 'encerrado')
      .then(({ data }) => setInativos((data as ClienteRef[]) ?? []))
  }, [])

  const porChave = useMemo(() => new Map(abertos.map((l) => [chaveMensal(l.cliente.id, l.competencia), l])), [abertos])
  // Cada cliente aparece uma vez; o mês é ligado automaticamente ao mês do crédito no extrato
  const abertosPorCliente = useMemo(() => {
    const m = new Map<string, Linha[]>()
    for (const l of [...abertos].sort((a, b) => a.competencia.localeCompare(b.competencia))) m.set(l.cliente.id, [...(m.get(l.cliente.id) ?? []), l])
    return m
  }, [abertos])
  const opcoesClientes = useMemo(
    () =>
      [...abertosPorCliente.values()]
        .map((ls) => ls[0].cliente)
        .sort((a, b) => a.razao_social.localeCompare(b.razao_social))
        .map((c) => ({ value: c.id, label: `${String(c.codigo).padStart(3, '0')} ${c.razao_social}` })),
    [abertosPorCliente],
  )
  /** Honorário do cliente no mês do crédito; se já estiver pago, o mais antigo em aberto. */
  const linhaParaCredito = (clienteId: string, data: string) => {
    const ls = abertosPorCliente.get(clienteId) ?? []
    return ls.find((l) => l.competencia === data.slice(0, 7)) ?? ls[0]
  }

  async function ler(f: File) {
    setErro(null)
    setFeito(null)
    setLendo(true)
    try {
      const buf = await f.arrayBuffer()
      const pdf = /\.pdf$/i.test(f.name) || new Uint8Array(buf.slice(0, 4)).every((b, i) => b === [0x25, 0x50, 0x44, 0x46][i])
      const lancs = pdf ? await lerPdf(buf) : lerExtrato(f.name, decodificar(buf))
      if (!lancs.length)
        return setErro(
          pdf
            ? 'Não consegui ler lançamentos neste PDF (pode ser imagem escaneada ou um layout diferente). Se possível, exporte o extrato em OFX.'
            : 'Não encontrei lançamentos no arquivo. Use o extrato em PDF, OFX ou CSV exportado pelo banco.',
        )
      const creditos = lancs.filter((l) => l.valor > 0)
      const todos: ClienteRef[] = [...clientes, ...inativos]
      const sug = sugerir(creditos, abertos, usados, todos, comHonorario, tarifaBoleto)
      const datas = lancs.map((l) => l.data).sort()
      setArquivo(f.name)
      setIgnorados(lancs.length - creditos.length)
      setVencidos(vencidosSemCredito(abertos, sug, datas[0], datas[datas.length - 1], hojeIso()))
      setItens(
        sug.map((s) => ({
          lancamento: s.lancamento,
          cliente: s.cliente,
          chave: s.chave ?? '',
          marcado: s.confianca === 'alta',
          confianca: s.confianca,
          nivel: s.nivel,
          motivo: s.motivo,
          tarifa: s.tarifa,
        })),
      )
    } catch (e) {
      setErro(`Não foi possível ler o arquivo: ${e instanceof Error ? e.message : e}`)
    } finally {
      setLendo(false)
    }
  }

  // Escolha manual: se o crédito for o honorário menos a tarifa do boleto, considera pago integralmente
  const tarifaManual = (chave: string, credito: number) => {
    const l = chave ? porChave.get(chave) : undefined
    return l && tarifaBoleto > 0 && Math.abs(l.aberto - tarifaBoleto - credito) < 0.005 ? tarifaBoleto : 0
  }
  const alterar = (i: number, m: Partial<Item>) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ...m } : x)))
  const marcados = itens.filter((i) => i.marcado && i.chave)
  const repetidos = new Set(marcados.map((i) => i.chave)).size !== marcados.length
  const conta = (n: Nivel) => itens.filter((i) => i.nivel === n).length
  const soma = (l: Item[]) => l.reduce((s, i) => s + i.lancamento.valor, 0)
  const visiveis = itens.map((it, i) => ({ it, i })).filter(({ it }) => !filtro || it.nivel === filtro)

  async function aplicar() {
    if (repetidos) return setErro('Há dois créditos marcados para o mesmo honorário. Ajuste antes de confirmar.')
    setSalvando(true)
    const r = await Promise.all(
      marcados.map((i) => {
        const l = porChave.get(i.chave)!
        return salvarMensal(l.cliente.id, l.competencia, {
          recebido_em: i.lancamento.data,
          // Crédito com tarifa do boleto descontada: o honorário foi pago integralmente pelo cliente
          valor_recebido: Math.round((l.recebido + i.lancamento.valor + i.tarifa) * 100) / 100,
          origem: 'extrato',
          extrato_id: i.lancamento.id,
          extrato_descricao: i.lancamento.descricao.slice(0, 300),
          ...(i.tarifa ? { observacao: `Tarifa do boleto descontada no crédito: ${valorTexto(i.tarifa)}` } : {}),
        })
      }),
    )
    setSalvando(false)
    const falha = r.find((x) => x.error)
    if (falha?.error) return setErro(falha.error.code === '23505' ? 'Algum crédito deste extrato já tinha sido importado.' : falha.error.message)
    setFeito(marcados.length)
    onSalvo()
  }

  function relatorio() {
    const cod = (c: { codigo: number } | null | undefined) => (c ? String(c.codigo).padStart(3, '0') : '')
    const arq = gerarXlsxAbas([
      {
        aba: 'Conciliação',
        colunas: [
          { titulo: 'Data', tipo: 'data', largura: 12 },
          { titulo: 'Descrição no extrato', largura: 50 },
          { titulo: 'Valor', tipo: 'moeda', largura: 14 },
          { titulo: 'Resultado', largura: 13 },
          { titulo: 'Detalhe', largura: 50 },
          { titulo: 'Cód.', largura: 7 },
          { titulo: 'Cliente identificado', largura: 40 },
          { titulo: 'Honorário', largura: 40 },
        ],
        linhas: itens.map((i) => {
          const l = i.chave ? porChave.get(i.chave) : undefined
          return [
            i.lancamento.data,
            i.lancamento.descricao,
            i.lancamento.valor,
            { valor: ROTULO[i.nivel], destaque: i.nivel === 'erro' ? 'negativo' : i.nivel === 'ok' ? 'positivo' : undefined },
            i.motivo,
            cod(i.cliente ?? l?.cliente),
            (i.cliente ?? l?.cliente)?.razao_social ?? '',
            l ? `${mesCurto(l.competencia)} · ${valorTexto(l.aberto)}` : '',
          ]
        }),
      },
      {
        aba: 'Vencidos sem crédito',
        colunas: [
          { titulo: 'Cód.', largura: 7 },
          { titulo: 'Cliente', largura: 42 },
          { titulo: 'Competência', largura: 12 },
          { titulo: 'Vencimento', tipo: 'data', largura: 12 },
          { titulo: 'Em aberto', tipo: 'moeda', largura: 14 },
        ],
        linhas: vencidos.map((l) => [cod(l.cliente), l.cliente.razao_social, mesCurto(l.competencia), l.vencimento, l.aberto]),
      },
    ])
    baixarArquivo(`conciliacao-extrato-${hojeIso()}.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  const cartoes: { n: Nivel | ''; rotulo: string; qtd: number; valor?: number; cor: string; icone: typeof Check }[] = [
    { n: '', rotulo: 'Créditos no extrato', qtd: itens.length, valor: soma(itens), cor: 'text-slate-800', icone: FileUp },
    { n: 'ok', rotulo: 'Conferidos', qtd: conta('ok'), valor: soma(itens.filter((i) => i.nivel === 'ok')), cor: 'text-emerald-700', icone: CircleCheck },
    { n: 'advertencia', rotulo: 'Advertências', qtd: conta('advertencia'), cor: 'text-amber-700', icone: AlertTriangle },
    { n: 'erro', rotulo: 'Erros', qtd: conta('erro'), cor: 'text-rose-600', icone: XCircle },
  ]

  return (
    <Modal
      title="Importar extrato bancário"
      subtitulo="Conciliação dos créditos com a Base de Clientes e marcação dos honorários recebidos"
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          {itens.length > 0 && (
            <button className="btn-secondary mr-auto" onClick={relatorio}>
              <FileSpreadsheet className="h-4 w-4" />
              Relatório da conciliação
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {itens.length > 0 && feito === null && (
            <button className="btn-primary from-emerald-500 to-emerald-600" onClick={aplicar} disabled={salvando || !marcados.length}>
              <Check className="h-4 w-4" />
              {salvando ? 'Marcando...' : `Marcar ${marcados.length} honorário(s) como recebido(s)`}
            </button>
          )}
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {feito !== null && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {feito} honorário(s) marcado(s) como recebido(s) com a data do crédito.
        </p>
      )}
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center hover:border-brand-400">
        <FileUp className={`h-8 w-8 text-brand-500 ${lendo ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-semibold text-slate-700">
          {lendo ? 'Lendo o extrato...' : arquivo ? `Arquivo: ${arquivo} (clique para trocar)` : 'Clique para escolher o extrato'}
        </span>
        <span className="text-xs text-slate-500">PDF, OFX ou CSV. O OFX é o mais preciso; no PDF a leitura depende do layout do banco.</span>
        <input
          type="file"
          accept=".pdf,.ofx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) ler(f)
            e.target.value = ''
          }}
        />
      </label>

      {itens.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {cartoes.map((c) => (
              <button
                key={c.rotulo}
                onClick={() => setFiltro(c.n)}
                className={`cursor-pointer rounded-2xl bg-white p-4 text-left ring-1 transition ${filtro === c.n ? 'ring-2 ring-brand-500' : 'ring-slate-200/70 hover:ring-slate-300'}`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <c.icone className={`h-3.5 w-3.5 ${c.cor}`} />
                  {c.rotulo}
                </div>
                <div className={`mt-1 text-xl font-extrabold tabular-nums ${c.cor}`}>{c.qtd}</div>
                {c.valor !== undefined && <div className="text-xs text-slate-500 tabular-nums">{valorTexto(c.valor)}</div>}
              </button>
            ))}
          </div>
          {ignorados > 0 && <p className="text-xs text-slate-400">{ignorados} débito(s) do extrato ignorado(s).</p>}

          <div className="rounded-2xl bg-white ring-1 ring-slate-200/70">
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                  <tr className="border-b border-slate-100">
                    <th className="w-10 px-3 py-2" />
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Descrição no extrato</th>
                    <th className="px-2 py-2 text-right">Valor</th>
                    <th className="px-2 py-2">Conciliação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visiveis.map(({ it, i }) => {
                    const l = it.chave ? porChave.get(it.chave) : undefined
                    return (
                      <tr key={it.lancamento.id + i} className={it.marcado ? 'bg-emerald-50/40' : ''}>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-emerald-600"
                            checked={it.marcado}
                            disabled={!it.chave}
                            onChange={(e) => alterar(i, { marcado: e.target.checked })}
                            aria-label="Marcar este crédito"
                          />
                        </td>
                        <td className="px-2 py-2 align-top whitespace-nowrap">{formatarData(it.lancamento.data)}</td>
                        <td className="max-w-72 px-2 py-2 align-top text-xs text-slate-600">{it.lancamento.descricao || '—'}</td>
                        <td className="px-2 py-2 text-right align-top font-semibold whitespace-nowrap tabular-nums">{valorTexto(it.lancamento.valor)}</td>
                        <td className="min-w-96 px-2 py-2">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ring-1 ${COR[it.nivel]}`}>{ROTULO[it.nivel]}</span>
                            <span className="text-xs text-slate-600">{it.motivo}</span>
                          </div>
                          {it.cliente && !l && (
                            <div className="mb-1 text-xs text-slate-500">
                              Cliente: <b>{String(it.cliente.codigo).padStart(3, '0')}</b> {it.cliente.razao_social}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            <select
                              className="input min-w-56 flex-1 py-1.5 text-xs"
                              value={l?.cliente.id ?? ''}
                              onChange={(e) => {
                                const linha = e.target.value ? linhaParaCredito(e.target.value, it.lancamento.data) : undefined
                                const chave = linha ? chaveMensal(linha.cliente.id, linha.competencia) : ''
                                alterar(i, {
                                  chave,
                                  marcado: !!chave,
                                  confianca: null,
                                  nivel: chave ? 'ok' : it.nivel,
                                  motivo: chave ? 'Escolhido à mão' : it.motivo,
                                  tarifa: tarifaManual(chave, it.lancamento.valor),
                                })
                              }}
                            >
                              <option value="">— Não é honorário / não marcar —</option>
                              {opcoesClientes.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            {l && (
                              <select
                                className="input w-auto py-1.5 text-xs"
                                value={it.chave}
                                title="Competência do honorário"
                                onChange={(e) => alterar(i, { chave: e.target.value, tarifa: tarifaManual(e.target.value, it.lancamento.valor) })}
                              >
                                {(abertosPorCliente.get(l.cliente.id) ?? []).map((x) => (
                                  <option key={x.competencia} value={chaveMensal(x.cliente.id, x.competencia)}>
                                    {mesCurto(x.competencia)} · {valorTexto(x.aberto)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {!visiveis.length && <p className="p-8 text-center text-sm text-slate-400">Nenhum crédito nesta categoria.</p>}
            </div>
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Os conferidos já vêm marcados. Confira as advertências e os erros, escolha o honorário certo quando for o caso. O mesmo crédito não é importado
              duas vezes.
            </p>
          </div>

          {vencidos.length > 0 && (
            <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200">
              <b>
                {vencidos.length} honorário(s) vencido(s) no período do extrato sem crédito correspondente (
                {valorTexto(vencidos.reduce((s, l) => s + l.aberto, 0))})
              </b>
              <ul className="mt-2 grid gap-x-6 gap-y-0.5 text-xs sm:grid-cols-2">
                {vencidos.map((l) => (
                  <li key={chaveMensal(l.cliente.id, l.competencia)} className="truncate">
                    <span className="font-mono">{String(l.cliente.codigo).padStart(3, '0')}</span> {l.cliente.razao_social} · {mesCurto(l.competencia)} ·{' '}
                    {valorTexto(l.aberto)} · venceu {formatarData(l.vencimento)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
