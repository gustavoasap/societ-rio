-- Implantação: o que não foi informado é pendente
update public.adm_clientes set certificado_digital = coalesce(certificado_digital, 'pendente'), procuracao = coalesce(procuracao, 'pendente'),
  onboarding = coalesce(onboarding, 'pendente') where certificado_digital is null or procuracao is null or onboarding is null;
alter table public.adm_clientes alter column certificado_digital set default 'pendente';
alter table public.adm_clientes alter column procuracao set default 'pendente';
alter table public.adm_clientes alter column onboarding set default 'pendente';

-- Documentos: certificado digital (só o arquivo; senha nunca é guardada), hash para ignorar envio repetido,
-- validade do certificado e situação (ativo / expirado)
alter table public.adm_documentos drop constraint if exists adm_documentos_tipo_check;
alter table public.adm_documentos add constraint adm_documentos_tipo_check check (tipo in ('contrato', 'cartao', 'certificado'));
alter table public.adm_documentos add column if not exists hash text;
alter table public.adm_documentos add column if not exists validade date;
alter table public.adm_documentos add column if not exists titular text;
alter table public.adm_documentos add column if not exists situacao text not null default 'ativo';
alter table public.adm_documentos drop constraint if exists adm_documentos_situacao_check;
alter table public.adm_documentos add constraint adm_documentos_situacao_check check (situacao in ('ativo', 'expirado', 'invalido'));
create index if not exists adm_documentos_hash_idx on public.adm_documentos (cliente_id, hash) where hash is not null;

create or replace function public.drive_registrar_documentos(p_token text, p_itens jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  n integer;
begin
  if not public.integracao_token_ok('drive_pastas', p_token) then
    raise exception 'Token inválido' using errcode = '42501';
  end if;
  insert into public.adm_documentos (cliente_id, tipo, nome, url, drive_id, origem, situacao)
  select distinct on (c.id, i.tipo, left(i.nome, 300)) c.id, i.tipo, left(i.nome, 300), i.url, i.drive_id, 'drive',
    case when i.situacao in ('ativo', 'expirado') then i.situacao else 'ativo' end
  from jsonb_to_recordset(coalesce(p_itens, '[]'::jsonb)) as i(codigo integer, tipo text, nome text, url text, drive_id text, situacao text)
  join public.adm_clientes c on c.codigo = i.codigo
  where i.tipo in ('contrato', 'cartao', 'certificado') and coalesce(i.nome, '') <> ''
  order by c.id, i.tipo, left(i.nome, 300), i.drive_id
  -- Já registrado: não altera o documento (só atualiza o link e a pasta onde está)
  on conflict (cliente_id, tipo, nome) do update set url = excluded.url, drive_id = excluded.drive_id,
    situacao = case when adm_documentos.situacao = 'invalido' then 'invalido' else excluded.situacao end;
  get diagnostics n = row_count;

  -- Certificado ativo no Drive: implantação concluída (não mexe em "não se aplica")
  update public.adm_clientes c set certificado_digital = 'concluida'
  where coalesce(c.certificado_digital, 'pendente') in ('pendente', 'pdf_enviado')
    and exists (select 1 from public.adm_documentos d where d.cliente_id = c.id and d.tipo = 'certificado' and d.situacao = 'ativo');

  -- Varredura completa com certificados: quem estava concluído sem nenhum certificado ativo volta a pendente
  if exists (select 1 from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e where e->>'tipo' = 'certificado') then
    update public.adm_clientes c set certificado_digital = 'pendente'
    where c.certificado_digital = 'concluida'
      and not exists (select 1 from public.adm_documentos d where d.cliente_id = c.id and d.tipo = 'certificado' and d.situacao = 'ativo');
  end if;
  return n;
end
$$;
