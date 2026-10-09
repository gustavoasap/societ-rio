import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AlertTriangle, Building2, CalendarX2, FileSignature, House, LogOut, MapPin, Pencil, Receipt, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Link } from '../../lib/rotas'
import { comRetentativa } from '../../lib/retentar'
import { formatarData, mascaraCnpj } from '../../lib/format'
import { Badge, Select } from '../../components/ui'
import { LegalizacaoForm } from './LegalizacaoForm'
import {
  STATUS_IM,
  STATUS_LICENCIAMENTO,
  STATUS_PROCURACAO,
  STATUS_TFE,
  corDe,
  legalizacaoVazia,
  situacaoValidade,
  type ClienteBase,
  type Legalizacao as RegistroLegalizacao,
  type Tfe,
} from './tipos'

// Cores das caixas de seleção de status na lista
const COR_SELECT: Record<string, string> = {
  pendente: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300',
  andamento: 'border-brand-200 bg-brand-50 text-brand-700 hover:border-brand-300',
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300',
  vencida: 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300',
  atrasado: 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300',
  neutro: 'border-slate-200 bg-slate-50 text-slate-600',
}
const classeSelect = (cor: string) => `rounded-full border py-1 pl-2.5 text-[0.8125rem] font-semibold outline-none transition ${COR_SELECT[cor] ?? COR_SELECT.neutro}`

type Campo = 'procuracao_status' | 'licenciamento_status' | 'im_status'

type Filtro = '' | 'procuracao' | 'licenca_alerta' | 'im_pendente' | 'tfe_atrasada' | 'sem_ie'

