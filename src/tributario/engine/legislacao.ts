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
    uso: 'Monofásico de farmacêuticos (30.01, 30.03 exceto 3003.90.56, 30.04 exceto 3004.90.46 e outros) e perfumaria/higiene (33.03 a 33.05, 33.07, 3401.11.90, 3401.20.10, 9603.21.00; 33.06 saiu em 2013 — Lei 12.839).',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'EFD-Contribuições — Tabelas 4.3.10 a 4.3.16',
    titulo: 'Tabelas de NCM por CST de PIS/COFINS publicadas no portal SPED (RFB)',
    url: 'http://sped.rfb.gov.br/pasta/show/1616',
    uso: '4.3.10/4.3.11 monofásico (CST 02/03 e revenda CST 04), 4.3.12 substituição tributária (CST 05), 4.3.13 alíquota zero (CST 06), 4.3.14 isenção (07), 4.3.15 sem incidência (08), 4.3.16 suspensão (09). Base do “Padrão” de monofásico e dos avisos da aba Produtos.',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Lei 10.485/2002',
    titulo: 'Monofásico — veículos, máquinas, autopeças (Anexos I e II) e pneus',
    url: planalto('leis/2002/l10485.htm'),
    uso: 'Autopeças constam dos Anexos I e II (a tabela 4.3.10 remete à lei, sem NCM): marque o monofásico manualmente na aba Produtos.',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Lei 13.097/2015',
    titulo: 'Bebidas frias (águas, refrigerantes, chás, isotônicos, energéticos, cervejas)',
    url: planalto('_ato2015-2018/2015/lei/l13097.htm'),
    uso: 'Tributação concentrada no fabricante/importador (arts. 14 a 36); revenda com alíquota zero.',
  },
  {
    grupo: 'PIS/COFINS',
    sigla: 'Lei 10.865/2004, art. 28',
    titulo: 'Alíquota zero de PIS/COFINS na venda de diversos produtos',
    url: planalto('_ato2004-2006/2004/lei/l10.865.htm'),
    uso: 'Alíquota zero (tabela 4.3.13) — sem débito na venda e sem crédito na compra no regime regular (Lei 10.833, art. 3º, §2º, II).',
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
    uso: 'Não cumulatividade do ICMS (débito e crédito); substituição tributária — responsabilidade do substituto, base com MVA e protocolos/convênios entre UFs (arts. 6º a 10).',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'Convênio ICMS 142/2018',
    titulo: 'Regimes de substituição tributária e antecipação do ICMS; lista nacional de mercadorias (CEST × NCM)',
    url: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18',
    uso: 'Anexos II a XXVI: mercadorias que podem estar sujeitas à ST, por segmento e CEST (aviso "Lista de ST" na aba Produtos); MVA ajustada nas operações interestaduais (cláusula nona).',
  },
  {
    grupo: 'ICMS/IPI/ISS',
    sigla: 'CONFAZ — protocolos',
    titulo: 'Protocolos ICMS (ST entre estados, por segmento)',
    url: 'https://www.confaz.fazenda.gov.br/legislacao/protocolos',
    uso: 'Acordos entre UFs que atribuem a retenção da ST ao remetente nas operações interestaduais. Sem protocolo ou convênio, o destinatário recolhe a ST na entrada.',
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
