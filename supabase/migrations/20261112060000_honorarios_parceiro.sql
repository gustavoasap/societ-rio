-- Controle de Honorários: períodos em que o parceiro paga a mensalidade do cliente (ex.: 6 meses pela Way Group).
create table if not exists public.adm_hon_parceiro (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.adm_clientes(id) on delete cascade,
  parceiro_id uuid not null references public.soc_parceiros(id) on delete restrict,
  inicio date not null check (extract(day from inicio) = 1),
  meses smallint not null check (meses between 1 and 120),
  observacao text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists adm_hon_parceiro_cliente_idx on public.adm_hon_parceiro (cliente_id);
alter table public.adm_hon_parceiro enable row level security;
create policy "administrativo acessa mensalidades de parceiros" on public.adm_hon_parceiro for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));
