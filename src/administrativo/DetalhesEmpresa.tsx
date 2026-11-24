import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, Download, Loader2, RefreshCw, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { consultarSerpro } from '../lib/cnpjSerpro'
import { camposDoCartao, consultarCnpj, enderecoTexto, type DadosCnpj } from '../lib/cnpj'
import { formatarData, formatarMoeda } from '../lib/format'
import { Info, Modal, Section } from '../components/ui'
import type { Socio } from '../types'
import { INSCRICOES, REGIMES, SEGMENTOS, formatarCnpj, labelDe, type Cliente, type SocioCadastro } from './tipos'
import { SociosCadastro } from './SociosCadastro'
import { socioPorNome } from './socios'
import { baixarParaComputador } from './drive'
import { SenhaCertificado } from './Cofre'
import { clientesComSenha, useSocio } from './cofre'

interface Doc {
  tipo: string
  nome: string
  url: string | null
  drive_id: string | null
  situacao: string
  validade: string | null
}

interface ProcessoSocios {
  id: string
  tipo: string
  data_inicio: string | null
  socios: Socio[] | null
}

const ROTULO_CAMPO: Record<string, string> = {
  razao_social: 'razão social',
  nome_fantasia: 'nome fantasia',
  data_abertura: 'data de abertura',
  endereco: 'endereço',
  situacao_cadastral: 'situação cadastral',
  email: 'e-mail',
  telefone: 'telefone',
}

