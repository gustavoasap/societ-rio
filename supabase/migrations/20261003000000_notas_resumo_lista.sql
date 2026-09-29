-- Notas importadas: resumo mensal e lista paginada calculados no banco (a tela não baixa as dezenas de milhares de notas)
create index if not exists trib_notas_empresa_data_idx on public.trib_notas (empresa_id, data, nota);

-- Lista com o ajuste de cada nota (respeita o RLS das tabelas)
create or replace view public.trib_notas_lista with (security_invoker = true) as
select
  n.id,
  n.empresa_id,
  n.estabelecimento_id,
  n.chave,
  n.tipo,
  n.nota,
  n.documento,
  n.parceiro_nome,
  n.data,
  n.competencia,
  n.cfops,
  n.valor,
  n.itens,
  a.data as aj_data,
  a.cfop as aj_cfop,
  coalesce(a.excluir, false) as aj_excluir,
  coalesce(a.observacao, '') as aj_observacao,
  (a.chave is not null) as ajustada,
  coalesce(to_char(a.data, 'YYYY-MM'), n.competencia) as competencia_efetiva,
  coalesce(a.cfop, n.cfops) as cfop_efetivo
from public.trib_notas n
left join public.trib_notas_ajustes a on a.empresa_id = n.empresa_id and a.chave = n.chave;

-- Resumo por competência e tipo: como importado e depois dos ajustes (uma linha por nota, mesmo reimportada)
create or replace function public.trib_notas_resumo(p_empresa uuid)
returns table (competencia text, tipo text, notas integer, valor numeric, notas_aj integer, valor_aj numeric, ajustadas integer, excluidas integer)
language sql stable security invoker set search_path = public as $$
  with n as (
    select distinct on (n.chave) n.chave, n.tipo, n.competencia, n.valor, n.cfops, a.data as aj_data, a.cfop as aj_cfop, coalesce(a.excluir, false) as exc
    from trib_notas n
    left join trib_notas_ajustes a on a.empresa_id = n.empresa_id and a.chave = n.chave
    where n.empresa_id = p_empresa
    order by n.chave, n.id
  ),
  o as (select n.competencia, n.tipo, count(*) as c, sum(n.valor) as v from n group by 1, 2),
  j as (
    select coalesce(to_char(n.aj_data, 'YYYY-MM'), n.competencia) as competencia, n.tipo,
      count(*) filter (where not n.exc) as c,
      coalesce(sum(n.valor) filter (where not n.exc), 0) as v,
      count(*) filter (where not n.exc and ((n.aj_data is not null and to_char(n.aj_data, 'YYYY-MM') <> n.competencia) or (n.aj_cfop is not null and n.aj_cfop <> n.cfops))) as ajustadas,
      count(*) filter (where n.exc) as excluidas
    from n group by 1, 2
  )
  select coalesce(o.competencia, j.competencia), coalesce(o.tipo, j.tipo), coalesce(o.c, 0)::integer, coalesce(o.v, 0), coalesce(j.c, 0)::integer, coalesce(j.v, 0),
    coalesce(j.ajustadas, 0)::integer, coalesce(j.excluidas, 0)::integer
  from o full join j on j.competencia = o.competencia and j.tipo = o.tipo
  order by 1, 2
$$;

grant select on public.trib_notas_lista to authenticated;
grant execute on function public.trib_notas_resumo(uuid) to authenticated;
