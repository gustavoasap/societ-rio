import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, CircleAlert, EyeOff, FileUp, Landmark, Pencil, Plus, Scale, Trash2, Undo2 } from 'lucide-react'
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
  buscarSaldoExtrato,
  excluir,
  inserirVarios,
  salvar,
  salvarSaldoExtrato,
  saldoNaData,
  useDados,
} from '../lib/dados'
import { chaveLinha, conciliar, contaBate, lerExtrato, sugestaoPorHistorico, type LinhaExtrato } from '../lib/extrato'
import { dataBR, dataValida, mesPorExtenso, moeda } from '../lib/formato'
import { supabase } from '../lib/supabase'
import { BANCOS } from '../tipos'
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
                ['conciliadas', 'Conciliadas', c.pares.length, 'text-emerald-600'],
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
                onErro={setErro}
                onAviso={setAviso}
              />
            ))}

          {abaAtual === 'conciliadas' && c.pares.length === 0 && <Vazio icone={Scale}>Nenhuma linha conciliada ainda.</Vazio>}
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
                      {!p.sugerido && (
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
  onErro,
  onAviso,
}: {
  linhas: LinhaExtrato[]
  contaId: string
  sugestao: (l: LinhaExtrato) => Sugestao
  onErro: (m: string) => void
  onAviso: (m: string) => void
}) {
  const { categorias, contas } = useApp()
  // o que foi digitado em cada linha (sem nada digitado, vale a sugestão)
  const [edicao, setEdicao] = useState<Record<string, { descricao?: string; classe?: string }>>({})
  const [gravando, setGravando] = useState(false)
  const outras = contas.filter((k) => k.ativa && k.id !== contaId)

  const valores = (l: LinhaExtrato) => {
    const s = sugestao(l)
    const e = edicao[l.id] ?? {}
    return {
      descricao: e.descricao ?? s?.descricao ?? l.descricao,
      classe: e.classe ?? (s?.transferir_para ? `t:${s.transferir_para}` : (s?.categoria_id ?? '')),
      sugerido: !!s && e.descricao === undefined && e.classe === undefined,
    }
  }
  const mudar = (id: string, campo: 'descricao' | 'classe', v: string) => setEdicao((x) => ({ ...x, [id]: { ...x[id], [campo]: v } }))

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
          <p className="text-xs text-slate-500">Ajuste o histórico se quiser (o valor fica o do banco), escolha a categoria e lance. Da próxima vez, o mesmo histórico já vem preenchido.</p>
        </div>
        {classificadas.length > 0 && (
          <button className="btn-primary btn-sm" onClick={() => lancarVarias(classificadas)} disabled={gravando}>
            <Check className="h-3.5 w-3.5" /> Lançar {classificadas.length === 1 ? 'a classificada' : `as ${classificadas.length} classificadas`}
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {linhas.map((l) => {
          const v = valores(l)
          const tipo = l.valor > 0 ? 'receita' : 'despesa'
          return (
            <div key={l.id} className="grid grid-cols-1 gap-2 py-3 sm:grid-cols-[5.5rem_minmax(0,1fr)_7.5rem_minmax(0,13rem)_auto] sm:items-center sm:gap-3">
              <div className="flex items-center justify-between sm:block">
                <span className="text-xs text-slate-500 tabular-nums">{dataBR(l.data)}</span>
                <span className={`font-semibold tabular-nums sm:hidden ${corValor(l.valor)}`}>{comSinal(l.valor)}</span>
              </div>
              <div className="min-w-0">
                <input className="input py-2 text-sm" value={v.descricao} onChange={(e) => mudar(l.id, 'descricao', e.target.value)} aria-label="Histórico" />
                {v.descricao !== l.descricao && <div className="mt-0.5 truncate text-[0.6875rem] text-slate-400">No banco: {l.descricao}</div>}
              </div>
              <span className={`hidden text-right font-semibold tabular-nums sm:block ${corValor(l.valor)}`}>{comSinal(l.valor)}</span>
              <div className="min-w-0">
                <select className="input cursor-pointer py-2 text-sm" value={v.classe} onChange={(e) => mudar(l.id, 'classe', e.target.value)} aria-label="Categoria">
                  <option value="">Escolha a categoria…</option>
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
                {v.sugerido && v.classe && <div className="mt-0.5 text-[0.6875rem] font-semibold text-azul-600">Como da última vez</div>}
              </div>
              <div className="flex items-center justify-end gap-1">
                <button className="btn-primary btn-sm" onClick={() => lancarVarias([l])} disabled={gravando}>
                  Lançar
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
          )
        })}
      </div>
    </section>
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
