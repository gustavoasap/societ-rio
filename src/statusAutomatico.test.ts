import { describe, expect, it } from 'vitest'
import { ACOMPANHAMENTO_POR_TIPO, statusAutomatico, type Processo, type TipoProcesso } from './types'

function processo(tipo: TipoProcesso, extra: Partial<Processo> = {}): Processo {
  const base: Record<string, unknown> = { tipo, status: 'pendente', numero_viabilidade: null, numero_dbe: null }
  for (const e of ACOMPANHAMENTO_POR_TIPO[tipo]) base[e.campo] = e.opcoes[0].value
  return { ...base, ...extra } as Processo
}

const tudoConcluido = (tipo: TipoProcesso) =>
  Object.fromEntries(ACOMPANHAMENTO_POR_TIPO[tipo].map((e) => [e.campo, e.concluido])) as Partial<Processo>

describe('statusAutomatico', () => {
  it('mantém o status enquanto nada foi iniciado', () => {
    expect(statusAutomatico(processo('abertura'))).toBe('pendente')
  })

  it('passa para Em andamento ao informar o número da viabilidade', () => {
    expect(statusAutomatico(processo('abertura', { numero_viabilidade: 'SPN2633893093' }))).toBe('andamento')
  })

  it('"Ainda não pagou o caução" nunca muda sozinho', () => {
    const caucao = { status: 'aguardando_caucao' as const }
    expect(statusAutomatico(processo('abertura', { ...caucao, numero_viabilidade: 'SPN2633893093' }))).toBe('aguardando_caucao')
    expect(statusAutomatico(processo('abertura', { ...caucao, status_dbe: 'em_analise' }))).toBe('aguardando_caucao')
    expect(statusAutomatico(processo('baixa', { ...caucao, ...tudoConcluido('baixa') }))).toBe('aguardando_caucao')
  })

  it('na baixa, o número DBE também inicia o processo', () => {
    expect(statusAutomatico(processo('baixa', { numero_dbe: '123' }))).toBe('andamento')
  })

  it('passa para Em andamento quando uma etapa sai da opção inicial', () => {
    expect(statusAutomatico(processo('abertura', { status_dbe: 'em_analise' }))).toBe('andamento')
    expect(statusAutomatico(processo('alteracao', { status_taxa: 'pendente_pagamento' }))).toBe('andamento')
  })

  it('conclui quando todas as etapas chegam à opção final', () => {
    for (const tipo of ['abertura', 'alteracao', 'baixa'] as const) {
      expect(statusAutomatico(processo(tipo, tudoConcluido(tipo)))).toBe('concluido')
    }
  })

  it('reabre um concluído quando uma etapa deixa de estar finalizada', () => {
    expect(statusAutomatico(processo('abertura', { ...tudoConcluido('abertura'), status: 'concluido', status_dbe: 'indeferido' }))).toBe('andamento')
  })
})
