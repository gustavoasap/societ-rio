import { useState } from 'react'
import { ChevronDown, UserRound } from 'lucide-react'
import { useApp } from '../contexto'
import { agruparItens, type Agrupamento, type Ordem } from '../lib/financas'
import { moeda, percentual } from '../lib/formato'
import { NATUREZAS, rotuloDe, type Lancamento, type Natureza } from '../tipos'
import { LinhaLancamento } from './LinhaLancamento'
import { Bolinha, Segmentado } from './ui'
import { COR_NATUREZA, corDe, iconeDe } from './visual'

const CHAVE = 'fatura-agrupamento'

function lerPreferencia(): { por: Agrupamento; ordem: Ordem } {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) ?? '{}')
    return { por: ['data', 'categoria', 'pessoa', 'natureza'].includes(p.por) ? p.por : 'categoria', ordem: p.ordem === 'valor' ? 'valor' : 'data' }
  } catch {
    return { por: 'categoria', ordem: 'data' }
  }
}

/** Itens da fatura, agrupados por categoria / pessoa / classificação (a escolha fica lembrada). */
export function ItensDaFatura({ itens, total }: { itens: Lancamento[]; total: number }) {
  const { categorias, pessoas, nome } = useApp()
  const [pref, setPref] = useState(lerPreferencia)
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const mudar = (p: Partial<typeof pref>) => {
    const novo = { ...pref, ...p }
    setPref(novo)
    setFechados(new Set())
    try {
      localStorage.setItem(CHAVE, JSON.stringify(novo))
    } catch {
      // sem armazenamento local: vale só nesta visita
    }
  }

  const cats = new Map(categorias.map((c) => [c.id, c]))
  const grupos = agruparItens(itens, pref.por, pref.ordem, cats)

  function cabecalho(chave: string) {
    if (pref.por === 'categoria') {
      const c = cats.get(chave)
      const cor = corDe(c?.cor ?? 'cinza')
      return { nome: c?.nome ?? 'Sem categoria', bolinha: <Bolinha icone={iconeDe(c?.icone)} fundo={cor.fundo} texto={cor.texto} tamanho="h-8 w-8" /> }
    }
    if (pref.por === 'pessoa') {
      const p = pessoas.find((x) => x.id === chave)
      return {
        nome: chave ? (p?.nome ?? 'Outra pessoa') : `Eu (${nome})`,
        bolinha: <Bolinha icone={UserRound} fundo={chave ? 'bg-amber-100' : 'bg-azul-100'} texto={chave ? 'text-amber-700' : 'text-azul-700'} tamanho="h-8 w-8" />,
      }
    }
    return {
      nome: rotuloDe(NATUREZAS, chave as Natureza),
      bolinha: <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: COR_NATUREZA[chave as Natureza] }} />,
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <Segmentado
            valor={pref.por}
            onChange={(por) => mudar({ por })}
            opcoes={[
              { value: 'categoria', label: 'Categoria' },
              { value: 'pessoa', label: 'Pessoa' },
              { value: 'natureza', label: 'Tipo' },
              { value: 'data', label: 'Data' },
            ]}
          />
        </div>
        <select className="input w-auto py-2 text-sm" value={pref.ordem} onChange={(e) => mudar({ ordem: e.target.value as Ordem })} aria-label="Ordenar itens">
          <option value="data">Ordenar por data</option>
          <option value="valor">Maior valor primeiro</option>
        </select>
      </div>

      {pref.por === 'data' ? (
        <div className="divide-y divide-slate-100">
          {grupos[0]?.itens.map((l) => (
            <LinhaLancamento key={l.id} l={l} mostrarData />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const h = cabecalho(g.chave)
            const aberto = !fechados.has(g.chave)
            return (
              <div key={g.chave || '-'} className="rounded-xl border border-slate-100">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                  onClick={() =>
                    setFechados((s) => {
                      const n = new Set(s)
                      if (n.has(g.chave)) n.delete(g.chave)
                      else n.add(g.chave)
                      return n
                    })
                  }
                  aria-expanded={aberto}
                >
                  {h.bolinha}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-800">{h.nome}</span>
                    <span className="block text-xs text-slate-500">
                      {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                      {total > 0 && g.total > 0 ? ` · ${percentual(g.total / total)} da fatura` : ''}
                    </span>
                  </span>
                  <span className="text-sm font-bold text-slate-900 tabular-nums">{moeda(g.total)}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${aberto ? 'rotate-180' : ''}`} />
                </button>
                {aberto && (
                  <div className="divide-y divide-slate-100 border-t border-slate-100 px-3">
                    {g.itens.map((l) => (
                      <LinhaLancamento key={l.id} l={l} mostrarData />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
