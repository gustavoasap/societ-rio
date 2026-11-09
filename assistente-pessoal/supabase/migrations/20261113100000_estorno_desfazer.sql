-- O que fazer para desfazer um estorno (lista de operações inversas), para casos com vários lançamentos
-- (ex.: estorno de um reembolso de despesa compartilhada mexe no reembolso, na parte dos outros e na minha). Idempotente.
alter table public.pes_extrato add column if not exists estorno_desfazer jsonb;
