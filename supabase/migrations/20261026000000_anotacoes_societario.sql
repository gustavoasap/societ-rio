-- Anotações - Tarefas (Rascunho) do departamento Societário
-- Lembretes rápidos das demandas que chegam (ex.: "Alteração - Daniel e Castiele"),
-- com o valor a cobrar de cada processo.

create table if not exists public.soc_anotacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  valor_cobrado numeric(14, 2) check (valor_cobrado is null or valor_cobrado >= 0),
  concluida boolean not null default false,
  concluida_em timestamptz,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists soc_anotacoes_updated_at on public.soc_anotacoes;
create trigger soc_anotacoes_updated_at
  before update on public.soc_anotacoes
  for each row execute function public.soc_set_updated_at();

alter table public.soc_anotacoes enable row level security;

drop policy if exists "societário acessa anotações" on public.soc_anotacoes;
create policy "societário acessa anotações" on public.soc_anotacoes
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('societario')))
  with check ((select public.portal_tem_acesso_slug('societario')));

-- Atalho no portal
insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Anotações - Tarefas (Rascunho)', 'Lembretes rápidos das demandas societárias e o valor a cobrar de cada processo.', 'ClipboardList', '/societario/anotacoes', 'disponivel', 4
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/anotacoes');
