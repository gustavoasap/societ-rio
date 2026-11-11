// Consulta de CNPJ (dados da Receita Federal).
// 1ª opção (quando contratado): Serpro, pela função do servidor — dados atualizados.
// Reserva gratuita: Minha Receita, BrasilAPI e CNPJá (dados abertos, atualização mensal).

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
  fonte: 'Serpro' | 'Minha Receita' | 'BrasilAPI' | 'CNPJá'
}

const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
function iso(v: unknown) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  if (/^\d{8}$/.test(t)) return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}`
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null
}

function telefoneBR(v: string | null | undefined) {
  const d = (v ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  const n = d.length > 11 ? d.slice(-11) : d
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
}

type Obj = Record<string, unknown>

/** Converte a resposta da BrasilAPI (/api/cnpj/v1/{cnpj}) — mesmo formato da Minha Receita. */
export function deBrasilApi(d: Obj, fonte: DadosCnpj['fonte'] = 'BrasilAPI'): DadosCnpj {
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
    fonte,
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

const SITUACAO_SERPRO: Record<string, string> = { '1': 'NULA', '2': 'ATIVA', '3': 'SUSPENSA', '4': 'INAPTA', '8': 'BAIXADA' }
const PORTE_SERPRO: Record<string, string> = { '00': 'NÃO INFORMADO', '01': 'MICRO EMPRESA', '03': 'EMPRESA DE PEQUENO PORTE', '05': 'DEMAIS' }
// Qualificações de sócio mais comuns (tabela da Receita)
const QUALIFICACAO: Record<string, string> = {
  '05': 'Administrador',
  '08': 'Conselheiro de Administração',
  '10': 'Diretor',
  '16': 'Presidente',
  '17': 'Procurador',
  '22': 'Sócio',
  '28': 'Sócio-Gerente',
  '37': 'Sócio Pessoa Jurídica Domiciliado no Exterior',
  '38': 'Sócio Pessoa Física Residente no Exterior',
  '49': 'Sócio-Administrador',
  '50': 'Empresário',
  '54': 'Fundador',
  '65': 'Titular Pessoa Física Residente ou Domiciliado no Brasil',
}

const codDesc = (v: unknown, mapa?: Record<string, string>) => {
  if (v && typeof v === 'object') {
    const o = v as Obj
    const cod = txt(String(o.codigo ?? '')) ?? null
    const desc = txt(o.descricao) ?? (cod && mapa ? (mapa[cod] ?? mapa[cod.padStart(2, '0')] ?? null) : null)
    return { cod, desc }
  }
  const cod = txt(typeof v === 'number' ? String(v) : v)
  return { cod, desc: cod && mapa ? (mapa[cod] ?? mapa[cod.padStart(2, '0')] ?? null) : null }
}
const simNao = (v: unknown) => (v === true || v === 'S' || v === 'SIM' ? true : v === false || v === 'N' || v === 'NAO' || v === 'NÃO' ? false : null)

/** Converte a resposta da API Consulta CNPJ do Serpro (v2: basica, qsa ou empresa). */
export function deSerpro(d: Obj): DadosCnpj {
  const end = (d.endereco ?? {}) as Obj
  const mun = codDesc(end.municipio)
  const sit = (d.situacaoCadastral ?? {}) as Obj
  const nat = codDesc(d.naturezaJuridica)
  const cnae = codDesc(d.cnaePrincipal)
  const sec = Array.isArray(d.cnaeSecundarias) ? (d.cnaeSecundarias as unknown[]) : []
  const tels = Array.isArray(d.telefones) ? (d.telefones as Obj[]) : []
  const socios = Array.isArray(d.socios) ? (d.socios as Obj[]) : []
  const info = (d.informacoesAdicionais ?? {}) as Obj
  const tipoLog = txt(end.tipoLogradouro)
  const log = txt(end.logradouro)
  const capital = typeof d.capitalSocial === 'number' ? d.capitalSocial : Number(String(d.capitalSocial ?? '').replace(',', '.'))
  const porte = codDesc(d.porte, PORTE_SERPRO)
  const situacao = codDesc(sit.codigo !== undefined ? sit.codigo : d.situacaoCadastral, SITUACAO_SERPRO)
  return {
    cnpj: String(d.ni ?? d.cnpj ?? '').replace(/\D/g, ''),
    razaoSocial: txt(d.nomeEmpresarial) ?? '',
    nomeFantasia: txt(d.nomeFantasia),
    situacao: txt(sit.descricao) ?? situacao.desc ?? situacao.cod,
    dataSituacao: iso(sit.data),
    abertura: iso(d.dataAbertura),
    naturezaJuridica: nat.cod ? `${nat.cod}${nat.desc ? ` - ${nat.desc}` : ''}` : nat.desc,
    porte: porte.desc ?? porte.cod,
    capitalSocial: d.capitalSocial !== undefined && d.capitalSocial !== null && Number.isFinite(capital) ? capital : null,
    simples: simNao(info.optanteSimples ?? d.optanteSimples),
    mei: simNao(info.optanteMei ?? d.optanteMei),
    atividadePrincipal: cnae.cod ? `${cnae.cod}${cnae.desc ? ` - ${cnae.desc}` : ''}` : null,
    atividadesSecundarias: sec
      .map((c) => codDesc(c))
      .filter((c) => c.cod && Number(c.cod) !== 0)
      .map((c) => `${c.cod}${c.desc ? ` - ${c.desc}` : ''}`),
    endereco: {
      logradouro: log ? (tipoLog && !log.toUpperCase().startsWith(tipoLog.toUpperCase()) ? `${tipoLog} ${log}` : log) : null,
      numero: txt(end.numero),
      complemento: txt(end.complemento),
      bairro: txt(end.bairro),
      municipio: mun.desc ?? mun.cod,
      uf: txt(end.uf),
      cep: txt(end.cep),
    },
    telefones: tels.map((t) => telefoneBR(`${t.ddd ?? ''}${t.numero ?? ''}`)).filter((t): t is string => !!t),
    email: txt(d.correioEletronico)?.toLowerCase() ?? null,
    socios: socios.map((s) => {
      const q = codDesc(s.qualificacao, QUALIFICACAO)
      return {
        nome: txt(s.nome) ?? '',
        documento: txt(s.cpf) ?? txt(s.cnpj) ?? txt(s.ni),
        qualificacao: q.desc ?? q.cod,
        desde: iso(s.dataInclusao),
        faixaEtaria: txt(s.faixaEtaria),
      }
    }),
    fonte: 'Serpro',
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

const FONTES: { nome: DadosCnpj['fonte']; url: (c: string) => string; ler: (d: Obj) => DadosCnpj; lenta?: boolean }[] = [
  { nome: 'Minha Receita', url: (c) => `https://minhareceita.org/${c}`, ler: (d) => deBrasilApi(d, 'Minha Receita') },
  { nome: 'BrasilAPI', url: (c) => `https://brasilapi.com.br/api/cnpj/v1/${c}`, ler: (d) => deBrasilApi(d, 'BrasilAPI') },
  // A CNPJá aberta permite poucas consultas por minuto: só como reserva
  { nome: 'CNPJá', url: (c) => `https://open.cnpja.com/office/${c}`, ler: deCnpja, lenta: true },
]

