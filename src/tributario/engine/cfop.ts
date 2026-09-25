// Classificação de CFOP (Ajuste SINIEF 07/2001 — Tabela de CFOP do Convênio s/nº de 1970)
// em naturezas usadas pelo motor. O contador pode sobrescrever qualquer CFOP por empresa.

export type Natureza =
  | 'venda'
  | 'venda_servico'
  | 'exportacao'
  | 'devolucao_venda'
  | 'outras_receitas'
  | 'compra_revenda'
  | 'compra_insumo'
  | 'devolucao_compra'
  | 'uso_consumo'
  | 'ativo'
  | 'energia'
  | 'frete'
  | 'comunicacao'
  | 'servico_tomado'
  | 'transferencia'
  | 'remessa'
  | 'retorno'
  | 'bonificacao'
  | 'ignorar'

export const NATUREZAS: { value: Natureza; label: string; grupo: 'Receita' | 'Custo/Crédito' | 'Neutro' }[] = [
  { value: 'venda', label: 'Venda de mercadoria', grupo: 'Receita' },
  { value: 'venda_servico', label: 'Prestação de serviço', grupo: 'Receita' },
  { value: 'exportacao', label: 'Exportação', grupo: 'Receita' },
  { value: 'devolucao_venda', label: 'Devolução de venda', grupo: 'Receita' },
  { value: 'outras_receitas', label: 'Outras receitas (não operacionais)', grupo: 'Receita' },
  { value: 'compra_revenda', label: 'Compra para revenda', grupo: 'Custo/Crédito' },
  { value: 'compra_insumo', label: 'Compra de insumo/industrialização', grupo: 'Custo/Crédito' },
  { value: 'devolucao_compra', label: 'Devolução de compra', grupo: 'Custo/Crédito' },
  { value: 'uso_consumo', label: 'Uso e consumo', grupo: 'Custo/Crédito' },
  { value: 'ativo', label: 'Ativo imobilizado', grupo: 'Custo/Crédito' },
  { value: 'energia', label: 'Energia elétrica', grupo: 'Custo/Crédito' },
  { value: 'frete', label: 'Frete / transporte', grupo: 'Custo/Crédito' },
  { value: 'comunicacao', label: 'Comunicação', grupo: 'Custo/Crédito' },
  { value: 'servico_tomado', label: 'Serviço tomado', grupo: 'Custo/Crédito' },
  { value: 'transferencia', label: 'Transferência entre estabelecimentos', grupo: 'Neutro' },
  { value: 'remessa', label: 'Remessa (depósito, conserto, consignação...)', grupo: 'Neutro' },
  { value: 'retorno', label: 'Retorno de remessa', grupo: 'Neutro' },
  { value: 'bonificacao', label: 'Bonificação / brinde / amostra', grupo: 'Neutro' },
  { value: 'ignorar', label: 'Outros (não considerar)', grupo: 'Neutro' },
]

export const labelNatureza = (n: Natureza) => NATUREZAS.find((x) => x.value === n)?.label ?? n

export const NATUREZAS_RECEITA: Natureza[] = ['venda', 'venda_servico', 'exportacao', 'devolucao_venda', 'outras_receitas']

