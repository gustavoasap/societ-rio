-- Planejamento tributário: empresas (matriz + filiais), importações de relatórios fiscais e movimento agregado

create table if not exists public.trib_empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  cnpj text,
  regime_atual text not null default 'simples' check (regime_atual in ('simples', 'presumido', 'real')),
  cnae text,
  observacoes text,
  parametros jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Matriz e filiais: no Simples Nacional todas são apuradas juntas no mesmo PGDAS-D
create table if not exists public.trib_estabelecimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  cnpj text not null,
  nome text not null,
  matriz boolean not null default false,
  uf text not null default 'SP',
  municipio text,
  aliquota_icms numeric(5, 2),
  created_at timestamptz not null default now(),
  constraint trib_estabelecimentos_cnpj_unico unique (cnpj)
);

create index if not exists trib_estabelecimentos_empresa_idx on public.trib_estabelecimentos (empresa_id);

create table if not exists public.trib_importacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  estabelecimento_id uuid not null references public.trib_estabelecimentos(id) on delete cascade,
  arquivo text not null,
  tipo_relatorio text not null,
  tipo_movimento text not null check (tipo_movimento in ('entrada', 'saida', 'servico_tomado', 'servico_prestado')),
  competencia_inicio text not null,
  competencia_fim text not null,
  registros integer not null default 0,
  valor_total numeric(16, 2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists trib_importacoes_empresa_idx on public.trib_importacoes (empresa_id);

-- Uma linha por competência × tipo × CFOP × NCM × UF × CST × serviço (os itens das notas já vêm somados)
create table if not exists public.trib_movimentos (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.trib_importacoes(id) on delete cascade,
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  estabelecimento_id uuid not null references public.trib_estabelecimentos(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  tipo text not null check (tipo in ('entrada', 'saida', 'servico_tomado', 'servico_prestado')),
  cfop text not null default '',
  ncm text not null default '',
  uf text not null default '',
  cst text not null default '',
  servico text not null default '',
  itens integer not null default 0,
  valor_contabil numeric(16, 2) not null default 0,
  bc_icms numeric(16, 2) not null default 0,
  icms numeric(16, 2) not null default 0,
  icms_st numeric(16, 2) not null default 0,
  ipi numeric(16, 2) not null default 0,
  pis numeric(16, 2) not null default 0,
  cofins numeric(16, 2) not null default 0,
  iss numeric(16, 2) not null default 0,
  difal numeric(16, 2) not null default 0,
  retencoes numeric(16, 2) not null default 0
);

create index if not exists trib_movimentos_empresa_comp_idx on public.trib_movimentos (empresa_id, competencia);
create index if not exists trib_movimentos_importacao_idx on public.trib_movimentos (importacao_id);

drop trigger if exists trib_empresas_updated_at on public.trib_empresas;
create trigger trib_empresas_updated_at
  before update on public.trib_empresas
  for each row execute function public.soc_set_updated_at();

-- Segurança: somente usuários autenticados (equipe do escritório) acessam os dados
alter table public.trib_empresas enable row level security;
alter table public.trib_estabelecimentos enable row level security;
alter table public.trib_importacoes enable row level security;
alter table public.trib_movimentos enable row level security;

drop policy if exists "equipe acessa empresas" on public.trib_empresas;
create policy "equipe acessa empresas" on public.trib_empresas
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe acessa estabelecimentos" on public.trib_estabelecimentos;
create policy "equipe acessa estabelecimentos" on public.trib_estabelecimentos
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe acessa importacoes" on public.trib_importacoes;
create policy "equipe acessa importacoes" on public.trib_importacoes
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe acessa movimentos" on public.trib_movimentos;
create policy "equipe acessa movimentos" on public.trib_movimentos
  for all to authenticated using (true) with check (true);
