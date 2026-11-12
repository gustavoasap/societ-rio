-- Configurações do Administrativo (ex.: URL do App da Web do script de pastas no Drive).
create table if not exists public.adm_config (
  chave text primary key,
  valor text,
  atualizado_em timestamptz not null default now()
);
alter table public.adm_config enable row level security;
create policy "administrativo acessa configuracoes" on public.adm_config for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));
