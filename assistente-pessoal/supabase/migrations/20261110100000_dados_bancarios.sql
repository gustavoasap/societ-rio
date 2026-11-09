-- Dados bancários da conta, para reconhecer o extrato OFX importado (BANKID / BRANCHID / ACCTID). Idempotente.
alter table public.pes_contas
  add column if not exists banco_codigo text,
  add column if not exists agencia text,
  add column if not exists numero_conta text;
