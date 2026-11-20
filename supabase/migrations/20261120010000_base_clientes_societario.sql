-- Base de Clientes no Societário (espelho só leitura da Base do Administrativo, sem honorários)
insert into public.portal_modulos (departamento_id, nome, descricao, link, status, icone, ordem, somente_socios)
select d.id, 'Base de Clientes', 'Espelho da Base de Clientes do Administrativo: cadastro, sócios, documentos e implantação (sem honorários).', '/societario/clientes', 'disponivel', 'Users', 0, false
from public.portal_departamentos d
where d.slug = 'societario'
  and not exists (select 1 from public.portal_modulos m where m.link = '/societario/clientes');

-- O Societário precisa só do endereço do script do Drive (para baixar documentos); nada mais da configuração
create policy "societário lê endereço do drive" on public.adm_config for select to authenticated
  using (chave = 'drive_webapp_url' and (select portal_tem_acesso_slug('societario')));
