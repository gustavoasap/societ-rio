import { describe, expect, it } from 'vitest'
import type { Lancamento } from '../tipos'
import { categoriaPorDescricao, chaveLinha, conciliar, contaBate, lerCsv, lerData, lerExtrato, lerOfx, sugestaoPorHistorico, type LinhaExtrato } from './extrato'

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST><DTSTART>20261001
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-89.90<FITID>A1<MEMO>PIX ENVIADO Padaria Pao Quente
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>9000.00<FITID>A2<NAME>SALARIO ASAP
</STMTTRN>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20261005<TRNAMT>0<FITID>A3<MEMO>SALDO DO DIA
</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>12430.55<DTASOF>20261031</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

describe('leitura do extrato', () => {
  it('datas em vários formatos', () => {
    expect(lerData('20261005')).toBe('2026-10-05')
    expect(lerData('05/10/2026')).toBe('2026-10-05')
    expect(lerData('5/10/26')).toBe('2026-10-05')
    expect(lerData('31/02/2026')).toBeNull()
    expect(lerData('PIX')).toBeNull()
  })

  it('OFX: lançamentos, identificador e saldo final', () => {
    const r = lerOfx(OFX)
    expect(r.linhas).toEqual([
      { data: '2026-10-03', valor: -89.9, descricao: 'PIX ENVIADO Padaria Pao Quente', fitid: 'A1' },
      { data: '2026-10-05', valor: 9000, descricao: 'SALARIO ASAP', fitid: 'A2' },
    ])
    expect(r.saldo).toEqual({ data: '2026-10-31', valor: 12430.55 })
    expect(lerExtrato(OFX).linhas).toHaveLength(2)
  })

  it('CSV do Nubank (vírgula, valor com ponto, identificador)', () => {
    const r = lerCsv('Data,Valor,Identificador,Descrição\n03/10/2026,-89.90,abc-1,Transferência enviada pelo Pix - Padaria\n05/10/2026,9000.00,abc-2,"Transferência recebida - ASAP, LTDA"\n')
    expect(r.linhas).toEqual([
      { data: '2026-10-03', valor: -89.9, descricao: 'Transferência enviada pelo Pix - Padaria', fitid: 'abc-1' },
      { data: '2026-10-05', valor: 9000, descricao: 'Transferência recebida - ASAP, LTDA', fitid: 'abc-2' },
    ])
  })

  it('CSV com ponto e vírgula, valor brasileiro e linhas de saldo (Itaú)', () => {
    const r = lerCsv('data;lançamento;valor\n03/10/2026;PIX TRANSF PADARIA;-89,90\n04/10/2026;SALDO DO DIA;1.234,56\n05/10/2026;REMUNERACAO ASAP;9.000,00')
    expect(r.linhas.map((l) => [l.data, l.descricao, l.valor])).toEqual([
      ['2026-10-03', 'PIX TRANSF PADARIA', -89.9],
      ['2026-10-05', 'REMUNERACAO ASAP', 9000],
    ])
  })

  it('CSV com colunas de crédito e débito', () => {
    const r = lerCsv('Data;Histórico;Crédito (R$);Débito (R$);Saldo\n03/10/2026;Padaria;;89,90;100,00\n05/10/2026;Salário;9.000,00;;9.100,00')
    expect(r.linhas.map((l) => l.valor)).toEqual([-89.9, 9000])
  })

  it('CSV sem cabeçalho', () => {
    const r = lerCsv('03/10/2026;PIX PADARIA;-89,90;1.000,00\n05/10/2026;SALARIO;9.000,00;10.000,00')
    expect(r.linhas.map((l) => [l.descricao, l.valor])).toEqual([
      ['PIX PADARIA', -89.9],
      ['SALARIO', 9000],
    ])
  })

  it('chave para não duplicar linhas sem identificador', () => {
    expect(chaveLinha({ data: '2026-10-03', valor: -89.9, descricao: 'PIX  Padaria' })).toBe(chaveLinha({ data: '2026-10-03', valor: -89.9, descricao: 'pix padaria' }))
  })
})

const lanc = (p: Partial<Lancamento>): Lancamento => ({
  id: Math.random().toString(),
  tipo: 'despesa',
  descricao: 'x',
  valor: 0,
  data: '2026-10-01',
  pago: true,
  conta_id: 'itau',
  conta_destino_id: null,
  categoria_id: null,
  observacao: null,
  grupo: null,
  parcela: null,
  parcelas: null,
  natureza: null,
  pessoa_id: null,
  reembolsado: false,
  recorrencia_id: null,
  ...p,
})
const linha = (p: Partial<LinhaExtrato>): LinhaExtrato => ({ id: Math.random().toString(), conta_id: 'itau', data: '2026-10-01', descricao: 'x', valor: 0, fitid: null, lancamento_id: null, ignorada: false, ...p })

