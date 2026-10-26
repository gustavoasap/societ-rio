-- Conciliação bancária: linhas do extrato (importadas de OFX/CSV ou digitadas) e o saldo informado pelo banco.
-- Idempotente: pode rodar de novo sem estragar nada.

create table if not exists public.pes_extrato (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references public.pes_contas (id) on delete cascade,
  data date not null,
  descricao text not null,
  -- com sinal: + entrou na conta, - saiu
  valor numeric(14, 2) not null check (valor <> 0),
  -- identificador da transação no arquivo do banco (evita importar a mesma linha duas vezes)
  fitid text,
  -- lançamento do app que corresponde a esta linha (conciliado)
  lancamento_id uuid references public.pes_lancamentos (id) on delete set null,
  -- linha que não vira lançamento (ex.: aplicação automática, estorno já tratado)
  ignorada boolean not null default false,
  criado_em timestamptz not null default now()
);
create unique index if not exists pes_extrato_fitid on public.pes_extrato (conta_id, fitid) where fitid is not null;
create index if not exists pes_extrato_conta_data on public.pes_extrato (conta_id, data);

create table if not exists public.pes_extrato_saldos (
  conta_id uuid not null references public.pes_contas (id) on delete cascade,
  data date not null,
  saldo numeric(14, 2) not null,
  primary key (conta_id, data)
);

do $$
declare
  t text;
begin
  foreach t in array array['pes_extrato', 'pes_extrato_saldos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "somente o dono" on public.%I', t);
    execute format(
      'create policy "somente o dono" on public.%I for all to authenticated using ((select public.pes_eh_dono())) with check ((select public.pes_eh_dono()))',
      t
    );
  end loop;
end;
$$;
