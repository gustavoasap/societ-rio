-- Portal interno da ASAP: departamentos, ferramentas (módulos) e permissões por usuário

-- Perfis: um por usuário do Supabase Auth
create table if not exists public.portal_perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text,
  admin boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_departamentos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nome text not null,
  descricao text,
  icone text not null default 'FolderOpen',
  cor text not null default 'brand',
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.portal_modulos (
  id uuid primary key default gen_random_uuid(),
  departamento_id uuid not null references public.portal_departamentos (id) on delete restrict,
  nome text not null,
  descricao text,
  icone text not null default 'LayoutGrid',
  -- Caminho interno (ex.: /societario/processos) ou endereço externo (https://...)
  link text,
  status text not null default 'em_breve' check (status in ('disponivel', 'em_breve', 'oculto')),
  ordem int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists portal_modulos_departamento_idx on public.portal_modulos (departamento_id);

-- Quais departamentos cada usuário enxerga (administradores enxergam todos)
create table if not exists public.portal_acessos (
  user_id uuid not null references public.portal_perfis (user_id) on delete cascade,
  departamento_id uuid not null references public.portal_departamentos (id) on delete cascade,
  primary key (user_id, departamento_id)
);

-- Funções auxiliares usadas nas regras de acesso
create or replace function public.portal_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.admin from public.portal_perfis p where p.user_id = auth.uid() and p.ativo), false);
$$;

create or replace function public.portal_tem_acesso(dep uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.portal_is_admin()
    or exists (
      select 1 from public.portal_acessos a
      join public.portal_perfis p on p.user_id = a.user_id and p.ativo
      where a.user_id = auth.uid() and a.departamento_id = dep
    );
$$;

-- Para usar depois nas tabelas de cada ferramenta: portal_tem_acesso_slug('societario')
create or replace function public.portal_tem_acesso_slug(dep_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.portal_tem_acesso((select d.id from public.portal_departamentos d where d.slug = dep_slug));
$$;

-- Cria o perfil automaticamente quando um usuário é cadastrado no Supabase
create or replace function public.portal_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.portal_perfis (user_id, email) values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists portal_novo_usuario on auth.users;
create trigger portal_novo_usuario
  after insert on auth.users
  for each row execute function public.portal_novo_usuario();

-- Perfis para os usuários que já existem
insert into public.portal_perfis (user_id, email)
select id, coalesce(email, '') from auth.users
on conflict (user_id) do nothing;

-- Segurança
alter table public.portal_perfis enable row level security;
alter table public.portal_departamentos enable row level security;
alter table public.portal_modulos enable row level security;
alter table public.portal_acessos enable row level security;

drop policy if exists "ver o próprio perfil ou admin" on public.portal_perfis;
create policy "ver o próprio perfil ou admin" on public.portal_perfis
  for select to authenticated using (user_id = auth.uid() or public.portal_is_admin());
drop policy if exists "admin altera perfis" on public.portal_perfis;
create policy "admin altera perfis" on public.portal_perfis
  for update to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());

drop policy if exists "ver departamentos liberados" on public.portal_departamentos;
create policy "ver departamentos liberados" on public.portal_departamentos
  for select to authenticated using (public.portal_tem_acesso(id));
drop policy if exists "admin gerencia departamentos" on public.portal_departamentos;
create policy "admin gerencia departamentos" on public.portal_departamentos
  for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());

drop policy if exists "ver ferramentas liberadas" on public.portal_modulos;
create policy "ver ferramentas liberadas" on public.portal_modulos
  for select to authenticated using (public.portal_tem_acesso(departamento_id) and (status <> 'oculto' or public.portal_is_admin()));
drop policy if exists "admin gerencia ferramentas" on public.portal_modulos;
create policy "admin gerencia ferramentas" on public.portal_modulos
  for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());

drop policy if exists "ver os próprios acessos ou admin" on public.portal_acessos;
create policy "ver os próprios acessos ou admin" on public.portal_acessos
  for select to authenticated using (user_id = auth.uid() or public.portal_is_admin());
drop policy if exists "admin gerencia acessos" on public.portal_acessos;
create policy "admin gerencia acessos" on public.portal_acessos
  for all to authenticated using (public.portal_is_admin()) with check (public.portal_is_admin());

-- Departamentos iniciais
insert into public.portal_departamentos (slug, nome, descricao, icone, cor, ordem) values
  ('societario', 'Societário', 'Abertura, alteração e baixa de empresas.', 'Landmark', 'brand', 1),
  ('contabil', 'Contábil', 'Conciliações, fechamento e demonstrações.', 'Calculator', 'emerald', 2),
  ('fiscal', 'Fiscal', 'Apuração de tributos e obrigações acessórias.', 'Receipt', 'amber', 3),
  ('pessoal', 'Departamento Pessoal', 'Folha, admissões e rescisões.', 'Users', 'violet', 4),
  ('administrativo', 'Administrativo', 'Gestão interna do escritório.', 'Briefcase', 'sky', 5)
on conflict (slug) do nothing;

-- Primeira ferramenta: Processos Societários
insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Processos Societários', 'Acompanhe abertura, alteração e baixa de CNPJ, etapa por etapa.', 'ClipboardList', '/societario/processos', 'disponivel', 1
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/processos');

-- Funções do portal: ninguém sem login executa; a de cadastro de perfil só roda pelo gatilho
revoke execute on function public.portal_is_admin() from public, anon;
revoke execute on function public.portal_tem_acesso(uuid) from public, anon;
revoke execute on function public.portal_tem_acesso_slug(text) from public, anon;
revoke execute on function public.portal_novo_usuario() from public, anon, authenticated;
grant execute on function public.portal_is_admin() to authenticated;
grant execute on function public.portal_tem_acesso(uuid) to authenticated;
grant execute on function public.portal_tem_acesso_slug(text) to authenticated;
