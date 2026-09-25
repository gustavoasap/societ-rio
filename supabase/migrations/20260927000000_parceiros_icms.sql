-- Clientes e fornecedores por empresa; ICMS interno e MVA por NCM

alter table public.trib_movimentos
  add column if not exists parceiro text not null default '';

create index if not exists trib_movimentos_parceiro_idx on public.trib_movimentos (empresa_id, parceiro);

create table if not exists public.trib_parceiros (
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  documento text not null,
  nome text,
  tipo text not null default '' check (tipo in ('', 'PF', 'PJ_C', 'PJ_N')),
  uf text,
  municipio text,
  updated_at timestamptz not null default now(),
  primary key (empresa_id, documento)
);

alter table public.trib_parceiros enable row level security;

drop policy if exists "fiscal acessa parceiros tributarios" on public.trib_parceiros;
create policy "fiscal acessa parceiros tributarios" on public.trib_parceiros
  for all to authenticated
  using (public.portal_tem_acesso_slug('fiscal'))
  with check (public.portal_tem_acesso_slug('fiscal'));

-- Alíquota interna de ICMS específica do NCM (ex.: perfumaria 25% em SP) e MVA da substituição tributária
alter table public.trib_ncms
  add column if not exists aliquota_icms numeric(5, 2),
  add column if not exists mva numeric(7, 2);
