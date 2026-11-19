import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lerCertificado, situacaoCertificado } from './certificado'

const buf = (n: string) => {
  const b = readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('certificado digital', () => {
  it('lê validade, titular e CNPJ sem senha quando o certificado vem aberto no .pfx', async () => {
    const i = await lerCertificado(buf('aberto.pfx'), 'aberto.pfx')
    expect(i.protegido).toBe(false)
    expect(i.invalido).toBe(false)
    expect(i.validade).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(i.titular).toBe('MINUSCOLI E FREITAS LTDA')
    expect(i.cnpj).toBe('69777924000103')
  })

  it('pfx protegido: sem senha marca como protegido; com a senha lê a validade', async () => {
    expect(await lerCertificado(buf('protegido.pfx'), 'protegido.pfx')).toMatchObject({ protegido: true, validade: null })
    expect(await lerCertificado(buf('protegido.pfx'), 'protegido.pfx', '1234')).toMatchObject({ protegido: false, cnpj: '69777924000103' })
    expect(await lerCertificado(buf('protegido.pfx'), 'protegido.pfx', 'errada')).toMatchObject({ protegido: true })
  })

  it('arquivo que não é certificado é inválido', async () => {
    const lixo = new Uint8Array(500).map((_, i) => (i * 37) % 251).buffer
    expect((await lerCertificado(lixo, 'x.pfx')).invalido).toBe(true)
  })

  it('situação pela validade', () => {
    const hoje = new Date(2026, 10, 19)
    expect(situacaoCertificado('2026-11-25', hoje)).toBe('vencendo')
    expect(situacaoCertificado('2026-11-29', hoje)).toBe('vencendo')
    expect(situacaoCertificado('2026-12-01', hoje)).toBe('valido')
    expect(situacaoCertificado('2026-11-18', hoje)).toBe('vencido')
    expect(situacaoCertificado(null, hoje)).toBe('sem_validade')
  })
})