export function Legalizacao({ session }: { session: Session }) {
  const [clientes, setClientes] = useState<ClienteBase[]>([])
  const [registros, setRegistros] = useState<Map<string, RegistroLegalizacao>>(new Map())
  const [tfes, setTfes] = useState<Tfe[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('')
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false)
  const [editando, setEditando] = useState<ClienteBase | null>(null)

  const carregar = useCallback(async () => {
    const [cli, leg, tf] = await comRetentativa(() =>
      Promise.all([
        supabase.from('adm_clientes').select('id, codigo, cnpj, razao_social, nome_fantasia, status, data_abertura').order('codigo'),
        supabase.from('soc_legalizacao').select('*'),
        supabase.from('soc_legalizacao_tfe').select('*'),
      ]),
    )
    setErro(cli.error?.message ?? leg.error?.message ?? tf.error?.message ?? null)
    setClientes((cli.data as ClienteBase[]) ?? [])
    setRegistros(new Map(((leg.data as RegistroLegalizacao[]) ?? []).map((r) => [r.cliente_id, r])))
    setTfes((tf.data as Tfe[]) ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Mudança de status direto na lista: grava só o campo alterado (cria o registro se ainda não existir)
  async function salvarCampo(clienteId: string, campo: Campo, valor: string) {
    setRegistros((m) => new Map(m).set(clienteId, { ...(m.get(clienteId) ?? legalizacaoVazia(clienteId)), [campo]: valor }))
    const { error } = await supabase.from('soc_legalizacao').upsert({ cliente_id: clienteId, [campo]: valor })
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  async function salvarTfe(clienteId: string, ano: number, status: Tfe['status']) {
    setTfes((lista) => [...lista.filter((t) => !(t.cliente_id === clienteId && t.ano === ano)), { cliente_id: clienteId, ano, status }])
    const { error } = await supabase.from('soc_legalizacao_tfe').upsert({ cliente_id: clienteId, ano, status })
    if (error) {
      setErro(error.message)
      carregar()
    }
  }

  const anoAtual = new Date().getFullYear()
  const registroDe = useCallback((id: string) => registros.get(id) ?? legalizacaoVazia(id), [registros])
  const tfesDe = useCallback((id: string) => tfes.filter((t) => t.cliente_id === id), [tfes])

  const ativos = useMemo(() => clientes.filter((c) => mostrarEncerrados || c.status !== 'encerrado'), [clientes, mostrarEncerrados])

  const alertas = useMemo(() => {
    const procuracao = ativos.filter((c) => registroDe(c.id).procuracao_status !== 'ok').length
    const licenca = ativos.filter((c) => ['vencida', 'vence_em_breve'].includes(situacaoValidade(registroDe(c.id).licenciamento_validade))).length
    const im = ativos.filter((c) => registroDe(c.id).im_status !== 'liberada').length
    const tfe = ativos.filter((c) => tfesDe(c.id).some((t) => t.status === 'pagamento_atrasado')).length
    const semIe = ativos.filter((c) => !registroDe(c.id).ie_numero).length
    return { procuracao, licenca, im, tfe, semIe }
  }, [ativos, registroDe, tfesDe])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const digitos = termo.replace(/\D/g, '')
    return ativos.filter((c) => {
      const r = registroDe(c.id)
      if (filtro === 'procuracao' && r.procuracao_status === 'ok') return false
      if (filtro === 'licenca_alerta' && !['vencida', 'vence_em_breve'].includes(situacaoValidade(r.licenciamento_validade))) return false
      if (filtro === 'im_pendente' && r.im_status === 'liberada') return false
      if (filtro === 'tfe_atrasada' && !tfesDe(c.id).some((t) => t.status === 'pagamento_atrasado')) return false
      if (filtro === 'sem_ie' && r.ie_numero) return false
      if (!termo) return true
      const texto = [c.razao_social, c.nome_fantasia, r.ie_numero, r.im_numero, r.im_municipio, String(c.codigo)].filter(Boolean).join(' ').toLowerCase()
      return texto.includes(termo) || (digitos.length >= 3 && (c.cnpj ?? '').includes(digitos))
    })
  }, [ativos, busca, filtro, registroDe, tfesDe])

  const cartoes: { id: Filtro; titulo: string; qtd: number; icone: typeof AlertTriangle; cor: string }[] = [
    { id: 'procuracao', titulo: 'Procuração pendente ou vencida', qtd: alertas.procuracao, icone: FileSignature, cor: 'from-fuchsia-500 to-purple-600' },
    { id: 'licenca_alerta', titulo: 'Licença vencida ou vencendo em 30 dias', qtd: alertas.licenca, icone: CalendarX2, cor: 'from-rose-400 to-pink-600' },
    { id: 'im_pendente', titulo: 'Inscrição municipal não liberada', qtd: alertas.im, icone: MapPin, cor: 'from-violet-500 to-indigo-600' },
    { id: 'tfe_atrasada', titulo: 'TFE/TFLF com pagamento atrasado', qtd: alertas.tfe, icone: Receipt, cor: 'from-amber-400 to-orange-500' },
    { id: 'sem_ie', titulo: 'Sem inscrição estadual informada', qtd: alertas.semIe, icone: Building2, cor: 'from-sky-400 to-blue-600' },
  ]

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 pb-20 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative flex w-full max-w-none items-center gap-4 py-4 px-3 sm:px-4 md:px-6 lg:px-8">
          <Link para="/" aria-label="Ir para a página inicial do portal">
            <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="h-9 w-auto sm:h-10" />
          </Link>
          <Link para="/" className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20">
            <House className="h-4 w-4" />
            <span className="hidden sm:inline">Página inicial</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-white/70 md:inline">{session.user.email}</span>
            <button className="btn btn-sm bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20" onClick={() => supabase.auth.signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="relative w-full max-w-none pt-4 px-3 sm:px-4 md:px-6 lg:px-8">
          <p className="text-sm font-medium text-cyan-300">
            <Link para="/" className="hover:underline">
              Página inicial
            </Link>{' '}
            ›{' '}
            <Link para="/d/societario" className="hover:underline">
              Societário
            </Link>{' '}
            · Controle Legalização
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Controle Legalização</h1>
          <p className="mt-1 text-sm text-white/60">Procuração, licenciamento, inscrições estadual e municipal e TFE/TFLF das empresas da Base de Clientes.</p>
        </div>
      </div>

      <main className="relative -mt-12 w-full max-w-none space-y-5 pb-10 px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cartoes.map((c) => {
            const ativo = filtro === c.id
            return (
              <button
                key={c.id}
                onClick={() => setFiltro(ativo ? '' : c.id)}
                className={`group cursor-pointer rounded-2xl bg-white p-5 text-left shadow-lg shadow-asap-900/5 ring-1 transition hover:-translate-y-0.5 hover:shadow-xl ${ativo ? 'ring-2 ring-brand-500' : 'ring-slate-200/70'}`}
              >
                <div className="flex items-start justify-between">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${c.cor} text-white shadow-lg`}>
                    <c.icone className="h-5 w-5" />
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ativo ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
                    {ativo ? 'filtrando' : 'filtrar'}
                  </span>
                </div>
                <div className="mt-4 text-3xl font-extrabold text-slate-900">{c.qtd}</div>
                <div className="text-sm font-medium text-slate-500">{c.titulo}</div>
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200/70">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Buscar por razão social, CNPJ, código, IE, IM ou município..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={mostrarEncerrados} onChange={(e) => setMostrarEncerrados(e.target.checked)} />
            Mostrar clientes encerrados
          </label>
          {filtro && (
            <button className="btn-ghost btn-sm" onClick={() => setFiltro('')}>
              <X className="h-3.5 w-3.5" />
              Limpar filtro
            </button>
          )}
        </div>

        {erro && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{erro}</div>}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-bold tracking-wider text-slate-400 uppercase">
                  <th className="py-3.5 pr-2 pl-4">Cód.</th>
                  <th className="px-2 py-3.5">Empresa</th>
                  <th className="px-2 py-3.5">Procuração</th>
                  <th className="px-2 py-3.5">Licenciamento</th>
                  <th className="px-2 py-3.5">Inscrição Estadual</th>
                  <th className="px-2 py-3.5">Inscrição Municipal</th>
                  <th className="px-2 py-3.5">TFE / TFLF {anoAtual}</th>
                  <th className="py-3.5 pr-4 pl-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-400">
                      Carregando empresas...
                    </td>
                  </tr>
                )}
                {!carregando && filtrados.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center text-slate-500">
                      {clientes.length === 0 ? 'Nenhuma empresa na Base de Clientes ainda. Cadastre no Administrativo › Base de Clientes.' : 'Nenhuma empresa encontrada com esses filtros.'}
                    </td>
                  </tr>
                )}
                {filtrados.map((c) => {
                  const r = registroDe(c.id)
                  const val = situacaoValidade(r.licenciamento_validade)
                  const doCliente = tfesDe(c.id)
                  const tfeAtual = doCliente.find((t) => t.ano === anoAtual)?.status ?? 'pendente_liberacao'
                  const atrasadas = doCliente.filter((t) => t.status === 'pagamento_atrasado').length
                  return (
                    <tr key={c.id} className="border-b border-slate-100 transition hover:bg-slate-50/80">
                      <td className="py-3.5 pr-2 pl-4 font-mono text-sm font-bold text-slate-500 tabular-nums">{String(c.codigo).padStart(3, '0')}</td>
                      <td className="min-w-[13rem] px-2 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-slate-800">{c.razao_social}</span>
                              {c.status === 'encerrado' && <Badge cor="neutro">Encerrado</Badge>}
                            </div>
                            <div className="mt-0.5 font-mono text-[0.8125rem] whitespace-nowrap text-slate-500">
                              {c.cnpj ? mascaraCnpj(c.cnpj) : 'CNPJ não informado'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3.5">
                        <div className="w-fit">
                          <Select
                            value={r.procuracao_status}
                            onChange={(v) => salvarCampo(c.id, 'procuracao_status', v)}
                            opcoes={STATUS_PROCURACAO}
                            className={classeSelect(corDe(STATUS_PROCURACAO, r.procuracao_status))}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-3.5">
                        <div className="w-fit">
                          <Select
                            value={r.licenciamento_status}
                            onChange={(v) => salvarCampo(c.id, 'licenciamento_status', v)}
                            opcoes={STATUS_LICENCIAMENTO}
                            className={classeSelect(corDe(STATUS_LICENCIAMENTO, r.licenciamento_status))}
                          />
                        </div>
                        <div className={`mt-1 text-[0.8125rem] ${val === 'vencida' ? 'font-bold text-rose-600' : val === 'vence_em_breve' ? 'font-bold text-amber-600' : 'text-slate-500'}`}>
                          {r.licenciamento_validade ? `Validade ${formatarData(r.licenciamento_validade)}` : 'Sem validade informada'}
                          {val === 'vencida' && ' · vencida'}
                          {val === 'vence_em_breve' && ' · vence em breve'}
                        </div>
                      </td>
                      <td className="px-2 py-3.5">
                        {r.ie_numero || r.ie_uf ? (
                          <>
                            <div className="font-mono text-sm font-semibold text-slate-700">{r.ie_numero || '—'}</div>
                            <div className="text-[0.8125rem] text-slate-500">{r.ie_uf ?? 'UF não informada'}</div>
                          </>
                        ) : (
                          <span className="text-slate-300">Não informada</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5">
                        <div className="w-fit">
                          <Select
                            value={r.im_status}
                            onChange={(v) => salvarCampo(c.id, 'im_status', v)}
                            opcoes={STATUS_IM}
                            className={classeSelect(corDe(STATUS_IM, r.im_status))}
                          />
                        </div>
                        <div className="mt-1 text-[0.8125rem] text-slate-500">
                          {[r.im_municipio && `${r.im_municipio}${r.ie_uf ? `/${r.ie_uf}` : ''}`, r.im_numero && `nº ${r.im_numero}`].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>
                      <td className="px-2 py-3.5">
                        <div className="w-fit">
                          <Select
                            value={tfeAtual}
                            onChange={(v) => salvarTfe(c.id, anoAtual, v as Tfe['status'])}
                            opcoes={STATUS_TFE}
                            className={classeSelect(corDe(STATUS_TFE, tfeAtual))}
                          />
                        </div>
                        {atrasadas > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-[0.8125rem] font-bold text-rose-600">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {atrasadas} ano(s) em atraso
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 pr-4 pl-2 text-right">
                        <button className="btn-sm btn bg-brand-50 text-brand-700 hover:bg-brand-100" onClick={() => setEditando(c)} title="Abrir a ficha da empresa">
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="hidden min-[1700px]:inline">Abrir</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {!carregando && ativos.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
              Exibindo {filtrados.length} de {ativos.length} empresa(s) da Base de Clientes
            </div>
          )}
        </div>
      </main>

      {editando && (
        <LegalizacaoForm
          cliente={editando}
          legalizacao={registroDe(editando.id)}
          tfes={tfesDe(editando.id)}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </div>
  )
}
