-- Base de Clientes: dados do Cartão CNPJ (Receita) guardados no cadastro.
alter table public.adm_clientes
  add column if not exists endereco text,
  add column if not exists situacao_cadastral text,
  add column if not exists receita_atualizada_em timestamptz;

-- Acompanhamento de Caução: nomes em caixa alta e datas das observações em DD/MM/AAAA
update public.soc_caucoes
set cliente = upper(btrim(cliente)),
    observacoes = regexp_replace(
      regexp_replace(observacoes, '^Responsável: ([^\n]*)', 'Responsável: ' || upper(substring(observacoes from '^Responsável: ([^\n]*)')), 'n'),
      '(\d{4})-(\d{2})-(\d{2})', '\3/\2/\1', 'g');
