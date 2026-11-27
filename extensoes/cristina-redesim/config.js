// Configuração da extensão Cristina – Viabilidade Redesim SP (ASAP)
// A chave abaixo é a chave PÚBLICA (publishable) do Supabase do portal, a mesma da Cláudia.
// Ela não dá acesso a nada sozinha: os dados só saem com o login do usuário (RLS do portal).
self.CRISTINA_CONFIG = {
  SUPABASE_URL: "https://zpffbnhtzlphuewctpsk.supabase.co",
  SUPABASE_KEY: "sb_publishable_AlIwF3FxbgtSX6Ri2tVjJg_cDIhrlBE",
  // Página inicial do VRE | REDESIM (o login com gov.br é sempre seu)
  URL_REDESIM: "https://vreredesim.sp.gov.br/",
  // Botões em que a Cristina NUNCA clica sozinha: ela para antes e espera você revisar.
  BOTOES_PROIBIDOS: /transmitir|enviar|protocolar|finalizar|concluir pedido|confirmar envio|assinar|pagar|gerar (guia|darf|boleto)/i,
  // Número da viabilidade no portal: 3 letras + 10 números (ex.: SPN2633893093)
  REGEX_VIABILIDADE: /\b([A-Z]{3}\d{10})\b/
};
