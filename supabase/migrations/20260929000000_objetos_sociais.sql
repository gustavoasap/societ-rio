-- Gerador de Objeto Social: objetos sociais padrão salvos pela equipe do Societário

create table if not exists public.soc_objetos_sociais (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  cnaes text[] not null default '{}',
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists soc_objetos_sociais_updated_at on public.soc_objetos_sociais;
create trigger soc_objetos_sociais_updated_at
  before update on public.soc_objetos_sociais
  for each row execute function public.soc_set_updated_at();

alter table public.soc_objetos_sociais enable row level security;

drop policy if exists "societário acessa objetos sociais" on public.soc_objetos_sociais;
create policy "societário acessa objetos sociais" on public.soc_objetos_sociais
  for all to authenticated
  using (public.portal_tem_acesso_slug('societario'))
  with check (public.portal_tem_acesso_slug('societario'));

-- Atalho no portal, ao lado de Processos Societários
insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Gerador de Objeto Social', 'Informe os CNAEs e receba o objeto social pronto para o contrato ou a alteração.', 'FilePen', '/societario/objeto-social', 'disponivel', 2
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/objeto-social');
