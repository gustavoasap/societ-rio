// Consulta pública de CNPJ (dados da Receita Federal) direto do navegador.
// 1ª opção: BrasilAPI; se falhar, CNPJá (open). As duas liberam acesso do navegador (CORS).

export interface SocioReceita {
  nome: string
  documento: string | null
  qualificacao: string | null
  desde: string | null
  faixaEtaria: string | null
}

export interface DadosCnpj {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  situacao: string | null
  dataSituacao: string | null
  abertura: string | null
  naturezaJuridica: string | null
  porte: string | null
  capitalSocial: number | null
  simples: boolean | null
  mei: boolean | null
  atividadePrincipal: string | null
  atividadesSecundarias: string[]
  endereco: {
    logradouro: string | null
    numero: string | null
    complemento: string | null
    bairro: string | null
    municipio: string | null
    uf: string | null
    cep: string | null
  }
  telefones: string[]
  email: string | null
  socios: SocioReceita[]
  fonte: 'BrasilAPI' | 'CNPJá'
}

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const iso = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)

function telefoneBR(v: string | null | undefined) {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  const n = d.length > 11 ? d.slice(-11) : d
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
}

type Obj = Record<string, unknown>

/** Converte a resposta da BrasilAPI (/api/cnpj/v1/{cnpj}). */
export function deBrasilApi(d: Obj): DadosCnpj {
  const qsa = Array.isArray(d.qsa) ? (d.qsa as Obj[]) : []
  const sec = Array.isArray(d.cnaes_secundarios) ? (d.cnaes_secundarios as Obj[]) : []
  const tipoLog = txt(d.descricao_tipo_de_logradouro)
  const log = txt(d.logradouro)
  return {
    cnpj: String(d.cnpj ?? '').replace(/\D/g, ''),
    razaoSocial: txt(d.razao_social) ?? '',
    nomeFantasia: txt(d.nome_fantasia),
    situacao: txt(d.descricao_situacao_cadastral),
    dataSituacao: iso(d.data_situacao_cadastral),
    abertura: iso(d.data_inicio_atividade),
    naturezaJuridica: txt(d.natureza_juridica),
    porte: txt(d.porte) ?? txt(d.descricao_porte),
    capitalSocial: typeof d.capital_social === 'number' ? d.capital_social : null,
    simples: typeof d.opcao_pelo_simples === 'boolean' ? d.opcao_pelo_simples : null,
    mei: typeof d.opcao_pelo_mei === 'boolean' ? d.opcao_pelo_mei : null,
    atividadePrincipal: d.cnae_fiscal ? `${d.cnae_fiscal} - ${txt(d.cnae_fiscal_descricao) ?? ''}`.trim() : null,
    atividadesSecundarias: sec.filter((c) => c.codigo && Number(c.codigo) !== 0).map((c) => `${c.codigo} - ${txt(c.descricao) ?? ''}`),
    endereco: {
      logradouro: log ? (tipoLog && !log.toUpperCase().startsWith(tipoLog.toUpperCase()) ? `${tipoLog} ${log}` : log) : null,
      numero: txt(d.numero),
      complemento: txt(d.complemento),
      bairro: txt(d.bairro),
      municipio: txt(d.municipio),
      uf: txt(d.uf),
      cep: txt(d.cep),
    },
    telefones: [telefoneBR(txt(d.ddd_telefone_1)), telefoneBR(txt(d.ddd_telefone_2))].filter((t): t is string => !!t),
    email: txt(d.email)?.toLowerCase() ?? null,
    socios: qsa.map((s) => ({
      nome: txt(s.nome_socio) ?? '',
      documento: txt(s.cnpj_cpf_do_socio),
      qualificacao: txt(s.qualificacao_socio),
      desde: iso(s.data_entrada_sociedade),
      faixaEtaria: txt(s.faixa_etaria),
    })),
    fonte: 'BrasilAPI',
  }
}

