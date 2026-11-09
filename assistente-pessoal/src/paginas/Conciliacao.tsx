import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, CircleAlert, EyeOff, FileUp, Landmark, Pencil, Plus, RotateCcw, Scale, Star, Trash2, Undo2, Users } from 'lucide-react'
import { CategoriaForm } from '../components/CategoriaForm'
import { LinhaLancamento } from '../components/LinhaLancamento'
import { Cabecalho, Campo, CampoValor, Carregando, Erro, Modal, Segmentado, Selecao, SeletorMes, Vazio } from '../components/ui'
import { useApp } from '../contexto'
import { hoje, mesAtual, primeiroDia, somarDias, somarMesesAoMes, ultimoDia } from '../lib/datas'
import {
  avisarMudanca,
  buscarChavesExtrato,
  buscarExtrato,
  buscarHistoricoExtrato,
  buscarLancamentos,
  buscarPadroes,
  buscarSaldoExtrato,
  pessoaRateio,
  type HistoricoPadrao,
  excluir,
  inserirVarios,
  salvar,
  salvarSaldoExtrato,
  saldoNaData,
  useDados,
} from '../lib/dados'
import { chaveLinha, conciliar, contaBate, lerExtrato, planoCompartilhada, planoEstorno, sugestaoPorHistorico, valorNaConta, type LinhaExtrato, type OpEstorno, type OriginalEstorno } from '../lib/extrato'
import { dataBR, dataValida, mesPorExtenso, moeda } from '../lib/formato'
import { supabase } from '../lib/supabase'
import { BANCOS, type Lancamento } from '../tipos'
import { ContaForm } from './Contas'

/** Lê o arquivo como UTF-8; se vier com acentos quebrados (bancos antigos), relê como Windows-1252. */
async function lerArquivo(f: File) {
  const buf = await f.arrayBuffer()
  const utf = new TextDecoder('utf-8').decode(buf)
  return utf.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf
}

const corValor = (v: number) => (v > 0 ? 'text-emerald-600' : 'text-slate-900')
const comSinal = (v: number) => `${v > 0 ? '+' : '−'} ${moeda(Math.abs(v))}`

