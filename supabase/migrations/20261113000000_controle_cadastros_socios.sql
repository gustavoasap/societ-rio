-- Controle de Cadastros (Administrativo): mesmo modelo do controle de obrigações, visível só para os sócios.
-- 'cadastros' não é um departamento: portal_tem_acesso_slug('cadastros') só é verdadeiro para administradores.
alter table public.portal_modulos add column if not exists somente_socios boolean not null default false;
alter policy "ver ferramentas liberadas" on public.portal_modulos
  using (portal_tem_acesso(departamento_id) and ((status <> 'oculto') or portal_is_admin()) and (not somente_socios or portal_is_admin()));

alter table public.fech_obrigacoes drop constraint if exists fech_obrigacoes_departamento_check,
  add constraint fech_obrigacoes_departamento_check check (departamento in ('contabil', 'fiscal', 'pessoal', 'societario', 'cadastros'));

create or replace function public.fech_empresas(p_departamento text)
returns table (id uuid, codigo integer, razao_social text, cnpj text, status text, data_abertura date,
               data_encerramento date, motivo_encerramento text, regime_tributario text, empresa text,
               parceiro text, link_drive text, responsavel text)
language sql stable security definer set search_path = '' as $$
  select c.id, c.codigo, c.razao_social, c.cnpj, c.status, c.data_abertura, c.data_encerramento,
         c.motivo_encerramento, c.regime_tributario, c.empresa, p.nome, c.link_drive, c.responsavel
  from public.adm_clientes c
  left join public.soc_parceiros p on p.id = c.parceiro_id
  where p_departamento in ('contabil', 'fiscal', 'pessoal', 'societario', 'cadastros')
    and public.portal_tem_acesso_slug(p_departamento)
  order by c.codigo;
$$;

insert into public.portal_modulos (departamento_id, nome, descricao, icone, link, status, ordem, somente_socios)
select d.id, 'Controle de Cadastros', 'Cadastro de cada cliente nos sistemas do escritório. Visível só para os sócios.',
       'ClipboardList', '/administrativo/cadastros', 'disponivel',
       coalesce((select max(m.ordem) + 1 from public.portal_modulos m where m.departamento_id = d.id), 1), true
from public.portal_departamentos d
where d.slug = 'administrativo' and not exists (select 1 from public.portal_modulos m where m.link = '/administrativo/cadastros');
