-- Estoque: nota e fornecedor/cliente do item (pareamento de compras devolvidas no mesmo valor e exclusão de nota do estoque),
-- valor dos produtos na nota (sem frete/IPI/ST) e produto "sem estoque" (vendas direto na receita, sem CMV)
alter table public.trib_estoque_movimentos
  add column if not exists nota text not null default '',
  add column if not exists parceiro text not null default '',
  add column if not exists valor_produto numeric(16, 2);

alter table public.trib_estoque_produtos
  add column if not exists sem_estoque boolean not null default false;