export function Conciliacao() {
  const { contas } = useApp()
  const bancos = contas.filter((c) => c.ativa && c.tipo !== 'cartao')
  const [contaId, setContaId] = useState(bancos.find((c) => c.tipo === 'corrente')?.id ?? bancos[0]?.id ?? '')
  const conta = contas.find((c) => c.id === contaId)
  const [mes, setMes] = useState(mesAtual())
  const inicio = primeiroDia(mes)
  const fim = ultimoDia(mes)

  const extrato = useDados(() => (contaId ? buscarExtrato(contaId, inicio, fim) : Promise.resolve([])), [contaId, inicio, fim])
  // um ano para trás: serve para lembrar a categoria pela descrição
  const lanc = useDados(() => buscarLancamentos(primeiroDia(somarMesesAoMes(mes, -12)), somarDias(fim, 7)), [mes, fim])
  const saldoBanco = useDados(() => (contaId ? buscarSaldoExtrato(contaId, inicio, fim) : Promise.resolve(null)), [contaId, inicio, fim])
  const dataSaldo = saldoBanco.dados?.data ?? (fim < hoje() ? fim : hoje())
  const padroes = useDados(buscarPadroes, [])
  const historico = useDados(() => (contaId ? buscarHistoricoExtrato(contaId) : Promise.resolve([])), [contaId])
  const saldoApp = useDados(() => (conta ? saldoNaData(conta.id, conta.saldo_inicial, dataSaldo) : Promise.resolve(0)), [conta?.id, conta?.saldo_inicial, dataSaldo])

  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novaLinha, setNovaLinha] = useState(false)
  const [editSaldo, setEditSaldo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [aba, setAba] = useState<'classificar' | 'conciliadas' | 'soApp' | 'ignoradas' | null>(null)
  const [editConta, setEditConta] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  if (bancos.length === 0) {
    return (
      <div className="space-y-5">
        <Cabecalho titulo="Conciliação bancária" />
        <Vazio icone={Landmark}>Cadastre sua conta do banco em Contas para conciliar o extrato.</Vazio>
      </div>
    )
  }

  const todos = lanc.dados ?? []
  const janela = todos.filter((l) => l.data >= somarDias(inicio, -7))
  const c = extrato.dados ? conciliar(extrato.dados, janela, contaId) : null
  const soAppDoMes = c?.soApp.filter((l) => l.data >= inicio && l.data <= fim && l.data <= hoje()) ?? []
  const aConfirmar = c ? c.pares.filter((p) => p.sugerido || !p.lanc.pago) : []
  const abaAtual = aba ?? (c && c.soExtrato.length ? 'classificar' : 'conciliadas')

  async function importar(f: File) {
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const lido = lerExtrato(await lerArquivo(f))
      if (!lido.linhas.length) throw new Error('Não encontrei lançamentos nesse arquivo. Use o extrato em OFX (Money/Quicken) ou CSV.')
      // OFX traz banco/agência/conta: confere com o cadastro e, se for de outra conta cadastrada, importa nela
      let destino = contaId
      let notaConta = ''
      if (lido.conta) {
        const arq = lido.conta
        const descArq = `banco ${arq.banco || '?'}, agência ${arq.agencia || '?'}, conta ${arq.numero}`
        const dona = bancos.find((b) => contaBate(b, arq) === 'bate')
        if (dona) {
          destino = dona.id
          if (dona.id !== contaId) notaConta = ` O arquivo é da conta ${dona.nome} (${descArq}), então foi importado nela.`
        } else if (conta && contaBate(conta, arq) === 'nao_bate') {
          throw new Error(`Este arquivo é de ${descArq}, que não bate com o cadastro de ${conta.nome}. Confira banco, agência e conta em Contas ou escolha a conta certa.`)
        } else if (conta) {
          // conta sem dados bancários: grava os do arquivo para as próximas importações
          await salvar('pes_contas', conta.id, { banco_codigo: arq.banco.replace(/\D/g, '').replace(/^0+(?=\d{3})/, '') || null, agencia: arq.agencia || null, numero_conta: arq.numero })
          notaConta = ` Gravei no cadastro de ${conta.nome} os dados do arquivo (${descArq}) para conferir as próximas importações.`
        }
      }
      const existentes = await buscarChavesExtrato(destino)
      const fitids = new Set(existentes.map((e) => e.fitid).filter(Boolean))
      const chaves = new Set(existentes.map(chaveLinha))
      const novas = lido.linhas.filter((l) => !(l.fitid && fitids.has(l.fitid)) && !chaves.has(chaveLinha(l)))
      if (novas.length) await inserirVarios('pes_extrato', novas.map((l) => ({ ...l, conta_id: destino })))
      if (lido.saldo) await salvarSaldoExtrato(destino, lido.saldo.data, lido.saldo.valor)
      setContaId(destino)
      setAba('classificar')
      const datas = lido.linhas.map((l) => l.data).sort()
      const ultimoMes = datas.at(-1)!.slice(0, 7)
      setMes(ultimoMes)
      setAviso(
        `${novas.length} ${novas.length === 1 ? 'linha importada' : 'linhas importadas'} (de ${dataBR(datas[0])} a ${dataBR(datas.at(-1)!)})` +
          (lido.linhas.length > novas.length ? `; ${lido.linhas.length - novas.length} já estavam aqui e foram puladas` : '') +
          (lido.saldo ? `. Saldo do banco em ${dataBR(lido.saldo.data)}: ${moeda(lido.saldo.valor)}.` : '.') +
          notaConta,
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
      if (arquivo.current) arquivo.current.value = ''
    }
  }

  async function confirmarTudo() {
    setOcupado(true)
    setErro(null)
    try {
      for (const p of aConfirmar) {
        if (p.sugerido) {
          const r = await supabase.from('pes_extrato').update({ lancamento_id: p.lanc.id }).eq('id', p.linha.id)
          if (r.error) throw new Error(r.error.message)
        }
        if (!p.lanc.pago) {
          const r = await supabase.from('pes_lancamentos').update({ pago: true }).eq('id', p.lanc.id)
          if (r.error) throw new Error(r.error.message)
        }
      }
      avisarMudanca()
      setAviso(`${aConfirmar.length} ${aConfirmar.length === 1 ? 'item conciliado' : 'itens conciliados'}.`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  async function desfazerEstorno(e: LinhaExtrato) {
    if (!window.confirm('Desfazer este estorno?')) return
    try {
      if (e.estorno_desfazer) {
        await executarDesfazer(e.estorno_desfazer as Desfazer[])
        await salvar('pes_extrato', e.id, { estorno_de: null, estorno_modo: null, estorno_lancamento: null, estorno_desfazer: null })
        return
      }
      if (e.estorno_modo === 'novo' && e.estorno_lancamento) {
        if (e.estorno_de) await salvar('pes_extrato', e.estorno_de, { lancamento_id: null })
        await excluir('pes_lancamentos', e.estorno_lancamento)
      }
      if (e.estorno_modo === 'reduziu' && e.estorno_lancamento) {
        const r = await supabase.from('pes_lancamentos').select('valor').eq('id', e.estorno_lancamento).maybeSingle()
        if (r.data) await salvar('pes_lancamentos', e.estorno_lancamento, { valor: Math.round((Number(r.data.valor) + Math.abs(e.valor)) * 100) / 100 })
      }
      await salvar('pes_extrato', e.id, { estorno_de: null, estorno_modo: null, estorno_lancamento: null })
      if (e.estorno_modo === 'apagou') setAviso('Estorno desfeito. O lançamento original tinha sido apagado: lance-o de novo pela linha dele em “A classificar”.')
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x))
    }
  }

  async function desfazerCompartilhada(grupo: string) {
    if (!window.confirm('Desfazer esta despesa compartilhada? Os lançamentos criados para ela são apagados e as linhas voltam para "A classificar".')) return
    try {
      const a = await supabase.from('pes_extrato').update({ lancamento_id: null, compartilhado_id: null }).eq('compartilhado_id', grupo)
      if (a.error) throw new Error(a.error.message)
      const b = await supabase.from('pes_lancamentos').delete().eq('compartilhado_id', grupo)
      if (b.error) throw new Error(b.error.message)
      avisarMudanca()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  // resumo de cada despesa compartilhada do mês (pago, recebido, minha parte)
  const resumoCompart = new Map<string, { pago: number; recebido: number }>()
  for (const l of extrato.dados ?? []) {
    if (!l.compartilhado_id) continue
    const r = resumoCompart.get(l.compartilhado_id) ?? { pago: 0, recebido: 0 }
    if (l.valor < 0) r.pago += -l.valor
    else r.recebido += l.valor
    resumoCompart.set(l.compartilhado_id, r)
  }

  const diferenca = saldoBanco.dados && saldoApp.dados !== undefined ? Math.round((saldoBanco.dados.saldo - saldoApp.dados) * 100) / 100 : null

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="Conciliação bancária"
        descricao="Confira o extrato do banco com o que está lançado no app. Importe o arquivo do banco ou digite as linhas você mesmo."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <Selecao value={contaId} onChange={setContaId} opcoes={bancos.map((b) => ({ value: b.id, label: b.nome }))} />
        </div>
        <SeletorMes mes={mes} onChange={setMes} />
        <div className="flex w-full gap-2 sm:ml-auto sm:w-auto">
          <input ref={arquivo} type="file" accept=".ofx,.csv,.txt,.qfx" className="hidden" onChange={(e) => e.target.files?.[0] && importar(e.target.files[0])} />
          <button className="btn-primary flex-1 whitespace-nowrap sm:flex-none" onClick={() => arquivo.current?.click()} disabled={ocupado}>
            <FileUp className="h-4 w-4" /> Importar extrato
          </button>
          <button className="btn-secondary flex-1 whitespace-nowrap sm:flex-none" onClick={() => setNovaLinha(true)}>
            <Plus className="h-4 w-4" /> Digitar linha
          </button>
        </div>
      </div>

      {conta && (
        <p className="-mt-2 text-xs text-slate-500">
          {conta.numero_conta ? (
            <>
              {BANCOS.find((b) => b.codigo === (conta.banco_codigo ?? '').padStart(3, '0'))?.nome ?? (conta.banco_codigo ? `Banco ${conta.banco_codigo}` : 'Banco não informado')} · Agência {conta.agencia || '—'} · Conta {conta.numero_conta}{' '}
            </>
          ) : (
            'Cadastre banco, agência e conta para o app conferir se o OFX é desta conta. '
          )}
          <button className="inline-flex items-center gap-0.5 font-semibold text-azul-600 hover:underline" onClick={() => setEditConta(true)}>
            <Pencil className="h-3 w-3" /> {conta.numero_conta ? 'Alterar' : 'Cadastrar'}
          </button>
        </p>
      )}

      {aviso && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{aviso}</p>}
      {erro && <Erro>{erro}</Erro>}
      {(extrato.erro || lanc.erro) && <Erro>{extrato.erro || lanc.erro}</Erro>}

      {/* saldo: banco × app */}
      <section className="cartao grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-500">Saldo no banco {saldoBanco.dados ? `em ${dataBR(saldoBanco.dados.data)}` : ''}</div>
          {saldoBanco.dados ? (
            <div className="text-xl font-extrabold text-slate-900 tabular-nums">{moeda(saldoBanco.dados.saldo)}</div>
          ) : (
            <div className="text-sm text-slate-400">Não informado</div>
          )}
          <button className="mt-1 text-xs font-semibold text-azul-600 hover:underline" onClick={() => setEditSaldo(true)}>
            {saldoBanco.dados ? 'Alterar' : 'Informar saldo do extrato'}
          </button>
        </div>
        <div>
          <div className="text-xs text-slate-500">Saldo no app em {dataBR(dataSaldo)}</div>
          <div className="text-xl font-extrabold text-slate-900 tabular-nums">{saldoApp.dados === undefined ? '…' : moeda(saldoApp.dados)}</div>
          <div className="text-xs text-slate-400">Só o que está marcado como pago</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Diferença</div>
          {diferenca === null ? (
            <div className="text-sm text-slate-400">Informe o saldo do banco para comparar</div>
          ) : Math.abs(diferenca) < 0.01 ? (
            <div className="flex items-center gap-1.5 text-xl font-extrabold text-emerald-600">
              <Check className="h-5 w-5" /> Bateu!
            </div>
          ) : (
            <>
              <div className="text-xl font-extrabold text-rose-600 tabular-nums">{comSinal(diferenca)}</div>
              <div className="text-xs text-slate-500">{diferenca > 0 ? 'O banco tem mais do que o app' : 'O app tem mais do que o banco'}</div>
            </>
          )}
        </div>
      </section>

      {extrato.carregando || lanc.carregando || !c ? (
        <Carregando />
      ) : extrato.dados!.length === 0 && soAppDoMes.length === 0 ? (
        <Vazio icone={Scale}>
          <span>
            Nenhuma linha do extrato de {conta?.nome} em {mesPorExtenso(mes)}.
          </span>
          <span className="text-xs">No app do banco, baixe o extrato em OFX (ou CSV) e toque em “Importar extrato”, ou use “Digitar linha”.</span>
        </Vazio>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {(
              [
                ['classificar', 'A classificar', c.soExtrato.length, 'text-amber-600'],
                ['conciliadas', 'Conciliadas', c.pares.length + c.estornos.length, 'text-emerald-600'],
                ['soApp', 'Só no app', soAppDoMes.length, 'text-rose-600'],
                ['ignoradas', 'Ignoradas', c.ignoradas.length, 'text-slate-500'],
              ] as const
            ).map(([k, rotulo, n, cor]) => (
              <button
                key={k}
                onClick={() => setAba(k)}
                className={`flex shrink-0 grow cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap transition ${abaAtual === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {rotulo} <span className={`tabular-nums ${n ? cor : 'text-slate-400'}`}>{n}</span>
              </button>
            ))}
          </div>

          {abaAtual === 'classificar' &&
            (c.soExtrato.length === 0 ? (
              <Vazio icone={Check}>Tudo classificado neste mês.</Vazio>
            ) : (
              <Classificar
                linhas={c.soExtrato}
                contaId={contaId}
                sugestao={(l) => sugestaoPorHistorico(l.descricao, historico.dados ?? [], todos, contaId)}
                padroes={padroes.dados ?? []}
                lancamentos={todos}
                extratoMes={extrato.dados ?? []}
                onErro={setErro}
                onAviso={setAviso}
              />
            ))}

          {abaAtual === 'conciliadas' && c.pares.length === 0 && c.estornos.length === 0 && <Vazio icone={Scale}>Nenhuma linha conciliada ainda.</Vazio>}
          {abaAtual === 'conciliadas' && c.estornos.length > 0 && (
            <section className="cartao space-y-2">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <RotateCcw className="h-4 w-4 text-amber-600" /> Estornos
              </h2>
              <div className="divide-y divide-slate-100">
                {c.estornos.map((l) => {
                  const orig = l.estorno_de ? extrato.dados?.find((x) => x.id === l.estorno_de) : undefined
                  return (
                    <div key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                      <RotateCcw className={`h-4 w-4 shrink-0 ${l.estorno_modo ? 'text-amber-600' : 'text-slate-300'}`} />
                      <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{dataBR(l.data)}</span>
                      <span className="min-w-0 flex-1 break-words sm:truncate">{l.descricao}</span>
                      <span className={`font-semibold tabular-nums ${corValor(l.valor)}`}>{comSinal(l.valor)}</span>
                      <span className="flex w-full items-center gap-1.5 pl-7 text-xs text-slate-500 sm:w-auto sm:pl-0">
                        <span className="rounded-full bg-amber-100 px-1.5 py-px text-[0.625rem] font-bold text-amber-800">{l.estorno_modo ? 'estorno' : 'estornado'}</span>
                        {l.estorno_modo && (
                          <>
                            <span className="truncate">
                              {l.estorno_modo === 'pendente' || l.estorno_modo === 'apagou' ? 'total' : 'parcial'}
                              {orig ? ` de ${orig.descricao} (${dataBR(orig.data)})` : ''}
                            </span>
                            <button className="icon-btn h-6 w-6" aria-label="Desfazer estorno" title="Desfazer estorno" onClick={() => desfazerEstorno(l)}>
                              <Undo2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {abaAtual === 'conciliadas' && c.pares.length > 0 && (
            <section className="cartao space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-800">Conciliadas</h2>
                {aConfirmar.length > 0 && (
                  <button className="btn-primary btn-sm" onClick={confirmarTudo} disabled={ocupado}>
                    <Check className="h-3.5 w-3.5" /> Confirmar {aConfirmar.length === 1 ? '1 item' : `${aConfirmar.length} itens`}
                  </button>
                )}
              </div>
              {aConfirmar.length > 0 && (
                <p className="text-xs text-slate-500">Os marcados como “sugerido” foram achados pelo valor e pela data. Confirme para gravar e marcar como pagos.</p>
              )}
              <div className="divide-y divide-slate-100">
                {c.pares.map((p) => (
                  <div key={p.linha.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                    <Check className={`h-4 w-4 shrink-0 ${p.sugerido ? 'text-slate-300' : 'text-emerald-600'}`} />
                    <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{dataBR(p.linha.data)}</span>
                    <span className="min-w-0 flex-1 break-words sm:truncate">{p.linha.descricao}</span>
                    <span className={`font-semibold tabular-nums ${corValor(p.linha.valor)}`}>{comSinal(p.linha.valor)}</span>
                    <span className="flex w-full items-center gap-1.5 pl-7 text-xs text-slate-500 sm:w-auto sm:pl-0">
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">
                        {p.lanc.descricao} ({dataBR(p.lanc.data)})
                      </span>
                      {p.sugerido && <span className="rounded-full bg-amber-100 px-1.5 py-px text-[0.625rem] font-bold text-amber-800">sugerido</span>}
                      {p.linha.compartilhado_id && <span className="rounded-full bg-violet-100 px-1.5 py-px text-[0.625rem] font-bold text-violet-800">compartilhada</span>}
                      {p.linha.compartilhado_id && p.linha.valor < 0 && (
                        <button className="icon-btn h-6 w-6" aria-label="Desfazer despesa compartilhada" title="Desfazer a despesa compartilhada" onClick={() => desfazerCompartilhada(p.linha.compartilhado_id!)}>
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {!p.sugerido && !p.linha.compartilhado_id && (
                        <button
                          className="icon-btn h-6 w-6"
                          aria-label="Desfazer conciliação"
                          title="Desfazer"
                          onClick={() => salvar('pes_extrato', p.linha.id, { lancamento_id: null }).catch((e: Error) => setErro(e.message))}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                    {p.linha.compartilhado_id && p.linha.valor < 0 && resumoCompart.get(p.linha.compartilhado_id) && (
                      <span className="w-full pl-7 text-xs text-violet-700">
                        Pago {moeda(resumoCompart.get(p.linha.compartilhado_id)!.pago)} · recebido {moeda(resumoCompart.get(p.linha.compartilhado_id)!.recebido)} · sua parte{' '}
                        <b>{moeda(Math.max(0, resumoCompart.get(p.linha.compartilhado_id)!.pago - resumoCompart.get(p.linha.compartilhado_id)!.recebido))}</b>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {abaAtual === 'soApp' && soAppDoMes.length === 0 && <Vazio icone={Check}>Tudo o que está no app apareceu no extrato.</Vazio>}
          {abaAtual === 'soApp' && soAppDoMes.length > 0 && (
            <section className="cartao space-y-2">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <CircleAlert className="h-4 w-4 text-rose-500" /> No app, mas não apareceu no extrato
              </h2>
              <p className="text-xs text-slate-500">Pode ser valor ou data diferente, algo que ainda não compensou, ou um lançamento que não aconteceu. Toque para corrigir.</p>
              <div className="divide-y divide-slate-100">
                {soAppDoMes.map((l) => (
                  <LinhaLancamento key={l.id} l={l} mostrarData />
                ))}
              </div>
            </section>
          )}

          {abaAtual === 'ignoradas' && c.ignoradas.length === 0 && <Vazio icone={EyeOff}>Nenhuma linha ignorada.</Vazio>}
          {abaAtual === 'ignoradas' && c.ignoradas.length > 0 && (
            <section className="cartao space-y-2">
              <h2 className="text-sm font-bold text-slate-500">Ignoradas</h2>
              <div className="divide-y divide-slate-100">
                {c.ignoradas.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 py-2 text-sm text-slate-400">
                    <span className="w-20 shrink-0 text-xs tabular-nums">{dataBR(l.data)}</span>
                    <span className="min-w-0 flex-1 truncate">{l.descricao}</span>
                    <span className="tabular-nums">{comSinal(l.valor)}</span>
                    <button className="icon-btn h-7 w-7" aria-label="Voltar a considerar" title="Voltar a considerar" onClick={() => salvar('pes_extrato', l.id, { ignorada: false }).catch((e: Error) => setErro(e.message))}>
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {editConta && conta && <ContaForm inicial={conta} onClose={() => setEditConta(false)} />}
      {novaLinha && <NovaLinhaForm contaId={contaId} mes={mes} onClose={() => setNovaLinha(false)} />}
      {editSaldo && (
        <SaldoForm contaId={contaId} inicial={saldoBanco.dados ?? { data: fim < hoje() ? fim : hoje(), saldo: 0 }} onClose={() => setEditSaldo(false)} />
      )}
    </div>
  )
}

type Sugestao = ReturnType<typeof sugestaoPorHistorico>

/**
 * Linhas do extrato que ainda não estão no app: edita o histórico (o valor fica como no banco),
 * escolhe a categoria (ou "transferência para outra conta") e lança — uma a uma ou todas de uma vez.
 */
function Classificar({
  linhas,
  contaId,
  sugestao,
  padroes,
  lancamentos,
  extratoMes,
  onErro,
  onAviso,
}: {
  linhas: LinhaExtrato[]
  contaId: string
  sugestao: (l: LinhaExtrato) => Sugestao
  padroes: HistoricoPadrao[]
  lancamentos: Lancamento[]
  extratoMes: LinhaExtrato[]
  onErro: (m: string) => void
  onAviso: (m: string) => void
}) {
  const { categorias, contas } = useApp()
  // o que foi digitado em cada linha (sem nada digitado, vale a sugestão)
  const [edicao, setEdicao] = useState<Record<string, { descricao?: string; classe?: string }>>({})
  const [gravando, setGravando] = useState(false)
  const [compart, setCompart] = useState<LinhaExtrato | null>(null)
  const [estorno, setEstorno] = useState<LinhaExtrato | null>(null)
  const [verPadroes, setVerPadroes] = useState(false)
  // criar categoria a partir de uma linha: guarda a linha para já selecionar a nova
  const [novaCat, setNovaCat] = useState<LinhaExtrato | null>(null)
  const outras = contas.filter((k) => k.ativa && k.id !== contaId)
  const padraoDe = (t: string) => padroes.find((p) => p.texto.trim().toLowerCase() === t.trim().toLowerCase())

  async function salvarPadrao(texto: string, classe: string) {
    const t = texto.trim()
    if (!t) return
    if (padraoDe(t)) return onAviso(`“${t}” já está nos padrões.`)
    try {
      await salvar('pes_historicos_padrao', null, { texto: t, categoria_id: classe && !classe.startsWith('t:') ? classe : null })
      onAviso(`“${t}” salvo nos padrões de histórico.`)
    } catch (e) {
      onErro(e instanceof Error ? e.message : String(e))
    }
  }

  const valores = (l: LinhaExtrato) => {
    const s = sugestao(l)
    const e = edicao[l.id] ?? {}
    return {
      descricao: e.descricao ?? s?.descricao ?? l.descricao,
      classe: e.classe ?? (s?.transferir_para ? `t:${s.transferir_para}` : (s?.categoria_id ?? '')),
      sugerido: !!s && e.descricao === undefined && e.classe === undefined,
    }
  }
  const mudar = (id: string, campo: 'descricao' | 'classe', v: string) =>
    setEdicao((x) => {
      const novo = { ...x[id], [campo]: v }
      // escolheu um histórico padrão: traz a categoria dele, se ainda não escolheu outra
      const p = campo === 'descricao' ? padraoDe(v) : undefined
      if (p?.categoria_id && x[id]?.classe === undefined) novo.classe = p.categoria_id
      return { ...x, [id]: novo }
    })

  async function lancar(l: LinhaExtrato) {
    const v = valores(l)
    const descricao = v.descricao.trim() || l.descricao
    const valor = Math.abs(l.valor)
    const dados = v.classe.startsWith('t:')
      ? {
          tipo: 'transferencia' as const,
          descricao,
          valor,
          data: l.data,
          // saiu daqui → vai para a outra conta; entrou aqui → veio da outra
          conta_id: l.valor < 0 ? contaId : v.classe.slice(2),
          conta_destino_id: l.valor < 0 ? v.classe.slice(2) : contaId,
          categoria_id: null,
          pago: true,
        }
      : { tipo: l.valor > 0 ? ('receita' as const) : ('despesa' as const), descricao, valor, data: l.data, conta_id: contaId, categoria_id: v.classe || null, pago: true }
    const novo = await salvar('pes_lancamentos', null, dados)
    await salvar('pes_extrato', l.id, { lancamento_id: novo.id })
  }

  async function lancarVarias(lista: LinhaExtrato[]) {
    setGravando(true)
    let n = 0
    try {
      for (const l of lista) {
        await lancar(l)
        n++
      }
      if (lista.length > 1) onAviso(`${n} lançamentos criados e conciliados.`)
    } catch (e) {
      onErro(e instanceof Error ? e.message : String(e))
    } finally {
      setGravando(false)
    }
  }

  const classificadas = linhas.filter((l) => valores(l).classe)

  return (
    <section className="cartao space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-800">No extrato, ainda não lançado no app</h2>
          <p className="text-xs text-slate-500">
            Escreva o <b>Histórico – Conciliação</b> (o do banco fica guardado e o valor não muda), escolha a categoria e lance. Nos ícones de cada linha:{' '}
            <Users className="inline h-3 w-3 text-violet-600" /> despesa compartilhada, <RotateCcw className="inline h-3 w-3 text-amber-600" /> estorno, <EyeOff className="inline h-3 w-3" /> ignorar.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setVerPadroes(true)}>
            <Star className="h-3.5 w-3.5 text-amber-500" /> Históricos padrão ({padroes.length})
          </button>
          {classificadas.length > 0 && (
            <button className="btn-primary btn-sm" onClick={() => lancarVarias(classificadas)} disabled={gravando}>
              <Check className="h-3.5 w-3.5" /> Lançar {classificadas.length === 1 ? 'a classificada' : `as ${classificadas.length} classificadas`}
            </button>
          )}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {linhas.map((l) => {
          const v = valores(l)
          const tipo = l.valor > 0 ? 'receita' : 'despesa'
          return (
            <div key={l.id} className="space-y-1.5 py-3">
              {/* linha de cima: data, histórico do banco e observações */}
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-slate-500" title={l.descricao}>
                  <span className="tabular-nums">{dataBR(l.data)}</span> · <span className="font-semibold">Banco:</span> {l.descricao}
                </span>
                {v.sugerido && v.classe && <span className="shrink-0 font-semibold text-azul-600">Como da última vez</span>}
              </div>
              {/* controles sempre nas mesmas colunas */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,14rem)_13.75rem] sm:items-center sm:gap-3">
                <div className="flex gap-1">
                  <input
                    className="input min-w-0 flex-1 py-2 text-sm"
                    list="padroes-historico"
                    value={v.descricao}
                    onChange={(e) => mudar(l.id, 'descricao', e.target.value)}
                    placeholder="Histórico – Conciliação"
                    aria-label="Histórico – Conciliação"
                  />
                  <button
                    type="button"
                    className={`icon-btn shrink-0 ${padraoDe(v.descricao) ? 'text-amber-500' : ''}`}
                    aria-label="Salvar como histórico padrão"
                    title={padraoDe(v.descricao) ? 'Já é um histórico padrão' : 'Salvar como histórico padrão'}
                    onClick={() => salvarPadrao(v.descricao, v.classe)}
                  >
                    <Star className={`h-4 w-4 ${padraoDe(v.descricao) ? 'fill-current' : ''}`} />
                  </button>
                </div>
                <span className={`text-right font-semibold tabular-nums ${corValor(l.valor)}`}>{comSinal(l.valor)}</span>
                <select
                  className="input cursor-pointer py-2 text-sm"
                  value={v.classe}
                  onChange={(e) => (e.target.value === '__nova__' ? setNovaCat(l) : mudar(l.id, 'classe', e.target.value))}
                  aria-label="Categoria"
                >
                  <option value="">Escolha a categoria…</option>
                  <option value="__nova__">+ Nova categoria…</option>
                  <optgroup label={tipo === 'receita' ? 'Receitas' : 'Despesas'}>
                    {categorias
                      .filter((k) => k.tipo === tipo && (k.ativa || k.id === v.classe))
                      .map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.nome}
                        </option>
                      ))}
                  </optgroup>
                  {outras.length > 0 && (
                    <optgroup label={l.valor < 0 ? 'Transferência para (ex.: pagar fatura, aplicar)' : 'Transferência vinda de'}>
                      {outras.map((k) => (
                        <option key={k.id} value={`t:${k.id}`}>
                          {k.tipo === 'cartao' ? `💳 ${k.nome}` : k.nome}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <div className="flex items-center justify-end gap-1">
                  <button className="btn-primary btn-sm w-[4.5rem] justify-center" onClick={() => lancarVarias([l])} disabled={gravando}>
                    Lançar
                  </button>
                  {/* a compartilhada só vale para saídas; nas entradas o espaço fica vazio para os ícones não mudarem de lugar */}
                  <button
                    className={`icon-btn text-violet-600 ${l.valor < 0 ? '' : 'invisible'}`}
                    aria-label="Despesa compartilhada"
                    title="Despesa compartilhada (paguei por todos e recebi de volta)"
                    onClick={() => setCompart(l)}
                    tabIndex={l.valor < 0 ? 0 : -1}
                  >
                    <Users className="h-4 w-4" />
                  </button>
                  <button className="icon-btn text-amber-600" aria-label="Estorno" title={l.valor > 0 ? 'Estorno de um pagamento (total ou parcial)' : 'Estorno de um recebimento (total ou parcial)'} onClick={() => setEstorno(l)}>
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button className="icon-btn" aria-label="Ignorar esta linha" title="Ignorar" onClick={() => salvar('pes_extrato', l.id, { ignorada: true }).catch((e: Error) => onErro(e.message))}>
                    <EyeOff className="h-4 w-4" />
                  </button>
                  <button
                    className="icon-btn text-rose-500"
                    aria-label="Apagar esta linha do extrato"
                    title="Apagar linha"
                    onClick={() => window.confirm('Apagar esta linha do extrato?') && excluir('pes_extrato', l.id).catch((e: Error) => onErro(e.message))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <datalist id="padroes-historico">
        {padroes.map((p) => (
          <option key={p.id} value={p.texto} />
        ))}
      </datalist>
      {compart && (
        <CompartilhadaForm
          saida={compart}
          candidatas={linhas.filter((x) => x.valor > 0)}
          contaId={contaId}
          inicial={valores(compart)}
          padroes={padroes}
          onClose={() => setCompart(null)}
          onAviso={onAviso}
        />
      )}
      {verPadroes && <PadroesForm padroes={padroes} onClose={() => setVerPadroes(false)} />}
      {estorno && (
        <EstornoForm
          estorno={estorno}
          pendentes={linhas}
          lancamentos={lancamentos}
          extratoMes={extratoMes}
          contaId={contaId}
          sugestao={valores}
          onClose={() => setEstorno(null)}
          onAviso={onAviso}
        />
      )}
      {novaCat && (
        <CategoriaForm
          inicial={null}
          tipoPadrao={novaCat.valor > 0 ? 'receita' : 'despesa'}
          onClose={() => setNovaCat(null)}
          onSalva={(k) => {
            if ((k.tipo === 'receita') === novaCat.valor > 0) mudar(novaCat.id, 'classe', k.id)
          }}
        />
      )}
    </section>
  )
}

const dias = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000

/** Paguei o total e recebi a parte dos outros: escolhe as entradas (PIX) que são reembolso desta saída. */
function CompartilhadaForm({
  saida,
  candidatas,
  contaId,
  inicial,
  padroes,
  onClose,
  onAviso,
}: {
  saida: LinhaExtrato
  candidatas: LinhaExtrato[]
  contaId: string
  inicial: { descricao: string; classe: string }
  padroes: HistoricoPadrao[]
  onClose: () => void
  onAviso: (m: string) => void
}) {
  const { categorias } = useApp()
  const [descricao, setDescricao] = useState(inicial.descricao)
  const [categoria, setCategoria] = useState(inicial.classe.startsWith('t:') ? '' : inicial.classe)
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [novaCat, setNovaCat] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // as entradas mais próximas da data da saída primeiro
  const lista = [...candidatas].sort((a, b) => dias(a.data, saida.data) - dias(b.data, saida.data) || a.data.localeCompare(b.data))
  const entradas = lista.filter((l) => marcadas.has(l.id))
  const pago = Math.abs(saida.valor)
  const recebido = Math.round(entradas.reduce((t, e) => t + e.valor, 0) * 100) / 100
  const minha = Math.round((pago - recebido) * 100) / 100

  function alternar(id: string) {
    setMarcadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  async function gravar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!entradas.length) return setErro('Marque as entradas (PIX) que você recebeu por esta despesa.')
    if (!descricao.trim()) return setErro('Informe o histórico.')
    setSalvando(true)
    try {
      const grupo = crypto.randomUUID()
      const itens = planoCompartilhada({ saida, entradas, contaId, categoriaId: categoria || null, descricao: descricao.trim(), pessoaId: await pessoaRateio(), grupo })
      for (const it of itens) {
        const novo = await salvar('pes_lancamentos', null, it.lanc)
        if (it.linhaId) await salvar('pes_extrato', it.linhaId, { lancamento_id: novo.id, compartilhado_id: grupo })
      }
      onAviso(`Despesa compartilhada lançada: pago ${moeda(pago)}, recebido ${moeda(recebido)}, sua parte ${moeda(minha)}.`)
      onClose()
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Modal
        titulo="Despesa compartilhada"
        onClose={onClose}
        rodape={
          <>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" form="form-compartilhada" disabled={salvando}>
              Lançar compartilhada
            </button>
          </>
        }
      >
        <form id="form-compartilhada" onSubmit={gravar} className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <div className="text-xs text-slate-500">Você pagou</div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate">
                {dataBR(saida.data)} · {saida.descricao}
              </span>
              <b className="tabular-nums">{moeda(pago)}</b>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Histórico – Conciliação">
              <input className="input" list="padroes-historico-c" value={descricao} onChange={(e) => {
                setDescricao(e.target.value)
                const p = padroes.find((x) => x.texto.toLowerCase() === e.target.value.trim().toLowerCase())
                if (p?.categoria_id && !categoria) setCategoria(p.categoria_id)
              }} />
              <datalist id="padroes-historico-c">
                {padroes.map((p) => (
                  <option key={p.id} value={p.texto} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Categoria da sua parte">
              <Selecao value={categoria} onChange={setCategoria} vazio="Sem categoria" opcoes={categorias.filter((k) => k.tipo === 'despesa' && (k.ativa || k.id === categoria)).map((k) => ({ value: k.id, label: k.nome }))} />
              <button type="button" className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-azul-600 hover:underline" onClick={() => setNovaCat(true)}>
                <Plus className="h-3 w-3" /> Nova categoria
              </button>
            </Campo>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">Marque o que você recebeu de volta</div>
            {lista.length === 0 ? (
              <p className="text-sm text-slate-400">Não há entradas a classificar neste mês.</p>
            ) : (
              <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {lista.map((l) => (
                  <label key={l.id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={marcadas.has(l.id)} onChange={() => alternar(l.id)} />
                    <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{dataBR(l.data)}</span>
                    <span className="min-w-0 flex-1 truncate">{l.descricao}</span>
                    <span className="font-semibold text-emerald-600 tabular-nums">+ {moeda(l.valor)}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-violet-50 p-3 text-center text-sm">
            <div>
              <div className="text-xs text-violet-700">Pago</div>
              <b className="tabular-nums">{moeda(pago)}</b>
            </div>
            <div>
              <div className="text-xs text-violet-700">Recebido ({entradas.length})</div>
              <b className="tabular-nums">{moeda(recebido)}</b>
            </div>
            <div>
              <div className="text-xs text-violet-700">Sua parte</div>
              <b className={`tabular-nums ${minha < 0 ? 'text-rose-600' : ''}`}>{moeda(minha)}</b>
            </div>
          </div>
          <p className="text-xs text-slate-500">Só a sua parte entra nas suas despesas (DRE, plano). A parte dos outros e os PIX recebidos ficam ligados a esta despesa e o saldo continua batendo com o banco.</p>
          <Erro>{erro}</Erro>
        </form>
      </Modal>
    {/* fora do <form> da compartilhada */}
    {novaCat && <CategoriaForm inicial={null} tipoPadrao="despesa" onClose={() => setNovaCat(false)} onSalva={(k) => k.tipo === 'despesa' && setCategoria(k.id)} />}
    </>
  )
}

/** Como voltar atrás de cada operação de um estorno (gravado na linha do estorno). */
type Desfazer =
  | { op: 'apagar_id'; id: string }
  | { op: 'valor'; id: string; valor: number }
  | { op: 'recriar'; lanc: Lancamento }
  | { op: 'ligar'; linha: string; lancamento_id: string | null }

/** Aplica as operações do estorno e devolve a lista para desfazer (na ordem certa). */
async function executarOps(ops: OpEstorno[]): Promise<Desfazer[]> {
  const volta: Desfazer[] = []
  for (const op of ops) {
    if (op.op === 'criar') {
      const novo = await salvar('pes_lancamentos', null, op.lanc)
      if (op.ligar) {
        await salvar('pes_extrato', op.ligar, { lancamento_id: novo.id })
        volta.push({ op: 'ligar', linha: op.ligar, lancamento_id: null })
      }
      volta.push({ op: 'apagar_id', id: novo.id })
    } else if (op.op === 'valor') {
      await salvar('pes_lancamentos', op.id, { valor: op.para })
      volta.push({ op: 'valor', id: op.id, valor: op.de })
    } else if (op.op === 'apagar') {
      if (op.desligar) {
        await salvar('pes_extrato', op.desligar, { lancamento_id: null })
        volta.push({ op: 'ligar', linha: op.desligar, lancamento_id: op.lanc.id })
      }
      await excluir('pes_lancamentos', op.lanc.id)
      volta.push({ op: 'recriar', lanc: op.lanc })
    } else {
      await salvar('pes_extrato', op.linha, { lancamento_id: op.para })
      volta.push({ op: 'ligar', linha: op.linha, lancamento_id: op.de })
    }
  }
  return volta.reverse()
}

async function executarDesfazer(lista: Desfazer[]) {
  for (const d of lista) {
    if (d.op === 'apagar_id') await excluir('pes_lancamentos', d.id)
    else if (d.op === 'valor') await salvar('pes_lancamentos', d.id, { valor: d.valor })
    else if (d.op === 'recriar') {
      const r = await supabase.from('pes_lancamentos').insert(d.lanc)
      if (r.error) throw new Error(r.error.message)
    } else await salvar('pes_extrato', d.linha, { lancamento_id: d.lancamento_id })
  }
  avisarMudanca()
}

/** Este valor desfaz, no todo ou em parte, um pagamento ou recebimento anterior: escolhe qual. */
function EstornoForm({
  estorno: e,
  pendentes,
  lancamentos,
  extratoMes,
  contaId,
  sugestao,
  onClose,
  onAviso,
}: {
  estorno: LinhaExtrato
  pendentes: LinhaExtrato[]
  lancamentos: Lancamento[]
  extratoMes: LinhaExtrato[]
  contaId: string
  sugestao: (l: LinhaExtrato) => { descricao: string; classe: string }
  onClose: () => void
  onAviso: (m: string) => void
}) {
  const { categorias } = useApp()
  const valorE = Math.abs(e.valor)
  const recebimento = e.valor < 0 // saída estorna um recebimento; entrada estorna um pagamento
  const limite = somarDias(e.data, -120)
  // candidatas: linhas do extrato ainda sem lançamento e lançamentos já feitos nesta conta (até 120 dias antes)
  type Opcao = { chave: string; data: string; descricao: string; valor: number; original: OriginalEstorno; jaLancado: boolean; compart?: boolean }
  const grupoDe = (l: Lancamento) => (l.compartilhado_id ? lancamentos.filter((g) => g.compartilhado_id === l.compartilhado_id) : [l])
  const somarValores = (ls: Lancamento[]) => Math.round(ls.reduce((t, x) => t + Math.round(x.valor * 100), 0)) / 100
  const vinculos = new Map(extratoMes.filter((x) => x.lancamento_id).map((x) => [x.lancamento_id!, x.id]))
  const opcoes: Opcao[] = [
    ...pendentes
      .filter((l) => l.id !== e.id && Math.sign(l.valor) === -Math.sign(e.valor) && Math.abs(l.valor) >= valorE - 0.001 && l.data <= e.data)
      .map((l) => ({ chave: `l:${l.id}`, data: l.data, descricao: l.descricao, valor: Math.abs(l.valor), original: { linha: l }, jaLancado: false })),
    ...lancamentos
      .filter((l) => (l.conta_id === contaId || l.conta_destino_id === contaId) && l.tipo !== 'transferencia' && l.data >= limite && l.data <= e.data)
      .filter((l) => Math.sign(valorNaConta(l, contaId)) === -Math.sign(e.valor))
      // da compra compartilhada (minha parte + parte dos outros) mostra uma opção só, pelo total pago
      .filter((l) => !(l.compartilhado_id && l.tipo === 'despesa' && l.pessoa_id && grupoDe(l).some((g) => g.tipo === 'despesa' && !g.pessoa_id)))
      .map((l) => {
        const total = l.compartilhado_id && l.tipo === 'despesa' ? somarValores(grupoDe(l).filter((g) => g.tipo === 'despesa')) : l.valor
        const linha = extratoMes.find((x) => grupoDe(l).some((g) => g.id === x.lancamento_id) && (l.tipo === 'receita' ? x.lancamento_id === l.id : Math.sign(x.valor) < 0))
        const compart = !!l.compartilhado_id
        return {
          chave: `x:${l.id}`,
          data: l.data,
          // no reembolso, mostra o PIX de quem pagou (texto do banco) para escolher o certo
          descricao: compart && l.tipo === 'despesa' ? l.descricao.replace(/ \(parte dos outros\)$/, '') : compart && linha ? linha.descricao : l.descricao,
          valor: total,
          original: linha ? { linha, lanc: l } : { lanc: l },
          jaLancado: true,
          compart,
        }
      })
      .filter((o) => o.valor >= valorE - 0.001),
  ].sort((a, b) => Number(Math.abs(b.valor - valorE) < 0.005) - Number(Math.abs(a.valor - valorE) < 0.005) || b.data.localeCompare(a.data))
  const [escolha, setEscolha] = useState(opcoes[0]?.chave ?? '')
  const op = opcoes.find((o) => o.chave === escolha)
  const sug = op?.original.linha && !op.jaLancado ? sugestao(op.original.linha) : null
  const [descricao, setDescricao] = useState('')
  const [categoria, setCategoria] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const liquido = op ? Math.round((op.valor - valorE) * 100) / 100 : 0
  // prévia: o que muda em cada lançamento (importante na despesa compartilhada)
  let previa: string[] = []
  if (op?.jaLancado && op.original.lanc) {
    try {
      const nomes = (l: Lancamento) => (l.compartilhado_id ? (l.tipo === 'receita' ? 'Reembolso recebido' : l.pessoa_id ? 'Parte dos outros' : 'Sua parte') : l.descricao)
      const porId = new Map(grupoDe(op.original.lanc).map((l) => [l.id, l]))
      previa = planoEstorno({ estorno: e, original: op.original, contaId, descricao: op.descricao, categoriaId: null, grupo: [...porId.values()], vinculos }).ops.flatMap((x) =>
        x.op === 'valor'
          ? [`${nomes(porId.get(x.id)!)}: ${moeda(x.de)} → ${moeda(x.para)}`]
          : x.op === 'apagar'
            ? [`${nomes(x.lanc)}: ${moeda(x.lanc.valor)} → apagado`]
            : x.op === 'criar'
              ? [`Sua parte: nova, ${moeda(x.lanc.valor)}`]
              : [],
      )
    } catch {
      previa = []
    }
  }
  const precisaClassificar = !!op && !op.jaLancado && liquido > 0
  const tipoOriginal = recebimento ? 'receita' : 'despesa'

  async function gravar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    if (!op) return setErro('Escolha o que este valor está estornando.')
    setSalvando(true)
    try {
      const desc = (descricao || sug?.descricao || op.descricao).trim()
      const cat = categoria || (sug?.classe && !sug.classe.startsWith('t:') ? sug.classe : '') || null
      const plano = planoEstorno({ estorno: e, original: op.original, contaId, descricao: desc, categoriaId: cat, grupo: op.original.lanc ? grupoDe(op.original.lanc) : [], vinculos })
      const volta = await executarOps(plano.ops)
      await salvar('pes_extrato', e.id, { estorno_de: plano.estorno_de, estorno_modo: plano.modo, estorno_lancamento: null, estorno_desfazer: volta })
      onAviso(liquido === 0 ? `Estorno total registrado: ${op.descricao} ficou zerado.` : `Estorno parcial registrado: ${op.descricao} ficou em ${moeda(liquido)}.`)
      onClose()
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Modal
      titulo={recebimento ? 'Estorno de recebimento' : 'Estorno de pagamento'}
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-estorno" disabled={salvando || !op}>
            Registrar estorno
          </button>
        </>
      }
    >
      <form id="form-estorno" onSubmit={gravar} className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="text-xs text-slate-500">{recebimento ? 'Saiu da conta (devolução de um recebimento)' : 'Voltou para a conta (devolução de um pagamento)'}</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate">
              {dataBR(e.data)} · {e.descricao}
            </span>
            <b className="tabular-nums">{moeda(valorE)}</b>
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-600">Qual {recebimento ? 'recebimento' : 'pagamento'} ele estorna?</div>
          {opcoes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-500">
              Não achei {recebimento ? 'recebimento' : 'pagamento'} de {moeda(valorE)} ou mais nesta conta nos últimos 120 dias. Lance o original primeiro (ou importe o extrato do mês dele).
            </p>
          ) : (
            <div className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {opcoes.map((o) => (
                <label key={o.chave} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                  <input type="radio" name="original" className="h-4 w-4 accent-amber-600" checked={escolha === o.chave} onChange={() => setEscolha(o.chave)} />
                  <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{dataBR(o.data)}</span>
                  <span className="min-w-0 flex-1 truncate">{o.descricao}</span>
                  <span className="shrink-0 text-[0.625rem] font-bold text-slate-400 uppercase">{o.compart ? 'compartilhada' : o.jaLancado ? 'lançado' : 'no extrato'}</span>
                  <span className="shrink-0 font-semibold tabular-nums">{moeda(o.valor)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {op && (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-amber-50 p-3 text-center text-sm">
            <div>
              <div className="text-xs text-amber-800">Original</div>
              <b className="tabular-nums">{moeda(op.valor)}</b>
            </div>
            <div>
              <div className="text-xs text-amber-800">Estornado</div>
              <b className="tabular-nums">{moeda(valorE)}</b>
            </div>
            <div>
              <div className="text-xs text-amber-800">{liquido === 0 ? 'Estorno total' : 'Fica'}</div>
              <b className="tabular-nums">{moeda(liquido)}</b>
            </div>
          </div>
        )}
        {precisaClassificar && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Histórico – Conciliação">
              <input className="input" value={descricao || sug?.descricao || op!.descricao} onChange={(x) => setDescricao(x.target.value)} />
            </Campo>
            <Campo label="Categoria">
              <Selecao
                value={categoria || (sug?.classe && !sug.classe.startsWith('t:') ? sug.classe : '')}
                onChange={setCategoria}
                vazio="Sem categoria"
                opcoes={categorias.filter((k) => k.tipo === tipoOriginal && k.ativa).map((k) => ({ value: k.id, label: k.nome }))}
              />
            </Campo>
          </div>
        )}
        {previa.length > 0 && (
          <div className="rounded-xl border border-amber-200 p-3 text-xs text-slate-700">
            <div className="mb-1 font-bold text-amber-800">O que muda ao registrar</div>
            <ul className="space-y-0.5">
              {previa.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            {op?.compart && (
              <p className="mt-1.5 text-slate-500">
                {recebimento ? 'Você devolveu parte do que recebeu: a parte dos outros diminui e a sua aumenta.' : 'A devolução da loja abate primeiro da sua parte, depois da parte dos outros.'}
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-500">
          {op?.jaLancado
            ? liquido === 0
              ? 'O lançamento original deixa de existir (foi todo devolvido).'
              : `O lançamento original passa a valer ${moeda(liquido)}.`
            : liquido === 0
              ? 'Os dois se anulam: nada entra nas despesas/receitas.'
              : `Será lançado só o que ficou: ${moeda(liquido)}.`}{' '}
          O saldo continua batendo com o banco, e dá para desfazer em Conciliadas.
        </p>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

/** Lista dos históricos padrão salvos, para apagar os que não usa mais. */
function PadroesForm({ padroes, onClose }: { padroes: HistoricoPadrao[]; onClose: () => void }) {
  const { categorias } = useApp()
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [categoria, setCategoria] = useState('')

  async function adicionar(ev: FormEvent) {
    ev.preventDefault()
    setErro(null)
    const t = texto.trim()
    if (!t) return setErro('Escreva o histórico.')
    if (padroes.some((p) => p.texto.toLowerCase() === t.toLowerCase())) return setErro('Esse histórico já está salvo.')
    try {
      await salvar('pes_historicos_padrao', null, { texto: t, categoria_id: categoria || null })
      setTexto('')
      setCategoria('')
    } catch (x) {
      setErro(x instanceof Error ? x.message : String(x))
    }
  }
  return (
    <Modal
      titulo="Padrões de histórico"
      onClose={onClose}
      rodape={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      <form onSubmit={adicionar} className="space-y-2 rounded-xl bg-slate-50 p-3">
        <div className="text-xs font-bold text-slate-600">Novo histórico padrão</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]">
          <input className="input py-2 text-sm" value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="Ex.: Almoço com amigos" aria-label="Histórico" />
          <Selecao value={categoria} onChange={setCategoria} vazio="Sem categoria" opcoes={categorias.filter((k) => k.ativa).map((k) => ({ value: k.id, label: `${k.nome}${k.tipo === 'receita' ? ' (receita)' : ''}` }))} />
          <button className="btn-primary btn-sm">
            <Plus className="h-3.5 w-3.5" /> Salvar
          </button>
        </div>
        <p className="text-xs text-slate-500">Também dá para salvar pela estrela ao lado do histórico em cada linha. Ao escolher um padrão, a categoria dele vem junto.</p>
      </form>
      {padroes.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">Nenhum padrão salvo ainda.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {padroes.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
              <Star className="h-4 w-4 shrink-0 fill-current text-amber-500" />
              <span className="min-w-0 flex-1 truncate">{p.texto}</span>
              <span className="shrink-0 text-xs text-slate-500">{categorias.find((k) => k.id === p.categoria_id)?.nome ?? ''}</span>
              <button className="icon-btn text-rose-500" aria-label={`Apagar ${p.texto}`} onClick={() => excluir('pes_historicos_padrao', p.id).catch((e: Error) => setErro(e.message))}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Erro>{erro}</Erro>
    </Modal>
  )
}

/** Digitar uma linha do extrato à mão. */
function NovaLinhaForm({ contaId, mes, onClose }: { contaId: string; mes: string; onClose: () => void }) {
  const [sentido, setSentido] = useState<'saida' | 'entrada'>('saida')
  const [data, setData] = useState(mes === mesAtual() ? hoje() : primeiroDia(mes))
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [continuar, setContinuar] = useState(false)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    if (!dataValida(data)) return setErro('Informe a data completa.')
    if (!descricao.trim()) return setErro('Informe a descrição como está no extrato.')
    if (!valor || valor <= 0) return setErro('Informe o valor.')
    try {
      await salvar('pes_extrato', null, { conta_id: contaId, data, descricao: descricao.trim(), valor: sentido === 'saida' ? -valor : valor })
      if (continuar) {
        setDescricao('')
        setValor(null)
        setErro(null)
      } else onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      titulo="Linha do extrato"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-secondary" form="form-linha" onClick={() => setContinuar(true)}>
            Salvar e digitar outra
          </button>
          <button className="btn-primary" form="form-linha" onClick={() => setContinuar(false)}>
            Salvar
          </button>
        </>
      }
    >
      <form id="form-linha" onSubmit={gravar} className="space-y-4">
        <Segmentado
          valor={sentido}
          onChange={setSentido}
          opcoes={[
            { value: 'saida', label: 'Saída (débito)', ativo: 'text-rose-600' },
            { value: 'entrada', label: 'Entrada (crédito)', ativo: 'text-emerald-600' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Valor">
            <CampoValor valor={valor} onChange={setValor} autoFocus />
          </Campo>
          <Campo label="Data">
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
        </div>
        <Campo label="Descrição (como está no extrato)">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: PIX ENVIADO PADARIA" />
        </Campo>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}

/** Saldo final que o banco mostra no extrato. */
function SaldoForm({ contaId, inicial, onClose }: { contaId: string; inicial: { data: string; saldo: number }; onClose: () => void }) {
  const [data, setData] = useState(inicial.data)
  const [saldo, setSaldo] = useState<number | null>(inicial.saldo || null)
  const [negativo, setNegativo] = useState(inicial.saldo < 0)
  const [erro, setErro] = useState<string | null>(null)

  async function gravar(e: FormEvent) {
    e.preventDefault()
    if (!dataValida(data)) return setErro('Informe a data completa.')
    if (saldo === null) return setErro('Informe o saldo.')
    const v = Math.abs(saldo) * (negativo ? -1 : 1)
    await salvarSaldoExtrato(contaId, data, v).then(onClose, (x: Error) => setErro(x.message))
  }

  return (
    <Modal
      titulo="Saldo do extrato"
      onClose={onClose}
      rodape={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-saldo">
            Salvar
          </button>
        </>
      }
    >
      <form id="form-saldo" onSubmit={gravar} className="space-y-4">
        <p className="text-sm text-slate-500">O saldo que aparece no fim do extrato, no dia escolhido.</p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Saldo">
            <CampoValor valor={saldo === null ? null : Math.abs(saldo)} onChange={setSaldo} autoFocus />
          </Campo>
          <Campo label="Em">
            <input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </Campo>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-rose-600" checked={negativo} onChange={(e) => setNegativo(e.target.checked)} />
          Saldo negativo (cheque especial)
        </label>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}
