// Tratamentos tributários identificados pelo NCM do produto.
// As listas abaixo cobrem os casos mais comuns; o contador pode ajustar o percentual nos parâmetros da empresa.

import { monofasicoPelaTabela } from './pisCofinsNcm'
import type { ConfigNcm, Parametros } from './tipos'

const limpar = (ncm: string) => ncm.replace(/\D/g, '')

/**
 * PIS/COFINS monofásico — a revenda tem alíquota zero (e no Simples os percentuais de PIS/COFINS são excluídos do DAS,
 * LC 123, art. 18, §4º-A, I). Pelas tabelas 4.3.10, 4.3.11 e 4.3.12 da EFD-Contribuições vigentes (Leis 10.147/2000,
 * 10.485/2002, 13.097/2015, 9.718/1998 e 11.116/2005). Autopeças (Lei 10.485, Anexos I e II) não têm NCM na tabela:
 * marque manualmente na aba Produtos.
 */
export function ncmMonofasico(ncm: string): boolean {
  return monofasicoPelaTabela(ncm) !== null
}

/**
 * Redução de 60% das alíquotas de IBS/CBS — Anexo VIII da LC 214/2025
 * (produtos de higiene pessoal e limpeza majoritariamente consumidos por famílias de baixa renda).
 * Absorventes e itens de saúde menstrual têm alíquota zero (LC 214, art. 147).
 */
const REDUCAO_60: string[] = ['34011190', '330610', '96032100', '48181000', '28289011', '34011900']
const ALIQUOTA_ZERO: string[] = ['96190000']

/** Percentual de redução das alíquotas de IBS/CBS aplicável ao NCM (0, 0,6 ou 1). */
export function reducaoIbsCbs(ncm: string): number {
  const n = limpar(ncm)
  if (!n) return 0
  if (ALIQUOTA_ZERO.some((pref) => n.startsWith(pref))) return 1
  if (REDUCAO_60.some((pref) => n.startsWith(pref))) return 0.6
  return 0
}

/** Tratamento efetivo do NCM na empresa: o que o contador definiu, senão o padrão do sistema. */
export function tratamentoNcm(
  ncm: string,
  config: Record<string, ConfigNcm>,
) {
  const c = config[limpar(ncm)] ?? {}
  return {
    monofasico: c.monofasico ?? ncmMonofasico(ncm),
    /** alíquota zero/isenção/suspensão de PIS/COFINS: só quando o contador marca (as tabelas 4.3.13 a 4.3.16 têm condições) */
    pisCofinsZero: c.pisCofinsZero ?? false,
    st: c.st ?? false,
    reducao: c.reducao !== undefined ? c.reducao / 100 : reducaoIbsCbs(ncm),
    /** alíquota interna específica do NCM (%) — null = alíquota modal do estabelecimento */
    aliquotaIcms: c.aliquotaIcms ?? null,
    /** MVA original (%) para o cálculo da ST */
    mva: c.mva ?? null,
  }
}

/** Mercadoria com ST em que a empresa é substituída: sem débito na venda interna, sem crédito do ICMS próprio na compra. */
export const stSubstituido = (ncm: string, params: Pick<Parametros, 'ncms' | 'papelSt'>) => !!ncm && params.papelSt !== 'substituto' && tratamentoNcm(ncm, params.ncms).st
