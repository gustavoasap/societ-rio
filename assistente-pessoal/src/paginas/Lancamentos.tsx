import { useState } from 'react'
import { Plus, Search } from 'lucide-react'
import { LinhaLancamento } from '../components/LinhaLancamento'
import { Cabecalho, Carregando, SeletorMes, Selecao, Vazio } from '../components/ui'
import { useApp } from '../contexto'
import { resumo } from '../lib/calculos'
import { mesAtual, primeiroDia, ultimoDia } from '../lib/datas'
import { buscarLancamentos, useDados } from '../lib/dados'
import { diaPorExtenso, moeda } from '../lib/formato'
import { NATUREZAS, type Lancamento } from '../tipos'

export function Lancamentos() {
  const { contas, categorias, pessoas, nome, abrirLancamento } = useApp()
  const [mes, setMes] = useState(mesAtual)
  const [tipo, setTipo] = useState('')
  const [contaId, setContaId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [situacao, setSituacao] = useState('')
  const [busca, setBusca] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [natureza, setNatureza] = useState('')
  const lanc = useDados(() => buscarLancamentos(primeiroDia(mes), ultimoDia(mes)), [mes])

  const t = busca.trim().toLowerCase()
  const cats = new Map(categorias.map((c) => [c.id, c]))
  const lista = (lanc.dados ?? []).filter(
    (l) =>
      (!tipo || l.tipo === tipo) &&
      (!contaId || l.conta_id === contaId || l.conta_destino_id === contaId) &&
      (!categoriaId || l.categoria_id === categoriaId) &&
      (!situacao || (situacao === 'aberto' ? !l.pago : l.pago)) &&
      (!pessoa || (pessoa === 'eu' ? !l.pessoa_id : l.pessoa_id === pessoa)) &&
      (!natureza || (l.tipo !== 'transferencia' && (l.natureza ?? cats.get(l.categoria_id ?? '')?.natureza ?? 'variavel') === natureza)) &&
      (!t || `${l.descricao} ${l.observacao ?? ''}`.toLowerCase().includes(t)),
  )
  // totais: só o que é meu (gastos de terceiros ficam de fora)
  const r = resumo(lista.filter((l) => !l.pessoa_id))

  const porDia = new Map<string, Lancamento[]>()
  for (const l of lista) porDia.set(l.data, [...(porDia.get(l.data) ?? []), l])

  const filtrando = tipo || contaId || categoriaId || situacao || pessoa || natureza || t
  return (
    <div className="space-y-4">
      <Cabecalho
        titulo="Lançamentos"
        descricao="Receitas, despesas e transferências do mês."
        acoes={
          <>
            <SeletorMes mes={mes} onChange={setMes} />
            <button className="btn-primary hidden lg:inline-flex" onClick={() => abrirLancamento()}>
              <Plus className="h-4 w-4" /> Novo
            </button>
          </>
        }
      />

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Mini rotulo="Receitas" valor={r.receitas} cor="text-emerald-600" />
        <Mini rotulo="Despesas" valor={r.despesas} cor="text-orange-600" />
        <Mini rotulo="Resultado" valor={r.resultado} cor={r.resultado < 0 ? 'text-rose-600' : 'text-azul-700'} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <label className="relative col-span-2 sm:col-span-3 xl:col-span-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar descrição" />
        </label>
        <Selecao
          value={tipo}
          onChange={setTipo}
          vazio="Todos os tipos"
          opcoes={[
            { value: 'receita', label: 'Receitas' },
            { value: 'despesa', label: 'Despesas' },
            { value: 'transferencia', label: 'Transferências' },
          ]}
        />
        <Selecao
          value={situacao}
          onChange={setSituacao}
          vazio="Pagos e em aberto"
          opcoes={[
            { value: 'aberto', label: 'Só em aberto' },
            { value: 'pago', label: 'Só pagos/recebidos' },
          ]}
        />
        <Selecao value={contaId} onChange={setContaId} vazio="Todas as contas" opcoes={contas.map((c) => ({ value: c.id, label: c.nome }))} />
        <Selecao value={categoriaId} onChange={setCategoriaId} vazio="Todas as categorias" opcoes={categorias.map((c) => ({ value: c.id, label: `${c.nome} (${c.tipo === 'receita' ? 'rec.' : 'desp.'})` }))} />
        <Selecao value={natureza} onChange={setNatureza} vazio="Fixas, variáveis e eventuais" opcoes={NATUREZAS.map((n) => ({ value: n.value, label: `Só ${n.label.toLowerCase()}s` }))} />
        <Selecao value={pessoa} onChange={setPessoa} vazio="Todos os responsáveis" opcoes={[{ value: 'eu', label: `Só meus (${nome})` }, ...pessoas.map((p) => ({ value: p.id, label: `Só de ${p.nome}` }))]} />
      </div>

      {lanc.erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{lanc.erro}</p>}
      {lanc.carregando ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <Vazio>
          <span>{filtrando ? 'Nenhum lançamento com esses filtros.' : 'Nenhum lançamento neste mês.'}</span>
          {!filtrando && (
            <button className="btn-primary btn-sm mt-1" onClick={() => abrirLancamento()}>
              <Plus className="h-3.5 w-3.5" /> Lançar agora
            </button>
          )}
        </Vazio>
      ) : (
        <div className="space-y-3">
          {[...porDia.entries()].map(([dia, itens]) => (
            <section key={dia} className="cartao py-2 sm:py-2">
              <div className="flex items-center justify-between border-b border-slate-100 py-2 text-xs font-bold text-slate-500">
                <span className="first-letter:uppercase">{diaPorExtenso(dia)}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {itens.map((l) => (
                  <LinhaLancamento key={l.id} l={l} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Mini({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div className="cartao px-3 py-3 sm:px-4">
      <div className="text-[0.6875rem] font-semibold text-slate-500 uppercase">{rotulo}</div>
      <div className={`mt-0.5 text-xs font-extrabold tabular-nums min-[400px]:text-sm sm:text-lg ${cor}`}>{moeda(valor)}</div>
    </div>
  )
}