/** Converte a resposta da CNPJá open (/office/{cnpj}). */
export function deCnpja(d: Obj): DadosCnpj {
  const company = (d.company ?? {}) as Obj
  const addr = (d.address ?? {}) as Obj
  const nat = (company.nature ?? {}) as Obj
  const size = (company.size ?? {}) as Obj
  const status = (d.status ?? {}) as Obj
  const main = (d.mainActivity ?? {}) as Obj
  const sec = Array.isArray(d.sideActivities) ? (d.sideActivities as Obj[]) : []
  const phones = Array.isArray(d.phones) ? (d.phones as Obj[]) : []
  const emails = Array.isArray(d.emails) ? (d.emails as Obj[]) : []
  const members = Array.isArray(company.members) ? (company.members as Obj[]) : []
  const simples = (company.simples ?? {}) as Obj
  const simei = (company.simei ?? {}) as Obj
  return {
    cnpj: String(d.taxId ?? '').replace(/\D/g, ''),
    razaoSocial: txt(company.name) ?? '',
    nomeFantasia: txt(d.alias),
    situacao: txt(status.text),
    dataSituacao: iso(d.statusDate),
    abertura: iso(d.founded),
    naturezaJuridica: nat.id ? `${nat.id} - ${txt(nat.text) ?? ''}` : txt(nat.text),
    porte: txt(size.text),
    capitalSocial: typeof company.equity === 'number' ? company.equity : null,
    simples: typeof simples.optant === 'boolean' ? simples.optant : null,
    mei: typeof simei.optant === 'boolean' ? simei.optant : null,
    atividadePrincipal: main.id ? `${main.id} - ${txt(main.text) ?? ''}` : null,
    atividadesSecundarias: sec.map((a) => `${a.id} - ${txt(a.text) ?? ''}`),
    endereco: {
      logradouro: txt(addr.street),
      numero: txt(addr.number),
      complemento: txt(addr.details),
      bairro: txt(addr.district),
      municipio: txt(addr.city),
      uf: txt(addr.state),
      cep: txt(addr.zip),
    },
    telefones: phones.map((p) => telefoneBR(`${p.area ?? ''}${p.number ?? ''}`)).filter((t): t is string => !!t),
    email: txt(emails[0]?.address)?.toLowerCase() ?? null,
    socios: members.map((m) => {
      const person = (m.person ?? {}) as Obj
      const role = (m.role ?? {}) as Obj
      return { nome: txt(person.name) ?? '', documento: txt(person.taxId), qualificacao: txt(role.text), desde: iso(m.since), faixaEtaria: txt(person.age) }
    }),
    fonte: 'CNPJá',
  }
}

export function enderecoTexto(e: DadosCnpj['endereco']) {
  const cep = e.cep?.replace(/\D/g, '')
  return [
    [e.logradouro, e.numero].filter(Boolean).join(', '),
    e.complemento,
    e.bairro,
    [e.municipio, e.uf].filter(Boolean).join('/'),
    cep && cep.length === 8 ? `CEP ${cep.slice(0, 5)}-${cep.slice(5)}` : null,
  ]
    .filter(Boolean)
    .join(' - ')
}

async function obter(url: string, sinal?: AbortSignal) {
  const r = await fetch(url, { signal: sinal, headers: { Accept: 'application/json' } })
  if (r.status === 404) throw new Error('CNPJ não encontrado na Receita Federal.')
  if (!r.ok) throw new Error(`Serviço respondeu ${r.status}`)
  return (await r.json()) as Obj
}

/** Consulta o CNPJ (14 dígitos). Tenta a BrasilAPI e, se falhar, a CNPJá. */
export async function consultarCnpj(cnpj: string, sinal?: AbortSignal): Promise<DadosCnpj> {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) throw new Error('CNPJ precisa ter 14 dígitos.')
  try {
    return deBrasilApi(await obter(`https://brasilapi.com.br/api/cnpj/v1/${d}`, sinal))
  } catch (e1) {
    if (sinal?.aborted) throw e1
    if (e1 instanceof Error && e1.message.startsWith('CNPJ não encontrado')) throw e1
    try {
      return deCnpja(await obter(`https://open.cnpja.com/office/${d}`, sinal))
    } catch (e2) {
      if (sinal?.aborted) throw e2
      throw new Error(`Não foi possível consultar a Receita agora (${e2 instanceof Error ? e2.message : 'erro'}). Tente novamente em instantes.`)
    }
  }
}
