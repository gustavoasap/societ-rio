-- RLS do módulo fiscal: a verificação de acesso roda uma vez por consulta (initPlan), não uma vez por linha

drop policy if exists "fiscal acessa empresas" on public.trib_empresas;
create policy "fiscal acessa empresas" on public.trib_empresas
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa estabelecimentos" on public.trib_estabelecimentos;
create policy "fiscal acessa estabelecimentos" on public.trib_estabelecimentos
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa estoque" on public.trib_estoque_movimentos;
create policy "fiscal acessa estoque" on public.trib_estoque_movimentos
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa produtos do estoque" on public.trib_estoque_produtos;
create policy "fiscal acessa produtos do estoque" on public.trib_estoque_produtos
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa importacoes" on public.trib_importacoes;
create policy "fiscal acessa importacoes" on public.trib_importacoes
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa movimentos" on public.trib_movimentos;
create policy "fiscal acessa movimentos" on public.trib_movimentos
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa ncms" on public.trib_ncms;
create policy "fiscal acessa ncms" on public.trib_ncms
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa notas" on public.trib_notas;
create policy "fiscal acessa notas" on public.trib_notas
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa ajustes de notas" on public.trib_notas_ajustes;
create policy "fiscal acessa ajustes de notas" on public.trib_notas_ajustes
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));

drop policy if exists "fiscal acessa parceiros tributarios" on public.trib_parceiros;
create policy "fiscal acessa parceiros tributarios" on public.trib_parceiros
  for all to authenticated
  using ((select public.portal_tem_acesso_slug('fiscal')))
  with check ((select public.portal_tem_acesso_slug('fiscal')));
