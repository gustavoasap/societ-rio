-- Automação de pastas no Google Drive (Apps Script).
-- O script consulta os clientes da Base sem pasta, cria a pasta no Drive e grava o link em adm_clientes.link_drive.
-- Acesso por token próprio (só o hash fica no banco), sem expor a chave de serviço do Supabase.

create table if not exists public.integracao_tokens (
  nome text primary key,
  token_hash text not null,
  criado_em timestamptz not null default now()
);

alter table public.integracao_tokens enable row level security;

revoke all on public.integracao_tokens from anon, authenticated;

create or replace function public.integracao_token_ok(p_nome text, p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1 from public.integracao_tokens
    where nome = p_nome and token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  )
$$;

revoke execute on function public.integracao_token_ok(text, text) from public, anon, authenticated;

-- Clientes para o script: só os sem pasta (p_todos = false) ou todos (varredura diária)
create or replace function public.drive_clientes(p_token text, p_todos boolean default false)
returns table (id uuid, codigo integer, razao_social text, link_drive text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.integracao_token_ok('drive_pastas', p_token) then
    raise exception 'Token inválido' using errcode = '42501';
  end if;
  return query
    select c.id, c.codigo, c.razao_social, c.link_drive
    from public.adm_clientes c
    where c.codigo is not null
      and coalesce(trim(c.razao_social), '') <> ''
      and (p_todos or coalesce(trim(c.link_drive), '') = '')
    order by c.codigo;
end
$$;

-- Grava o link da pasta somente se o cliente ainda não tiver um (não troca links existentes)
create or replace function public.drive_registrar_pasta(p_token text, p_id uuid, p_url text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.integracao_token_ok('drive_pastas', p_token) then
    raise exception 'Token inválido' using errcode = '42501';
  end if;
  if coalesce(p_url, '') !~ '^https://drive\.google\.com/' then
    raise exception 'Link de pasta inválido';
  end if;
  update public.adm_clientes set link_drive = p_url where id = p_id and coalesce(trim(link_drive), '') = '';
  if found then
    return 'preenchido';
  end if;
  return 'mantido';
end
$$;

revoke execute on function public.drive_clientes(text, boolean) from public;
revoke execute on function public.drive_registrar_pasta(text, uuid, text) from public;
grant execute on function public.drive_clientes(text, boolean) to anon, authenticated;
grant execute on function public.drive_registrar_pasta(text, uuid, text) to anon, authenticated;
