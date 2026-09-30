-- Unifica soc_objetos_sociais entre a tela Modelos (Processos Societários) e o Gerador
-- de Objeto Social: acrescenta as colunas que faltavam. O gatilho de updated_at criado
-- em 20260929000000 falhava em qualquer edição porque a coluna não existia.
alter table public.soc_objetos_sociais
  add column if not exists cnaes text[] not null default '{}',
  add column if not exists criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();
