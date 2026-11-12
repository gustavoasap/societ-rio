-- Tarifa cobrada por boleto emitido: o crédito no extrato vem com o honorário menos a tarifa.
alter table public.adm_hon_config add column if not exists tarifa_boleto numeric(10,2) not null default 0 check (tarifa_boleto >= 0);
update public.adm_hon_config set tarifa_boleto = 2.19 where id = 1;
