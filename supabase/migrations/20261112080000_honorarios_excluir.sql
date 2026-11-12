-- Excluir honorário do histórico (o anterior volta a valer) e marcar cliente sem honorário excluindo os cadastrados.
create or replace function public.adm_excluir_honorario(p_id uuid)
returns void language plpgsql set search_path = '' as $$
declare h record;
begin
  select * into h from public.adm_honorarios where id = p_id;
  if h.id is null then raise exception 'Honorário não encontrado.'; end if;
  delete from public.adm_honorarios where id = p_id;
  if h.vigencia_fim is null then
    update public.adm_honorarios set vigencia_fim = null
    where id = (select id from public.adm_honorarios where cliente_id = h.cliente_id and vigencia_fim = h.vigencia_inicio - 1 order by vigencia_inicio desc limit 1);
  end if;
end $$;
revoke execute on function public.adm_excluir_honorario(uuid) from public, anon;
grant execute on function public.adm_excluir_honorario(uuid) to authenticated;

create or replace function public.adm_cliente_sem_honorario(p_cliente uuid, p_motivo text default null)
returns void language plpgsql set search_path = '' as $$
begin
  delete from public.adm_honorarios where cliente_id = p_cliente;
  update public.adm_clientes set sem_honorario = true, sem_honorario_motivo = nullif(trim(coalesce(p_motivo, '')), '') where id = p_cliente;
end $$;
revoke execute on function public.adm_cliente_sem_honorario(uuid, text) from public, anon;
grant execute on function public.adm_cliente_sem_honorario(uuid, text) to authenticated;
