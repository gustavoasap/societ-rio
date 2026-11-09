-- Recorrência por dias (toda semana, a cada 15 dias, a cada N dias), a partir da data de início. Idempotente.
-- intervalo_dias preenchido = conta em dias a partir de `inicio` (ignora dia do mês e intervalo_meses).
-- Nesse modo, `gerado_ate` é o último DIA já gerado (no modo mensal continua sendo o 1º dia do último mês gerado)
-- e a `competencia` de cada lançamento é a própria data (há mais de um por mês).
alter table public.pes_recorrencias
  add column if not exists intervalo_dias int check (intervalo_dias between 1 and 366);

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
  -- no modo por dias, gera até o fim do mês que vem
  fim_janela date := ((date_trunc('month', hoje) + interval '2 month') - interval '1 day')::date;
  ate date;
  m date;
  d date;
  cartao boolean;
  n int := 0;
  k int;
  meses_desde_inicio int;
  comeco date;
begin
  if not public.pes_eh_dono() then
    return 0;
  end if;
  for r in select * from public.pes_recorrencias where ativa loop
    select tipo = 'cartao' into cartao from public.pes_contas where id = r.conta_id;

    if r.intervalo_dias is not null then
      ate := least(fim_janela, coalesce(r.fim, fim_janela));
      comeco := greatest(r.inicio, coalesce(r.gerado_ate + 1, r.inicio));
      -- primeira data da série (inicio + k × intervalo) que não é anterior a `comeco`
      d := r.inicio + (ceil((comeco - r.inicio)::numeric / r.intervalo_dias)::int * r.intervalo_dias);
      while d <= ate loop
        insert into public.pes_lancamentos
          (tipo, descricao, valor, data, pago, conta_id, categoria_id, pessoa_id, natureza, observacao, recorrencia_id, competencia)
        values
          (r.tipo, r.descricao, r.valor, d, coalesce(cartao, false) or r.auto_pago, r.conta_id, r.categoria_id, r.pessoa_id, r.natureza, r.observacao, r.id, d)
        on conflict (recorrencia_id, competencia) do nothing;
        get diagnostics k = row_count;
        n := n + k;
        d := d + r.intervalo_dias;
      end loop;
      if ate > coalesce(r.gerado_ate, '0001-01-01') then
        update public.pes_recorrencias set gerado_ate = ate where id = r.id;
      end if;
      continue;
    end if;

    ate := least(limite, coalesce(date_trunc('month', r.fim)::date, limite));
    m := coalesce((r.gerado_ate + interval '1 month')::date, date_trunc('month', r.inicio)::date);
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
