-- Assistente Pessoal: finanças, metas e objetivos de um único dono.
-- Todas as tabelas usam o prefixo pes_ para não se misturar com outras tabelas do projeto.
--
-- Acesso: o primeiro usuário que entrar no app vira o dono (pes_reivindicar) e,
-- a partir daí, só ele lê e grava. Qualquer outro login não enxerga nada.

-- ---------------------------------------------------------------- dono
create table public.pes_dono (
  unico boolean primary key default true check (unico),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
alter table public.pes_dono enable row level security;

create function public.pes_eh_dono()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.pes_dono where user_id = (select auth.uid()))
$$;

create function public.pes_reivindicar()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  insert into public.pes_dono (user_id) values ((select auth.uid())) on conflict do nothing;
  return public.pes_eh_dono();
end;
$$;

revoke all on function public.pes_eh_dono() from public, anon;
revoke all on function public.pes_reivindicar() from public, anon;
grant execute on function public.pes_eh_dono() to authenticated;
grant execute on function public.pes_reivindicar() to authenticated;

create policy "dono vê o próprio registro" on public.pes_dono
  for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- contas
create table public.pes_contas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'corrente' check (tipo in ('corrente', 'poupanca', 'investimento', 'carteira', 'cartao', 'outro')),
  instituicao text,
  saldo_inicial numeric(14, 2) not null default 0,
  limite numeric(14, 2),
  cor text not null default 'azul',
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- categorias
create table public.pes_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null check (tipo in ('receita', 'despesa')),
  cor text not null default 'azul',
  icone text not null default 'tag',
  orcamento_mensal numeric(14, 2),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tipo, nome)
);

-- ---------------------------------------------------------------- metas financeiras
create table public.pes_metas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  valor_alvo numeric(14, 2) not null check (valor_alvo > 0),
  prazo date,
  cor text not null default 'azul',
  icone text not null default 'target',
  concluida boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Aportes (valor positivo) e resgates (valor negativo) de cada meta
create table public.pes_meta_aportes (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references public.pes_metas (id) on delete cascade,
  valor numeric(14, 2) not null check (valor <> 0),
  data date not null default current_date,
  observacao text,
  criado_em timestamptz not null default now()
);
create index pes_meta_aportes_meta on public.pes_meta_aportes (meta_id);

-- ---------------------------------------------------------------- lançamentos
create table public.pes_lancamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita', 'despesa', 'transferencia')),
  descricao text not null,
  valor numeric(14, 2) not null check (valor > 0),
  data date not null,
  pago boolean not null default true,
  conta_id uuid not null references public.pes_contas (id) on delete restrict,
  conta_destino_id uuid references public.pes_contas (id) on delete restrict,
  categoria_id uuid references public.pes_categorias (id) on delete set null,
  observacao text,
  -- recorrência / parcelamento: lançamentos gerados juntos compartilham o grupo
  grupo uuid,
  parcela int,
  parcelas int,
  criado_em timestamptz not null default now(),
  check ((tipo = 'transferencia') = (conta_destino_id is not null)),
  check (conta_destino_id is null or conta_destino_id <> conta_id)
);
create index pes_lancamentos_data on public.pes_lancamentos (data);
create index pes_lancamentos_conta on public.pes_lancamentos (conta_id);
create index pes_lancamentos_destino on public.pes_lancamentos (conta_destino_id);
create index pes_lancamentos_categoria on public.pes_lancamentos (categoria_id);
create index pes_lancamentos_grupo on public.pes_lancamentos (grupo);

-- ---------------------------------------------------------------- objetivos de vida
create table public.pes_objetivos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  area text not null default 'pessoal' check (area in ('pessoal', 'profissional', 'financeiro', 'saude', 'familia', 'estudos', 'espiritual', 'lazer')),
  status text not null default 'planejado' check (status in ('planejado', 'andamento', 'pausado', 'concluido')),
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  prazo date,
  concluido_em date,
  criado_em timestamptz not null default now()
);

create table public.pes_etapas (
  id uuid primary key default gen_random_uuid(),
  objetivo_id uuid not null references public.pes_objetivos (id) on delete cascade,
  titulo text not null,
  feita boolean not null default false,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index pes_etapas_objetivo on public.pes_etapas (objetivo_id);

-- ---------------------------------------------------------------- acesso: só o dono
do $$
declare
  t text;
begin
  foreach t in array array['pes_contas', 'pes_categorias', 'pes_metas', 'pes_meta_aportes', 'pes_lancamentos', 'pes_objetivos', 'pes_etapas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "somente o dono" on public.%I for all to authenticated using ((select public.pes_eh_dono())) with check ((select public.pes_eh_dono()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------- saldo das contas
-- Considera só lançamentos pagos/recebidos. security_invoker: respeita o RLS das tabelas.
create view public.pes_saldos
with (security_invoker = on) as
select
  c.id as conta_id,
  c.saldo_inicial + coalesce(sum(
    case
      when l.conta_destino_id = c.id then l.valor
      when l.tipo = 'receita' then l.valor
      else -l.valor
    end
  ) filter (where l.pago), 0) as saldo
from public.pes_contas c
left join public.pes_lancamentos l on l.conta_id = c.id or l.conta_destino_id = c.id
group by c.id, c.saldo_inicial;

-- ---------------------------------------------------------------- categorias iniciais
insert into public.pes_categorias (nome, tipo, cor, icone) values
  ('Salário / Pró-labore', 'receita', 'azul', 'briefcase'),
  ('Distribuição de lucros', 'receita', 'celeste', 'landmark'),
  ('Rendimentos', 'receita', 'verde', 'trending-up'),
  ('Outras receitas', 'receita', 'cinza', 'plus'),
  ('Moradia', 'despesa', 'azul', 'house'),
  ('Alimentação', 'despesa', 'laranja', 'utensils'),
  ('Mercado', 'despesa', 'verde', 'shopping-cart'),
  ('Transporte', 'despesa', 'celeste', 'car'),
  ('Saúde', 'despesa', 'vermelho', 'heart-pulse'),
  ('Educação', 'despesa', 'roxo', 'graduation-cap'),
  ('Lazer', 'despesa', 'amarelo', 'party-popper'),
  ('Cruzeiro / Futebol', 'despesa', 'azul', 'star'),
  ('Assinaturas', 'despesa', 'roxo', 'repeat'),
  ('Impostos e taxas', 'despesa', 'cinza', 'receipt'),
  ('Vestuário', 'despesa', 'rosa', 'shirt'),
  ('Outras despesas', 'despesa', 'cinza', 'tag');
