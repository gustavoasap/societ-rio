import { describe, expect, it } from 'vitest'
import {
  emCarencia,
  honorarioDoMes,
  inadimplentes,
  linhaDoMes,
  resumoDoMes,
  vencimentoDe,
  type ClienteHon,
  type ConfigHon,
  type HonorarioBase,
} from './calculo'
import { lerCsv, lerOfx, nomeNaDescricao, sugerir } from './extrato'

const cfg: ConfigHon = { inicio: '2026-10-01', dia_vencimento: 10, vence_mes_seguinte: false }
const cli = (o: Partial<ClienteHon> = {}): ClienteHon => ({
  id: 'c1',
  codigo: 10,
  razao_social: 'MARIA STORE COMERCIO LTDA',
  nome_fantasia: 'MARIA STORE',
  cnpj: '65013172000145',
  responsavel: 'MARIA DAS GRACAS SILVA',
  status: 'assinado',
  data_inicio_servicos: null,
  carencia_meses: null,
  sem_honorario: false,
  sem_honorario_motivo: null,
  ...o,
})
const hon = (o: Partial<HonorarioBase> = {}): HonorarioBase => ({
  cliente_id: 'c1',
  valor: 500,
  vigencia_inicio: '2025-01-01',
  vigencia_fim: null,
  dia_vencimento: null,
  ...o,
})

describe('honorário do mês', () => {
  it('pega o vigente mais recente', () => {
    const hs = [hon({ valor: 400, vigencia_fim: '2026-09-30' }), hon({ valor: 500, vigencia_inicio: '2026-10-01' })]
    expect(honorarioDoMes(hs, '2026-09')?.valor).toBe(400)
    expect(honorarioDoMes(hs, '2026-10')?.valor).toBe(500)
    expect(honorarioDoMes(hs, '2024-12')).toBeNull()
  })
  it('carência a partir do mês do início dos serviços', () => {
    const c = { data_inicio_servicos: '2026-10-22', carencia_meses: 6 }
    expect(emCarencia(c, '2026-10')).toBe(true)
    expect(emCarencia(c, '2027-03')).toBe(true)
    expect(emCarencia(c, '2027-04')).toBe(false)
  })
  it('vencimento no próprio mês, limitado ao último dia', () => {
    expect(vencimentoDe('2026-10', 10, false)).toBe('2026-10-10')
    expect(vencimentoDe('2026-02', 31, false)).toBe('2026-02-28')
    expect(vencimentoDe('2026-12', 5, true)).toBe('2027-01-05')
  })
})

describe('linha do mês', () => {
  const hoje = '2026-11-12'
  it('inativo não entra', () => {
    expect(linhaDoMes(cli({ status: 'encerrado' }), [hon()], null, '2026-10', cfg, hoje)).toBeNull()
  })
  it('sem honorário não entra', () => {
    expect(linhaDoMes(cli(), [], null, '2026-10', cfg, hoje)).toBeNull()
  })
  it('vencido, a vencer e recebido', () => {
    expect(linhaDoMes(cli(), [hon()], null, '2026-10', cfg, hoje)?.situacao).toBe('vencido')
    expect(linhaDoMes(cli(), [hon()], null, '2026-12', cfg, hoje)?.situacao).toBe('a_vencer')
    const m = {
      cliente_id: 'c1',
      competencia: '2026-10-01',
      valor_ajustado: null,
      motivo_ajuste: null,
      recebido_em: '2026-10-09',
      valor_recebido: 500,
      origem: 'manual' as const,
      extrato_id: null,
      extrato_descricao: null,
      observacao: null,
    }
    const l = linhaDoMes(cli(), [hon()], m, '2026-10', cfg, hoje)!
    expect(l.situacao).toBe('recebido')
    expect(l.aberto).toBe(0)
  })
  it('valor ajustado e recebimento parcial', () => {
    const m = {
      cliente_id: 'c1',
      competencia: '2026-10-01',
      valor_ajustado: 750,
      motivo_ajuste: 'Serviço extra',
      recebido_em: '2026-10-09',
      valor_recebido: 500,
      origem: 'manual' as const,
      extrato_id: null,
      extrato_descricao: null,
      observacao: null,
    }
    const l = linhaDoMes(cli(), [hon()], m, '2026-10', cfg, hoje)!
    expect(l.valor).toBe(750)
    expect(l.ajustado).toBe(true)
    expect(l.situacao).toBe('parcial')
    expect(l.aberto).toBe(250)
  })
  it('carência não cobra', () => {
    const l = linhaDoMes(cli({ data_inicio_servicos: '2026-10-22', carencia_meses: 6 }), [hon()], null, '2026-10', cfg, hoje)!
    expect(l.valor).toBe(0)
    expect(l.situacao).toBe('carencia')
  })
  it('inadimplentes e resumo', () => {
    const ls = ['2026-10', '2026-11'].map((m) => linhaDoMes(cli(), [hon()], null, m, cfg, hoje)!)
    const ina = inadimplentes(ls, hoje)
    expect(ina).toHaveLength(1)
    expect(ina[0].total).toBe(1000)
    expect(ina[0].diasAtraso).toBe(33)
    expect(resumoDoMes(ls, '2026-11', hoje)).toMatchObject({ previsto: 500, recebido: 0, atrasado: 500 })
  })
})

