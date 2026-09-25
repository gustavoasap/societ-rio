// Perfil de ICMS de cada NCM observado nas próprias notas da empresa: alíquota interna praticada e substituição tributária.
import { naturezaDe } from './base'
import type { Natureza } from './cfop'
import type { ConfigNcm, MovimentoLinha } from './tipos'

export type FonteIcms = 'saidas' | 'entradas'

export interface PerfilIcmsNcm {
  /** carga efetiva interna (%) = ICMS ÷ (valor − IPI), já com eventual redução de base; null = não observada */
  aliquota: number | null
  /** alíquota nominal (%) = ICMS ÷ base de cálculo */
  nominal: number | null
  fonteAliquota: FonteIcms | null
  valorAliquota: number // valor das notas usadas para a alíquota
  /** mercadoria sujeita a ST (maioria das notas com CST 10/30/60/70 ou CSOSN 201/202/203/500) */
  st: boolean | null
  fonteSt: FonteIcms | null
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

/** Nota emitida por contribuinte do regime normal (CST, não CSOSN) — só ela traz o ICMS destacado pela alíquota interna. */
const regimeNormal = (cst: string) => {
  const c = cst.replace(/\D/g, '')
  return c.length === 2 || c.length === 3
}

type Acum = { valor: number; base: number; icms: number; liquido: number }
const novo = (): Acum => ({ valor: 0, base: 0, icms: 0, liquido: 0 })

/**
 * Lê, por NCM, a carga de ICMS das operações internas com imposto destacado:
 * 1º as vendas internas da própria empresa (regime normal); 2º as compras internas de fornecedores do regime normal.
 * A ST vem da CST/CSOSN das vendas e, na falta delas, das compras (inclusive ICMS-ST retido).
 * Só entram estabelecimentos da UF de referência (a alíquota interna é de cada estado).
 */
export function perfilIcmsPorNcm(
  linhas: MovimentoLinha[],
  ufDoEstab: (id: string | null) => string,
  ufReferencia: string,
  cfopNatureza: Record<string, Natureza> = {},
): Map<string, PerfilIcmsNcm> {
  const aliq = { saidas: new Map<string, Acum>(), entradas: new Map<string, Acum>() }
  const st = { saidas: new Map<string, { com: number; total: number }>(), entradas: new Map<string, { com: number; total: number }>() }
  for (const l of linhas) {
    if (!l.ncm || ufDoEstab(l.estabelecimento_id) !== ufReferencia) continue
    const natureza = naturezaDe(l, cfopNatureza)
    const fonte: FonteIcms | null =
      l.tipo === 'saida' && natureza === 'venda' ? 'saidas' : l.tipo === 'entrada' && (natureza === 'compra_revenda' || natureza === 'compra_insumo') ? 'entradas' : null
    if (!fonte) continue
    const temSt = l.icms_st > 0 ? true : cstComSt(l.cst)
    if (temSt !== null) {
      const s = st[fonte].get(l.ncm) ?? { com: 0, total: 0 }
      s.total += l.valor_contabil
      if (temSt) s.com += l.valor_contabil
      st[fonte].set(l.ncm, s)
    }
    const interna = l.cfop.startsWith(fonte === 'saidas' ? '5' : '1')
    if (interna && !temSt && regimeNormal(l.cst) && l.icms > 0 && l.bc_icms > 0) {
      const a = aliq[fonte].get(l.ncm) ?? novo()
      a.valor += l.valor_contabil
      a.base += l.bc_icms
      a.icms += l.icms
      a.liquido += Math.max(0, l.valor_contabil - l.ipi - l.icms_st)
      aliq[fonte].set(l.ncm, a)
    }
  }
  const ncms = new Set([...aliq.saidas.keys(), ...aliq.entradas.keys(), ...st.saidas.keys(), ...st.entradas.keys()])
  const r = new Map<string, PerfilIcmsNcm>()
  const arred = (v: number) => Math.round(v * 100) / 100
  for (const n of ncms) {
    const fonteA: FonteIcms | null = aliq.saidas.has(n) ? 'saidas' : aliq.entradas.has(n) ? 'entradas' : null
    const a = fonteA ? aliq[fonteA].get(n)! : null
    const fonteS: FonteIcms | null = st.saidas.has(n) ? 'saidas' : st.entradas.has(n) ? 'entradas' : null
    const s = fonteS ? st[fonteS].get(n)! : null
    r.set(n, {
      // frete e despesas somados à base podem levar a carga acima da nominal: limita à alíquota nominal
      aliquota: a && a.liquido ? arred(Math.min((a.icms / a.liquido) * 100, a.base ? (a.icms / a.base) * 100 : Infinity)) : null,
      nominal: a && a.base ? arred((a.icms / a.base) * 100) : null,
      fonteAliquota: fonteA,
      valorAliquota: a?.valor ?? 0,
      st: s && s.total ? s.com / s.total >= 0.5 : null,
      fonteSt: fonteS,
    })
  }
  return r
}

/**
 * Tratamento de ICMS por NCM usado nos cálculos: o que o contador informou prevalece; na falta, o que as notas mostram.
 */
export function mesclarPerfilIcms(config: Record<string, ConfigNcm>, perfil: Map<string, PerfilIcmsNcm>): Record<string, ConfigNcm> {
  const r: Record<string, ConfigNcm> = { ...config }
  for (const [ncm, p] of perfil) {
    const c = { ...(r[ncm] ?? {}) }
    if (c.aliquotaIcms === undefined && p.aliquota !== null) c.aliquotaIcms = p.aliquota
    if (c.st === undefined && p.st !== null) c.st = p.st
    if (Object.keys(c).length) r[ncm] = c
  }
  return r
}
