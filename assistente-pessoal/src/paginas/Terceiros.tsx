import { CircleCheck, Users } from 'lucide-react'
import { LinhaLancamento } from '../components/LinhaLancamento'
import { Cabecalho, Carregando, Erro, Vazio } from '../components/ui'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { hoje } from '../lib/datas'
import { avisarMudanca, buscarDeTerceiros, useDados } from '../lib/dados'
import { moeda } from '../lib/formato'
import { supabase } from '../lib/supabase'

export function Terceiros() {
  const { pessoas } = useApp()
  const d = useDados(buscarDeTerceiros, [])
  if (d.carregando) return <Carregando />
  const hj = hoje()
  const lista = d.dados ?? []
  const ids = [...new Set(lista.map((l) => l.pessoa_id!))]

  async function recebi(ids: string[], msg: string) {
    if (!window.confirm(msg)) return
    const { error } = await supabase.from('pes_lancamentos').update({ reembolsado: true }).in('id', ids)
    if (error) window.alert(error.message)
    avisarMudanca()
  }

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="A receber de terceiros"
        descricao="Gastos que você pagou (no cartão ou na conta) em nome de outra pessoa. Eles ficam fora da sua DRE até serem reembolsados."
      />
      {d.erro && <Erro>{d.erro}</Erro>}
      {ids.length === 0 ? (
        <Vazio icone={Users}>
          <span>Ninguém te deve nada.</span>
          <span className="text-xs">Ao lançar uma despesa, escolha outra pessoa em “Responsável” para ela aparecer aqui.</span>
        </Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ids.map((id) => {
            const itens = lista.filter((l) => l.pessoa_id === id)
            const vencidos = itens.filter((l) => l.data <= hj)
            const futuros = itens.filter((l) => l.data > hj)
            const nome = pessoas.find((p) => p.id === id)?.nome ?? 'Outra pessoa'
            return (
              <section key={id} className="cartao">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">{nome}</h2>
                    <div className="text-2xl font-extrabold text-amber-600 tabular-nums">{moeda(somar(vencidos.map((l) => l.valor)))}</div>
                    <div className="text-xs text-slate-500">
                      a receber até hoje
                      {futuros.length > 0 && ` · + ${moeda(somar(futuros.map((l) => l.valor)))} em parcelas/lançamentos futuros`}
                    </div>
                  </div>
                  {vencidos.length > 0 && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => recebi(vencidos.map((l) => l.id), `Marcar como recebidos os ${vencidos.length} gastos de ${nome} até hoje?`)}
                    >
                      <CircleCheck className="h-3.5 w-3.5 text-emerald-600" /> {nome.split(' ')[0]} me pagou
                    </button>
                  )}
                </div>
                <div className="mt-2 divide-y divide-slate-100">
                  {itens.map((l) => (
                    <LinhaLancamento key={l.id} l={l} mostrarData />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
