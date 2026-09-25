import { lucroAntesIr } from './apuracao'
import type { DreDados } from './tipos'

export interface LinhaDre {
  chave: string
  rotulo: string
  valor: number
  tipo: 'receita' | 'deducao' | 'subtotal' | 'custo' | 'despesa' | 'resultado' | 'detalhe'
}

const ORDEM_DEDUCOES = ['DAS — Simples Nacional', 'ICMS fora do DAS (sublimite)', 'ICMS próprio', 'DIFAL', 'IPI', 'ISS', 'PIS', 'COFINS', 'CBS', 'IBS']

const ordem = (n: string) => {
  const i = ORDEM_DEDUCOES.indexOf(n)
  return i < 0 ? 99 : i
}

export const ordenarDeducoes = (l: LinhaDre[]) => [...l].sort((a, b) => ordem(a.rotulo.replace('(−) ', '')) - ordem(b.rotulo.replace('(−) ', '')))

/** Linhas da DRE gerencial (valores negativos = redutores). */
export function linhasDre(d: DreDados): LinhaDre[] {
  const deducoes = Object.entries(d.deducoes)
    .filter(([, v]) => Math.abs(v) > 0.005)
    .sort(([a], [b]) => ordem(a) - ordem(b))
  const totalDeducoes = deducoes.reduce((s, [, v]) => s + v, 0)
  const receitaLiquida = d.receitaBruta - d.devolucoes - totalDeducoes
  const cmvLiquido = d.cmv - d.creditosCompras + d.icmsEntradas
  const lucroBruto = receitaLiquida - cmvLiquido
  const despesas = d.servicosTomados + d.despesasOperacionais + d.pessoal + d.encargos + d.despesasGerais - d.creditosDespesas
  const operacional = lucroBruto - despesas
  const lair = lucroAntesIr(d)
  const liquido = lair - d.irpj - d.csll
  return [
    { chave: 'rb', rotulo: 'Receita bruta de vendas e serviços', valor: d.receitaBruta, tipo: 'receita' },
    { chave: 'dev', rotulo: '(−) Devoluções de venda', valor: -d.devolucoes, tipo: 'deducao' },
    ...deducoes.map(([n, v]) => ({ chave: `ded-${n}`, rotulo: `(−) ${n}`, valor: -v, tipo: 'deducao' as const })),
    { chave: 'rl', rotulo: '= Receita líquida', valor: receitaLiquida, tipo: 'subtotal' },
    { chave: 'cmv', rotulo: '(−) Custo das mercadorias (valor das notas)', valor: -d.cmv, tipo: 'custo' },
    { chave: 'cred', rotulo: '(+) Créditos recuperáveis sobre compras', valor: d.creditosCompras, tipo: 'detalhe' },
    { chave: 'icmsent', rotulo: '(−) ICMS-ST e antecipação nas entradas', valor: -d.icmsEntradas, tipo: 'custo' },
    { chave: 'lb', rotulo: '= Lucro bruto', valor: lucroBruto, tipo: 'subtotal' },
    { chave: 'serv', rotulo: '(−) Serviços tomados', valor: -d.servicosTomados, tipo: 'despesa' },
    { chave: 'oper', rotulo: '(−) Fretes, energia, comunicação e consumo', valor: -d.despesasOperacionais, tipo: 'despesa' },
    { chave: 'pes', rotulo: '(−) Pessoal (folha, FGTS, pró-labore)', valor: -d.pessoal, tipo: 'despesa' },
    { chave: 'enc', rotulo: '(−) INSS patronal fora do DAS', valor: -d.encargos, tipo: 'despesa' },
    { chave: 'ger', rotulo: '(−) Outras despesas gerais', valor: -d.despesasGerais, tipo: 'despesa' },
    { chave: 'credd', rotulo: '(+) Créditos sobre serviços e despesas', valor: d.creditosDespesas, tipo: 'detalhe' },
    { chave: 'op', rotulo: '= Resultado operacional', valor: operacional, tipo: 'subtotal' },
    { chave: 'fin', rotulo: '(+) Receitas financeiras', valor: d.receitasFinanceiras - d.tributosFinanceiros, tipo: 'detalhe' },
    { chave: 'lair', rotulo: '= Lucro antes do IRPJ e da CSLL', valor: lair, tipo: 'subtotal' },
    { chave: 'irpj', rotulo: '(−) IRPJ', valor: -d.irpj, tipo: 'deducao' },
    { chave: 'csll', rotulo: '(−) CSLL', valor: -d.csll, tipo: 'deducao' },
    { chave: 'll', rotulo: '= Lucro líquido', valor: liquido, tipo: 'resultado' },
  ]
}
