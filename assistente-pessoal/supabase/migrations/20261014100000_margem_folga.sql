-- Margem de folga (%) sobre as despesas para calcular a renda necessária no "Meu plano".
alter table public.pes_config
  add column if not exists margem_folga numeric(5, 2) not null default 20 check (margem_folga between 0 and 300);
notify pgrst, 'reload schema';
