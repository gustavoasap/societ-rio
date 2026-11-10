-- Controle de fechamento mensal (Contábil, Fiscal e Pessoal).
-- As empresas não são copiadas: vêm da Base de Clientes (ativas a partir do mês da
-- data de abertura; encerradas até o mês do encerramento). Cada departamento tem
-- suas obrigações, com opções e cores próprias.

create table public.fech_obrigacoes (
  id uuid primary key default gen_random_uuid(),
  departamento text not null check (departamento in ('contabil', 'fiscal', 'pessoal')),
  nome text not null check (btrim(nome) <> ''),
  -- [{ "id": "pendente", "label": "Pendente", "cor": "vermelho", "concluido": false }, ...]
  -- A primeira opção é a situação de quem ainda não foi marcado.
  opcoes jsonb not null default '[
    {"id":"pendente","label":"Pendente","cor":"vermelho","concluido":false},
    {"id":"andamento","label":"Em andamento","cor":"amarelo","concluido":false},
    {"id":"concluido","label":"Concluído","cor":"verde","concluido":true}
  ]'::jsonb check (jsonb_typeof(opcoes) = 'array' and jsonb_array_length(opcoes) >= 1),
  inicio date not null default date_trunc('month', now())::date,
  fim date,
  ordem integer not null default 0,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index fech_obrigacoes_dep_idx on public.fech_obrigacoes (departamento, ordem);

create table public.fech_status (
  obrigacao_id uuid not null references public.fech_obrigacoes(id) on delete cascade,
  cliente_id uuid not null references public.adm_clientes(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  valor text not null,
  observacao text,
  atualizado_por uuid default auth.uid() references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (obrigacao_id, cliente_id, competencia)
);
create index fech_status_comp_idx on public.fech_status (competencia);
create index fech_status_cliente_idx on public.fech_status (cliente_id);

alter table public.fech_obrigacoes enable row level security;
alter table public.fech_status enable row level security;

create policy "departamento acessa suas obrigações" on public.fech_obrigacoes for all to authenticated
  using ((select public.portal_tem_acesso_slug(departamento)))
  with check ((select public.portal_tem_acesso_slug(departamento)));

create policy "departamento acessa seus fechamentos" on public.fech_status for all to authenticated
  using (exists (select 1 from public.fech_obrigacoes o where o.id = obrigacao_id and public.portal_tem_acesso_slug(o.departamento)))
  with check (exists (select 1 from public.fech_obrigacoes o where o.id = obrigacao_id and public.portal_tem_acesso_slug(o.departamento)));

-- Empresas do controle para um departamento (só os campos necessários da Base de Clientes)
create or replace function public.fech_clientes(p_departamento text)
returns table (id uuid, codigo integer, razao_social text, cnpj text, status text, data_abertura date,
               data_encerramento date, regime_tributario text, empresa text, parceiro text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.codigo, c.razao_social, c.cnpj, c.status, c.data_abertura, c.data_encerramento,
         c.regime_tributario, c.empresa, p.nome
  from public.adm_clientes c
  left join public.soc_parceiros p on p.id = c.parceiro_id
  where p_departamento in ('contabil', 'fiscal', 'pessoal')
    and public.portal_tem_acesso_slug(p_departamento)
  order by c.codigo;
$$;
revoke execute on function public.fech_clientes(text) from public, anon;
grant execute on function public.fech_clientes(text) to authenticated;

insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Controle de Fechamento Mensal', 'Obrigações do mês por empresa: pendente, em andamento e concluído.',
       'ClipboardList', '/' || d.slug || '/fechamento', 'disponivel', 0
from public.portal_departamentos d
where d.slug in ('contabil', 'fiscal', 'pessoal')
  and not exists (select 1 from public.portal_modulos m where m.link = '/' || d.slug || '/fechamento');
