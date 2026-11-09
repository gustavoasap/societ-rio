-- Datas de uma fatura específica do cartão, quando fogem do padrão (fechamento/vencimento do cadastro).
-- mes = 1º dia do mês da fatura (o mês do vencimento padrão). Idempotente.

create table if not exists public.pes_fatura_datas (
  conta_id uuid not null references public.pes_contas (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  fechamento date not null,
  vencimento date not null check (vencimento >= fechamento),
  primary key (conta_id, mes)
);

alter table public.pes_fatura_datas enable row level security;
drop policy if exists "somente o dono" on public.pes_fatura_datas;
create policy "somente o dono" on public.pes_fatura_datas for all to authenticated
  using ((select public.pes_eh_dono())) with check ((select public.pes_eh_dono()));
