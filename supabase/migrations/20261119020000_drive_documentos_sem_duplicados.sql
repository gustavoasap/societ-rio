create or replace function public.drive_registrar_documentos(p_token text, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  n integer;
begin
  if not public.integracao_token_ok('drive_pastas', p_token) then
    raise exception 'Token inválido' using errcode = '42501';
  end if;
  -- O mesmo nome de arquivo pode aparecer em mais de uma subpasta do cliente: registra uma vez só
  insert into public.adm_documentos (cliente_id, tipo, nome, url, drive_id, origem)
  select distinct on (c.id, i.tipo, left(i.nome, 300)) c.id, i.tipo, left(i.nome, 300), i.url, i.drive_id, 'drive'
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as i(codigo integer, tipo text, nome text, url text, drive_id text)
  join public.adm_clientes c on c.codigo = i.codigo
  where i.tipo in ('contrato', 'cartao') and coalesce(i.nome, '') <> ''
  order by c.id, i.tipo, left(i.nome, 300), i.drive_id
  on conflict (cliente_id, tipo, nome) do update set url = excluded.url, drive_id = excluded.drive_id;
  get diagnostics n = row_count;
  return n;
end
$$;
