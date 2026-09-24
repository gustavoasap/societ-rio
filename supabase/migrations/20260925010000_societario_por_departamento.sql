-- Processos Societários: só quem tem acesso ao departamento Societário no portal
-- (ou é administrador) vê e altera processos e parceiros

drop policy if exists "equipe acessa parceiros" on public.soc_parceiros;
drop policy if exists "societário acessa parceiros" on public.soc_parceiros;
create policy "societário acessa parceiros" on public.soc_parceiros
  for all to authenticated
  using (public.portal_tem_acesso_slug('societario'))
  with check (public.portal_tem_acesso_slug('societario'));

drop policy if exists "equipe acessa processos" on public.soc_processos;
drop policy if exists "societário acessa processos" on public.soc_processos;
create policy "societário acessa processos" on public.soc_processos
  for all to authenticated
  using (public.portal_tem_acesso_slug('societario'))
  with check (public.portal_tem_acesso_slug('societario'));
