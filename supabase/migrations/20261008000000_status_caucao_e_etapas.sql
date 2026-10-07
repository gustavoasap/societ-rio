-- Status "Ainda não pagou o caução", DBE indeferido e novos nomes de etapas

alter table public.soc_processos drop constraint if exists soc_processos_status_check;
alter table public.soc_processos add constraint soc_processos_status_check
  check (status in ('aguardando_caucao', 'pendente', 'andamento', 'concluido'));

alter table public.soc_processos drop constraint if exists soc_processos_status_dbe_check;
alter table public.soc_processos add constraint soc_processos_status_dbe_check
  check (status_dbe in ('pendente', 'em_analise', 'indeferido', 'ok'));

-- Pagamento da Taxa: "Em análise" passa a ser "Pendente de Pagamento"
alter table public.soc_processos drop constraint if exists soc_processos_status_taxa_check;
update public.soc_processos set status_taxa = 'pendente_pagamento' where status_taxa = 'em_analise';
alter table public.soc_processos add constraint soc_processos_status_taxa_check
  check (status_taxa in ('pendente', 'pendente_pagamento', 'ok'));

-- Contrato Social: "Falta assinatura" passa a ser "Enviado para assinatura"
alter table public.soc_processos drop constraint if exists soc_processos_status_contrato_social_check;
update public.soc_processos set status_contrato_social = 'enviado_assinatura' where status_contrato_social = 'falta_assinatura';
alter table public.soc_processos add constraint soc_processos_status_contrato_social_check
  check (status_contrato_social in ('pendente_envio', 'enviado_assinatura', 'ok'));
