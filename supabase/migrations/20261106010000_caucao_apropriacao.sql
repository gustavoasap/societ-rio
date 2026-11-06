-- Data em que o saldo restante do caução (lucro ou prejuízo) foi baixado da conta
-- "Adiantamento de Clientes - Caução" para o resultado. Usada na conciliação mensal.
alter table public.soc_caucoes add column if not exists data_apropriacao date;
