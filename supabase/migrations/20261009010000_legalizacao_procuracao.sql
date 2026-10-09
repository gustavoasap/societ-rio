-- Controle Legalização: status da procuração (antes do licenciamento)
alter table public.soc_legalizacao
  add column if not exists procuracao_status text not null default 'pendente'
    check (procuracao_status in ('pendente', 'ok', 'vencida'));
