-- 1) CST de PIS das notas (segregação de monofásico no PGDAS-D pelo que a nota declara)
alter table public.trib_movimentos
  add column if not exists cst_pis text not null default '';

-- 2) Regime especial de ICMS por estabelecimento (carga efetiva, crédito presumido, sem créditos das entradas)
alter table public.trib_estabelecimentos
  add column if not exists beneficio_icms jsonb;

-- 3) Itens por produto dos relatórios detalhados (quantidade e valor) — base do estoque e do CMV pelo custo médio ponderado
create table if not exists public.trib_estoque_movimentos (
  id bigint generated always as identity primary key,
  importacao_id uuid not null references public.trib_importacoes(id) on delete cascade,
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  estabelecimento_id uuid references public.trib_estabelecimentos(id) on delete cascade,
  competencia text not null check (competencia ~ '^\d{4}-\d{2}$'),
  tipo text not null check (tipo in ('entrada', 'saida')),
  cfop text not null default '',
  codigo text not null default '',
  ean text not null default '',
  descricao text not null default '',
  ncm text not null default '',
  unidade text not null default '',
  quantidade numeric(18, 4) not null default 0,
  valor numeric(16, 2) not null default 0
);

create index if not exists trib_estoque_movimentos_empresa_idx on public.trib_estoque_movimentos (empresa_id, competencia);
create index if not exists trib_estoque_movimentos_importacao_idx on public.trib_estoque_movimentos (importacao_id);

-- 4) Configuração do produto: estoque inicial e DE.PARA (produto vendido → produtos comprados, com fator)
create table if not exists public.trib_estoque_produtos (
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  chave text not null,
  qtd_inicial numeric(18, 4),
  valor_inicial numeric(16, 2),
  componentes jsonb,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, chave)
);

alter table public.trib_estoque_movimentos enable row level security;
alter table public.trib_estoque_produtos enable row level security;

drop policy if exists "fiscal acessa estoque" on public.trib_estoque_movimentos;
create policy "fiscal acessa estoque" on public.trib_estoque_movimentos
  for all to authenticated
  using (public.portal_tem_acesso_slug('fiscal'))
  with check (public.portal_tem_acesso_slug('fiscal'));

drop policy if exists "fiscal acessa produtos do estoque" on public.trib_estoque_produtos;
create policy "fiscal acessa produtos do estoque" on public.trib_estoque_produtos
  for all to authenticated
  using (public.portal_tem_acesso_slug('fiscal'))
  with check (public.portal_tem_acesso_slug('fiscal'));
