-- Controle de obrigações: periodicidade (mensal, anual, única), meses de entrega das anuais,
-- vigência opcional (padrão: desde a abertura de cada empresa), motivo do encerramento do cliente
-- e link do Drive no controle.

alter table public.fech_obrigacoes add column if not exists periodicidade text not null default 'mensal';
alter table public.fech_obrigacoes add constraint fech_obrigacoes_periodicidade_check check (periodicidade in ('mensal', 'anual', 'unica'));
-- Meses do período de entrega das anuais (1 a 12)
alter table public.fech_obrigacoes add column if not exists meses_entrega smallint[];
-- Sem início: vale desde a abertura de cada empresa
alter table public.fech_obrigacoes alter column inicio drop not null;
alter table public.fech_obrigacoes alter column inicio drop default;

alter table public.adm_clientes add column if not exists motivo_encerramento text;
alter table public.adm_clientes add constraint adm_clientes_motivo_encerramento_check check (motivo_encerramento in ('baixa', 'distrato'));

-- Empresas do controle (com link do Drive e motivo do encerramento)
create or replace function public.fech_empresas(p_departamento text)
returns table (id uuid, codigo integer, razao_social text, cnpj text, status text, data_abertura date,
               data_encerramento date, motivo_encerramento text, regime_tributario text, empresa text,
               parceiro text, link_drive text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.codigo, c.razao_social, c.cnpj, c.status, c.data_abertura, c.data_encerramento,
         c.motivo_encerramento, c.regime_tributario, c.empresa, p.nome, c.link_drive
  from public.adm_clientes c
  left join public.soc_parceiros p on p.id = c.parceiro_id
  where p_departamento in ('contabil', 'fiscal', 'pessoal', 'societario')
    and public.portal_tem_acesso_slug(p_departamento)
  order by c.codigo;
$$;
revoke execute on function public.fech_empresas(text) from public, anon;
grant execute on function public.fech_empresas(text) to authenticated;
