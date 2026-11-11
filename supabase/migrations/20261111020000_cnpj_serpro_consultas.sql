-- Registro das consultas pagas à API Consulta CNPJ do Serpro (controle de custo).
create table if not exists public.cnpj_consultas_serpro (
  id bigint generated always as identity primary key,
  cnpj text not null,
  produto text not null,
  status integer not null,
  usuario_id uuid references auth.users(id) on delete set null,
  consultado_em timestamptz not null default now()
);
create index if not exists cnpj_consultas_serpro_data_idx on public.cnpj_consultas_serpro (consultado_em);
alter table public.cnpj_consultas_serpro enable row level security;
create policy "usuários do portal veem as consultas" on public.cnpj_consultas_serpro for select to authenticated using (true);