describe('extrato', () => {
  it('lê OFX', () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKACCTFROM><ACCTID>1234</ACCTID></BANKACCTFROM><STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261009120000[-3:BRT]<TRNAMT>500.00<FITID>abc1<MEMO>PIX RECEBIDO MARIA STORE COMERCIO</STMTTRN><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261010<TRNAMT>-80,50<FITID>abc2<NAME>TARIFA</STMTTRN></OFX>`
    const l = lerOfx(ofx)
    expect(l).toHaveLength(2)
    expect(l[0]).toMatchObject({ id: 'ofx:1234:abc1', data: '2026-10-09', valor: 500 })
    expect(l[1].valor).toBe(-80.5)
  })
  it('lê CSV com crédito/débito', () => {
    const csv =
      'Extrato conta\nData;Histórico;Documento;Crédito (R$);Débito (R$)\n09/10/2026;PIX RECEBIDO - MARIA STORE;123;1.500,00;\n10/10/2026;TARIFA;;;-12,00'
    const l = lerCsv(csv)
    expect(l[0]).toMatchObject({ data: '2026-10-09', valor: 1500 })
  })
  it('nome na descrição', () => {
    expect(nomeNaDescricao('MARIA STORE COMERCIO LTDA', 'PIX RECEBIDO MARIA STORE')).toBe(true)
    expect(nomeNaDescricao('MARIA STORE COMERCIO LTDA', 'PIX RECEBIDO JOAO STORE')).toBe(false)
    expect(nomeNaDescricao('MARIA DAS GRACAS SILVA', 'PIX MARIA G SILVA', true)).toBe(true)
  })
  it('sugere honorário pelo nome e valor', () => {
    const hoje = '2026-11-12'
    const ls = ['2026-10', '2026-11'].map((m) => linhaDoMes(cli(), [hon()], null, m, cfg, hoje)!)
    const outro = linhaDoMes(
      cli({ id: 'c2', razao_social: 'LT GROUP LTDA', nome_fantasia: null, cnpj: null, responsavel: null }),
      [hon({ cliente_id: 'c2', valor: 320 })],
      null,
      '2026-10',
      cfg,
      hoje,
    )!
    const s = sugerir(
      [
        { id: 'a', data: '2026-10-09', valor: 500, descricao: 'PIX MARIA STORE' },
        { id: 'b', data: '2026-11-09', valor: 500, descricao: 'PIX MARIA STORE' },
        { id: 'c', data: '2026-10-09', valor: 320, descricao: 'PIX FULANO' },
        { id: 'd', data: '2026-10-09', valor: -10, descricao: 'TARIFA' },
      ],
      [...ls, outro],
      new Set(),
    )
    expect(s[0]).toMatchObject({ chave: 'c1|2026-10', confianca: 'alta' })
    expect(s[1]).toMatchObject({ chave: 'c1|2026-11', confianca: 'alta' })
    expect(s[2]).toMatchObject({ chave: 'c2|2026-10', confianca: 'baixa' })
    expect(s[3].chave).toBeNull()
  })
})

describe('reajuste', () => {
  it('índice + adicional e arredondamento', async () => {
    const { novoValor, arredondar } = await import('./reajuste')
    const p = { tipo: 'percentual' as const, indice: 4.5, adicional: 2, fixo: null, acrescimo: 0 }
    expect(arredondar(novoValor(360, p), 'centavos')).toBe(383.4)
    expect(arredondar(novoValor(360, p), 'inteiro')).toBe(383)
    expect(arredondar(novoValor(360, p), 'cima')).toBe(384)
    expect(novoValor(360, { ...p, tipo: 'fixo', fixo: 400 })).toBe(400)
    expect(novoValor(360, { ...p, tipo: 'acrescimo', acrescimo: 40 })).toBe(400)
  })
  it('reajuste mantém o valor antigo até a competência anterior', () => {
    const hs = [hon({ valor: 360, vigencia_fim: '2026-12-31' }), hon({ valor: 383.4, vigencia_inicio: '2027-01-01' })]
    expect(honorarioDoMes(hs, '2026-12')?.valor).toBe(360)
    expect(honorarioDoMes(hs, '2027-01')?.valor).toBe(383.4)
  })
})
