-- Inadimplência automática só a partir de uma competência (padrão: nov/2026); antes disso,
-- os honorários em aberto vêm da planilha importada do sistema de cobrança.
alter table public.adm_hon_config add column if not exists inadimplencia_desde date not null default '2026-11-01' check (extract(day from inadimplencia_desde) = 1);

create table if not exists public.adm_hon_inad_importada (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.adm_clientes(id) on delete cascade,
  vencimento date,
  competencia date,
  valor numeric(12,2) not null check (valor >= 0),
  descricao text,
  arquivo text,
  recebido_em date,
  importado_por uuid default auth.uid() references auth.users(id) on delete set null,
  importado_em timestamptz not null default now()
);
create index if not exists adm_hon_inad_importada_cliente_idx on public.adm_hon_inad_importada (cliente_id);
alter table public.adm_hon_inad_importada enable row level security;
create policy "administrativo acessa inadimplencia importada" on public.adm_hon_inad_importada for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));
