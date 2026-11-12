import { useState } from 'react'
import { Check, RotateCcw, Settings } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData, formatarMoeda, lerNumeroBR, moedaDigitada } from '../../lib/format'
import { CampoData, CampoMes } from '../../components/CampoData'
import { Field, Modal } from '../../components/ui'
import { competenciaDe, hojeIso, type ConfigHon, type Linha } from './calculo'
import { nomeMes, salvarMensal, valorTexto } from './util'
import { alterarDiaVencimento } from '../acoes'

/** Marcar um ou vários honorários como recebidos (data obrigatória). */
export function MarcarRecebido({ linhas, onClose, onSalvo }: { linhas: Linha[]; onClose: () => void; onSalvo: () => void }) {
  const uma = linhas.length === 1 ? linhas[0] : null
  const [data, setData] = useState(hojeIso())
  const [valor, setValor] = useState(uma ? moedaDigitada(String(uma.valor)) : '')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const total = linhas.reduce((s, l) => s + l.valor, 0)

  async function salvar() {
    if (!data) return setErro('Informe a data do recebimento.')
    const v = uma ? lerNumeroBR(valor) : null
    if (uma && (v === null || v < 0)) return setErro('Informe o valor recebido.')
    setSalvando(true)
    const r = await Promise.all(
      linhas.map((l) =>
        salvarMensal(l.cliente.id, l.competencia, {
          recebido_em: data,
          valor_recebido: uma ? v : l.valor,
          origem: 'manual',
          ...(obs.trim() ? { observacao: obs.trim() } : {}),
        }),
      ),
    )
    setSalvando(false)
    const falha = r.find((x) => x.error)
    if (falha?.error) return setErro(falha.error.message)
    onSalvo()
  }

  return (
    <Modal
      title={uma ? `Receber honorário · ${uma.cliente.razao_social}` : `Receber ${linhas.length} honorários`}
      subtitulo={uma ? `Competência ${nomeMes(uma.competencia)} · vencimento ${formatarData(uma.vencimento)}` : `Total ${valorTexto(total)}`}
      onClose={onClose}
      largura="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary from-emerald-500 to-emerald-600" onClick={salvar} disabled={salvando}>
            <Check className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Marcar como recebido'}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:grid-cols-2">
        <Field label="Data do recebimento *">
          <CampoData id="data-recebimento" className="input" value={data} onChange={setData} />
        </Field>
        {uma ? (
          <Field label="Valor recebido *">
            <input
              id="valor-recebido"
              className="input"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => setValor(moedaDigitada(valor))}
            />
          </Field>
        ) : (
          <div className="text-sm text-slate-600 sm:pt-6">Cada honorário é marcado com o valor do mês.</div>
        )}
        <Field label="Observação" className="sm:col-span-2">
          <input className="input" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: PIX, boleto, pago em dinheiro" />
        </Field>
      </div>
      {!uma && (
        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-2xl bg-white px-4 text-sm ring-1 ring-slate-200/70">
          {linhas.map((l) => (
            <li key={`${l.cliente.id}${l.competencia}`} className="flex justify-between gap-3 py-2">
              <span className="truncate">
                <span className="font-mono text-xs text-slate-400">{String(l.cliente.codigo).padStart(3, '0')}</span> {l.cliente.razao_social}
              </span>
              <span className="font-semibold whitespace-nowrap tabular-nums">{valorTexto(l.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** Valor diferente no mês (serviço extra, negociação). */
export function AjustarValor({ linha, onClose, onSalvo }: { linha: Linha; onClose: () => void; onSalvo: () => void }) {
  const [valor, setValor] = useState(moedaDigitada(String(linha.valor)))
  const [motivo, setMotivo] = useState(linha.mensal?.motivo_ajuste ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function gravar(campos: Record<string, unknown>) {
    setSalvando(true)
    const { error } = await salvarMensal(linha.cliente.id, linha.competencia, campos)
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  function salvar() {
    const v = lerNumeroBR(valor)
    if (v === null || v < 0) return setErro('Informe o valor do mês.')
    if (!motivo.trim()) return setErro('Informe o motivo (ex.: serviço extra, desconto negociado).')
    gravar({ valor_ajustado: v, motivo_ajuste: motivo.trim() })
  }

  return (
    <Modal
      title={`Valor do mês · ${linha.cliente.razao_social}`}
      subtitulo={`Competência ${nomeMes(linha.competencia)} · honorário da base: ${linha.base !== null ? formatarMoeda(linha.base) : 'não cadastrado'}${linha.parceiro ? ` · pago por ${linha.parceiro.nome} (${linha.parceiro.parcela}/${linha.parceiro.total})` : ''}`}
      onClose={onClose}
      largura="max-w-lg"
      footer={
        <>
          {linha.ajustado && (
            <button className="btn-secondary mr-auto" onClick={() => gravar({ valor_ajustado: null, motivo_ajuste: null })} disabled={salvando}>
              <RotateCcw className="h-4 w-4" />
              Voltar ao valor da base
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            <Check className="h-4 w-4" />
            Salvar
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
        <Field label="Valor deste mês *">
          <input
            id="valor-mes"
            className="input"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => setValor(moedaDigitada(valor))}
            autoFocus
          />
        </Field>
        <Field label="Motivo *">
          <input
            id="motivo-ajuste"
            className="input"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: Serviço extra - alteração contratual"
          />
        </Field>
        <p className="text-xs text-slate-500">Vale só para esta competência. Os outros meses continuam com o honorário cadastrado na Base de Clientes.</p>
      </div>
    </Modal>
  )
}

export function ConfigHonorarios({ cfg, onClose, onSalvo }: { cfg: ConfigHon; onClose: () => void; onSalvo: () => void }) {
  const [inicio, setInicio] = useState(cfg.inicio.slice(0, 7))
  const [dia, setDia] = useState(String(cfg.dia_vencimento))
  const [seguinte, setSeguinte] = useState(cfg.vence_mes_seguinte)
  const [tarifa, setTarifa] = useState(moedaDigitada(String(cfg.tarifa_boleto ?? 0)))
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    const d = Number(dia)
    if (!Number.isInteger(d) || d < 1 || d > 31) return setErro('Dia de vencimento entre 1 e 31.')
    const t = lerNumeroBR(tarifa) ?? 0
    if (t < 0) return setErro('Tarifa inválida.')
    const { error } = await supabase
      .from('adm_hon_config')
      .update({ inicio: competenciaDe(inicio), dia_vencimento: d, vence_mes_seguinte: seguinte, tarifa_boleto: t, updated_at: new Date().toISOString() })
      .eq('id', 1)
    if (error) return setErro(error.message)
    onSalvo()
  }

  return (
    <Modal
      title="Configurações do controle"
      subtitulo="Início do controle e vencimento padrão"
      onClose={onClose}
      largura="max-w-lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar}>
            <Settings className="h-4 w-4" />
            Salvar
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
        <Field label="Controlar a partir de">
          <CampoMes value={inicio} onChange={setInicio} className="input" />
        </Field>
        <Field label="Dia de vencimento padrão">
          <input className="input w-28" inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))} />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={seguinte} onChange={(e) => setSeguinte(e.target.checked)} />
          Vence no mês seguinte ao da competência
        </label>
        <Field label="Tarifa por boleto emitido">
          <input
            className="input w-36"
            inputMode="decimal"
            value={tarifa}
            onChange={(e) => setTarifa(e.target.value)}
            onBlur={() => setTarifa(moedaDigitada(tarifa))}
          />
        </Field>
        <p className="text-xs text-slate-500">
          Na importação do extrato, um crédito igual ao honorário menos essa tarifa conta como valor certo, e o honorário fica como recebido integralmente.
        </p>
        <p className="text-xs text-slate-500">
          Quando o honorário do cliente tem dia de vencimento próprio (cadastrado no Expandir da Base de Clientes), vale o dia dele.
        </p>
      </div>
    </Modal>
  )
}

/** Dia de vencimento próprio do cliente (vale para o honorário atual e os próximos). */
export function AlterarVencimento({ linha, onClose, onSalvo }: { linha: Linha; onClose: () => void; onSalvo: () => void }) {
  const [dia, setDia] = useState(linha.vencimento.slice(8, 10).replace(/^0/, ''))
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    const d = Number(dia)
    if (!Number.isInteger(d) || d < 1 || d > 31) return setErro('Informe um dia entre 1 e 31.')
    const msg = await alterarDiaVencimento(linha.cliente.id, d)
    if (msg) return setErro(msg)
    onSalvo()
  }

  return (
    <Modal
      title={`Vencimento · ${linha.cliente.razao_social}`}
      subtitulo="Dia de vencimento do honorário deste cliente"
      onClose={onClose}
      largura="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar}>
            <Check className="h-4 w-4" />
            Salvar
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
        <Field label="Dia do vencimento">
          <input
            id="dia-vencimento"
            className="input w-28"
            inputMode="numeric"
            value={dia}
            onChange={(e) => setDia(e.target.value.replace(/\D/g, '').slice(0, 2))}
            autoFocus
          />
        </Field>
        <p className="text-xs text-slate-500">
          Vale para o honorário atual e os reajustes já agendados deste cliente, inclusive na lista de inadimplentes. Em meses mais curtos, vence no último dia
          do mês.
        </p>
      </div>
    </Modal>
  )
}
