-- Base de Clientes: colunas da planilha (empresa, início dos serviços, carência e
-- situação do encerramento) e regra de nomes em caixa alta.
alter table public.adm_clientes
  add column if not exists empresa text,
  add column if not exists data_inicio_servicos date,
  add column if not exists carencia_meses smallint check (carencia_meses is null or carencia_meses between 0 and 60),
  add column if not exists situacao_encerramento text;

create or replace function public.adm_clientes_maiusculas()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.razao_social = upper(btrim(new.razao_social));
  new.nome_fantasia = nullif(upper(btrim(new.nome_fantasia)), '');
  new.responsavel = nullif(upper(btrim(new.responsavel)), '');
  new.email = nullif(lower(btrim(new.email)), '');
  return new;
end;
$$;

drop trigger if exists adm_clientes_maiusculas on public.adm_clientes;
create trigger adm_clientes_maiusculas before insert or update on public.adm_clientes
  for each row execute function public.adm_clientes_maiusculas();

-- Os dados foram carregados da planilha "Base de Clientes 02/11" (fora do controle de versão).
