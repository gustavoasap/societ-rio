-- Despesa compartilhada (paguei o total, os outros me devolveram por PIX) e históricos padrão da conciliação. Idempotente.

-- Liga a saída e as entradas do extrato, e os lançamentos criados para elas, num mesmo grupo
alter table public.pes_extrato add column if not exists compartilhado_id uuid;
alter table public.pes_lancamentos add column if not exists compartilhado_id uuid;
create index if not exists pes_lancamentos_compartilhado on public.pes_lancamentos (compartilhado_id) where compartilhado_id is not null;

-- Textos de histórico salvos para reaproveitar na conciliação (com a categoria que costuma acompanhar)
create table if not exists public.pes_historicos_padrao (
  id uuid primary key default gen_random_uuid(),
  texto text not null unique,
  categoria_id uuid references public.pes_categorias (id) on delete set null,
  criado_em timestamptz not null default now()
);
alter table public.pes_historicos_padrao enable row level security;
drop policy if exists "somente o dono" on public.pes_historicos_padrao;
create policy "somente o dono" on public.pes_historicos_padrao for all to authenticated
  using ((select public.pes_eh_dono())) with check ((select public.pes_eh_dono()));
