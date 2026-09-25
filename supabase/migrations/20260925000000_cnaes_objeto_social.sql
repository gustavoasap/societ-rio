-- Modelos de objeto social e blocos de CNAEs pré-definidos

create table if not exists public.soc_objetos_sociais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  texto text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.soc_blocos_cnae (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnae_principal text,
  cnaes_secundarios text[] not null default '{}',
  objeto_social_id uuid references public.soc_objetos_sociais(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.soc_processos
  add column if not exists objeto_social text,
  add column if not exists bloco_cnae_id uuid references public.soc_blocos_cnae(id) on delete set null;

alter table public.soc_objetos_sociais enable row level security;
alter table public.soc_blocos_cnae enable row level security;

drop policy if exists "equipe acessa objetos sociais" on public.soc_objetos_sociais;
create policy "equipe acessa objetos sociais" on public.soc_objetos_sociais
  for all to authenticated using (true) with check (true);

drop policy if exists "equipe acessa blocos cnae" on public.soc_blocos_cnae;
create policy "equipe acessa blocos cnae" on public.soc_blocos_cnae
  for all to authenticated using (true) with check (true);

-- Modelo inicial: CNAEs WAY
with objeto as (
  insert into public.soc_objetos_sociais (nome, texto)
  select 'Objeto Social WAY', 'A SOCIEDADE TERA COMO OBJETO SOCIAL O COMERCIO VAREJISTA EM LOJAS DE VARIEDADES POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE PECAS E ACESSORIOS PARA MOTOCICLETAS E MOTONETAS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE PRODUTOS ALIMENTICIOS EM GERAL E DE PRODUTOS ALIMENTICIOS NAO ESPECIFICADOS ANTERIORMENTE POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE MOVEIS E ARTIGOS DE COLCHOARIA POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE MATERIAIS DE CONSTRUCAO EM GERAL POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA ESPECIALIZADO DE ELETRODOMESTICOS EQUIPAMENTOS ELETRICOS E ELETRONICOS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE MATERIAIS ELETRICOS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE ARTIGOS DE CAMA MESA E BANHO POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE TAPETES CORTINAS PERSIANAS E ARTIGOS DE TAPECARIA POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE ARTIGOS DE MADEIRA POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE OUTROS ARTIGOS DE USO DOMESTICO NAO ESPECIFICADOS ANTERIORMENTE POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE LIVROS JORNAIS REVISTAS E ARTIGOS DE PAPELARIA POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE JORNAIS E REVISTAS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE BRINQUEDOS E ARTIGOS RECREATIVOS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE DISCOS CDS DVDS E FITAS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE INSTRUMENTOS MUSICAIS E ACESSORIOS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA DE ARTIGOS DO VESTUARIO E ACESSORIOS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. O COMERCIO VAREJISTA AMBULANTE DE PRODUTOS ALIMENTICIOS. O COMERCIO VAREJISTA AMBULANTE DE PRODUTOS DO VESTUARIO. O COMERCIO VAREJISTA DE SUVENIRES BIJUTERIAS E ARTESANATOS POR MEIO DE LOJA FISICA E COMERCIO ELETRONICO E ECOMMERCE. A SOCIEDADE PODERA EXERCER ATIVIDADES CORRELATAS COMPLEMENTARES E ACESSORIAS AS DESCRITAS.'
  where not exists (select 1 from public.soc_objetos_sociais where nome = 'Objeto Social WAY')
  returning id
)
insert into public.soc_blocos_cnae (nome, cnae_principal, cnaes_secundarios, objeto_social_id)
select 'CNAEs WAY', '4713-0-02', array[
  '4541-2-06', '4729-6-99', '4751-2-01', '4752-1-00', '4753-9-00', '4754-7-03', '4755-5-02', '4755-5-03',
  '4756-3-00', '4759-8-99', '4761-0-01', '4761-0-03', '4763-6-01', '4763-6-02', '4763-6-03', '4772-5-00',
  '4781-4-00', '4782-2-01', '4789-0-01', '4789-0-04', '4789-0-07', '4789-0-08'
], (select id from objeto)
where not exists (select 1 from public.soc_blocos_cnae where nome = 'CNAEs WAY');