/** Consulta no Serpro: devolve null quando não está contratado/configurado. */
export type ConsultaSerpro = (cnpj: string, sinal?: AbortSignal) => Promise<DadosCnpj | null>

/**
 * Consulta o CNPJ (14 dígitos) nas fontes públicas da Receita, em ordem. Se a primeira resposta
 * vier sem e-mail ou telefone, tenta completar com as outras (o Cartão CNPJ traz esses dados).
 * `emLote`: não usa a fonte lenta só para completar e-mail (evita bloqueio em consultas em massa).
 */
export async function consultarCnpj(
  cnpj: string,
  sinal?: AbortSignal,
  { emLote = false, serpro }: { emLote?: boolean; serpro?: ConsultaSerpro } = {},
): Promise<DadosCnpj> {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14) throw new Error('CNPJ precisa ter 14 dígitos.')
  // Serpro (pago, atualizado): se não estiver contratado ou falhar, segue para as fontes gratuitas
  if (serpro) {
    try {
      const r = await serpro(d, sinal)
      if (r) return r
    } catch (e) {
      if (sinal?.aborted) throw e
      if (e instanceof Error && e.message.startsWith('CNPJ não encontrado')) throw e
    }
  }
  let dados: DadosCnpj | null = null
  let ultimoErro: unknown = null
  for (const f of FONTES) {
    if (dados && dados.email && dados.telefones.length) break
    if (dados && f.lenta && emLote) break
    try {
      const r = f.ler(await obter(f.url(d), sinal))
      const atual = dados as DadosCnpj | null
      dados = !atual
        ? r
        : {
            ...atual,
            email: atual.email ?? r.email,
            telefones: atual.telefones.length ? atual.telefones : r.telefones,
          }
    } catch (e) {
      if (sinal?.aborted) throw e
      if (e instanceof Error && e.message.startsWith('CNPJ não encontrado') && !dados) throw e
      ultimoErro = e
    }
  }
  if (dados) return dados
  throw new Error(`Não foi possível consultar a Receita agora (${ultimoErro instanceof Error ? ultimoErro.message : 'erro'}). Tente novamente em instantes.`)
}

/** Campos do cadastro do cliente preenchidos com os dados da Receita (Cartão CNPJ). */
export function camposDoCartao(d: DadosCnpj) {
  return {
    razao_social: d.razaoSocial.toUpperCase(),
    nome_fantasia: d.nomeFantasia ? d.nomeFantasia.toUpperCase() : null,
    data_abertura: d.abertura,
    endereco: enderecoTexto(d.endereco) || null,
    situacao_cadastral: d.situacao ? d.situacao.toUpperCase() : null,
    // E-mail e telefone só são trocados quando a Receita informa (não apaga o que já existe)
    ...(d.email ? { email: d.email } : {}),
    ...(d.telefones[0] ? { telefone: d.telefones[0] } : {}),
  }
}
