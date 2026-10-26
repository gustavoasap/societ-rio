import { useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, CircleAlert, EyeOff, FileUp, Landmark, Plus, Scale, Trash2, Undo2 } from 'lucide-react'
import { LinhaLancamento } from '../components/LinhaLancamento'
import { Cabecalho, Campo, CampoValor, Carregando, Erro, Modal, Segmentado, Selecao, SeletorMes, Vazio } from '../components/ui'
import { useApp } from '../contexto'
import { hoje, mesAtual, primeiroDia, somarDias, somarMesesAoMes, ultimoDia } from '../lib/datas'
import {
  avisarMudanca,
  buscarChavesExtrato,
  buscarExtrato,
  buscarLancamentos,
  buscarSaldoExtrato,
  excluir,
  inserirVarios,
  salvar,
  salvarSaldoExtrato,
  saldoNaData,
  useDados,
} from '../lib/dados'
import { categoriaPorDescricao, chaveLinha, conciliar, lerExtrato, type LinhaExtrato } from '../lib/extrato'
import { dataBR, dataValida, mesPorExtenso, moeda } from '../lib/formato'
import { supabase } from '../lib/supabase'

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
  const saldoApp = useDados(() => (conta ? saldoNaData(conta.id, conta.saldo_inicial, dataSaldo) : Promise.resolve(0)), [conta?.id, conta?.saldo_inicial, dataSaldo])

  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novaLinha, setNovaLinha] = useState(false)
  const [editSaldo, setEditSaldo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
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

  async function importar(f: File) {
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      const lido = lerExtrato(await lerArquivo(f))
      if (!lido.linhas.length) throw new Error('Não encontrei lançamentos nesse arquivo. Use o extrato em OFX (Money/Quicken) ou CSV.')
      const existentes = await buscarChavesExtrato(contaId)
      const fitids = new Set(existentes.map((e) => e.fitid).filter(Boolean))
      const chaves = new Set(existentes.map(chaveLinha))
      const novas = lido.linhas.filter((l) => !(l.fitid && fitids.has(l.fitid)) && !chaves.has(chaveLinha(l)))
      if (novas.length) await inserirVarios('pes_extrato', novas.map((l) => ({ ...l, conta_id: contaId })))
      if (lido.saldo) await salvarSaldoExtrato(contaId, lido.saldo.data, lido.saldo.valor)
      const datas = lido.linhas.map((l) => l.data).sort()
      const ultimoMes = datas.at(-1)!.slice(0, 7)
      setMes(ultimoMes)
      setAviso(
        `${novas.length} ${novas.length === 1 ? 'linha importada' : 'linhas importadas'} (de ${dataBR(datas[0])} a ${dataBR(datas.at(-1)!)})` +
          (lido.linhas.length > novas.length ? `; ${lido.linhas.length - novas.length} já estavam aqui e foram puladas` : '') +
          (lido.saldo ? `. Saldo do banco em ${dataBR(lido.saldo.data)}: ${moeda(lido.saldo.valor)}.` : '.'),
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
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Contador rotulo="Linhas do extrato" valor={extrato.dados!.length} />
            <Contador rotulo="Conciliadas" valor={c.pares.length} cor="text-emerald-600" />
            <Contador rotulo="Falta lançar" valor={c.soExtrato.length} cor={c.soExtrato.length ? 'text-amber-600' : undefined} />
            <Contador rotulo="Só no app" valor={soAppDoMes.length} cor={soAppDoMes.length ? 'text-rose-600' : undefined} />
          </div>

          {c.soExtrato.length > 0 && (
            <section className="cartao space-y-2">
              <h2 className="text-sm font-bold text-slate-800">No extrato, mas não lançado no app</h2>
              <p className="text-xs text-slate-500">Escolha a categoria e toque em Lançar. A categoria fica lembrada para a próxima vez com a mesma descrição.</p>
              <div className="divide-y divide-slate-100">
                {c.soExtrato.map((l) => (
                  <LinhaFaltando key={l.id} linha={l} sugestao={categoriaPorDescricao(l.descricao, todos)} contaId={contaId} onErro={setErro} />
                ))}
              </div>
            </section>
          )}

          {c.pares.length > 0 && (
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

          {soAppDoMes.length > 0 && (
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

          {c.ignoradas.length > 0 && (
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

      {novaLinha && <NovaLinhaForm contaId={contaId} mes={mes} onClose={() => setNovaLinha(false)} />}
      {editSaldo && (
        <SaldoForm contaId={contaId} inicial={saldoBanco.dados ?? { data: fim < hoje() ? fim : hoje(), saldo: 0 }} onClose={() => setEditSaldo(false)} />
      )}
    </div>
  )
}

/** Linha do extrato sem par: escolhe a categoria e lança. */
function LinhaFaltando({ linha, sugestao, contaId, onErro }: { linha: LinhaExtrato; sugestao: string | null; contaId: string; onErro: (m: string) => void }) {
  const { categorias } = useApp()
  const tipo = linha.valor > 0 ? 'receita' : 'despesa'
  const [cat, setCat] = useState(sugestao ?? '')
  const [gravando, setGravando] = useState(false)

  async function lancar() {
    setGravando(true)
    try {
      const l = await salvar('pes_lancamentos', null, {
        tipo,
        descricao: linha.descricao,
        valor: Math.abs(linha.valor),
        data: linha.data,
        conta_id: contaId,
        categoria_id: cat || null,
        pago: true,
      })
      await salvar('pes_extrato', linha.id, { lancamento_id: l.id })
    } catch (e) {
      onErro(e instanceof Error ? e.message : String(e))
      setGravando(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm">
      <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{dataBR(linha.data)}</span>
      <span className="min-w-0 flex-1 font-medium break-words text-slate-800 sm:truncate">{linha.descricao}</span>
      <span className={`font-semibold tabular-nums ${corValor(linha.valor)}`}>{comSinal(linha.valor)}</span>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="min-w-0 flex-1 sm:w-44">
          <Selecao value={cat} onChange={setCat} vazio="Sem categoria" opcoes={categorias.filter((k) => k.tipo === tipo && k.ativa).map((k) => ({ value: k.id, label: k.nome }))} />
        </div>
        <button className="btn-primary btn-sm" onClick={lancar} disabled={gravando}>
          Lançar
        </button>
        <button className="icon-btn" aria-label="Ignorar esta linha" title="Ignorar" onClick={() => salvar('pes_extrato', linha.id, { ignorada: true }).catch((e: Error) => onErro(e.message))}>
          <EyeOff className="h-4 w-4" />
        </button>
        <button
          className="icon-btn text-rose-500"
          aria-label="Apagar esta linha do extrato"
          title="Apagar linha"
          onClick={() => window.confirm('Apagar esta linha do extrato?') && excluir('pes_extrato', linha.id).catch((e: Error) => onErro(e.message))}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function Contador({ rotulo, valor, cor = 'text-slate-900' }: { rotulo: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{rotulo}</div>
      <div className={`text-lg font-extrabold tabular-nums ${cor}`}>{valor}</div>
    </div>
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
