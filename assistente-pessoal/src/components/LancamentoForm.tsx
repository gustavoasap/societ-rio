import { useState, type FormEvent } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../contexto'
import { gerarRepeticao } from '../lib/calculos'
import { hoje } from '../lib/datas'
import { atualizarDaquiEmDiante, excluir, excluirDaquiEmDiante, inserirVarios, salvar } from '../lib/dados'
import { moeda } from '../lib/formato'
import type { Lancamento, TipoLancamento } from '../tipos'
import { Campo, CampoValor, Erro, Modal, Segmentado, Selecao } from './ui'

type Repeticao = 'nao' | 'fixo' | 'parcelado'

export function LancamentoForm({ inicial, onClose }: { inicial: Lancamento | { tipo: TipoLancamento; conta_id?: string }; onClose: () => void }) {
  const { contas, categorias } = useApp()
  const edicao = 'id' in inicial ? inicial : null
  const ativas = contas.filter((c) => c.ativa || c.id === edicao?.conta_id || c.id === edicao?.conta_destino_id)

  const [tipo, setTipo] = useState<TipoLancamento>(inicial.tipo)
  const [valor, setValor] = useState<number | null>(edicao?.valor ?? null)
  const [descricao, setDescricao] = useState(edicao?.descricao ?? '')
  const [data, setData] = useState(edicao?.data ?? hoje())
  const [contaId, setContaId] = useState(inicial.conta_id ?? ativas[0]?.id ?? '')
  const [destinoId, setDestinoId] = useState(edicao?.conta_destino_id ?? '')
  const [categoriaId, setCategoriaId] = useState(edicao?.categoria_id ?? '')
  const [pago, setPago] = useState(edicao?.pago ?? true)
  const [pagoMexido, setPagoMexido] = useState(!!edicao)
  const [observacao, setObservacao] = useState(edicao?.observacao ?? '')
  const [repeticao, setRepeticao] = useState<Repeticao>('nao')
  const [vezes, setVezes] = useState(12)
  const [aplicarProximos, setAplicarProximos] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const cats = categorias.filter((c) => c.tipo === tipo && (c.ativa || c.id === categoriaId))

  function mudarData(d: string) {
    setData(d)
    // lançamento futuro nasce "em aberto", até o usuário marcar
    if (!pagoMexido) setPago(d <= hoje())
  }

  async function gravar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!valor || valor <= 0) return setErro('Informe um valor maior que zero.')
    if (!contaId) return setErro('Cadastre uma conta primeiro (menu Contas).')
    if (tipo === 'transferencia' && (!destinoId || destinoId === contaId)) return setErro('Escolha a conta de destino (diferente da de origem).')
    const desc = descricao.trim() || (tipo === 'transferencia' ? 'Transferência' : (cats.find((c) => c.id === categoriaId)?.nome ?? ''))
    if (!desc) return setErro('Informe uma descrição.')

    const comum = {
      tipo,
      conta_id: contaId,
      conta_destino_id: tipo === 'transferencia' ? destinoId : null,
      categoria_id: tipo === 'transferencia' ? null : categoriaId || null,
      observacao: observacao.trim() || null,
    }
    setSalvando(true)
    try {
      if (edicao) {
        if (aplicarProximos && edicao.grupo) {
          // data e "pago" são de cada lançamento; o resto vale para a sequência
          await atualizarDaquiEmDiante(edicao, { ...comum, descricao: desc, valor })
          await salvar('pes_lancamentos', edicao.id, { data, pago })
        } else await salvar('pes_lancamentos', edicao.id, { ...comum, descricao: desc, valor, data, pago })
      } else if (repeticao === 'nao') {
        await salvar('pes_lancamentos', null, { ...comum, descricao: desc, valor, data, pago })
      } else {
        const grupo = crypto.randomUUID()
        const hj = hoje()
        const linhas = gerarRepeticao({ descricao: desc, valor, data }, Math.max(2, Math.min(120, vezes)), repeticao).map((p, i) => ({
          ...comum,
          ...p,
          grupo,
          // a 1ª segue o que foi marcado; as futuras ficam em aberto
          pago: i === 0 ? pago : p.data <= hj && pago,
        }))
        await inserirVarios('pes_lancamentos', linhas)
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
    const msg = todos ? 'Excluir este lançamento e todos os próximos da sequência?' : 'Excluir este lançamento?'
    if (!window.confirm(msg)) return
    try {
      if (todos) await excluirDaquiEmDiante(edicao)
      else await excluir('pes_lancamentos', edicao.id)
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  const opcoesContas = ativas.map((c) => ({ value: c.id, label: c.nome }))
  const rotuloPago = tipo === 'receita' ? 'Já recebi' : tipo === 'despesa' ? 'Já paguei' : 'Já transferi'
  const valorParcela = valor && repeticao === 'parcelado' && vezes > 1 ? valor / vezes : null

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
              {edicao.grupo && (
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
          }}
          opcoes={[
            { value: 'despesa', label: 'Despesa', ativo: 'text-rose-600' },
            { value: 'receita', label: 'Receita', ativo: 'text-emerald-600' },
            { value: 'transferencia', label: 'Transferência' },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo label={repeticao === 'parcelado' ? 'Valor total' : 'Valor'}>
            <CampoValor valor={valor} onChange={setValor} autoFocus={!edicao} />
          </Campo>
          <Campo label="Data">
            <input className="input" type="date" value={data} onChange={(e) => mudarData(e.target.value)} required />
          </Campo>
        </div>
        <Campo label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'transferencia' ? 'Transferência' : 'Ex.: Supermercado, aluguel, salário'} />
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
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Categoria">
              <Selecao value={categoriaId} onChange={setCategoriaId} opcoes={cats.map((c) => ({ value: c.id, label: c.nome }))} vazio="Sem categoria" />
            </Campo>
            <Campo label={tipo === 'receita' ? 'Entra em' : 'Sai de'}>
              <Selecao value={contaId} onChange={setContaId} opcoes={opcoesContas} />
            </Campo>
          </div>
        )}

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
          <span className="text-sm font-semibold text-slate-700">{rotuloPago}</span>
          {!pago && <span className="ml-auto text-xs text-amber-600">fica como “a {tipo === 'receita' ? 'receber' : 'pagar'}”</span>}
        </label>

        {!edicao && (
          <div className="space-y-3 rounded-xl bg-slate-50 p-3">
            <Segmentado
              valor={repeticao}
              onChange={setRepeticao}
              opcoes={[
                { value: 'nao', label: 'Única' },
                { value: 'fixo', label: 'Todo mês' },
                { value: 'parcelado', label: 'Parcelado' },
              ]}
            />
            {repeticao !== 'nao' && (
              <Campo
                label={repeticao === 'fixo' ? 'Repetir por quantos meses?' : 'Quantas parcelas?'}
                dica={valorParcela ? `${vezes}x de ${moeda(Math.floor(valorParcela * 100) / 100)}` : repeticao === 'fixo' ? 'Cria um lançamento por mês, a partir da data acima.' : undefined}
              >
                <input className="input" type="number" min={2} max={120} value={vezes} onChange={(e) => setVezes(Number(e.target.value))} />
              </Campo>
            )}
          </div>
        )}

        {edicao?.grupo && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-azul-50 px-3.5 py-3 text-sm text-azul-800">
            <input type="checkbox" className="h-5 w-5 accent-azul-600" checked={aplicarProximos} onChange={(e) => setAplicarProximos(e.target.checked)} />
            Aplicar descrição, valor, conta e categoria também aos próximos
            {edicao.parcelas ? ` (parcela ${edicao.parcela}/${edicao.parcelas})` : ''}
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