const TIPO: Record<string, string> = { abertura: 'Abertura', alteracao: 'Alteração', baixa: 'Baixa' }
const mascaraCpf = (v: string) => {
  const d = (v ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : v
}

/** Detalhes do CNPJ consultados na Receita Federal + sócios do contrato social (processos do portal). */
/** Com `espelho` (Base do Societário): só leitura e sem consultar a Receita (os dados vêm do cadastro). */
export function DetalhesEmpresa({
  cliente,
  onClose,
  onAtualizado,
  espelho = false,
}: {
  cliente: Cliente
  onClose: () => void
  onAtualizado: () => void
  espelho?: boolean
}) {
  const [dados, setDados] = useState<DadosCnpj | null>(null)
  const [carregando, setCarregando] = useState(!espelho)
  const socio = useSocio()
  const [temSenha, setTemSenha] = useState<boolean | null>(null)
  const verSenha = useCallback(() => {
    clientesComSenha().then((s) => setTemSenha(s.has(cliente.id)))
  }, [cliente.id])
  useEffect(() => {
    if (socio && !espelho) verSenha()
  }, [socio, espelho, verSenha])
  const [erro, setErro] = useState<string | null>(null)
  const [processos, setProcessos] = useState<ProcessoSocios[]>([])
  const [gravando, setGravando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [sociosCad, setSociosCad] = useState<SocioCadastro[]>(cliente.socios ?? [])
  const [documentos, setDocumentos] = useState<Doc[]>([])
  const [baixando, setBaixando] = useState<string | null>(null)

  async function baixar(d: Doc) {
    if (!d.drive_id) return
    setBaixando(d.nome)
    try {
      await baixarParaComputador(d.drive_id)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setBaixando(null)
  }

  useEffect(() => {
    supabase
      .from('adm_documentos')
      .select('tipo, nome, url, drive_id, situacao, validade')
      .eq('cliente_id', cliente.id)
      .order('nome')
      .then(({ data }) => setDocumentos((data as Doc[]) ?? []))
  }, [cliente.id])

  const consultar = useCallback(
    async (sinal?: AbortSignal) => {
      if (!cliente.cnpj) {
        setCarregando(false)
        setErro('Cliente sem CNPJ cadastrado. Informe o CNPJ no cadastro (lápis) para consultar a Receita.')
        return
      }
      setCarregando(true)
      setErro(null)
      try {
        setDados(await consultarCnpj(cliente.cnpj, sinal, { serpro: consultarSerpro }))
      } catch (e) {
        if (!sinal?.aborted) setErro(e instanceof Error ? e.message : String(e))
      } finally {
        if (!sinal?.aborted) setCarregando(false)
      }
    },
    [cliente.cnpj],
  )

  useEffect(() => {
    const ctrl = new AbortController()
    // Espelho do Societário: não consulta a Receita (evita custo da API)
    if (!espelho) consultar(ctrl.signal)
    if (cliente.cnpj) {
      const c = cliente.cnpj
      const comMascara = formatarCnpj(c)
      supabase
        .from('soc_processos')
        .select('id, tipo, data_inicio, socios')
        .in('cnpj', [c, comMascara])
        .order('data_inicio', { ascending: false })
        .then(({ data }) => setProcessos(((data as ProcessoSocios[]) ?? []).filter((p) => p.socios?.some((s) => s.nome?.trim()))))
    }
    return () => ctrl.abort()
  }, [consultar, cliente.cnpj, espelho])

  // Campos do cadastro que diferem do Cartão CNPJ (Receita)
  const mudancas: Record<string, string | null> = {}
  if (dados) {
    for (const [k, v] of Object.entries(camposDoCartao(dados))) {
      if (v !== undefined && v !== (cliente[k as keyof Cliente] ?? null)) mudancas[k] = v
    }
  }
  const nMudancas = Object.keys(mudancas).length

  async function atualizarCadastro() {
    setGravando(true)
    const { error } = await supabase
      .from('adm_clientes')
      .update({ ...mudancas, receita_atualizada_em: new Date().toISOString() })
      .eq('id', cliente.id)
    setGravando(false)
    if (error) return setErro(error.message)
    setAviso('Cadastro atualizado com os dados da Receita.')
    onAtualizado()
  }

  const contrato = processos[0]

  return (
    <Modal
      title={cliente.razao_social}
      subtitulo={`Detalhes da empresa · CNPJ ${formatarCnpj(cliente.cnpj) || 'não informado'}`}
      onClose={onClose}
      largura="max-w-5xl"
    >
      {aviso && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{aviso}</p>}

      <Section
        title={espelho ? 'Dados do cadastro' : 'Dados da Receita Federal'}
        icone={Building2}
        actions={
          espelho ? undefined : (
            <button className="btn-secondary btn-sm" onClick={() => consultar()} disabled={carregando}>
              <RefreshCw className={`h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} />
              Consultar de novo
            </button>
          )
        }
      >
        {espelho && (
          <div className="mb-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="CNPJ" value={<span className="font-mono">{formatarCnpj(cliente.cnpj)}</span>} />
            <Info label="Razão social" value={cliente.razao_social} />
            <Info label="Nome fantasia" value={cliente.nome_fantasia} />
            <Info label="Situação cadastral" value={cliente.situacao_cadastral} />
            <Info label="Abertura" value={cliente.data_abertura ? formatarData(cliente.data_abertura) : null} />
            <Info label="Responsável legal" value={cliente.responsavel} />
            <Info label="Endereço" value={cliente.endereco} className="sm:col-span-2" />
            <Info label="E-mail" value={cliente.email} />
            <Info label="Telefone" value={cliente.telefone} />
            <Info label="Regime tributário" value={labelDe(REGIMES, cliente.regime_tributario)} />
            <Info label="Segmento" value={labelDe(SEGMENTOS, cliente.segmento)} />
          </div>
        )}
        {/* Inscrição vem do cadastro do cliente (a Receita não informa) */}
        <div className="mb-4 grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl bg-slate-50/70 px-4 py-3 ring-1 ring-slate-100 sm:grid-cols-3">
          <Info
            label="Tipo de inscrição"
            value={cliente.tipo_inscricao ? (INSCRICOES.find((i) => i.value === cliente.tipo_inscricao)?.label ?? cliente.tipo_inscricao) : 'Não informada'}
          />
          <Info label="Número da inscrição" value={cliente.inscricao ? <span className="font-mono">{cliente.inscricao}</span> : 'Não informado'} />
          <p className="self-center text-[0.6875rem] text-slate-400">
            {espelho
              ? 'Dados do cadastro do cliente (mantidos pelo Administrativo).'
              : 'Dados do cadastro do cliente. Para alterar, use o lápis na Base de Clientes.'}
          </p>
          {(['contrato', 'cartao', 'certificado'] as const).map((t) => {
            const ds = documentos.filter((d) => d.tipo === t && (t !== 'certificado' || d.situacao === 'ativo'))
            return (
              <Info
                key={t}
                label={t === 'contrato' ? 'Contrato Social / Inteiro Teor' : t === 'cartao' ? 'Cartão CNPJ' : 'Certificado digital (ativo)'}
                className="sm:col-span-3"
                value={
                  ds.length ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1">
                      {ds.map((d) => (
                        <span key={d.nome} className="inline-flex items-center gap-1">
                          {d.url ? (
                            <a href={d.url} target="_blank" rel="noreferrer" className="text-brand-700 underline hover:text-brand-900">
                              {d.nome}
                            </a>
                          ) : (
                            <span>{d.nome}</span>
                          )}
                          {t === 'certificado' && d.validade && <span className="text-xs text-slate-500">(vence {formatarData(d.validade)})</span>}
                          {d.drive_id && (
                            <button
                              className="icon-btn h-6 w-6"
                              onClick={() => baixar(d)}
                              disabled={baixando === d.nome}
                              title="Baixar o arquivo"
                              aria-label={`Baixar ${d.nome}`}
                            >
                              {baixando === d.nome ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="font-semibold text-amber-700">
                      {t === 'certificado' && cliente.certificado_digital === 'na'
                        ? 'Não se aplica'
                        : 'Pendente: não encontrado no Drive nem enviado pelo portal'}
                    </span>
                  )
                }
              />
            )
          })}
          {socio && !espelho && cliente.certificado_digital !== 'na' && temSenha !== null && (
            <Info
              label="Senha do certificado (cofre)"
              className="sm:col-span-3"
              value={<SenhaCertificado clienteId={cliente.id} tem={temSenha} onAlterado={verSenha} />}
            />
          )}
        </div>
        {carregando && <p className="py-6 text-center text-sm text-slate-400">Consultando a Receita Federal...</p>}
        {erro && !carregando && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
        {dados && !carregando && (
          <>
            {nMudancas > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
                <span>
                  O cadastro está diferente da Receita em:{' '}
                  <b>
                    {Object.keys(mudancas)
                      .map((k) => ROTULO_CAMPO[k] ?? k)
                      .join(', ')}
                  </b>
                  .
                </span>
                <button className="btn-primary btn-sm" onClick={atualizarCadastro} disabled={gravando}>
                  <Check className="h-3.5 w-3.5" />
                  {gravando ? 'Atualizando...' : 'Atualizar cadastro'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="CNPJ" value={<span className="font-mono">{formatarCnpj(dados.cnpj)}</span>} />
              <Info label="Razão social" value={dados.razaoSocial} />
              <Info label="Nome fantasia" value={dados.nomeFantasia} />
              <Info
                label="Situação cadastral"
                value={
                  dados.situacao && (
                    <span className={dados.situacao.toUpperCase() === 'ATIVA' ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-600'}>
                      {dados.situacao}
                      {dados.dataSituacao ? ` desde ${formatarData(dados.dataSituacao)}` : ''}
                    </span>
                  )
                }
              />
              <Info label="Abertura" value={dados.abertura ? formatarData(dados.abertura) : null} />
              <Info label="Natureza jurídica" value={dados.naturezaJuridica} />
              <Info label="Endereço" value={enderecoTexto(dados.endereco)} className="sm:col-span-2" />
              <Info label="Porte" value={dados.porte} />
              <Info label="E-mail" value={dados.email} />
              <Info label="Telefone" value={dados.telefones.join(' · ')} />
              <Info label="Capital social" value={dados.capitalSocial !== null ? formatarMoeda(dados.capitalSocial) : null} />
              <Info
                label="Simples Nacional / MEI"
                value={dados.simples === null ? null : `${dados.simples ? 'Optante do Simples' : 'Não optante do Simples'}${dados.mei ? ' · MEI' : ''}`}
              />
              <Info label="Atividade principal" value={dados.atividadePrincipal} className="sm:col-span-2" />
              {dados.atividadesSecundarias.length > 0 && (
                <Info
                  label={`Atividades secundárias (${dados.atividadesSecundarias.length})`}
                  className="sm:col-span-2 lg:col-span-3"
                  value={
                    <ul className="list-disc space-y-0.5 pl-4 text-[0.8125rem] font-normal text-slate-700">
                      {dados.atividadesSecundarias.map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  }
                />
              )}
            </div>
            <p className="mt-4 text-[0.6875rem] text-slate-400">
              {dados.fonte === 'Serpro'
                ? 'Fonte: Serpro (API Consulta CNPJ), dados atualizados da Receita Federal.'
                : `Fonte: ${dados.fonte}, com dados abertos da Receita Federal (atualização mensal).`}
            </p>
          </>
        )}
      </Section>

      <Section title="Sócios" icone={Users} cor="violet">
        <SociosCadastro
          somenteLeitura={espelho}
          cliente={{ ...cliente, socios: sociosCad }}
          onSalvo={(s) => {
            setSociosCad(s)
            setAviso('Sócios salvos no cadastro.')
            onAtualizado()
          }}
        />
        {!espelho && <h4 className="mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">Quadro societário na Receita Federal</h4>}
        {espelho ? null : dados?.socios.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="py-1.5 pr-3">Nome</th>
                  <th className="px-3 py-1.5">Qualificação</th>
                  <th className="px-3 py-1.5">CPF/CNPJ</th>
                  <th className="py-1.5 pl-3">Entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dados.socios.map((s, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 font-semibold text-slate-800">{s.nome}</td>
                    <td className="px-3 py-2 text-slate-600">{s.qualificacao ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {socioPorNome(sociosCad, s.nome)?.cpf ? (
                        <span className="text-slate-800" title="CPF informado no cadastro">
                          {socioPorNome(sociosCad, s.nome)!.cpf}
                        </span>
                      ) : (
                        (s.documento ?? '—')
                      )}
                    </td>
                    <td className="py-2 pl-3 whitespace-nowrap text-slate-600">{s.desde ? formatarData(s.desde) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[0.6875rem] text-slate-400">
              A Receita não divulga o CPF completo dos sócios. Quando o CPF foi informado no cadastro (acima), ele aparece aqui.
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">{carregando ? 'Consultando...' : 'Sem sócios informados pela Receita (ex.: empresário individual / MEI).'}</p>
        )}

        <h4 className="mt-5 mb-2 text-xs font-bold tracking-wide text-slate-500 uppercase">
          Sócios no contrato social
          {contrato && (
            <span className="ml-1 font-medium tracking-normal normal-case">
              · processo de {TIPO[contrato.tipo] ?? contrato.tipo} {contrato.data_inicio ? `de ${formatarData(contrato.data_inicio)}` : ''} em Processos
              Societários
            </span>
          )}
        </h4>
        {contrato ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {contrato
              .socios!.filter((s) => s.nome?.trim())
              .map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                  <div className="font-bold text-slate-800">{s.nome.toUpperCase()}</div>
                  <div className="text-xs text-slate-500">
                    {[i === 0 && contrato.tipo === 'abertura' ? 'Responsável legal' : null, s.qualificacao].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <Info label="CPF" value={s.cpf ? <span className="font-mono">{mascaraCpf(s.cpf)}</span> : null} />
                    <Info label="Nascimento" value={s.data_nascimento ? formatarData(s.data_nascimento) : null} />
                    <Info label="E-mail" value={s.email} />
                    <Info label="Telefone" value={s.telefone} />
                    <Info label="Estado civil" value={[s.estado_civil, s.regime_bens].filter(Boolean).join(' · ')} />
                    <Info label="Profissão" value={s.profissao} />
                    <Info
                      label="Endereço"
                      value={[s.endereco, s.numero, s.complemento].filter(Boolean).join(', ') + (s.cep ? ` - CEP ${s.cep}` : '')}
                      className="col-span-2"
                    />
                  </div>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Nenhum processo deste CNPJ em Processos Societários com os dados dos sócios.</p>
        )}
      </Section>
    </Modal>
  )
}
