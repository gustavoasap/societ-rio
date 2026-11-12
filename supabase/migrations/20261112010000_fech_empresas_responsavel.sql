-- Controle de obrigações: responsável legal da empresa (Base de Clientes) nas colunas.
drop function public.fech_empresas(text);
create function public.fech_empresas(p_departamento text)
returns table (id uuid, codigo integer, razao_social text, cnpj text, status text, data_abertura date,
               data_encerramento date, motivo_encerramento text, regime_tributario text, empresa text,
               parceiro text, link_drive text, responsavel text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.codigo, c.razao_social, c.cnpj, c.status, c.data_abertura, c.data_encerramento,
         c.motivo_encerramento, c.regime_tributario, c.empresa, p.nome, c.link_drive, c.responsavel
  from public.adm_clientes c
  left join public.soc_parceiros p on p.id = c.parceiro_id
  where p_departamento in ('contabil', 'fiscal', 'pessoal', 'societario')
    and public.portal_tem_acesso_slug(p_departamento)
  order by c.codigo;
$$;
revoke execute on function public.fech_empresas(text) from public, anon;
grant execute on function public.fech_empresas(text) to authenticated;
