-- PIS/COFINS com alíquota zero, isenção, suspensão ou sem incidência por NCM (tabelas 4.3.13 a 4.3.16 da EFD-Contribuições),
-- marcado pelo contador (null = não marcado)
alter table public.trib_ncms
  add column if not exists pis_cofins_zero boolean;
