-- Controle de Honorários (Administrativo): o valor de cada mês vem do honorário vigente na Base
-- de Clientes (adm_honorarios). Aqui ficam só as exceções do mês (valor ajustado) e o recebimento.

create table if not exists public.adm_hon_config (
  id smallint primary key default 1 check (id = 1),
  inicio date not null default '2026-10-01' check (extract(day from inicio) = 1),
  dia_vencimento smallint not null default 10 check (dia_vencimento between 1 and 31),
  -- false = vence no próprio mês da competência
  vence_mes_seguinte boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.adm_hon_config (id) values (1) on conflict do nothing;

create table if not exists public.adm_hon_mensal (
  cliente_id uuid not null references public.adm_clientes(id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1),
  -- Valor do mês diferente do honorário da base (serviço extra, negociação); null = valor da base
  valor_ajustado numeric(12,2) check (valor_ajustado >= 0),
  motivo_ajuste text,
  recebido_em date,
  valor_recebido numeric(12,2) check (valor_recebido >= 0),
  origem text check (origem in ('manual', 'extrato')),
  -- Identificação do lançamento do extrato (evita marcar duas vezes o mesmo crédito)
  extrato_id text,
  extrato_descricao text,
  observacao text,
  atualizado_por uuid default auth.uid() references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  primary key (cliente_id, competencia)
);
create index if not exists adm_hon_mensal_comp_idx on public.adm_hon_mensal (competencia);
create unique index if not exists adm_hon_mensal_extrato_idx on public.adm_hon_mensal (extrato_id) where extrato_id is not null;

alter table public.adm_hon_config enable row level security;
alter table public.adm_hon_mensal enable row level security;

create policy "administrativo acessa config de honorarios" on public.adm_hon_config for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));
create policy "administrativo acessa honorarios mensais" on public.adm_hon_mensal for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));

insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Controle de Honorários', 'Honorários do mês, recebimentos, extrato bancário, inadimplentes e evolução.',
       'Wallet', '/administrativo/honorarios', 'disponivel',
       coalesce((select max(m.ordem) + 1 from public.portal_modulos m where m.departamento_id = d.id), 1)
from public.portal_departamentos d
where d.slug = 'administrativo'
  and not exists (select 1 from public.portal_modulos m where m.link = '/administrativo/honorarios');
