-- Opção padrão "N/A" (cinza, conta como concluído) nas obrigações do fechamento.
alter table public.fech_obrigacoes alter column opcoes set default '[
  {"id":"pendente","label":"Pendente","cor":"vermelho","concluido":false},
  {"id":"andamento","label":"Em andamento","cor":"amarelo","concluido":false},
  {"id":"concluido","label":"Concluído","cor":"verde","concluido":true},
  {"id":"na","label":"N/A","cor":"cinza","concluido":true}
]'::jsonb;

-- Obrigações já criadas sem uma opção "na" recebem a N/A no fim da lista
update public.fech_obrigacoes
set opcoes = opcoes || '[{"id":"na","label":"N/A","cor":"cinza","concluido":true}]'::jsonb
where not exists (select 1 from jsonb_array_elements(opcoes) o where o->>'id' = 'na');
