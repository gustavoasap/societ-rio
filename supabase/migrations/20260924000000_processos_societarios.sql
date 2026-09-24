-- Gestão de processos societários (abertura, alteração e baixa de CNPJ)

create table if not exists public.soc_parceiros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  email text,
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists public.soc_processos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('abertura', 'alteracao', 'baixa')),
  status text not null default 'pendente'
    check (status in ('pendente', 'andamento', 'concluido')),
  data_inicio date not null default current_date,
  parceiro_id uuid references public.soc_parceiros(id) on delete set null,

  -- Identificação (alteração / baixa; na abertura o CNPJ é preenchido quando liberado)
  cnpj text,
  razao_social text,
  responsavel text,
  alteracao_descricao text,

  -- Dados da abertura
  municipio text,
  natureza_juridica text,
  orgao_registro text,
  enquadramento text,
  cnae_principal text,
  cnaes_secundarios text,
  tipo_unidade text check (tipo_unidade is null or tipo_unidade in ('produtiva', 'auxiliar')),
  nome_fantasia text,
  cep text,
  endereco text,
  complemento text,
  area_imovel numeric(14, 2),
  area_estabelecimento numeric(14, 2),
  area_terreno numeric(14, 2),
  capital_social numeric(16, 2),
  socios jsonb not null default '[]'::jsonb,

  -- Acompanhamento
  numero_viabilidade text,
  status_viabilidade text not null default 'pendente'
    check (status_viabilidade in ('pendente', 'em_analise', 'ok')),
  status_dbe text not null default 'pendente'
    check (status_dbe in ('pendente', 'em_analise', 'ok')),
  status_integrador text not null default 'pendente'
    check (status_integrador in ('pendente', 'em_analise', 'ok')),
  status_taxa text not null default 'pendente'
    check (status_taxa in ('pendente', 'em_analise', 'ok')),
  status_contrato_social text not null default 'pendente_envio'
    check (status_contrato_social in ('pendente_envio', 'falta_assinatura', 'ok')),
  status_registro_digital text not null default 'pendente_envio'
    check (status_registro_digital in ('pendente_envio', 'em_analise', 'pendente_mat', 'cnpj_liberado')),
  status_contrato_servicos text not null default 'pendente_envio'
    check (status_contrato_servicos in ('pendente_envio', 'enviado')),

  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists soc_processos_status_idx on public.soc_processos (status);
create index if not exists soc_processos_parceiro_idx on public.soc_processos (parceiro_id);

create or replace function public.soc_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists soc_processos_updated_at on public.soc_processos;
create trigger soc_processos_updated_at
  before update on public.soc_processos
  for each row execute function public.soc_set_updated_at();

-- Segurança: somente usuários autenticados (equipe do escritório) acessam os dados
alter table public.soc_parceiros enable row level security;
alter table public.soc_processos enable row level security;

drop policy if exists "equipe acessa parceiros" on public.soc_parceiros;
create policy "equipe acessa parceiros" on public.soc_parceiros
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe acessa processos" on public.soc_processos;
create policy "equipe acessa processos" on public.soc_processos
  for all to authenticated using (true) with check (true);
