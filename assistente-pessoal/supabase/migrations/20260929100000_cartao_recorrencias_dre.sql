-- Assistente Pessoal, parte 2: classificação (fixa/variável/eventual), responsável pelo gasto,
-- cartão de crédito (fechamento/vencimento), recorrências (salário, custos fixos) e DRE.

-- ---------------------------------------------------------------- classificação
alter table public.pes_categorias
  add column natureza text not null default 'variavel' check (natureza in ('fixa', 'variavel', 'eventual'));

update public.pes_categorias set natureza = 'fixa'
  where (tipo, nome) in (('receita', 'Salário / Pró-labore'), ('despesa', 'Moradia'), ('despesa', 'Educação'), ('despesa', 'Assinaturas'), ('despesa', 'Saúde'));
update public.pes_categorias set natureza = 'eventual'
  where (tipo, nome) in (('receita', 'Outras receitas'), ('despesa', 'Impostos e taxas'));

insert into public.pes_categorias (nome, tipo, cor, icone, natureza) values
  ('Contas de consumo (luz, água, internet)', 'despesa', 'amarelo', 'zap', 'fixa'),
  ('Empréstimos e financiamentos', 'despesa', 'vermelho', 'landmark', 'fixa'),
  ('Seguros', 'despesa', 'celeste', 'heart', 'fixa'),
  ('Viagens', 'despesa', 'laranja', 'plane', 'eventual'),
  ('Presentes', 'despesa', 'rosa', 'gift', 'eventual'),
  ('Manutenção e reparos', 'despesa', 'cinza', 'wrench', 'eventual')
on conflict (tipo, nome) do nothing;

-- ---------------------------------------------------------------- pessoas (responsável pelo gasto)
create table public.pes_pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- cartão de crédito
alter table public.pes_contas
  add column dia_fechamento int check (dia_fechamento between 1 and 31),
  add column dia_vencimento int check (dia_vencimento between 1 and 31);

-- ---------------------------------------------------------------- recorrências (salário, aluguel, assinaturas...)
create table public.pes_recorrencias (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null,
  valor numeric(14, 2) not null check (valor > 0),
  dia int not null check (dia between 1 and 31),
  conta_id uuid not null references public.pes_contas (id) on delete restrict,
  categoria_id uuid references public.pes_categorias (id) on delete set null,
  pessoa_id uuid references public.pes_pessoas (id) on delete set null,
  natureza text check (natureza in ('fixa', 'variavel', 'eventual')),
  -- débito automático: o lançamento já nasce como pago/recebido
  auto_pago boolean not null default false,
  inicio date not null,
  fim date,
  ativa boolean not null default true,
  -- primeiro dia do último mês já gerado
  gerado_ate date,
  observacao text,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- lançamentos
alter table public.pes_lancamentos
  add column natureza text check (natureza in ('fixa', 'variavel', 'eventual')),
  add column pessoa_id uuid references public.pes_pessoas (id) on delete set null,
  add column reembolsado boolean not null default false,
  add column recorrencia_id uuid references public.pes_recorrencias (id) on delete set null,
  add column competencia date,
  add constraint pes_lancamentos_recorrencia_mes unique (recorrencia_id, competencia);
create index pes_lancamentos_pessoa on public.pes_lancamentos (pessoa_id);

-- ---------------------------------------------------------------- acesso: só o dono
do $$
declare
  t text;
begin
  foreach t in array array['pes_pessoas', 'pes_recorrencias']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "somente o dono" on public.%I for all to authenticated using ((select public.pes_eh_dono())) with check ((select public.pes_eh_dono()))',
      t
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------- saldo: só o que já aconteceu
-- Lançamento futuro (parcela do mês que vem, salário do dia 5) não mexe no saldo de hoje.
create or replace view public.pes_saldos
with (security_invoker = on) as
select
  c.id as conta_id,
  c.saldo_inicial + coalesce(sum(
    case
      when l.conta_destino_id = c.id then l.valor
      when l.tipo = 'receita' then l.valor
      else -l.valor
    end
  ) filter (where l.pago and l.data <= (now() at time zone 'America/Sao_Paulo')::date), 0) as saldo
from public.pes_contas c
left join public.pes_lancamentos l on l.conta_id = c.id or l.conta_destino_id = c.id
group by c.id, c.saldo_inicial;

-- ---------------------------------------------------------------- geração automática das recorrências
-- Cria os lançamentos de cada recorrência ativa até o mês seguinte ao atual.
-- Idempotente: a constraint (recorrencia_id, competencia) impede duplicar.
create function public.pes_gerar_recorrencias()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r record;
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  limite date := (date_trunc('month', hoje) + interval '1 month')::date;
  ate date;
  m date;
  d date;
  cartao boolean;
  n int := 0;
  k int;
begin
  if not public.pes_eh_dono() then
    return 0;
  end if;
  for r in select * from public.pes_recorrencias where ativa loop
    ate := least(limite, coalesce(date_trunc('month', r.fim)::date, limite));
    m := coalesce((r.gerado_ate + interval '1 month')::date, date_trunc('month', r.inicio)::date);
    select tipo = 'cartao' into cartao from public.pes_contas where id = r.conta_id;
    while m <= ate loop
      d := m + (least(r.dia, extract(day from (m + interval '1 month - 1 day'))::int) - 1);
      if d >= r.inicio and (r.fim is null or d <= r.fim) then
        insert into public.pes_lancamentos
          (tipo, descricao, valor, data, pago, conta_id, categoria_id, pessoa_id, natureza, observacao, recorrencia_id, competencia)
        values
          (r.tipo, r.descricao, r.valor, d, coalesce(cartao, false) or r.auto_pago, r.conta_id, r.categoria_id, r.pessoa_id, r.natureza, r.observacao, r.id, m)
        on conflict (recorrencia_id, competencia) do nothing;
        get diagnostics k = row_count;
        n := n + k;
      end if;
      m := (m + interval '1 month')::date;
    end loop;
    if ate >= coalesce(r.gerado_ate, '0001-01-01') then
      update public.pes_recorrencias set gerado_ate = ate where id = r.id;
    end if;
  end loop;
  return n;
end;
$$;

revoke all on function public.pes_gerar_recorrencias() from public, anon;
grant execute on function public.pes_gerar_recorrencias() to authenticated;
