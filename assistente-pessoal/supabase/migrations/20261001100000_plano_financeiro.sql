-- Assistente Pessoal, parte 3: despesas anuais/periódicas, gastos essenciais, reserva de emergência
-- e configurações do plano financeiro. Pode ser executado mais de uma vez sem erro.

-- ---------------------------------------------------------------- periodicidade das recorrências
-- 1 = todo mês, 2 = bimestral, 3 = trimestral, 6 = semestral, 12 = anual (IPVA, IPTU, seguro, anuidade...)
-- O mês de início define em quais meses cai (ex.: anual começando em março cai todo março).
alter table public.pes_recorrencias
  add column if not exists intervalo_meses int not null default 1 check (intervalo_meses in (1, 2, 3, 6, 12));

-- ---------------------------------------------------------------- gastos essenciais (renda mínima)
alter table public.pes_categorias
  add column if not exists essencial boolean not null default false;

-- marca as categorias essenciais padrão só na primeira vez (se nenhuma estiver marcada)
update public.pes_categorias set essencial = true
  where tipo = 'despesa'
    and nome in ('Moradia', 'Mercado', 'Saúde', 'Transporte', 'Educação', 'Contas de consumo (luz, água, internet)',
                 'Empréstimos e financiamentos', 'Seguros', 'Impostos e taxas')
    and not exists (select 1 from public.pes_categorias where essencial);

insert into public.pes_categorias (nome, tipo, cor, icone, natureza, essencial) values
  ('IPVA e licenciamento', 'despesa', 'celeste', 'car', 'eventual', true),
  ('IPTU', 'despesa', 'azul', 'house', 'eventual', true),
  ('Investimentos (aportes)', 'despesa', 'verde', 'trending-up', 'variavel', false)
on conflict (tipo, nome) do nothing;

-- ---------------------------------------------------------------- contas que formam a reserva de emergência
alter table public.pes_contas
  add column if not exists reserva boolean not null default false;

-- ---------------------------------------------------------------- configurações do plano (uma linha só)
create table if not exists public.pes_config (
  unico boolean primary key default true check (unico),
  meses_reserva int not null default 6 check (meses_reserva between 1 and 24),
  pct_investimento numeric(5, 2) not null default 20 check (pct_investimento between 0 and 90),
  atualizado_em timestamptz not null default now()
);
alter table public.pes_config enable row level security;
drop policy if exists "somente o dono" on public.pes_config;
create policy "somente o dono" on public.pes_config
  for all to authenticated using ((select public.pes_eh_dono())) with check ((select public.pes_eh_dono()));
insert into public.pes_config (unico) values (true) on conflict do nothing;

-- ---------------------------------------------------------------- geração respeitando a periodicidade
create or replace function public.pes_gerar_recorrencias()
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
  meses_desde_inicio int;
begin
  if not public.pes_eh_dono() then
    return 0;
  end if;
  for r in select * from public.pes_recorrencias where ativa loop
    ate := least(limite, coalesce(date_trunc('month', r.fim)::date, limite));
    m := coalesce((r.gerado_ate + interval '1 month')::date, date_trunc('month', r.inicio)::date);
    select tipo = 'cartao' into cartao from public.pes_contas where id = r.conta_id;
    while m <= ate loop
      meses_desde_inicio := (extract(year from m)::int * 12 + extract(month from m)::int)
                          - (extract(year from r.inicio)::int * 12 + extract(month from r.inicio)::int);
      if meses_desde_inicio >= 0 and meses_desde_inicio % r.intervalo_meses = 0 then
        d := case
          when r.dia_util is not null then public.pes_dia_util(m, r.dia, r.dia_util)
          else m + (least(r.dia, extract(day from (m + interval '1 month - 1 day'))::int) - 1)
        end;
        if d >= r.inicio and (r.fim is null or d <= r.fim) then
          insert into public.pes_lancamentos
            (tipo, descricao, valor, data, pago, conta_id, categoria_id, pessoa_id, natureza, observacao, recorrencia_id, competencia)
          values
            (r.tipo, r.descricao, r.valor, d, coalesce(cartao, false) or r.auto_pago, r.conta_id, r.categoria_id, r.pessoa_id, r.natureza, r.observacao, r.id, m)
          on conflict (recorrencia_id, competencia) do nothing;
          get diagnostics k = row_count;
          n := n + k;
        end if;
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

notify pgrst, 'reload schema';
