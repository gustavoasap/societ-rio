import { describe, expect, it } from 'vitest'
import type { Lancamento } from '../tipos'
import { categoriaPorDescricao, chaveLinha, conciliar, contaBate, lerCsv, lerData, lerExtrato, lerOfx, planoCompartilhada, planoEstorno, sugestaoPorHistorico, type LinhaExtrato } from './extrato'

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

describe('despesa compartilhada', () => {
  const saida = linha({ id: 's', data: '2026-11-01', descricao: 'PIX ENVIADO RESTAURANTE', valor: -89.9 })
  const pix = [1, 2, 3, 4, 5, 6, 7].map((i) => linha({ id: `p${i}`, data: '2026-11-01', descricao: `PIX RECEBIDO AMIGO ${i}`, valor: 10 }))
  const plano = planoCompartilhada({ saida, entradas: pix, contaId: 'itau', categoriaId: 'alim', descricao: 'Churrasco', pessoaId: 'rateio', grupo: 'g1' })

  it('minha parte na categoria, parte dos outros e reembolsos em nome da pessoa', () => {
    expect(plano[0]).toEqual({ linhaId: 's', lanc: expect.objectContaining({ tipo: 'despesa', valor: 19.9, categoria_id: 'alim', pessoa_id: null }) })
    expect(plano[1]).toEqual({ linhaId: null, lanc: expect.objectContaining({ tipo: 'despesa', valor: 70, pessoa_id: 'rateio', reembolsado: true }) })
    expect(plano.slice(2).map((x) => [x.linhaId, x.lanc.tipo, x.lanc.valor, x.lanc.pessoa_id])).toEqual(pix.map((p) => [p.id, 'receita', 10, 'rateio']))
    expect(plano.every((x) => x.lanc.compartilhado_id === 'g1')).toBe(true)
  })

  it('o saldo bate com o banco (−89,90 + 7 × 10) e a minha DRE só vê 19,90', () => {
    const efeito = plano.reduce((t, x) => t + (x.lanc.tipo === 'receita' ? 1 : -1) * Math.round(x.lanc.valor * 100), 0)
    expect(efeito).toBe(Math.round((-89.9 + 70) * 100))
    expect(plano.filter((x) => !x.lanc.pessoa_id).map((x) => x.lanc.valor)).toEqual([19.9])
  })

  it('se todos pagaram tudo, a saída fica com a parte dos outros', () => {
    const r = planoCompartilhada({ saida: linha({ id: 's', valor: -30 }), entradas: [linha({ id: 'a', valor: 30 })], contaId: 'itau', categoriaId: null, descricao: 'Presente', pessoaId: 'x', grupo: 'g' })
    expect(r.map((x) => [x.linhaId, x.lanc.tipo, x.lanc.valor])).toEqual([
      ['s', 'despesa', 30],
      ['a', 'receita', 30],
    ])
  })

  it('recebeu mais do que pagou: erro', () => {
    expect(() => planoCompartilhada({ saida: linha({ valor: -10 }), entradas: [linha({ valor: 20 })], contaId: 'i', categoriaId: null, descricao: 'x', pessoaId: 'p', grupo: 'g' })).toThrow(/mais do que pagou/)
  })

  it('na conciliação, a parte dos outros não aparece como "só no app"', () => {
    const parte = lanc({ id: 'outros', valor: 70, data: '2026-11-01', compartilhado_id: 'g1', pessoa_id: 'rateio' })
    const minha = lanc({ id: 'minha', valor: 19.9, data: '2026-11-01', compartilhado_id: 'g1' })
    const r = conciliar([linha({ id: 's', data: '2026-11-01', valor: -89.9, lancamento_id: 'minha', compartilhado_id: 'g1' })], [parte, minha], 'itau')
    expect(r.pares.map((p) => p.lanc.id)).toEqual(['minha'])
    expect(r.soApp).toEqual([])
  })
})

describe('estorno', () => {
  const pago = linha({ id: 'o', data: '2026-11-02', descricao: 'COMPRA LOJA X', valor: -100 })
  const args = { contaId: 'itau', descricao: 'Loja X', categoriaId: 'roupas' }

  it('original ainda não lançado, estorno parcial: lança só o líquido', () => {
    const r = planoEstorno({ ...args, estorno: linha({ id: 'e', valor: 30 }), original: { linha: pago } })
    expect(r).toEqual({ modo: 'novo', estorno_de: 'o', liquido: 70, criar: expect.objectContaining({ tipo: 'despesa', valor: 70, data: '2026-11-02', categoria_id: 'roupas' }) })
  })

  it('original ainda não lançado, estorno total: não lança nada', () => {
    expect(planoEstorno({ ...args, estorno: linha({ valor: 100 }), original: { linha: pago } })).toEqual({ modo: 'pendente', estorno_de: 'o', liquido: 0 })
  })

  it('original já lançado: parcial reduz, total apaga e solta a linha', () => {
    const l = lanc({ id: 'L', valor: 100 })
    expect(planoEstorno({ ...args, estorno: linha({ valor: 30 }), original: { linha: { ...pago, lancamento_id: 'L' }, lanc: l } })).toEqual({ modo: 'reduziu', estorno_de: 'o', liquido: 70, reduzir: { id: 'L', valor: 70 } })
    expect(planoEstorno({ ...args, estorno: linha({ valor: 100 }), original: { linha: { ...pago, lancamento_id: 'L' }, lanc: l } })).toEqual({ modo: 'apagou', estorno_de: 'o', liquido: 0, apagar: 'L', desligar: 'o' })
  })

  it('recebimento estornado (saída) e lançamento sem linha no extrato', () => {
    const rec = lanc({ id: 'R', tipo: 'receita', valor: 500 })
    expect(planoEstorno({ ...args, estorno: linha({ valor: -200 }), original: { lanc: rec } })).toEqual({ modo: 'reduziu', estorno_de: null, liquido: 300, reduzir: { id: 'R', valor: 300 } })
  })

  it('sinal igual ou estorno maior que o original: erro', () => {
    expect(() => planoEstorno({ ...args, estorno: linha({ valor: -30 }), original: { linha: pago } })).toThrow(/sinal contrário/)
    expect(() => planoEstorno({ ...args, estorno: linha({ valor: 150 }), original: { linha: pago } })).toThrow(/maior que o valor original/)
  })

  it('na conciliação, estorno e original estornada saem de "a classificar"', () => {
    const r = conciliar([pago, linha({ id: 'e', data: '2026-11-05', valor: 100, estorno_de: 'o', estorno_modo: 'pendente' }), linha({ id: 'x', valor: -5 })], [], 'itau')
    expect(r.estornos.map((l) => l.id)).toEqual(['o', 'e'])
    expect(r.soExtrato.map((l) => l.id)).toEqual(['x'])
  })
})
