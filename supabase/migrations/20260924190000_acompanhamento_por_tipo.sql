-- Acompanhamento específico por tipo de processo (abertura, alteração, baixa)

-- Registro Digital: alteração e baixa usam "Concluído"
alter table public.soc_processos drop constraint if exists soc_processos_status_registro_digital_check;
alter table public.soc_processos add constraint soc_processos_status_registro_digital_check
  check (status_registro_digital in ('pendente_envio', 'em_analise', 'pendente_mat', 'cnpj_liberado', 'concluido'));

-- Campos exclusivos da baixa
alter table public.soc_processos
  add column if not exists numero_dbe text,
  add column if not exists status_documento_baixa text not null default 'pendente'
    check (status_documento_baixa in ('pendente', 'enviado_assinatura', 'assinado')),
  add column if not exists status_distrato text not null default 'pendente_envio'
    check (status_distrato in ('pendente_envio', 'enviado_assinatura', 'assinado')),
  add column if not exists status_declaracoes_baixa text not null default 'pendente_envio'
    check (status_declaracoes_baixa in ('pendente_envio', 'em_andamento', 'enviadas'));

-- Ajusta valores de Registro Digital que só existem na abertura
update public.soc_processos
  set status_registro_digital = case status_registro_digital
    when 'cnpj_liberado' then 'concluido'
    when 'pendente_mat' then 'em_analise'
    else status_registro_digital end
  where tipo in ('alteracao', 'baixa') and status_registro_digital in ('cnpj_liberado', 'pendente_mat');
