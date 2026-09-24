-- Regime tributário de cada fornecedor/prestador: define o crédito de ICMS, PIS/COFINS e IBS/CBS
alter table public.trib_parceiros
  add column if not exists regime text
    check (regime is null or regime in ('normal', 'real', 'presumido', 'simples', 'mei', 'pf'));
