-- Ordem das ferramentas do Societário: Acompanhamento de Caução logo após Processos Societários.
update public.portal_modulos m set ordem = v.ordem
from (values
  ('/societario/processos', 1),
  ('/societario/caucao', 2),
  ('/societario/objeto-social', 3),
  ('/societario/legalizacao', 4),
  ('/societario/anotacoes', 5)
) as v(link, ordem)
where m.link = v.link;
