-- Processos societários: status "Desistiu" (vai para a aba Desistências).
alter table public.soc_processos drop constraint soc_processos_status_check,
  add constraint soc_processos_status_check check (status in ('aguardando_caucao', 'pendente', 'andamento', 'concluido', 'desistiu'));
