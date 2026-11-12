-- Honorários: confirmação de cliente sem honorário, honorário "atual" = vigente hoje (reajuste
-- agendado não aparece antes da hora) e reajuste em massa a partir de uma competência.
alter table public.adm_clientes add column if not exists sem_honorario boolean not null default false;
alter table public.adm_clientes add column if not exists sem_honorario_motivo text;

create or replace view public.adm_clientes_honorario_atual with (security_invoker = true) as
  select distinct on (c.id) c.id as cliente_id, h.id as honorario_id, h.valor, h.vigencia_inicio, h.dia_vencimento
  from public.adm_clientes c
  join public.adm_honorarios h on h.cliente_id = c.id
  -- vigente hoje; se só houver honorário futuro (cliente novo), mostra o próximo
  order by c.id, (h.vigencia_inicio <= current_date and (h.vigencia_fim is null or h.vigencia_fim >= current_date)) desc, (h.vigencia_inicio > current_date) desc, h.vigencia_inicio desc;

create or replace function public.adm_reajustar_em_massa(p_itens jsonb, p_inicio date, p_descricao text default null)
returns integer language plpgsql set search_path = '' as $$
declare
  it jsonb;
  atual record;
  n integer := 0;
begin
  if extract(day from p_inicio) <> 1 then raise exception 'O reajuste vale a partir do primeiro dia de uma competência.'; end if;
  for it in select * from jsonb_array_elements(p_itens) loop
    select id, vigencia_inicio, dia_vencimento into atual
      from public.adm_honorarios where cliente_id = (it->>'cliente')::uuid and vigencia_fim is null
      order by vigencia_inicio desc limit 1;
    if atual.id is null then raise exception 'Cliente % sem honorário vigente.', it->>'cliente'; end if;
    if atual.vigencia_inicio >= p_inicio then
      raise exception 'Um dos clientes já tem honorário a partir de %. Desmarque-o ou escolha outra competência.', to_char(atual.vigencia_inicio, 'DD/MM/YYYY');
    end if;
    update public.adm_honorarios set vigencia_fim = p_inicio - 1 where id = atual.id;
    insert into public.adm_honorarios (cliente_id, valor, vigencia_inicio, dia_vencimento, descricao)
      values ((it->>'cliente')::uuid, (it->>'valor')::numeric, p_inicio, atual.dia_vencimento, p_descricao);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.adm_reajustar_em_massa(jsonb, date, text) from public, anon;
grant execute on function public.adm_reajustar_em_massa(jsonb, date, text) to authenticated;
