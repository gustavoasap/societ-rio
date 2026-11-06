-- Regra: nome do cliente do caução sempre em caixa alta.
create or replace function public.soc_caucoes_atualizado()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.cliente = upper(btrim(new.cliente));
  if new.responsavel_tipo = 'cliente' then new.responsavel_parceiro_id = null; end if;
  return new;
end;
$$;

-- Nomes já cadastrados (inclusive o "Responsável:" das observações) e datas no texto em DD/MM/AAAA
update public.soc_caucoes
set cliente = upper(btrim(cliente)),
    observacoes = regexp_replace(
      regexp_replace(observacoes, '^Responsável: ([^\n]*)', 'Responsável: ' || upper(substring(observacoes from '^Responsável: ([^\n]*)')), 'n'),
      '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1', 'g');
