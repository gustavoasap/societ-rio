-- Societário: Acompanhamento de Caução (caução recebido × taxa da junta × certificado digital).

-- Juntas comerciais e a taxa padrão de cada uma (editável; novos estados podem ser cadastrados).
create table public.soc_caucao_juntas (
  uf text primary key check (uf ~ '^[A-Z]{2}$'),
  nome text not null,
  taxa numeric(12,2) not null check (taxa >= 0),
  updated_at timestamptz not null default now()
);

insert into public.soc_caucao_juntas (uf, nome, taxa) values
  ('SP', 'JUCESP', 218.99),
  ('MG', 'JUCEMG', 281.08)
on conflict (uf) do nothing;

create table public.soc_caucoes (
  id uuid primary key default gen_random_uuid(),
  cliente text not null,
  parceiro_id uuid references public.soc_parceiros(id) on delete set null,
  -- Quem pagou o caução: o próprio cliente ou um parceiro
  responsavel_tipo text not null default 'cliente' check (responsavel_tipo in ('cliente', 'parceiro')),
  responsavel_parceiro_id uuid references public.soc_parceiros(id) on delete set null,
  cobertura_meses smallint not null default 0 check (cobertura_meses between 0 and 6),
  valor_caucao numeric(12,2) check (valor_caucao is null or valor_caucao >= 0),
  data_recebimento date,
  junta_uf text references public.soc_caucao_juntas(uf) on update cascade on delete set null,
  -- Valor efetivamente pago (vem da tabela de juntas, mas fica gravado para não mudar o histórico)
  taxa_junta numeric(12,2) check (taxa_junta is null or taxa_junta >= 0),
  data_pagamento_taxa date,
  valor_certificado numeric(12,2) check (valor_certificado is null or valor_certificado >= 0),
  data_pagamento_certificado date,
  observacoes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index soc_caucoes_parceiro_idx on public.soc_caucoes (parceiro_id);
create index soc_caucoes_responsavel_idx on public.soc_caucoes (responsavel_parceiro_id);
create index soc_caucoes_junta_idx on public.soc_caucoes (junta_uf);

create or replace function public.soc_caucoes_atualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.responsavel_tipo = 'cliente' then new.responsavel_parceiro_id = null; end if;
  return new;
end;
$$;

create trigger soc_caucoes_atualizado before insert or update on public.soc_caucoes
  for each row execute function public.soc_caucoes_atualizado();

alter table public.soc_caucao_juntas enable row level security;
alter table public.soc_caucoes enable row level security;

create policy "societário acessa juntas" on public.soc_caucao_juntas for all to authenticated
  using ((select public.portal_tem_acesso_slug('societario')))
  with check ((select public.portal_tem_acesso_slug('societario')));
create policy "societário acessa cauções" on public.soc_caucoes for all to authenticated
  using ((select public.portal_tem_acesso_slug('societario')))
  with check ((select public.portal_tem_acesso_slug('societario')));

insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Acompanhamento de Caução', 'Caução recebido, taxa da junta, certificado digital e o resultado de cada cliente.',
       'Wallet', '/societario/caucao', 'disponivel', 5
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/caucao');
