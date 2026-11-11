-- Controle de Tarefas Mensal no Societário: mesmo funcionamento do Controle de Fechamento Mensal.

alter table public.fech_obrigacoes drop constraint if exists fech_obrigacoes_departamento_check;
alter table public.fech_obrigacoes add constraint fech_obrigacoes_departamento_check
  check (departamento in ('contabil', 'fiscal', 'pessoal', 'societario'));

create or replace function public.fech_clientes(p_departamento text)
returns table (id uuid, codigo integer, razao_social text, cnpj text, status text, data_abertura date,
               data_encerramento date, regime_tributario text, empresa text, parceiro text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.codigo, c.razao_social, c.cnpj, c.status, c.data_abertura, c.data_encerramento,
         c.regime_tributario, c.empresa, p.nome
  from public.adm_clientes c
  left join public.soc_parceiros p on p.id = c.parceiro_id
  where p_departamento in ('contabil', 'fiscal', 'pessoal', 'societario')
    and public.portal_tem_acesso_slug(p_departamento)
  order by c.codigo;
$$;

insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem)
select d.id, 'Controle de Tarefas Mensal', 'Tarefas do mês por empresa: pendente, em andamento e concluído.',
       'ClipboardList', '/societario/tarefas', 'disponivel', 6
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/tarefas');
