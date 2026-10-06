-- Base de Clientes (departamento Administrativo)
-- Estrutura pensada para servir de base aos futuros módulos financeiros:
-- o honorário fica em tabela própria, com histórico de vigências (reajustes).

-- Parceiros são do escritório todo: o Administrativo também enxerga e cadastra
drop policy if exists "administrativo acessa parceiros" on public.soc_parceiros;
create policy "administrativo acessa parceiros" on public.soc_parceiros
  for all to authenticated
  using (public.portal_tem_acesso_slug('administrativo'))
  with check (public.portal_tem_acesso_slug('administrativo'));

create sequence if not exists public.adm_clientes_codigo_seq;

create table if not exists public.adm_clientes (
  id uuid primary key default gen_random_uuid(),
  codigo integer not null unique default nextval('public.adm_clientes_codigo_seq'),
  cnpj text unique check (cnpj ~ '^\d{14}$'),
  razao_social text not null,
  nome_fantasia text,
  status text not null default 'pendente' check (status in ('pendente', 'assinado', 'encerrado')),
  data_abertura date,
  data_assinatura date,
  data_encerramento date,
  responsavel text,
  email text,
  telefone text,
  parceiro_id uuid references public.soc_parceiros (id) on delete set null,
  regime_tributario text check (regime_tributario in ('simples', 'mei', 'presumido', 'real', 'outro')),
  segmento text check (segmento in ('comercio', 'servicos', 'industria', 'misto')),
  tipo_inscricao text check (tipo_inscricao in ('estadual', 'municipal', 'ambas')),
  inscricao text,
  -- Etapas de implantação
  procuracao text check (procuracao in ('pendente', 'pdf_enviado', 'concluida', 'na')),
  certificado_digital text check (certificado_digital in ('pendente', 'pdf_enviado', 'concluida', 'na')),
  onboarding text check (onboarding in ('pendente', 'pdf_enviado', 'concluida', 'na')),
  licenciamento text check (licenciamento in ('pendente', 'pdf_enviado', 'concluida', 'na')),
  makrosystem text check (makrosystem in ('pendente', 'pdf_enviado', 'concluida', 'na')),
  link_drive text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.adm_clientes_codigo_seq owned by public.adm_clientes.codigo;

create index if not exists adm_clientes_status_idx on public.adm_clientes (status);
create index if not exists adm_clientes_parceiro_idx on public.adm_clientes (parceiro_id);

drop trigger if exists adm_clientes_updated_at on public.adm_clientes;
create trigger adm_clientes_updated_at
  before update on public.adm_clientes
  for each row execute function public.soc_set_updated_at();

-- Honorários com histórico: cada reajuste fecha a vigência anterior e abre outra
create table if not exists public.adm_honorarios (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.adm_clientes (id) on delete cascade,
  valor numeric(12, 2) not null check (valor >= 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  descricao text,
  created_at timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);

create index if not exists adm_honorarios_cliente_idx on public.adm_honorarios (cliente_id);
-- No máximo um honorário em aberto (sem fim) por cliente
create unique index if not exists adm_honorarios_um_vigente on public.adm_honorarios (cliente_id) where vigencia_fim is null;

-- Honorário vigente de cada cliente (base para resumos e para o financeiro)
create or replace view public.adm_clientes_honorario_atual
with (security_invoker = true) as
select c.id as cliente_id, h.id as honorario_id, h.valor, h.vigencia_inicio, h.dia_vencimento
from public.adm_clientes c
join public.adm_honorarios h on h.cliente_id = c.id and h.vigencia_fim is null;

-- Reajuste em uma operação: fecha o honorário vigente na véspera e abre o novo
create or replace function public.adm_reajustar_honorario(
  p_cliente uuid, p_valor numeric, p_inicio date, p_dia smallint default null, p_descricao text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  novo uuid;
begin
  update public.adm_honorarios
    set vigencia_fim = greatest(vigencia_inicio, p_inicio - 1)
    where cliente_id = p_cliente and vigencia_fim is null;
  insert into public.adm_honorarios (cliente_id, valor, vigencia_inicio, dia_vencimento, descricao)
    values (p_cliente, p_valor, p_inicio, p_dia, p_descricao)
    returning id into novo;
  return novo;
end;
$$;

revoke execute on function public.adm_reajustar_honorario(uuid, numeric, date, smallint, text) from public, anon;
grant execute on function public.adm_reajustar_honorario(uuid, numeric, date, smallint, text) to authenticated;

alter table public.adm_clientes enable row level security;
alter table public.adm_honorarios enable row level security;

drop policy if exists "administrativo acessa clientes" on public.adm_clientes;
create policy "administrativo acessa clientes" on public.adm_clientes
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));

drop policy if exists "administrativo acessa honorarios" on public.adm_honorarios;
create policy "administrativo acessa honorarios" on public.adm_honorarios
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));

-- Atalho no portal
insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Base de Clientes', 'Cadastro dos clientes do escritório, honorários e etapas de implantação.', 'Users', '/administrativo/clientes', 'disponivel', 1
from public.portal_departamentos d
where d.slug = 'administrativo'
  and not exists (select 1 from public.portal_modulos m where m.link = '/administrativo/clientes');
