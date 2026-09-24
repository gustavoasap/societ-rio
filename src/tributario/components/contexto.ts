import type { Contexto } from '../engine/apuracao'
import type { DadosEstab } from '../engine/base'
import type { AnoProjetado } from '../engine/projecao'
import type { BaseMensal, Estabelecimento, MovimentoLinha, Parametros, RegimeId } from '../engine/tipos'
import type { ParceiroRegistro } from '../dados'

/** Tudo o que as telas de análise precisam, calculado uma vez no painel da empresa. */
export interface DadosAnalise {
  linhas: MovimentoLinha[] // todo o movimento (as exclusões são aplicadas por linhaConsiderada)
  params: Parametros
  bases: BaseMensal[] // meses já filtrados e classificados
  ctx: Contexto
  anos: AnoProjetado[] // projeção 2026-2033
  estabs: Estabelecimento[]
  dadosEstab: DadosEstab
  regimeAtual: RegimeId
  parceiros: Map<string, ParceiroRegistro>
  produtos: Map<string, string> // NCM -> descrição
  eVenda: (l: MovimentoLinha) => boolean // venda considerada na análise
  eCompra: (l: MovimentoLinha) => boolean // compra de mercadoria considerada
  onParams: (p: Parametros) => void
}
