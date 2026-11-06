export type ResponsavelTipo = 'cliente' | 'parceiro'

export interface Caucao {
  id: string
  cliente: string
  parceiro_id: string | null
  responsavel_tipo: ResponsavelTipo
  responsavel_parceiro_id: string | null
  cobertura_meses: number
  valor_caucao: number | null
  data_recebimento: string | null
  junta_uf: string | null
  taxa_junta: number | null
  data_pagamento_taxa: string | null
  valor_certificado: number | null
  data_pagamento_certificado: string | null
  observacoes: string | null
  created_at: string
  updated_at: string
}

export interface Junta {
  uf: string
  nome: string
  taxa: number
}

export const COBERTURAS = [
  { value: '0', label: 'Sem cobertura' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'mês' : 'meses'}` })),
]

export const labelCobertura = (n: number) => COBERTURAS.find((c) => c.value === String(n))?.label ?? ''

/** Valor do responsável no select: "cliente" ou o id do parceiro. */
export const valorResponsavel = (c: Pick<Caucao, 'responsavel_tipo' | 'responsavel_parceiro_id'>) =>
  c.responsavel_tipo === 'parceiro' && c.responsavel_parceiro_id ? c.responsavel_parceiro_id : 'cliente'

/** Lucro (positivo) ou prejuízo (negativo): Caução − Taxa da junta − Certificado digital. */
export const resultado = (c: Pick<Caucao, 'valor_caucao' | 'taxa_junta' | 'valor_certificado'>) =>
  Math.round(((c.valor_caucao ?? 0) - (c.taxa_junta ?? 0) - (c.valor_certificado ?? 0)) * 100) / 100

export interface Totais {
  caucao: number
  taxa: number
  certificado: number
  resultado: number
  comLucro: number
  comPrejuizo: number
}

export function totalizar(lista: Caucao[]): Totais {
  const t: Totais = { caucao: 0, taxa: 0, certificado: 0, resultado: 0, comLucro: 0, comPrejuizo: 0 }
  for (const c of lista) {
    t.caucao += c.valor_caucao ?? 0
    t.taxa += c.taxa_junta ?? 0
    t.certificado += c.valor_certificado ?? 0
    const r = resultado(c)
    t.resultado += r
    if (r > 0) t.comLucro++
    else if (r < 0) t.comPrejuizo++
  }
  t.resultado = Math.round(t.resultado * 100) / 100
  return t
}
