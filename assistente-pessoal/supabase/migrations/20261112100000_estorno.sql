-- Estorno (total ou parcial) de um pagamento ou recebimento, na conciliação. Idempotente.
-- A linha do estorno guarda: qual linha do extrato ela desfaz (se houver), qual lançamento foi criado,
-- reduzido ou apagado por causa dela, e como (para poder desfazer).
alter table public.pes_extrato
  add column if not exists estorno_de uuid references public.pes_extrato (id) on delete set null,
  add column if not exists estorno_lancamento uuid,
  add column if not exists estorno_modo text check (estorno_modo in ('pendente', 'novo', 'reduziu', 'apagou'));
