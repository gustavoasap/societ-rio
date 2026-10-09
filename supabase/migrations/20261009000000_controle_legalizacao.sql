-- Controle Legalização (departamento Societário)
-- As empresas vêm da Base de Clientes (adm_clientes): o registro de legalização
-- é criado na primeira vez que algo é salvo, então cliente novo aparece sozinho.

-- O Societário precisa enxergar a Base de Clientes (somente leitura)
drop policy if exists "societário lê clientes" on public.adm_clientes;
create policy "societário lê clientes" on public.adm_clientes
  for select to authenticated
  using ((select public.portal_tem_acesso_slug('societario')));

create table if not exists public.soc_legalizacao (
  cliente_id uuid primary key references public.adm_clientes (id) on delete cascade,
  -- Licenciamento
  licenciamento_status text not null default 'pendente'
    check (licenciamento_status in ('pendente', 'andamento', 'concluido')),
  licenciamento_validade date,
  -- Inscrição Estadual
  ie_uf text check (ie_uf is null or ie_uf ~ '^[A-Z]{2}$'),
  ie_numero text,
  -- Inscrição Municipal
  im_status text not null default 'pendente_liberacao'
    check (im_status in ('pendente_liberacao', 'andamento', 'liberada')),
  im_municipio text,
  im_numero text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists soc_legalizacao_updated_at on public.soc_legalizacao;
create trigger soc_legalizacao_updated_at
  before update on public.soc_legalizacao
  for each row execute function public.soc_set_updated_at();

-- TFE / TFLF: uma linha por empresa e ano
create table if not exists public.soc_legalizacao_tfe (
  cliente_id uuid not null references public.adm_clientes (id) on delete cascade,
  ano smallint not null check (ano between 1990 and 2100),
  status text not null default 'pendente_liberacao'
    check (status in ('pendente_liberacao', 'enviada_pagamento', 'pagamento_atrasado', 'pagamento_concluido')),
  updated_at timestamptz not null default now(),
  primary key (cliente_id, ano)
);

alter table public.soc_legalizacao enable row level security;
alter table public.soc_legalizacao_tfe enable row level security;

drop policy if exists "societário acessa legalização" on public.soc_legalizacao;
create policy "societário acessa legalização" on public.soc_legalizacao
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('societario')))
  with check ((select public.portal_tem_acesso_slug('societario')));

drop policy if exists "societário acessa tfe" on public.soc_legalizacao_tfe;
create policy "societário acessa tfe" on public.soc_legalizacao_tfe
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('societario')))
  with check ((select public.portal_tem_acesso_slug('societario')));

-- Documentos de licenciamento (bucket privado; PDF ou imagem, até 10 MB por arquivo)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legalizacao', 'legalizacao', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "societário lê documentos de legalização" on storage.objects;
create policy "societário lê documentos de legalização" on storage.objects
  for select to authenticated
  using (bucket_id = 'legalizacao' and (select public.portal_tem_acesso_slug('societario')));

drop policy if exists "societário envia documentos de legalização" on storage.objects;
create policy "societário envia documentos de legalização" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'legalizacao' and (select public.portal_tem_acesso_slug('societario')));

drop policy if exists "societário exclui documentos de legalização" on storage.objects;
create policy "societário exclui documentos de legalização" on storage.objects
  for delete to authenticated
  using (bucket_id = 'legalizacao' and (select public.portal_tem_acesso_slug('societario')));

-- Atalho no portal
insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Controle Legalização', 'Licenciamento, inscrições estadual e municipal e TFE/TFLF de cada empresa da Base de Clientes.', 'ShieldCheck', '/societario/legalizacao', 'disponivel', 3
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/legalizacao');
