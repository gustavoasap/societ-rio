// Base legal usada nos cálculos, com links oficiais para consulta.

export interface Norma {
  sigla: string
  titulo: string
  url: string
  uso: string
  grupo: 'Reforma Tributária' | 'Simples Nacional' | 'IRPJ/CSLL' | 'PIS/COFINS' | 'ICMS/IPI/ISS' | 'Previdência'
}

const planalto = (caminho: string) => `https://www.planalto.gov.br/ccivil_03/${caminho}`

export const LEGISLACAO: Norma[] = [
  {
    grupo: 'Reforma Tributária',
    sigla: 'EC 132/2023',
    titulo: 'Emenda Constitucional da Reforma Tributária (IBS, CBS e IS)',
    url: planalto('constituicao/emendas/emc/emc132.htm'),
    uso: 'Cronograma da transição: extinção de PIS/COFINS e IPI (2027), redução do ICMS/ISS em 10%/20%/30%/40% de 2029 a 2032 e extinção em 2033 (ADCT, arts. 125 a 133).',
  },
  {
    grupo: 'Reforma Tributária',
    sigla: 'LC 214/2025',
    titulo: 'Institui o IBS, a CBS e o Imposto Seletivo',
    url: planalto('leis/lcp/lcp214.htm'),
    uso: 'Base de cálculo sem ICMS/ISS/PIS/COFINS/IPI (art. 12, §2º); créditos (arts. 28 e 47); Simples Nacional e opção pelo regime regular (art. 41); alíquotas de teste de 2026 (arts. 343, 346 e 348); IBS de 0,1% e CBS reduzida em 0,1 p.p. em 2027-2028 (arts. 344 e 347); reduções de 60% (Anexo VIII) e alíquota zero (art. 147).',
  },
  {
    grupo: 'Reforma Tributária',
    sigla: 'LC 227/2026',
    titulo: 'Comitê Gestor do IBS e processo administrativo (PLP 108/2024)',
    url: planalto('leis/lcp/lcp227.htm'),
    uso: 'Gestão e distribuição do IBS entre Estados e Municípios; ajustes na LC 214/2025.',
  },
  {
    grupo: 'Reforma Tributária',
    sigla: 'Portal da Reforma',
    titulo: 'Ministério da Fazenda — Regulamentação da Reforma Tributária',
    url: 'https://www.gov.br/fazenda/pt-br/acesso-a-informacao/acoes-e-programas/reforma-tributaria',
    uso: 'Estimativas oficiais das alíquotas de referência (CBS ≈ 8,8% e IBS ≈ 17,7%). A alíquota da CBS de 2027 será fixada pelo Senado até 15/12/2026 após cálculo do TCU.',
  },
  {
    grupo: 'Reforma Tributária',
    sigla: 'CGIBS',
    titulo: 'Comitê Gestor do IBS — resoluções',
    url: 'https://www.cgibs.gov.br/',
    uso: 'Resolução CGIBS nº 14/2026 (proposta de percentuais do IBS para 2027) e estimativa de alíquota combinada de 27,91%.',
  },
  {
    grupo: 'Simples Nacional',
    sigla: 'LC 123/2006',
    titulo: 'Estatuto da Microempresa e Empresa de Pequeno Porte (Simples Nacional)',
    url: planalto('leis/lcp/lcp123.htm'),
    uso: 'Anexos I a V e partilha (redação da LC 155/2016); RBT12 e início de atividade (art. 18, §§1º e 2º); segregação de monofásico/ST/exportação (art. 18, §4º-A); limite de R$ 4,8 mi (art. 3º) e sublimite de R$ 3,6 mi (art. 13-A).',
  },
  {
    grupo: 'Simples Nacional',
    sigla: 'Res. CGSN 140/2018',
    titulo: 'Regulamento do Simples Nacional',
    url: 'http://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=92278',
    uso: 'Regras operacionais do PGDAS-D, apuração consolidada de matriz e filiais (art. 21) e segregação de receitas.',
  },
  {
    grupo: 'IRPJ/CSLL',
    sigla: 'Lei 9.249/1995',
    titulo: 'IRPJ e CSLL — percentuais de presunção',
    url: planalto('leis/l9249.htm'),
    uso: 'Presunção de 8% (IRPJ) e 12% (CSLL) para comércio e 32% para serviços (arts. 15 e 20).',
  },
  {
    grupo: 'IRPJ/CSLL',
    sigla: 'Lei 9.430/1996',
    titulo: 'Apuração trimestral do IRPJ e CSLL',
    url: planalto('leis/l9430.htm'),
    uso: 'Períodos trimestrais (art. 1º) e adicional de 10% sobre a parcela que exceder R$ 20 mil/mês (art. 4º; Lei 9.249, art. 3º, §1º).',
  },
  {
    grupo: 'IRPJ/CSLL',
    sigla: 'LC 224/2025',
    titulo: 'Redução de benefícios fiscais — presunção do Lucro Presumido',
    url: planalto('leis/lcp/lcp224.htm'),
    uso: 'Acréscimo de 10% nos percentuais de presunção sobre a receita bruta anual que exceder R$ 5 milhões (IRPJ desde 01/2026; CSLL desde 04/2026).',
  },
  {
    grupo: 'IRPJ/CSLL',
    sigla: 'Decreto 9.580/2018',
    titulo: 'Regulamento do Imposto de Renda (RIR/2018)',
    url: planalto('_ato2015-2018/2018/decreto/d9580.htm'),
    uso: 'Lucro real, custos e despesas dedutíveis, compensação de prejuízos (limite de 30%).',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Lei 9.718/1998',
    titulo: 'PIS/COFINS cumulativos',
    url: planalto('leis/l9718compilada.htm'),
    uso: 'Alíquotas de 0,65% e 3% no Lucro Presumido.',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Leis 10.637/2002 e 10.833/2003',
    titulo: 'PIS/COFINS não cumulativos',
    url: planalto('leis/2003/l10.833.htm'),
    uso: 'Alíquotas de 1,65% e 7,6% e créditos sobre bens para revenda, energia, fretes e armazenagem (art. 3º).',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Lei 10.147/2000',
    titulo: 'Monofásico — farmacêuticos, perfumaria, higiene pessoal e cosméticos',
    url: planalto('leis/l10147.htm'),
    uso: 'Revenda com alíquota zero de PIS/COFINS para os NCM 30.03, 30.04, 33.03 a 33.07, 3401.11.90, 3401.20.10 e 9603.21.00.',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Lei 14.592/2023',
    titulo: 'Exclusão do ICMS da base de crédito de PIS/COFINS',
    url: planalto('_ato2023-2026/2023/lei/l14592.htm'),
    uso: 'O ICMS destacado na nota de compra não gera crédito de PIS/COFINS.',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'STF — Tema 69',
    titulo: 'RE 574.706 — exclusão do ICMS da base de PIS/COFINS',
    url: 'https://portal.stf.jus.br/jurisprudenciaRepercussao/verAndamentoProcesso.asp?incidente=2585258&numeroProcesso=574706&classeProcesso=RE&numeroTema=69',
    uso: 'O ICMS destacado na nota não compõe a base de PIS/COFINS.',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'LC 87/1996',
    titulo: 'Lei Kandir — ICMS',
    url: planalto('leis/lcp/lcp87.htm'),
    uso: 'Não cumulatividade do ICMS (débito e crédito).',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'EC 87/2015 e LC 190/2022',
    titulo: 'DIFAL nas vendas interestaduais a não contribuintes',
    url: planalto('leis/lcp/lcp190.htm'),
    uso: 'Diferencial de alíquotas devido ao estado de destino.',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'Res. Senado 22/1989 e 13/2012',
    titulo: 'Alíquotas interestaduais de ICMS (12%, 7% e 4% para importados)',
    url: 'https://legis.senado.leg.br/norma/590838',
    uso: 'Alíquota interestadual média nos parâmetros.',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'RICMS/SP',
    titulo: 'Regulamento do ICMS de São Paulo (Decreto 45.490/2000)',
    url: 'https://legislacao.fazenda.sp.gov.br/Paginas/RICMS_2000.aspx',
    uso: 'Alíquota interna de 18% (art. 52) — confira a alíquota modal de cada UF nos respectivos regulamentos.',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'LC 116/2003',
    titulo: 'ISS — lista de serviços',
    url: planalto('leis/lcp/lcp116.htm'),
    uso: 'Códigos de serviço dos relatórios de serviços tomados/prestados; alíquota máxima de 5%.',
  },
  {
    grupo: 'Previdência',
    sigla: 'Lei 8.212/1991',
    titulo: 'Contribuição previdenciária patronal',
    url: planalto('leis/l8212cons.htm'),
    uso: '20% sobre folha e pró-labore, RAT/FAP e terceiros (art. 22) — fora do DAS no Presumido, Real e Anexo IV.',
  },
]
