import { useCallback, useEffect, useState } from 'react'
import { Building2, Check, CircleDollarSign, History, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarData, lerNumeroBR, moedaDigitada } from '../lib/format'
import { CampoData } from '../components/CampoData'
import { Select } from '../components/ui'
import { DetalhesEmpresa } from './DetalhesEmpresa'
import { ETAPAS, OPCOES_ETAPA, STATUS_CLIENTE, hojeISO, moeda, type Cliente, type Etapa, type Honorario, type StatusCliente, type Vigente } from './tipos'

/** Cores do seletor conforme a situação (mesma linguagem visual de Processos Societários). */
const COR_SELECT_ETAPA: Record<Etapa | 'vazio', string> = {
  concluida: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pdf_enviado: 'border-sky-200 bg-sky-50 text-sky-700',
  pendente: 'border-amber-200 bg-amber-50 text-amber-700',
  na: 'border-slate-200 bg-slate-100 text-slate-500',
  vazio: 'border-slate-200 bg-white text-slate-400',
}

const COR_NUMERO: Record<Etapa | 'vazio', string> = {
  concluida: 'bg-emerald-500',
  pdf_enviado: 'bg-sky-500',
  pendente: 'bg-amber-400',
  na: 'bg-slate-300',
  vazio: 'bg-slate-300',
}

const COR_STATUS_SELECT: Record<StatusCliente, string> = {
  assinado: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pendente: 'border-amber-200 bg-amber-50 text-amber-700',
  encerrado: 'border-slate-200 bg-slate-100 text-slate-600',
}

