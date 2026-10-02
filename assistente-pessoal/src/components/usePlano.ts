import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { hoje, mesAtual, primeiroDia, somarMesesAoMes, ultimoDia } from '../lib/datas'
import { buscarConfig, buscarLancamentos, buscarMetas, buscarRecorrencias, useDados } from '../lib/dados'
import { disponivelNoMes, montarPlano, projetar } from '../lib/plano'

/** Carrega o que o plano precisa (12 meses para trás e 12 para frente) e monta plano, projeção e disponível do mês. */
export function usePlano() {
  const { contas, categorias } = useApp()
  const mes = mesAtual()
  const inicio = primeiroDia(somarMesesAoMes(mes, -12))
  const fim = ultimoDia(somarMesesAoMes(mes, 12))
  const lanc = useDados(() => buscarLancamentos(inicio, fim), [inicio, fim])
  const recs = useDados(buscarRecorrencias, [])
  const metas = useDados(buscarMetas, [])
  const config = useDados(buscarConfig, [])

  const carregando = lanc.carregando || recs.carregando || metas.carregando || config.carregando
  const erro = lanc.erro || recs.erro || metas.erro || config.erro
  if (carregando || !lanc.dados || !recs.dados || !metas.dados || !config.dados) return { carregando, erro, dados: null }

  const hj = hoje()
  const ativas = contas.filter((c) => c.ativa)
  const saldoReserva = somar(ativas.filter((c) => c.reserva).map((c) => c.saldo))
  const patrimonio = somar(ativas.map((c) => c.saldo))
  const plano = montarPlano({
    categorias,
    recorrencias: recs.dados,
    lancamentos: lanc.dados,
    metas: metas.dados.metas,
    aportes: metas.dados.aportes,
    config: config.dados,
    saldoReserva,
    hoje: hj,
  })
  return {
    carregando: false,
    erro,
    dados: {
      plano,
      config: config.dados,
      recorrencias: recs.dados,
      lancamentos: lanc.dados,
      patrimonio,
      temContaReserva: ativas.some((c) => c.reserva),
      projecao: projetar({ plano, recorrencias: recs.dados, lancamentos: lanc.dados, patrimonioAtual: patrimonio, hoje: hj }),
      disponivel: disponivelNoMes({ plano, lancamentos: lanc.dados, hoje: hj }),
    },
  }
}
