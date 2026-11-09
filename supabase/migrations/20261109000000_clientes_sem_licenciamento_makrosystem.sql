-- Base de Clientes: licenciamento e Makrosystem deixam de ser controlados aqui
-- (o licenciamento tem controle próprio em Societário > Controle Legalização).
alter table public.adm_clientes drop column if exists licenciamento, drop column if exists makrosystem;
