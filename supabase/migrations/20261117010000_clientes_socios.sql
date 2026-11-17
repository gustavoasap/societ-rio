alter table public.adm_clientes add column if not exists socios jsonb not null default '[]'::jsonb;
comment on column public.adm_clientes.socios is 'Sócios informados no cadastro: [{nome, cpf, qualificacao}]';