describe('conciliação', () => {
  it('casa pelo valor com data próxima, respeita vínculo confirmado e separa o que sobra', () => {
    const aluguel = lanc({ id: 'alug', descricao: 'Aluguel', valor: 3200, data: '2026-10-10' })
    const salario = lanc({ id: 'sal', tipo: 'receita', descricao: 'Pró-labore', valor: 9000, data: '2026-10-05' })
    const mercado = lanc({ id: 'merc', descricao: 'Mercado', valor: 300, data: '2026-10-08' })
    const aporte = lanc({ id: 'apo', tipo: 'transferencia', descricao: 'Aporte XP', valor: 2000, data: '2026-10-15', conta_destino_id: 'xp' })
    const doCartao = lanc({ id: 'cart', valor: 50, conta_id: 'nubank' })
    const linhas = [
      linha({ id: 'e1', data: '2026-10-11', descricao: 'TED ALUGUEL', valor: -3200 }),
      linha({ id: 'e2', data: '2026-10-05', descricao: 'REMUNERACAO', valor: 9000, lancamento_id: 'sal' }),
      linha({ id: 'e3', data: '2026-10-15', descricao: 'APLICACAO XP', valor: -2000 }),
      linha({ id: 'e4', data: '2026-10-20', descricao: 'PIX PADARIA', valor: -25 }),
      linha({ id: 'e5', data: '2026-10-30', descricao: 'Mercado longe', valor: -300 }),
      linha({ id: 'e6', data: '2026-10-21', descricao: 'Tarifa', valor: -10, ignorada: true }),
    ]
    const r = conciliar(linhas, [aluguel, salario, mercado, aporte, doCartao], 'itau')
    expect(r.pares.map((p) => [p.linha.id, p.lanc.id, p.sugerido])).toEqual([
      ['e2', 'sal', false],
      ['e1', 'alug', true],
      ['e3', 'apo', true],
    ])
    expect(r.soExtrato.map((l) => l.id)).toEqual(['e4', 'e5']) // mercado com 22 dias de diferença não casa
    expect(r.soApp.map((l) => l.id)).toEqual(['merc'])
    expect(r.ignoradas.map((l) => l.id)).toEqual(['e6'])
  })

  it('dois lançamentos de mesmo valor: fica com o de data mais próxima', () => {
    const a = lanc({ id: 'a', valor: 55.9, data: '2026-10-01', descricao: 'Netflix' })
    const b = lanc({ id: 'b', valor: 55.9, data: '2026-10-04', descricao: 'Outro' })
    const r = conciliar([linha({ valor: -55.9, data: '2026-10-04' })], [a, b], 'itau')
    expect(r.pares[0].lanc.id).toBe('b')
  })

  it('sugere a categoria usada antes com a mesma descrição', () => {
    const ls = [lanc({ descricao: 'PIX PADARIA', categoria_id: 'alim', data: '2026-09-01' }), lanc({ descricao: 'pix  padaria', categoria_id: 'merc', data: '2026-10-01' })]
    expect(categoriaPorDescricao('Pix Padaria', ls)).toBe('merc')
    expect(categoriaPorDescricao('Outra coisa', ls)).toBeNull()
  })
})

describe('dados da conta no OFX', () => {
  const ofx = (bank: string, branch: string, acct: string) =>
    `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL<BANKACCTFROM><BANKID>${bank}<BRANCHID>${branch}<ACCTID>${acct}<ACCTTYPE>CHECKING</BANKACCTFROM><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003<TRNAMT>-10.00<FITID>1<MEMO>X</STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`

  it('lê banco, agência e conta', () => {
    expect(lerOfx(ofx('0341', '1234', '12345-6')).conta).toEqual({ banco: '0341', agencia: '1234', numero: '12345-6' })
    expect(lerOfx(OFX).conta).toBeNull()
  })

  it('confere com o cadastro (zeros à esquerda, com ou sem dígito, agência na frente)', () => {
    const itau = { banco_codigo: '341', agencia: '1234', numero_conta: '12345-6' }
    expect(contaBate(itau, { banco: '0341', agencia: '1234', numero: '12345-6' })).toBe('bate')
    expect(contaBate(itau, { banco: '0341', agencia: '', numero: '123456' })).toBe('bate')
    expect(contaBate(itau, { banco: '341', agencia: '1234', numero: '12345' })).toBe('bate')
    expect(contaBate(itau, { banco: '341', agencia: '', numero: '1234123456' })).toBe('bate')
    expect(contaBate(itau, { banco: '237', agencia: '1234', numero: '12345-6' })).toBe('nao_bate')
    expect(contaBate(itau, { banco: '341', agencia: '9999', numero: '12345-6' })).toBe('nao_bate')
    expect(contaBate(itau, { banco: '341', agencia: '1234', numero: '99999-9' })).toBe('nao_bate')
    expect(contaBate({ banco_codigo: '341' }, { banco: '341', agencia: '1', numero: '1' })).toBe('sem_dados')
  })
})

describe('sugestão pelo histórico do extrato', () => {
  const l1 = lanc({ id: 'l1', descricao: 'Padaria', categoria_id: 'alim', data: '2026-09-03' })
  const l2 = lanc({ id: 'l2', tipo: 'transferencia', descricao: 'Fatura Nubank', valor: 900, data: '2026-09-03', conta_id: 'itau', conta_destino_id: 'nubank' })
  const hist = [
    { descricao: 'PIX ENVIADO PADARIA PAO QUENTE', lancamento_id: 'l1' },
    { descricao: 'PAGAMENTO FATURA NU', lancamento_id: 'l2' },
  ]
  it('repete a descrição e a categoria dadas da última vez', () => {
    expect(sugestaoPorHistorico('PIX enviado padaria pao quente', hist, [l1, l2], 'itau')).toEqual({ descricao: 'Padaria', categoria_id: 'alim', transferir_para: null })
  })
  it('lembra quando virou transferência (pagamento de fatura)', () => {
    expect(sugestaoPorHistorico('PAGAMENTO FATURA NU', hist, [l1, l2], 'itau')).toEqual({ descricao: 'Fatura Nubank', categoria_id: null, transferir_para: 'nubank' })
  })
  it('sem histórico: nada', () => {
    expect(sugestaoPorHistorico('TED QUALQUER', hist, [l1, l2], 'itau')).toBeNull()
  })
})
