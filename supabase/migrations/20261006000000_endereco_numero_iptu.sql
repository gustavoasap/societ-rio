-- Número do endereço e inscrição do IPTU do imóvel da empresa.
-- (Número e complemento do sócio ficam no jsonb `socios`, sem migração.)
alter table public.soc_processos
  add column if not exists numero text,
  add column if not exists iptu text;
