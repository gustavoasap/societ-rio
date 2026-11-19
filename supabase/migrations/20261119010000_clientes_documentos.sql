create table if not exists public.adm_documentos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.adm_clientes(id) on delete cascade,
  tipo text not null check (tipo in ('contrato', 'cartao')),
  nome text not null,
  url text,
  drive_id text,
  origem text not null default 'portal' check (origem in ('portal', 'drive', 'manual')),
  criado_em timestamptz not null default now(),
  unique (cliente_id, tipo, nome)
);
create index if not exists adm_documentos_cliente_idx on public.adm_documentos (cliente_id);
alter table public.adm_documentos enable row level security;
create policy "administrativo acessa documentos" on public.adm_documentos for all to authenticated
  using ((select portal_tem_acesso_slug('administrativo'))) with check ((select portal_tem_acesso_slug('administrativo')));
create policy "societário lê documentos" on public.adm_documentos for select to authenticated
  using ((select portal_tem_acesso_slug('societario')));

-- Varredura do Drive (script de pastas): registra contratos e cartões CNPJ encontrados nas pastas dos clientes.
-- p_itens: [{codigo, tipo, nome, url, drive_id}]
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
  insert into public.adm_documentos (cliente_id, tipo, nome, url, drive_id, origem)
  select c.id, i.tipo, left(i.nome, 300), i.url, i.drive_id, 'drive'
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as i(codigo integer, tipo text, nome text, url text, drive_id text)
  join public.adm_clientes c on c.codigo = i.codigo
  where i.tipo in ('contrato', 'cartao') and coalesce(i.nome, '') <> ''
  on conflict (cliente_id, tipo, nome) do update set url = excluded.url, drive_id = excluded.drive_id;
  get diagnostics n = row_count;
  return n;
end
$$;
revoke all on function public.drive_registrar_documentos(text, jsonb) from public;
grant execute on function public.drive_registrar_documentos(text, jsonb) to anon, authenticated;
