-- Cofre das senhas de certificado digital (só sócios). As senhas chegam já criptografadas pelo navegador
-- (AES-256-GCM com chave derivada da senha-mestra por PBKDF2); o banco nunca vê a senha nem a senha-mestra.

create table if not exists public.adm_cofre_config (
  id integer primary key default 1 check (id = 1),
  salt text not null,
  iteracoes integer not null,
  -- Texto conhecido criptografado com a chave: confere se a senha-mestra digitada está certa
  verificador_iv text not null,
  verificador text not null,
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid()
);

create table if not exists public.adm_cofre_senhas (
  cliente_id uuid primary key references public.adm_clientes(id) on delete cascade,
  iv text not null,
  cifrado text not null,
  origem text not null default 'manual' check (origem in ('manual', 'drive')),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid()
);

create table if not exists public.adm_cofre_acessos (
  id bigserial primary key,
  cliente_id uuid references public.adm_clientes(id) on delete set null,
  acao text not null check (acao in ('revelar', 'copiar', 'gravar', 'excluir', 'importar', 'trocar_mestra', 'criar_mestra')),
  user_id uuid default auth.uid(),
  em timestamptz not null default now()
);
create index if not exists adm_cofre_acessos_cliente_idx on public.adm_cofre_acessos (cliente_id, em desc);

alter table public.adm_cofre_config enable row level security;
alter table public.adm_cofre_senhas enable row level security;
alter table public.adm_cofre_acessos enable row level security;

create policy "sócios acessam config do cofre" on public.adm_cofre_config for all to authenticated
  using ((select portal_is_admin())) with check ((select portal_is_admin()));
create policy "sócios acessam senhas do cofre" on public.adm_cofre_senhas for all to authenticated
  using ((select portal_is_admin())) with check ((select portal_is_admin()));
-- Registro de acessos: sócios leem e registram; ninguém altera nem apaga
create policy "sócios leem acessos do cofre" on public.adm_cofre_acessos for select to authenticated using ((select portal_is_admin()));
create policy "sócios registram acessos do cofre" on public.adm_cofre_acessos for insert to authenticated
  with check ((select portal_is_admin()) and user_id = auth.uid());

-- Troca da senha-mestra em uma transação só: as senhas recriptografadas e a nova verificação juntas
create or replace function public.cofre_trocar_mestra(p_salt text, p_iteracoes integer, p_verificador_iv text, p_verificador text, p_linhas jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  n integer;
  total integer;
begin
  if not public.portal_is_admin() then
    raise exception 'Somente sócios' using errcode = '42501';
  end if;
  select count(*) into total from public.adm_cofre_senhas;
  if jsonb_array_length(coalesce(p_linhas, '[]'::jsonb)) <> total then
    raise exception 'A lista de senhas mudou durante a troca. Tente de novo.';
  end if;
  update public.adm_cofre_senhas s set iv = l.iv, cifrado = l.cifrado, atualizado_em = now(), atualizado_por = auth.uid()
  from jsonb_to_recordset(p_linhas) as l(cliente_id uuid, iv text, cifrado text)
  where s.cliente_id = l.cliente_id;
  get diagnostics n = row_count;
  if n <> total then
    raise exception 'Nem todas as senhas foram recriptografadas. Nada foi alterado.';
  end if;
  update public.adm_cofre_config set salt = p_salt, iteracoes = p_iteracoes, verificador_iv = p_verificador_iv, verificador = p_verificador where id = 1;
  insert into public.adm_cofre_acessos (acao, user_id) values ('trocar_mestra', auth.uid());
  return n;
end
$$;
revoke all on function public.cofre_trocar_mestra(text, integer, text, text, jsonb) from public, anon;
grant execute on function public.cofre_trocar_mestra(text, integer, text, text, jsonb) to authenticated;
