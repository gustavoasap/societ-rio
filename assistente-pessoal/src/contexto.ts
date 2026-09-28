import { createContext, useContext } from 'react'
import type { ContaComSaldo } from './lib/dados'
import type { Categoria, Lancamento, TipoLancamento } from './tipos'

export interface ContextoApp {
  contas: ContaComSaldo[]
  categorias: Categoria[]
  /** Abre o formulário de lançamento (novo, com tipo pré-escolhido, ou edição) */
  abrirLancamento: (l?: Lancamento | { tipo: TipoLancamento; conta_id?: string }) => void
}

export const Contexto = createContext<ContextoApp>({ contas: [], categorias: [], abrirLancamento: () => {} })

export const useApp = () => useContext(Contexto)
