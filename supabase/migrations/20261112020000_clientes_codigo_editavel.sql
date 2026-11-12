-- Base de Clientes: código editável. A sequência acompanha o maior código usado,
-- para o próximo cliente novo não repetir um código digitado à mão.
create or replace function public.adm_clientes_sincronizar_codigo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform setval('public.adm_clientes_codigo_seq', greatest((select coalesce(max(codigo), 0) from public.adm_clientes), 1));
  return null;
end $$;
create trigger adm_clientes_sincronizar_codigo after insert or update of codigo on public.adm_clientes
  for each statement execute function public.adm_clientes_sincronizar_codigo();
alter table public.adm_clientes add constraint adm_clientes_codigo_check check (codigo > 0);