/** Natureza padrão de um CFOP (4 dígitos). */
export function classificarCfop(cfop: string | number): Natureza {
  const c = String(cfop).replace(/\D/g, '')
  if (c.length !== 4) return 'ignorar'
  const d = Number(c[0])
  const r = Number(c.slice(1)) // três últimos dígitos
  const saida = d >= 5
  const exterior = d === 3 || d === 7

  if (saida) {
    if (exterior) {
      if (r >= 101 && r <= 127) return 'exportacao'
      if (r === 201 || r === 202 || r === 210 || r === 211 || r === 212) return 'devolucao_compra'
      if (r >= 301 && r <= 360) return 'exportacao'
      if (r === 501) return 'exportacao'
      if (r === 551) return 'outras_receitas'
      if (r === 930 || r === 949) return 'ignorar'
      return 'remessa'
    }
    if (r >= 101 && r <= 125) {
      if (r === 116 || r === 117) return 'remessa' // entrega futura: receita no simples faturamento (x922)
      return 'venda'
    }
    if (r >= 151 && r <= 159) return 'transferencia'
    if (r >= 201 && r <= 210) return 'devolucao_compra'
    if (r >= 251 && r <= 258) return 'venda' // venda de energia elétrica
    if (r >= 301 && r <= 307) return 'venda_servico' // comunicação
    if (r >= 351 && r <= 360) return 'venda_servico' // transporte
    if (r >= 401 && r <= 405) return 'venda' // venda com ST
    if (r === 408 || r === 409) return 'transferencia'
    if (r >= 410 && r <= 415) return 'devolucao_compra'
    if (r === 501 || r === 502) return 'exportacao' // remessa com fim específico de exportação
    if (r >= 503 && r <= 505) return 'remessa'
    if (r === 551) return 'outras_receitas' // venda de ativo imobilizado
    if (r === 552 || r === 557) return 'transferencia'
    if (r === 553 || r === 556) return 'devolucao_compra'
    if (r >= 554 && r <= 555) return 'remessa'
    if (r >= 601 && r <= 606) return 'ignorar' // transferência de crédito/saldo
    if (r >= 651 && r <= 656) return 'venda' // combustíveis
    if (r === 658 || r === 659) return 'transferencia'
    if (r >= 660 && r <= 662) return 'devolucao_compra'
    if (r >= 663 && r <= 667) return 'remessa'
    if (r === 910 || r === 911) return 'bonificacao'
    if (r === 922) return 'venda' // simples faturamento — venda para entrega futura
    if (r === 929) return 'ignorar' // documento relativo a operação já registrada em ECF
    if (r === 933) return 'venda_servico' // serviço sujeito ao ISS
    if (r === 932) return 'venda_servico'
    if (r === 949) return 'ignorar'
    if (r >= 901 && r <= 949) return 'remessa'
    return 'ignorar'
  }

  // Entradas
  if (exterior) {
    if (r === 101 || r === 127) return 'compra_insumo'
    if (r === 102) return 'compra_revenda'
    if (r >= 201 && r <= 211) return 'devolucao_venda'
    if (r >= 251 && r <= 258) return 'energia'
    if (r >= 301 && r <= 356) return 'servico_tomado'
    if (r === 551) return 'ativo'
    if (r === 556) return 'uso_consumo'
    if (r === 651 || r === 652) return 'compra_revenda'
    if (r === 653) return 'uso_consumo'
    if (r === 930 || r === 949) return 'ignorar'
    return 'remessa'
  }
  if (r === 101 || r === 111 || r === 116 || r === 120 || r === 122 || r === 124 || r === 125 || r === 126 || r === 128)
    return r === 116 ? 'remessa' : 'compra_insumo'
  if (r === 102 || r === 113 || r === 117 || r === 118 || r === 121)
    return r === 117 ? 'remessa' : 'compra_revenda'
  if (r >= 151 && r <= 159) return 'transferencia'
  if (r >= 201 && r <= 207) return 'devolucao_venda'
  if (r === 208 || r === 209) return 'transferencia'
  if (r >= 251 && r <= 257) return 'energia'
  if (r >= 301 && r <= 306) return 'comunicacao'
  if (r >= 351 && r <= 360) return 'frete'
  if (r === 401) return 'compra_insumo'
  if (r === 403) return 'compra_revenda'
  if (r === 406) return 'ativo'
  if (r === 407) return 'uso_consumo'
  if (r === 408 || r === 409) return 'transferencia'
  if (r === 410 || r === 411) return 'devolucao_venda'
  if (r === 414 || r === 415) return 'retorno'
  if (r === 551) return 'ativo'
  if (r === 552 || r === 557) return 'transferencia'
  if (r === 553) return 'devolucao_venda'
  if (r === 554 || r === 555) return 'retorno'
  if (r === 556) return 'uso_consumo'
  if (r >= 601 && r <= 605) return 'ignorar'
  if (r === 651) return 'compra_insumo'
  if (r === 652) return 'compra_revenda'
  if (r === 653) return 'uso_consumo'
  if (r === 658 || r === 659) return 'transferencia'
  if (r >= 660 && r <= 662) return 'devolucao_venda'
  if (r >= 663 && r <= 664) return 'remessa'
  if (r === 910 || r === 911) return 'bonificacao'
  if (r === 922) return 'compra_revenda' // simples faturamento — compra para recebimento futuro
  if (r === 923) return 'remessa' // entrada física em venda à ordem (a compra é o x121)
  if (r === 926) return 'ignorar'
  if (r === 933) return 'servico_tomado'
  if (r === 949) return 'ignorar'
  if ([902, 903, 906, 907, 909, 913, 914, 916, 918, 919, 921, 925].includes(r)) return 'retorno'
  if (r >= 901 && r <= 949) return 'remessa'
  return 'ignorar'
}

/** CFOP de saída interna (5xxx), interestadual (6xxx) ou exterior (7xxx). */
export const destinoCfop = (cfop: string) => (cfop.startsWith('5') ? 'interna' : cfop.startsWith('6') ? 'interestadual' : cfop.startsWith('7') ? 'exterior' : 'entrada')

/** Vendas a não contribuinte (x107, x108) — sujeitas ao DIFAL da EC 87/2015 quando interestaduais. */
export const vendaNaoContribuinte = (cfop: string) => /^[56]10[78]$/.test(cfop)

/**
 * O CST/CSOSN do documento de entrada indica se o fornecedor é do Simples Nacional:
 * CSOSN (101, 102, 103, 201, 202, 203, 300, 400, 500, 900) x CST (00, 10, 20, 30, 40, 41, 50, 51, 60, 70, 90),
 * ambos podendo vir precedidos do dígito de origem.
 */
export function fornecedorDoSimples(cst: string): boolean | null {
  const c = cst.replace(/\D/g, '')
  if (!c) return null
  const csosn = ['101', '102', '103', '201', '202', '203', '300', '400', '500', '900']
  const csts = ['00', '10', '20', '30', '40', '41', '50', '51', '60', '61', '70', '90']
  if (c.length === 4) return csosn.includes(c.slice(1))
  if (c.length === 3) {
    if (csosn.includes(c) && !csts.includes(c.slice(1))) return true
    if (csts.includes(c.slice(1))) return false
    return csosn.includes(c)
  }
  if (c.length <= 2) return csts.includes(c.padStart(2, '0')) ? false : null
  return null
}

/**
 * Situação tributária do ICMS no relatório: 3 dígitos = origem + CST (regime normal); 4 dígitos = origem + CSOSN (Simples).
 * Indica se há ST na operação (retida agora ou cobrada anteriormente) — Convênio SINIEF s/nº de 1970, Anexo (tabelas B e CSOSN).
 */
export function cstComSt(cst: string): boolean | null {
  const c = cst.replace(/\D/g, '')
  if (c.length === 4) return ['201', '202', '203', '500'].includes(c.slice(1))
  if (c.length === 3) return ['10', '30', '60', '70'].includes(c.slice(1))
  if (c.length === 2) return ['10', '30', '60', '70'].includes(c)
  return null
}
