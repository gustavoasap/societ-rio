-- CRM (Administrativo): funil de vendas, atividades de follow-up e histórico de etapas.

create table public.crm_oportunidades (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  cnpj text check (cnpj is null or cnpj ~ '^\d{14}$'),
  contato_nome text,
  contato_cargo text,
  email text,
  telefone text,
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  origem text not null default 'outro' check (origem in (
    'indicacao_parceiro', 'indicacao_cliente', 'site', 'instagram', 'google',
    'whatsapp', 'evento', 'prospeccao', 'outro')),
  parceiro_id uuid references public.soc_parceiros(id) on delete set null,
  servico text not null default 'contabilidade' check (servico in (
    'abertura', 'contabilidade', 'troca_contador', 'bpo', 'regularizacao', 'consultoria', 'outro')),
  regime_tributario text check (regime_tributario in ('simples', 'mei', 'presumido', 'real', 'outro')),
  segmento text check (segmento in ('comercio', 'servicos', 'industria', 'misto')),
  faturamento_mensal numeric,
  qtd_funcionarios integer check (qtd_funcionarios is null or qtd_funcionarios >= 0),
  etapa text not null default 'lead' check (etapa in (
    'lead', 'contato', 'diagnostico', 'proposta', 'negociacao', 'ganho', 'perdido')),
  valor_mensal numeric check (valor_mensal is null or valor_mensal >= 0),
  valor_avulso numeric check (valor_avulso is null or valor_avulso >= 0),
  previsao_fechamento date,
  temperatura text not null default 'morno' check (temperatura in ('frio', 'morno', 'quente')),
  responsavel_id uuid references auth.users(id) on delete set null,
  motivo_perda text check (motivo_perda is null or motivo_perda in (
    'preco', 'concorrente', 'sem_resposta', 'desistiu', 'sem_perfil', 'ficou_atual', 'outro')),
  motivo_perda_detalhe text,
  cliente_id uuid references public.adm_clientes(id) on delete set null,
  etapa_desde timestamptz not null default now(),
  fechado_em timestamptz,
  observacoes text,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_oportunidades_etapa_idx on public.crm_oportunidades (etapa);
create index crm_oportunidades_parceiro_idx on public.crm_oportunidades (parceiro_id);

create table public.crm_atividades (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  tipo text not null default 'tarefa' check (tipo in ('ligacao', 'whatsapp', 'email', 'reuniao', 'tarefa', 'nota')),
  descricao text not null,
  data_prevista timestamptz,
  concluida boolean not null default false,
  concluida_em timestamptz,
  responsavel_id uuid references auth.users(id) on delete set null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index crm_atividades_oportunidade_idx on public.crm_atividades (oportunidade_id);
create index crm_atividades_pendentes_idx on public.crm_atividades (data_prevista) where not concluida;

create table public.crm_historico (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.crm_oportunidades(id) on delete cascade,
  de text,
  para text not null,
  em timestamptz not null default now(),
  por uuid default auth.uid()
);
create index crm_historico_oportunidade_idx on public.crm_historico (oportunidade_id);

create or replace function public.crm_datas_etapa()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then
    if new.etapa in ('ganho', 'perdido') then new.fechado_em = coalesce(new.fechado_em, now()); end if;
  elsif new.etapa is distinct from old.etapa then
    new.etapa_desde = now();
    new.fechado_em = case when new.etapa in ('ganho', 'perdido') then now() else null end;
  end if;
  return new;
end;
$$;

create or replace function public.crm_registrar_etapa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.etapa is distinct from old.etapa then
    insert into public.crm_historico (oportunidade_id, de, para)
    values (new.id, case when tg_op = 'UPDATE' then old.etapa end, new.etapa);
  end if;
  return null;
end;
$$;

create trigger crm_oportunidades_datas before insert or update on public.crm_oportunidades
  for each row execute function public.crm_datas_etapa();
create trigger crm_oportunidades_historico after insert or update on public.crm_oportunidades
  for each row execute function public.crm_registrar_etapa();

alter table public.crm_oportunidades enable row level security;
alter table public.crm_atividades enable row level security;
alter table public.crm_historico enable row level security;

create policy "administrativo acessa oportunidades" on public.crm_oportunidades for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));
create policy "administrativo acessa atividades" on public.crm_atividades for all to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')))
  with check ((select public.portal_tem_acesso_slug('administrativo')));
create policy "administrativo lê histórico" on public.crm_historico for select to authenticated
  using ((select public.portal_tem_acesso_slug('administrativo')));

-- Equipe que pode ser responsável por oportunidades (usuários com acesso ao Administrativo).
create or replace function public.crm_equipe()
returns table (user_id uuid, nome text, email text)
language sql stable security definer set search_path = '' as $$
  select p.user_id, coalesce(nullif(p.nome, ''), split_part(p.email, '@', 1)), p.email
  from public.portal_perfis p
  where public.portal_tem_acesso_slug('administrativo')
    and p.ativo
    and (p.admin or exists (
      select 1 from public.portal_acessos a
      join public.portal_departamentos d on d.id = a.departamento_id and d.slug = 'administrativo'
      where a.user_id = p.user_id))
  order by 2;
$$;
revoke execute on function public.crm_equipe() from public, anon;
grant execute on function public.crm_equipe() to authenticated;

insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'CRM', 'Funil de vendas: leads, propostas, follow-ups e conversão em clientes.',
       'Handshake', '/administrativo/crm', 'disponivel', 2
from public.portal_departamentos d
where d.slug = 'administrativo'
  and not exists (select 1 from public.portal_modulos m where m.link = '/administrativo/crm');
