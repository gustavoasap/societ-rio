import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, ListPlus, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData, formatarMoeda } from '../../lib/format'
import { Field, Modal, Select } from '../../components/ui'
import { lerXlsx } from '../../tributario/importacao/xlsx'
import type { Parceiro } from '../../types'
import { NOVO_CLIENTE, lerPlanilhaLote, lerTextoLote, temErro, validarLote, type EntradaLote, type LinhaLote } from './lote'
import type { Caucao } from './tipos'

const hojeISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function RecebimentoLote({
  caucoes,
  parceiros,
  onClose,
  onFeito,
}: {
  caucoes: Caucao[]
  parceiros: Parceiro[]
  onClose: () => void
  onFeito: (msg: string) => void
}) {
  const [data, setData] = useState(hojeISO)
  const [pagador, setPagador] = useState('')
  const [texto, setTexto] = useState('')
  const [deArquivo, setDeArquivo] = useState<{ nome: string; entradas: EntradaLote[] } | null>(null)
  const [escolhas, setEscolhas] = useState<Map<number, string>>(new Map())
  const [desmarcadas, setDesmarcadas] = useState<Set<number>>(new Set())
  const [erro, setErro] = useState<string | null>(null)
  const [gravando, setGravando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  const nomeParceiro = (id: string | null) => parceiros.find((p) => p.id === id)?.nome ?? ''
  const entradas = useMemo(() => deArquivo?.entradas ?? lerTextoLote(texto), [deArquivo, texto])
  const linhas = useMemo(
    () =>
      validarLote(entradas, caucoes, {
        dataPadrao: data || null,
        hoje: hojeISO(),
        escolhas,
        nomeParceiro,
        pagador: !pagador ? undefined : pagador === 'cliente' ? { tipo: 'cliente' } : { tipo: 'parceiro', parceiroId: pagador, nome: nomeParceiro(pagador) },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entradas, caucoes, data, escolhas, pagador, parceiros],
  )

  const prontas = linhas.filter((l) => !temErro(l) && !desmarcadas.has(l.linha))
  const comErro = linhas.filter(temErro).length
  const comAlerta = linhas.filter((l) => !temErro(l) && l.problemas.length).length
  const total = prontas.reduce((s, l) => s + (l.valor ?? 0), 0)

  const aguardando = caucoes.filter((c) => !c.data_recebimento && !c.data_apropriacao)

  function adicionarAguardando() {
    setDeArquivo(null)
    const ja = new Set(linhas.map((l) => l.caucao?.id))
    const novos = aguardando
      .filter((c) => !ja.has(c.id))
      .map((c) => (c.valor_caucao ? `${c.cliente}\t${c.valor_caucao.toFixed(2).replace('.', ',')}` : c.cliente))
    setTexto((t) => [t.trim(), ...novos].filter(Boolean).join('\n'))
  }

  async function carregarArquivo(f: File) {
    setErro(null)
    setEscolhas(new Map())
    setDesmarcadas(new Set())
    try {
      if (/\.xlsx$/i.test(f.name)) {
        const e = lerPlanilhaLote(lerXlsx(new Uint8Array(await f.arrayBuffer())))
        if (!e.length) return setErro('Não encontrei linhas com nome de cliente na planilha.')
        setDeArquivo({ nome: f.name, entradas: e })
      } else {
        setDeArquivo(null)
        setTexto(await f.text())
      }
    } catch (e) {
      setErro(`Não consegui ler o arquivo: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function gravar() {
    if (!prontas.length) return
    setGravando(true)
    setErro(null)
    const resp =
      pagador === ''
        ? {}
        : pagador === 'cliente'
          ? { responsavel_tipo: 'cliente', responsavel_parceiro_id: null }
          : { responsavel_tipo: 'parceiro', responsavel_parceiro_id: pagador }
    const resultados = await Promise.all(
      prontas.map((l) =>
        l.novo
          ? supabase.from('soc_caucoes').insert({ cliente: l.nomeDigitado.trim(), valor_caucao: l.valor, data_recebimento: l.data, ...resp })
          : supabase
              .from('soc_caucoes')
              .update({ valor_caucao: l.valor, data_recebimento: l.data, ...resp })
              .eq('id', l.caucao!.id),
      ),
    )
    setGravando(false)
    const falhas = resultados.map((r, i) => (r.error ? `${prontas[i].caucao?.cliente ?? prontas[i].nomeDigitado}: ${r.error.message}` : null)).filter(Boolean)
    if (falhas.length) {
      setErro(`${resultados.length - falhas.length} gravado(s). Falharam: ${falhas.join('; ')}`)
      return
    }
    onFeito(`${prontas.length} recebimento(s) gravado(s), total ${formatarMoeda(total)}.`)
  }

  const escolher = (l: LinhaLote, id: string) =>
    setEscolhas((m) => {
      const n = new Map(m)
      if (id) n.set(l.linha, id)
      else n.delete(l.linha)
      return n
    })

  const alternar = (n: number) =>
    setDesmarcadas((s) => {
      const x = new Set(s)
      if (x.has(n)) x.delete(n)
      else x.add(n)
      return x
    })

  return (
    <Modal
      title="Recebimento em lote"
      subtitulo="Cole a lista de quem pagou, confira os apontamentos e grave tudo de uma vez"
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          <div className="mr-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold text-emerald-700">
              {prontas.length} pronto(s) · {formatarMoeda(total)}
            </span>
            {comAlerta > 0 && <span className="text-amber-700">{comAlerta} com alerta</span>}
            {comErro > 0 && <span className="font-semibold text-rose-600">{comErro} com erro (não serão gravados)</span>}
          </div>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={gravar} disabled={gravando || !prontas.length}>
            <CheckCircle2 className="h-4 w-4" />
            {gravando ? 'Gravando...' : `Gravar ${prontas.length} recebimento(s)`}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-800">Lista de recebimentos</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={adicionarAguardando}
                disabled={!aguardando.length}
                title="Coloca na lista todos que ainda não têm recebimento"
              >
                <ListPlus className="h-4 w-4" />
                Puxar os {aguardando.length} aguardando
              </button>
              <button type="button" className="btn-secondary btn-sm" onClick={() => arquivo.current?.click()}>
                <Upload className="h-4 w-4" />
                Carregar Excel/CSV
              </button>
              <input
                ref={arquivo}
                type="file"
                accept=".xlsx,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) carregarArquivo(f)
                  e.target.value = ''
                }}
              />
            </div>
          </div>
          {deArquivo ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800 ring-1 ring-brand-100">
              <span>
                Arquivo <b>{deArquivo.nome}</b>: {deArquivo.entradas.length} linha(s) lida(s).
              </span>
              <button className="text-xs font-semibold underline" onClick={() => setDeArquivo(null)}>
                Usar texto colado
              </button>
            </div>
          ) : (
            <textarea
              id="lote-texto"
              className="input min-h-36 font-mono text-xs"
              placeholder={
                'Uma linha por cliente. Pode colar direto do Excel ou do extrato:\n\nPadaria Pão Quente\t1.200,00\t05/11/2026\nTechSoft Sistemas; 2.500,00\nClínica Odonto Sorriso\n\nSem valor → usa o valor já cadastrado. Sem data → usa a data geral.'
              }
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value)
                setDesmarcadas(new Set())
              }}
            />
          )}
        </div>

        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <Field label="Data do pagamento / recebimento">
            <input id="lote-data" type="date" className="input" value={data} onChange={(e) => setData(e.target.value)} />
          </Field>
          <p className="-mt-1 text-xs text-slate-500">Vale para as linhas sem data. Linha com data própria usa a dela.</p>
          <Field label="Quem pagou">
            <Select
              value={pagador}
              onChange={setPagador}
              vazio="Conforme o cadastro de cada cliente"
              opcoes={[{ value: 'cliente', label: 'Próprio cliente (todos)' }, ...parceiros.map((p) => ({ value: p.id, label: `Parceiro: ${p.nome}` }))]}
            />
          </Field>
          <p className="-mt-1 text-xs text-slate-500">
            Escolha um parceiro quando ele pagou o boleto de vários clientes de uma vez. Quem estiver diferente no cadastro é apontado.
          </p>
        </div>
      </div>

      {linhas.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
          <div className="overflow-x-auto">
            <table className="w-full text-[0.8125rem]">
              <thead className="border-b border-slate-100 text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="w-10 py-2.5 pl-4" />
                  <th className="px-2 py-2.5">Linha</th>
                  <th className="px-3 py-2.5">Na lista</th>
                  <th className="px-3 py-2.5">Cliente no cadastro</th>
                  <th className="px-3 py-2.5 text-right">Valor</th>
                  <th className="px-3 py-2.5">Data</th>
                  <th className="py-2.5 pr-4 pl-3">Apontamentos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => {
                  const erroL = temErro(l)
                  const marcada = !erroL && !desmarcadas.has(l.linha)
                  const opcoes = [
                    ...(l.nomeDigitado ? [{ value: NOVO_CLIENTE, label: `+ Cadastrar "${l.nomeDigitado}" como novo` }] : []),
                    ...(l.candidatos.length ? l.candidatos : caucoes).map((c) => ({ value: c.id, label: c.cliente })),
                  ]
                  return (
                    <tr key={l.linha} className={erroL ? 'bg-rose-50/50' : l.problemas.length ? 'bg-amber-50/40' : ''}>
                      <td className="py-2 pl-4">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-brand-600"
                          checked={marcada}
                          disabled={erroL}
                          onChange={() => alternar(l.linha)}
                          title={erroL ? 'Corrija o erro para incluir' : 'Incluir na gravação'}
                        />
                      </td>
                      <td className="px-2 py-2 text-slate-400 tabular-nums">{l.linha}</td>
                      <td className="max-w-48 px-3 py-2 text-slate-600">{l.nomeDigitado || <span className="text-slate-300">—</span>}</td>
                      <td className="min-w-56 px-3 py-2">
                        {l.caucao && !escolhas.has(l.linha) ? (
                          <span className="font-semibold text-slate-800">{l.caucao.cliente}</span>
                        ) : (
                          <Select
                            value={escolhas.get(l.linha) ?? ''}
                            onChange={(v) => escolher(l, v)}
                            opcoes={opcoes}
                            vazio={l.candidatos.length ? 'Escolha o cliente...' : 'Selecione o cliente...'}
                            className="input py-1.5 text-xs"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold whitespace-nowrap text-slate-800 tabular-nums">
                        {l.valor !== null ? formatarMoeda(l.valor) : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600 tabular-nums">{l.data ? formatarData(l.data) : '—'}</td>
                      <td className="py-2 pr-4 pl-3">
                        {l.problemas.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> OK
                          </span>
                        ) : (
                          <ul className="space-y-0.5">
                            {l.problemas.map((p, i) => (
                              <li
                                key={i}
                                className={`flex items-start gap-1 text-xs ${p.gravidade === 'erro' ? 'font-semibold text-rose-600' : 'text-amber-700'}`}
                              >
                                {p.gravidade === 'erro' ? (
                                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                ) : (
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                )}
                                {p.texto}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}