function Cartao({ numero, titulo, ok, cor, children }: { numero: number; titulo: string; ok: boolean; cor: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-bold text-white ${cor}`}>{ok ? '✓' : numero}</span>
        <span className="text-xs font-semibold text-slate-600">{titulo}</span>
      </div>
      {children}
    </div>
  )
}

export function ClienteExpandido({
  cliente: c,
  vigente,
  onCampo,
  onStatus,
  onHonorario,
}: {
  cliente: Cliente
  vigente: Vigente | undefined
  /** Grava um campo do cliente (certificado, procuração, onboarding, data de assinatura). */
  onCampo: (campo: keyof Cliente, valor: string | null) => void
  onStatus: (status: StatusCliente) => void
  /** Chamado depois de gravar um honorário, para recarregar a lista. */
  onHonorario: () => void
}) {
  const [historico, setHistorico] = useState<Honorario[]>([])
  const [form, setForm] = useState<{ valor: string; inicio: string; dia: string; descricao: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [detalhes, setDetalhes] = useState(false)

  const carregarHistorico = useCallback(async () => {
    const { data } = await supabase.from('adm_honorarios').select('*').eq('cliente_id', c.id).order('vigencia_inicio', { ascending: false })
    setHistorico((data as Honorario[]) ?? [])
  }, [c.id])

  useEffect(() => {
    carregarHistorico()
  }, [carregarHistorico])

  function abrirForm() {
    setErro(null)
    setForm({
      valor: vigente ? moedaDigitada(String(vigente.valor).replace('.', ',')) : '',
      inicio: hojeISO(),
      dia: String(vigente?.dia_vencimento ?? 10),
      descricao: vigente ? 'Reajuste' : '',
    })
  }

  async function salvarHonorario() {
    if (!form) return
    const valor = lerNumeroBR(form.valor)
    const dia = form.dia ? Number(form.dia) : null
    if (!valor || valor <= 0) return setErro('Informe o valor mensal.')
    if (!form.inicio) return setErro('Informe a partir de quando vale.')
    if (dia !== null && (dia < 1 || dia > 31)) return setErro('Dia de vencimento entre 1 e 31.')
    setSalvando(true)
    setErro(null)
    const { error } = await supabase.rpc('adm_reajustar_honorario', {
      p_cliente: c.id,
      p_valor: valor,
      p_inicio: form.inicio,
      p_dia: dia,
      p_descricao: form.descricao.trim() || null,
    })
    setSalvando(false)
    if (error) return setErro(error.message)
    setForm(null)
    carregarHistorico()
    onHonorario()
  }

  const encerrado = c.status === 'encerrado'

  return (
    <div className="animar-modal rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Cartao numero={1} titulo="Contrato assinado" ok={c.status === 'assinado'} cor={c.status === 'assinado' ? 'bg-emerald-500' : 'bg-amber-400'}>
          {encerrado ? (
            <div className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium ${COR_STATUS_SELECT.encerrado}`}>
              Encerrado em {formatarData(c.data_encerramento)}
            </div>
          ) : (
            <Select
              value={c.status}
              onChange={(v) => onStatus(v as StatusCliente)}
              opcoes={STATUS_CLIENTE}
              className={`w-full rounded-lg border px-2.5 py-1.5 text-sm font-medium outline-none ${COR_STATUS_SELECT[c.status]}`}
            />
          )}
          <label className="mt-2 block">
            <span className="mb-1 block text-[0.6875rem] font-semibold text-slate-500">Data da assinatura</span>
            <CampoData
              className="input py-1.5 text-sm"
              value={c.data_assinatura ?? ''}
              onChange={(v) => onCampo('data_assinatura', v || null)}
              disabled={encerrado}
            />
          </label>
        </Cartao>

        {ETAPAS.map((e, i) => {
          const st = c[e.campo] ?? 'vazio'
          return (
            <Cartao key={e.campo} numero={i + 2} titulo={e.label} ok={st === 'concluida'} cor={COR_NUMERO[st]}>
              <Select
                value={c[e.campo] ?? ''}
                onChange={(v) => onCampo(e.campo, v || null)}
                opcoes={OPCOES_ETAPA}
                vazio="Não informado"
                className={`w-full rounded-lg border px-2.5 py-1.5 text-sm font-medium outline-none ${COR_SELECT_ETAPA[st]}`}
              />
            </Cartao>
          )
        })}
        <div className="flex items-stretch">
          <button className="btn-primary w-full" onClick={() => setDetalhes(true)}>
            <Building2 className="h-4 w-4" />
            Detalhes da Empresa
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <CircleDollarSign className="h-4 w-4 text-brand-600" />
            <span className="font-semibold text-slate-700">Honorário mensal</span>
            {vigente ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-bold text-emerald-700 tabular-nums ring-1 ring-emerald-200">
                {moeda(vigente.valor)}
                {vigente.dia_vencimento ? <span className="font-medium"> · vence dia {vigente.dia_vencimento}</span> : null}
              </span>
            ) : (
              <span className="text-slate-400">não informado</span>
            )}
          </div>
          {!form && !encerrado && (
            <button className="btn-secondary btn-sm" onClick={abrirForm}>
              <Plus className="h-3.5 w-3.5" />
              {vigente ? 'Reajustar honorário' : 'Informar honorário'}
            </button>
          )}
        </div>

        {form && (
          <div className="mt-3 grid items-end gap-2 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100 sm:grid-cols-[1fr_1fr_7rem_1.5fr_auto]">
            <label>
              <span className="mb-1 block text-[0.6875rem] font-semibold text-slate-600">Valor mensal</span>
              <input
                className="input tabular-nums"
                placeholder="R$ 0,00"
                value={form.valor}
                autoFocus
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                onBlur={(e) => setForm({ ...form, valor: moedaDigitada(e.target.value) })}
              />
            </label>
            <label>
              <span className="mb-1 block text-[0.6875rem] font-semibold text-slate-600">Vale a partir de</span>
              <CampoData className="input" value={form.inicio} onChange={(v) => setForm({ ...form, inicio: v })} />
            </label>
            <label>
              <span className="mb-1 block text-[0.6875rem] font-semibold text-slate-600">Dia vencimento</span>
              <input type="number" min={1} max={31} className="input" value={form.dia} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-[0.6875rem] font-semibold text-slate-600">Observação</span>
              <input
                className="input"
                placeholder="Ex.: reajuste anual"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </label>
            <div className="flex gap-1">
              <button className="btn-primary" onClick={salvarHonorario} disabled={salvando}>
                <Check className="h-4 w-4" />
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
              <button className="btn-secondary" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
            {vigente && <p className="text-xs text-brand-700 sm:col-span-5">O honorário atual termina na véspera da nova data; o histórico é mantido.</p>}
            {erro && <p className="text-xs font-semibold text-rose-600 sm:col-span-5">{erro}</p>}
          </div>
        )}

        {historico.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <div className="mb-1 flex items-center gap-1 text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
              <History className="h-3.5 w-3.5" /> Histórico
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {historico.map((h) => (
                  <tr key={h.id} className={h.vigencia_fim ? 'text-slate-400' : 'text-slate-700'}>
                    <td className="py-1.5 pr-3 font-semibold whitespace-nowrap tabular-nums">{moeda(Number(h.valor))}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                      {formatarData(h.vigencia_inicio)} a {h.vigencia_fim ? formatarData(h.vigencia_fim) : 'hoje'}
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{h.dia_vencimento ? `vence dia ${h.dia_vencimento}` : ''}</td>
                    <td className="py-1.5 pl-3">{h.descricao ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {detalhes && <DetalhesEmpresa cliente={c} onClose={() => setDetalhes(false)} onAtualizado={onHonorario} />}
    </div>
  )
}
