import { createContext, useContext } from 'react'
import type { ContaComSaldo } from './lib/dados'
import type { Categoria, Lancamento, Pessoa, TipoLancamento } from './tipos'

/** Lançamento existente (edição) ou um novo com alguns campos já preenchidos. */
export type InicialLancamento = Lancamento | ({ tipo: TipoLancamento } & Partial<Pick<Lancamento, 'conta_id' | 'conta_destino_id' | 'valor' | 'descricao' | 'data' | 'categoria_id'>>)

export interface ContextoApp {
  contas: ContaComSaldo[]
  categorias: Categoria[]
  pessoas: Pessoa[]
  /** Primeiro nome do dono, para mostrar "Eu (Gustavo)" */
  nome: string
  abrirLancamento: (l?: InicialLancamento) => void
}

export const Contexto = createContext<ContextoApp>({ contas: [], categorias: [], pessoas: [], nome: '', abrirLancamento: () => {} })

export const useApp = () => useContext(Contexto)
