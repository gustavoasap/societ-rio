-- Notas fiscais importadas (resumo por nota + a parte de cada uma no movimento e no estoque)
create table if not exists public.trib_notas (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.trib_importacoes(id) on delete cascade,
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  estabelecimento_id uuid references public.trib_estabelecimentos(id) on delete cascade,
  chave text not null,
  tipo text not null,
  nota text not null default '',
  documento text not null default '',
  parceiro_nome text not null default '',
  data date,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  cfops text not null default '',
  valor numeric(16, 2) not null default 0,
  itens integer not null default 0,
  linhas jsonb not null default '[]',
  estoque jsonb not null default '[]'
);

create index if not exists trib_notas_empresa_idx on public.trib_notas (empresa_id, competencia);
create index if not exists trib_notas_chave_idx on public.trib_notas (empresa_id, chave);
create index if not exists trib_notas_importacao_idx on public.trib_notas (importacao_id);

-- Ajustes do contador por nota: nova data (competência), novo CFOP, considerar ou não; valem também após reimportar
create table if not exists public.trib_notas_ajustes (
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  chave text not null,
  data date,
  cfop text,
  excluir boolean not null default false,
  observacao text not null default '',
  updated_at timestamptz not null default now(),
  primary key (empresa_id, chave)
);

alter table public.trib_notas enable row level security;
alter table public.trib_notas_ajustes enable row level security;

drop policy if exists "fiscal acessa notas" on public.trib_notas;
create policy "fiscal acessa notas" on public.trib_notas
  for all to authenticated
  using (public.portal_tem_acesso_slug('fiscal'))
  with check (public.portal_tem_acesso_slug('fiscal'));

drop policy if exists "fiscal acessa ajustes de notas" on public.trib_notas_ajustes;
create policy "fiscal acessa ajustes de notas" on public.trib_notas_ajustes
  for all to authenticated
  using (public.portal_tem_acesso_slug('fiscal'))
  with check (public.portal_tem_acesso_slug('fiscal'));
