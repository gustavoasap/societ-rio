import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Bolinha, Cabecalho, Campo, CampoValor, Carregando, Erro, Modal, Progresso, SeletorMes } from '../components/ui'
import { corDe, iconeDe } from '../components/visual'
import { useApp } from '../contexto'
import { despesasPorCategoria, somar } from '../lib/calculos'
import { diasEntre, diasNoMes, hoje, mesAtual, primeiroDia, ultimoDia } from '../lib/datas'
import { buscarLancamentos, salvar, useDados } from '../lib/dados'
import { moeda, percentual } from '../lib/formato'
import type { Categoria } from '../tipos'

export function Orcamento() {
  const { categorias } = useApp()
  const [mes, setMes] = useState(mesAtual)
  const [edit, setEdit] = useState<Categoria | null>(null)
  const lanc = useDados(() => buscarLancamentos(primeiroDia(mes), ultimoDia(mes)), [mes])

  if (lanc.carregando) return <Carregando />
  const gastos = new Map(despesasPorCategoria(lanc.dados ?? []).map((g) => [g.categoriaId, g.total]))
  const cats = categorias
    .filter((c) => c.tipo === 'despesa' && (c.ativa || gastos.has(c.id)))
    .map((c) => ({ c, gasto: gastos.get(c.id) ?? 0 }))
    .sort((a, b) => Number(!!b.c.orcamento_mensal) - Number(!!a.c.orcamento_mensal) || b.gasto - a.gasto)
  const semCategoria = gastos.get('') ?? 0

  const comLimite = cats.filter((x) => x.c.orcamento_mensal)
  const totalOrcado = somar(comLimite.map((x) => x.c.orcamento_mensal!))
  const totalGastoOrcado = somar(comLimite.map((x) => x.gasto))
  const totalGasto = somar([...gastos.values()])

  // ritmo do mês: quanto do mês já passou, para comparar com o quanto do orçamento já foi
  const [a, m] = mes.split('-').map(Number)
  const hj = hoje()
  const decorrido = mes < mesAtual() ? 1 : mes > mesAtual() ? 0 : (diasEntre(primeiroDia(mes), hj) + 1) / diasNoMes(a, m)

  return (
    <div className="space-y-4">
      <Cabecalho titulo="Orçamento" descricao="Limite mensal por categoria de despesa e quanto já foi usado." acoes={<SeletorMes mes={mes} onChange={setMes} />} />

      <section className="cartao">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">Gasto nas categorias com limite</div>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
              {moeda(totalGastoOrcado)} <span className="text-base font-semibold text-slate-400">de {moeda(totalOrcado)}</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            Total de despesas do mês: <b className="text-slate-800">{moeda(totalGasto)}</b>
            {decorrido > 0 && decorrido < 1 && <div>{percentual(decorrido)} do mês já passou</div>}
          </div>
        </div>
        {totalOrcado > 0 && (
          <div className="relative mt-3">
            <Progresso fracao={totalGastoOrcado / totalOrcado} alerta={totalGastoOrcado > totalOrcado} />
            {decorrido > 0 && decorrido < 1 && <div className="absolute -top-1 h-4 w-0.5 bg-slate-800" style={{ left: `${decorrido * 100}%` }} title="Hoje" />}
          </div>
        )}
        {totalOrcado === 0 && <p className="mt-2 text-sm text-slate-500">Toque no lápis de uma categoria para definir um limite mensal.</p>}
      </section>

      {lanc.erro && <Erro>{lanc.erro}</Erro>}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {cats.map(({ c, gasto }) => {
          const cor = corDe(c.cor)
          const limite = c.orcamento_mensal
          const fr = limite ? gasto / limite : 0
          const estourou = !!limite && gasto > limite
          const adiantado = !!limite && !estourou && decorrido > 0 && decorrido < 1 && fr > decorrido + 0.1
          return (
            <div key={c.id} className="cartao flex items-center gap-3">
              <Bolinha icone={iconeDe(c.icone)} fundo={cor.fundo} texto={cor.texto} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-semibold text-slate-800">{c.nome}</span>
                  <span className="shrink-0 font-bold text-slate-900 tabular-nums">{moeda(gasto)}</span>
                </div>
                {limite ? (
                  <>
                    <div className="my-1.5">
                      <Progresso fracao={fr} cor={cor.barra} alerta={estourou} />
                    </div>
                    <div className={`text-xs ${estourou ? 'font-semibold text-rose-600' : adiantado ? 'text-amber-600' : 'text-slate-400'}`}>
                      {estourou
                        ? `Passou ${moeda(somar([gasto, -limite]))} do limite de ${moeda(limite)}`
                        : `Restam ${moeda(somar([limite, -gasto]))} de ${moeda(limite)}${adiantado ? ' · gastando rápido' : ''}`}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400">Sem limite definido</div>
                )}
              </div>
              <button className="icon-btn" onClick={() => setEdit(c)} aria-label={`Definir limite de ${c.nome}`}>
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )
        })}
        {semCategoria > 0 && (
          <div className="cartao flex items-center justify-between text-sm">
            <span className="text-slate-500">Despesas sem categoria</span>
            <b className="tabular-nums">{moeda(semCategoria)}</b>
          </div>
        )}
      </div>

      {edit && <LimiteForm categoria={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function LimiteForm({ categoria, onClose }: { categoria: Categoria; onClose: () => void }) {
  const [valor, setValor] = useState<number | null>(categoria.orcamento_mensal)
  const [erro, setErro] = useState<string | null>(null)
  async function gravar(v: number | null) {
    try {
      await salvar('pes_categorias', categoria.id, { orcamento_mensal: v && v > 0 ? v : null })
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <Modal
      titulo={`Limite mensal · ${categoria.nome}`}
      onClose={onClose}
      rodape={
        <>
          {categoria.orcamento_mensal && (
            <button className="btn-ghost mr-auto" onClick={() => gravar(null)}>
              Remover limite
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={() => gravar(valor)}>
            Salvar
          </button>
        </>
      }
    >
      <Campo label="Quanto posso gastar por mês nesta categoria?" dica="Vale para todos os meses.">
        <CampoValor valor={valor} onChange={setValor} autoFocus />
      </Campo>
      <Erro>{erro}</Erro>
    </Modal>
  )
}
