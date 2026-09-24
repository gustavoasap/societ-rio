-- Destinatário das notas (PF / PJ contribuinte / PJ não contribuinte) e tratamento de NCM por empresa

alter table public.trib_movimentos
  add column if not exists destinatario text not null default ''
    check (destinatario in ('', 'PF', 'PJ_C', 'PJ_N'));

-- NCMs encontrados nos relatórios de cada empresa, com o tratamento definido pelo contador
-- (null = usar o padrão do sistema)
create table if not exists public.trib_ncms (
  empresa_id uuid not null references public.trib_empresas(id) on delete cascade,
  ncm text not null,
  descricao text,
  monofasico boolean,
  st boolean,
  reducao numeric(5, 2) check (reducao is null or (reducao >= 0 and reducao <= 100)),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, ncm)
);

alter table public.trib_ncms enable row level security;

drop policy if exists "fiscal acessa ncms" on public.trib_ncms;
create policy "fiscal acessa ncms" on public.trib_ncms
  for all to authenticated
  using (public.portal_tem_acesso_slug('fiscal'))
  with check (public.portal_tem_acesso_slug('fiscal'));
