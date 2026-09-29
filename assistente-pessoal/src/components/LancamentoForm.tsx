import { useState, type FormEvent } from 'react'
import { CreditCard, Repeat, Trash2 } from 'lucide-react'
import { useApp, type InicialLancamento } from '../contexto'
import { hoje, type ModoDiaUtil } from '../lib/datas'
import { atualizarDaquiEmDiante, excluir, excluirDaquiEmDiante, gerarRecorrencias, inserirVarios, salvar } from '../lib/dados'
import { datasDaFatura, faturaDe, gerarParcelas } from '../lib/financas'
import { dataBR, mesAbreviado, moeda } from '../lib/formato'
import { supabase } from '../lib/supabase'
import { NATUREZAS, rotuloDe, type Lancamento, type Natureza, type TipoLancamento } from '../tipos'
import { CampoDia } from './CampoDia'
import { SeletorPessoa } from './SeletorPessoa'
import { Campo, CampoValor, Erro, Modal, Segmentado, Selecao } from './ui'

type Repeticao = 'nao' | 'parcelado' | 'recorrente'

export function LancamentoForm({ inicial, onClose }: { inicial: InicialLancamento; onClose: () => void }) {
  const { contas, categorias } = useApp()
  const edicao = 'id' in inicial ? (inicial as Lancamento) : null
  const ativas = contas.filter((c) => c.ativa || c.id === edicao?.conta_id || c.id === edicao?.conta_destino_id)

  const [tipo, setTipo] = useState<TipoLancamento>(inicial.tipo)
  const [valor, setValor] = useState<number | null>(inicial.valor ?? null)
  const [descricao, setDescricao] = useState(inicial.descricao ?? '')
  const [data, setData] = useState(inicial.data ?? hoje())
  const [contaId, setContaId] = useState(inicial.conta_id ?? ativas.find((c) => c.tipo !== 'cartao')?.id ?? ativas[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(inicial.conta_destino_id ?? '')
  const [categoriaId, setCategoriaId] = useState(inicial.categoria_id ?? '')
  const [natureza, setNatureza] = useState<Natureza | ''>(edicao?.natureza ?? '')
  const [pessoaId, setPessoaId] = useState(edicao?.pessoa_id ?? '')
  const [reembolsado, setReembolsado] = useState(edicao?.reembolsado ?? false)
  const [pago, setPago] = useState(edicao?.pago ?? true)
  const [pagoMexido, setPagoMexido] = useState(!!edicao)
  const [observacao, setObservacao] = useState(edicao?.observacao ?? '')
  const [repeticao, setRepeticao] = useState<Repeticao>('nao')
  const [valorEhTotal, setValorEhTotal] = useState(false)
  const [parcelaAtual, setParcelaAtual] = useState(1)
  const [totalParcelas, setTotalParcelas] = useState(10)
  const [fim, setFim] = useState('')
  const [diaRec, setDiaRec] = useState(() => Number((inicial.data ?? hoje()).slice(8, 10)))
  const [modoRec, setModoRec] = useState<ModoDiaUtil | null>(null)
  const [autoPago, setAutoPago] = useState(false)
  const [aplicarProximos, setAplicarProximos] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const conta = contas.find((c) => c.id === contaId)
  const ehCartao = conta?.tipo === 'cartao'
  const cats = categorias.filter((c) => c.tipo === tipo && (c.ativa || c.id === categoriaId))
  const cat = categorias.find((c) => c.id === categoriaId)
  const sequencia = !!(edicao?.grupo || edicao?.recorrencia_id)

  function mudarData(d: string) {
    setData(d)
    // lançamento futuro nasce "em aberto", até o usuário marcar
    if (!pagoMexido) setPago(d <= hoje())
  }

  async function gravar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!valor || valor <= 0) return setErro('Informe um valor maior que zero.')
    if (!contaId) return setErro('Cadastre uma conta ou cartão primeiro (menu Contas).')
    if (tipo === 'transferencia' && (!destinoId || destinoId === contaId)) return setErro('Escolha a conta de destino (diferente da de origem).')
    const desc = descricao.trim() || (tipo === 'transferencia' ? 'Transferência' : (cat?.nome ?? ''))
    if (!desc) return setErro('Informe uma descrição.')
    if (repeticao === 'recorrente' && (!diaRec || diaRec < 1 || diaRec > (modoRec ? 23 : 31))) return setErro(modoRec ? 'Informe qual dia útil (de 1 a 23).' : 'Informe o dia do mês.')
    if (repeticao === 'parcelado' && (totalParcelas < 2 || parcelaAtual < 1 || parcelaAtual > totalParcelas)) return setErro('Confira a parcela atual e o total de parcelas.')

    const transf = tipo === 'transferencia'
    const comum = {
      tipo,
      conta_id: contaId,
      conta_destino_id: transf ? destinoId : null,
      categoria_id: transf ? null : categoriaId || null,
      natureza: transf ? null : natureza || null,
      pessoa_id: tipo === 'despesa' ? pessoaId || null : null,
      reembolsado: tipo === 'despesa' && !!pessoaId && reembolsado,
      observacao: observacao.trim() || null,
    }
    // no cartão, a compra entra na fatura na hora; "pagar" é pagar a fatura
    const pagoFinal = ehCartao && tipo !== 'transferencia' ? true : pago

    setSalvando(true)
    try {
      if (edicao) {
        if (aplicarProximos && edicao.recorrencia_id) {
          await supabase
            .from('pes_recorrencias')
            .update({ descricao: desc, valor, conta_id: contaId, categoria_id: comum.categoria_id, natureza: comum.natureza, pessoa_id: comum.pessoa_id })
            .eq('id', edicao.recorrencia_id)
          const { error } = await supabase
            .from('pes_lancamentos')
            .update({ ...comum, descricao: desc, valor })
            .eq('recorrencia_id', edicao.recorrencia_id)
            .gte('data', edicao.data)
          if (error) throw new Error(error.message)
          await salvar('pes_lancamentos', edicao.id, { data, pago: pagoFinal })
        } else if (aplicarProximos && edicao.grupo) {
          // data e "pago" são de cada lançamento; o resto vale para a sequência
          await atualizarDaquiEmDiante(edicao, { ...comum, descricao: desc, valor })
          await salvar('pes_lancamentos', edicao.id, { data, pago: pagoFinal })
        } else await salvar('pes_lancamentos', edicao.id, { ...comum, descricao: desc, valor, data, pago: pagoFinal })
      } else if (repeticao === 'recorrente' && !transf) {
        await salvar('pes_recorrencias', null, {
          tipo,
          descricao: desc,
          valor,
          dia: diaRec,
          dia_util: modoRec,
          conta_id: contaId,
          categoria_id: comum.categoria_id,
          pessoa_id: comum.pessoa_id,
          natureza: comum.natureza,
          auto_pago: autoPago,
          inicio: data,
          fim: fim || null,
          observacao: comum.observacao,
        })
        await gerarRecorrencias()
      } else if (repeticao === 'parcelado') {
        const grupo = crypto.randomUUID()
        const hj = hoje()
        const linhas = gerarParcelas({ valor, valorEhTotal, data, atual: parcelaAtual, total: totalParcelas }).map((p, i) => ({
          ...comum,
          ...p,
          descricao: desc,
          grupo,
          // fora do cartão: a 1ª segue o que foi marcado; as futuras ficam em aberto
          pago: ehCartao || (i === 0 ? pago : p.data <= hj && pago),
        }))
        await inserirVarios('pes_lancamentos', linhas)
      } else {
        await salvar('pes_lancamentos', null, { ...comum, descricao: desc, valor, data, pago: pagoFinal })
      }
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function apagar(todos: boolean) {
    if (!edicao) return
    const msg = todos
      ? edicao.recorrencia_id
        ? 'Excluir este lançamento e os próximos, e encerrar a recorrência?'
        : 'Excluir este lançamento e todos os próximos da sequência?'
      : 'Excluir este lançamento?'
    if (!window.confirm(msg)) return
    try {
      if (todos && edicao.recorrencia_id) {
        await supabase.from('pes_recorrencias').update({ ativa: false }).eq('id', edicao.recorrencia_id)
        const { error } = await supabase.from('pes_lancamentos').delete().eq('recorrencia_id', edicao.recorrencia_id).gte('data', edicao.data)
        if (error) throw new Error(error.message)
        await excluir('pes_lancamentos', edicao.id).catch(() => {})
      } else if (todos) await excluirDaquiEmDiante(edicao)
      else await excluir('pes_lancamentos', edicao.id)
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const opcoesContas = ativas.map((c) => ({ value: c.id, label: c.tipo === 'cartao' ? `💳 ${c.nome}` : c.nome }))
  const rotuloPago = tipo === 'receita' ? 'Já recebi' : tipo === 'despesa' ? 'Já paguei' : 'Já transferi'
  const fatura = ehCartao && conta ? faturaDe(data, conta.dia_fechamento, conta.dia_vencimento) : null
  const venc = fatura && conta ? datasDaFatura(fatura, conta.dia_fechamento, conta.dia_vencimento).vencimento : null
  const previa =
    repeticao === 'parcelado' && valor && totalParcelas >= 2 && parcelaAtual >= 1 && parcelaAtual <= totalParcelas
      ? gerarParcelas({ valor, valorEhTotal, data, atual: parcelaAtual, total: totalParcelas })
      : null

  return (
    <Modal
      titulo={edicao ? 'Editar lançamento' : 'Novo lançamento'}
      onClose={onClose}
      rodape={
        <>
          {edicao && (
            <div className="mr-auto flex gap-1">
              <button type="button" className="btn-danger btn-sm" onClick={() => apagar(false)}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
              {sequencia && (
                <button type="button" className="btn-ghost btn-sm text-rose-600" onClick={() => apagar(true)}>
                  Este e os próximos
                </button>
              )}
            </div>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-lancamento" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-lancamento" onSubmit={gravar} className="space-y-4">
        <Segmentado
          valor={tipo}
          onChange={(t) => {
            setTipo(t)
            setCategoriaId('')
            if (t === 'transferencia' && repeticao !== 'nao') setRepeticao('nao')
          }}
          opcoes={[
            { value: 'despesa', label: 'Despesa', ativo: 'text-rose-600' },
            { value: 'receita', label: 'Receita', ativo: 'text-emerald-600' },
            { value: 'transferencia', label: 'Transferência' },
          ]}
        />

        {!edicao && tipo !== 'transferencia' && (
          <Segmentado
            valor={repeticao}
            onChange={setRepeticao}
            opcoes={[
              { value: 'nao', label: 'Única' },
              { value: 'parcelado', label: 'Parcelada' },
              { value: 'recorrente', label: 'Todo mês' },
            ]}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <Campo label={repeticao === 'parcelado' ? (valorEhTotal ? 'Valor total da compra' : 'Valor da parcela') : 'Valor'}>
            <CampoValor valor={valor} onChange={setValor} autoFocus={!edicao && !inicial.valor} />
          </Campo>
          <Campo label={repeticao === 'parcelado' ? 'Data da parcela atual' : repeticao === 'recorrente' ? 'Começa em' : ehCartao ? 'Data da compra' : 'Data'}>
            <input className="input" type="date" value={data} onChange={(e) => mudarData(e.target.value)} required />
          </Campo>
        </div>

        {repeticao === 'parcelado' && (
          <div className="space-y-3 rounded-xl bg-azul-50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Parcela atual">
                <input className="input" type="number" min={1} max={totalParcelas} value={parcelaAtual} onChange={(e) => setParcelaAtual(Number(e.target.value))} />
              </Campo>
              <Campo label="Total de parcelas">
                <input className="input" type="number" min={2} max={120} value={totalParcelas} onChange={(e) => setTotalParcelas(Number(e.target.value))} />
              </Campo>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={valorEhTotal} onChange={(e) => setValorEhTotal(e.target.checked)} />
              O valor informado é o total da compra (dividir pelas parcelas)
            </label>
            {previa && (
              <p className="text-xs text-azul-900">
                Vai lançar <b>{previa.length}</b> {previa.length === 1 ? 'parcela' : 'parcelas'} ({previa[0].parcela}/{previa[0].parcelas} a {previa.at(-1)!.parcela}/{previa.at(-1)!.parcelas}) de{' '}
                <b>{moeda(previa.at(-1)!.valor)}</b>, de {mesAbreviado(previa[0].data.slice(0, 7))} a {mesAbreviado(previa.at(-1)!.data.slice(0, 7))}.
              </p>
            )}
          </div>
        )}

        {repeticao === 'recorrente' && (
          <div className="space-y-3 rounded-xl bg-azul-50 p-3">
            <p className="flex items-start gap-2 text-xs text-azul-900">
              <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Repete todo mês a partir de {dataBR(data)}. Os meses vão sendo lançados sozinhos (sempre até o mês seguinte). Ideal para salário, aluguel, assinaturas e contas fixas.
            </p>
            <CampoDia dia={diaRec} setDia={setDiaRec} modo={modoRec} setModo={setModoRec} aPartirDe={data.slice(0, 7)} />
            <div className="grid grid-cols-2 items-end gap-3">
              <Campo label="Até (opcional)">
                <input className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </Campo>
              {!ehCartao && (
                <label className="flex cursor-pointer items-center gap-2 pb-3 text-sm text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={autoPago} onChange={(e) => setAutoPago(e.target.checked)} />
                  {tipo === 'receita' ? 'Cai sozinho na conta' : 'Débito automático'}
                </label>
              )}
            </div>
          </div>
        )}

        <Campo label="Descrição">
          <input
            className="input"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder={tipo === 'transferencia' ? 'Transferência' : tipo === 'receita' ? 'Ex.: Pró-labore ASAP' : 'Ex.: Supermercado, aluguel, Netflix'}
          />
        </Campo>

        {tipo === 'transferencia' ? (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="De">
              <Selecao value={contaId} onChange={setContaId} opcoes={opcoesContas} />
            </Campo>
            <Campo label="Para">
              <Selecao value={destinoId} onChange={setDestinoId} opcoes={opcoesContas.filter((o) => o.value !== contaId)} vazio="Escolha..." />
            </Campo>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Categoria">
                <Selecao value={categoriaId} onChange={setCategoriaId} opcoes={cats.map((c) => ({ value: c.id, label: c.nome }))} vazio="Sem categoria" />
              </Campo>
              <Campo label={tipo === 'receita' ? 'Entra em' : 'Pago com'}>
                <Selecao value={contaId} onChange={setContaId} opcoes={opcoesContas} />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Classificação">
                <Selecao
                  value={natureza}
                  onChange={(v) => setNatureza(v as Natureza | '')}
                  vazio={`${rotuloDe(NATUREZAS, cat?.natureza ?? 'variavel')} (padrão)`}
                  opcoes={NATUREZAS}
                />
              </Campo>
              {tipo === 'despesa' && (
                <Campo label="Responsável">
                  <SeletorPessoa valor={pessoaId} onChange={setPessoaId} />
                </Campo>
              )}
            </div>
          </>
        )}

        {tipo === 'despesa' && pessoaId && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
            <input type="checkbox" className="h-5 w-5 accent-amber-600" checked={reembolsado} onChange={(e) => setReembolsado(e.target.checked)} />
            Essa pessoa já me pagou esse valor
          </label>
        )}

        {ehCartao && tipo !== 'transferencia' ? (
          <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-3 text-sm text-violet-900">
            <CreditCard className="h-4 w-4 shrink-0" />
            {fatura && (conta?.dia_fechamento ? `Cai na fatura de ${mesAbreviado(fatura)}${venc ? ` (vence ${dataBR(venc)})` : ''}.` : 'Entra na fatura do cartão.')}
            {!conta?.dia_fechamento && <span className="text-xs text-violet-700"> Cadastre o dia de fechamento em Cartões para calcular a fatura.</span>}
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3">
            <input
              type="checkbox"
              className="h-5 w-5 accent-azul-600"
              checked={pago}
              onChange={(e) => {
                setPago(e.target.checked)
                setPagoMexido(true)
              }}
            />
            <span className="text-sm font-semibold text-slate-700">{repeticao === 'nao' ? rotuloPago : `${rotuloPago} (a 1ª)`}</span>
            {!pago && <span className="ml-auto text-xs text-amber-600">fica “a {tipo === 'receita' ? 'receber' : 'pagar'}”</span>}
          </label>
        )}

        {sequencia && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-azul-50 px-3.5 py-3 text-sm text-azul-800">
            <input type="checkbox" className="h-5 w-5 accent-azul-600" checked={aplicarProximos} onChange={(e) => setAplicarProximos(e.target.checked)} />
            {edicao?.recorrencia_id
              ? 'Aplicar também aos próximos meses (muda a recorrência, ex.: reajuste de salário ou aluguel)'
              : `Aplicar descrição, valor, conta e categoria às próximas parcelas${edicao?.parcelas ? ` (esta é a ${edicao.parcela}/${edicao.parcelas})` : ''}`}
          </label>
        )}

        <Campo label="Observação">
          <textarea className="input min-h-16" value={observacao} onChange={(e) => setObservacao(e.target.value)} />
        </Campo>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}
