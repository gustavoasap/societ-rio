import { useMemo, useState } from 'react'
import { Check, Search, TrendingUp } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData, lerNumeroBR, moedaDigitada } from '../../lib/format'
import { CampoMes } from '../../components/CampoData'
import { Field, Modal } from '../../components/ui'
import { mesHoje, somarMes, type ClienteHon, type HonorarioBase } from './calculo'
import { mesCurto, valorTexto } from './util'
import { arredondar, novoValor, type Arredondamento, type TipoReajuste } from './reajuste'

/** Reajuste de vários clientes de uma vez (ex.: IPCA + 2% no início do ano), a partir de uma competência. */
export function ReajusteMassa({
  clientes,
  hons,
  onClose,
  onSalvo,
}: {
  clientes: ClienteHon[]
  hons: HonorarioBase[]
  onClose: () => void
  onSalvo: () => void
}) {
  const [inicio, setInicio] = useState(() => somarMes(mesHoje(), 1))
  const [tipo, setTipo] = useState<TipoReajuste>('percentual')
  const [indice, setIndice] = useState('')
  const [adicional, setAdicional] = useState('')
  const [fixo, setFixo] = useState('')
  const [acrescimo, setAcrescimo] = useState('')
  const [arred, setArred] = useState<Arredondamento>('centavos')
  const [descricao, setDescricao] = useState('')
  const [busca, setBusca] = useState('')
  const [valorFiltro, setValorFiltro] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [manual, setManual] = useState<Map<string, string>>(new Map())
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Clientes ativos com honorário em aberto (o atual, que será encerrado na véspera do reajuste)
  const base = useMemo(() => {
    const aberto = new Map<string, HonorarioBase>()
    for (const h of hons)
      if (!h.vigencia_fim && (!aberto.get(h.cliente_id) || h.vigencia_inicio > aberto.get(h.cliente_id)!.vigencia_inicio)) aberto.set(h.cliente_id, h)
    return clientes
      .filter((c) => c.status !== 'encerrado' && aberto.has(c.id))
      .map((c) => ({ cliente: c, atual: Number(aberto.get(c.id)!.valor), desde: aberto.get(c.id)!.vigencia_inicio }))
  }, [clientes, hons])

  const params = {
    tipo,
    indice: lerNumeroBR(indice) ?? 0,
    adicional: lerNumeroBR(adicional) ?? 0,
    fixo: lerNumeroBR(fixo),
    acrescimo: lerNumeroBR(acrescimo) ?? 0,
  }
  const pct = params.indice + params.adicional
  const calcular = (atual: number) => arredondar(novoValor(atual, params), arred)
  const bloqueado = (desde: string) => desde.slice(0, 7) >= inicio

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    const v = lerNumeroBR(valorFiltro)
    return base.filter((b) => {
      if (v !== null && Math.abs(b.atual - v) > 0.005) return false
      if (!t) return true
      return b.cliente.razao_social.toLowerCase().includes(t) || String(b.cliente.codigo).padStart(3, '0').includes(t) || String(b.cliente.codigo) === t
    })
  }, [base, busca, valorFiltro])

  const escolhidos = base.filter((b) => sel.has(b.cliente.id) && !bloqueado(b.desde))
  const valorFinal = (b: (typeof base)[number]) => {
    const m = manual.get(b.cliente.id)
    return m !== undefined ? (lerNumeroBR(m) ?? 0) : calcular(b.atual)
  }
  const totalAtual = escolhidos.reduce((s, b) => s + b.atual, 0)
  const totalNovo = escolhidos.reduce((s, b) => s + valorFinal(b), 0)
  const textoPadrao =
    tipo === 'percentual'
      ? `Reajuste ${[params.indice ? `${params.indice.toLocaleString('pt-BR')}%` : '', params.adicional ? `${params.adicional.toLocaleString('pt-BR')}%` : ''].filter(Boolean).join(' + ') || '0%'} a partir de ${mesCurto(inicio)}`
      : tipo === 'fixo'
        ? `Novo honorário a partir de ${mesCurto(inicio)}`
        : `Reajuste de ${valorTexto(params.acrescimo)} a partir de ${mesCurto(inicio)}`

  function alternar(id: string, marcar: boolean) {
    setSel((s) => {
      const n = new Set(s)
      if (marcar) n.add(id)
      else n.delete(id)
      return n
    })
  }

  async function aplicar() {
    if (!escolhidos.length) return setErro('Selecione pelo menos um cliente.')
    if (tipo === 'fixo' && !params.fixo) return setErro('Informe o novo valor.')
    const itens = escolhidos.map((b) => ({ cliente: b.cliente.id, valor: Math.round(valorFinal(b) * 100) / 100 }))
    if (itens.some((i) => !(i.valor > 0))) return setErro('Há cliente com novo valor zerado. Confira os valores.')
    if (!confirm(`Reajustar ${itens.length} cliente(s) a partir de ${mesCurto(inicio)}?\n\nTotal mensal: ${valorTexto(totalAtual)} → ${valorTexto(totalNovo)}`))
      return
    setSalvando(true)
    const { error } = await supabase.rpc('adm_reajustar_em_massa', { p_itens: itens, p_inicio: `${inicio}-01`, p_descricao: descricao.trim() || textoPadrao })
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  return (
    <Modal
      title="Reajuste em massa"
      subtitulo="Selecione os clientes, informe o reajuste e a competência a partir da qual vale"
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          <span className="mr-auto text-sm text-slate-600">
            <b>{escolhidos.length}</b> cliente(s) · {valorTexto(totalAtual)} → <b className="text-emerald-700">{valorTexto(totalNovo)}</b>
            {totalAtual > 0 && <span className="text-slate-400"> (+{valorTexto(totalNovo - totalAtual)}/mês)</span>}
          </span>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={aplicar} disabled={salvando || !escolhidos.length}>
            <Check className="h-4 w-4" />
            {salvando ? 'Aplicando...' : 'Aplicar reajuste'}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}

      <div className="grid gap-4 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 lg:grid-cols-[auto_1fr]">
        <Field label="A partir da competência">
          <CampoMes value={inicio} onChange={setInicio} className="input" />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Tipo de reajuste</span>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: 'percentual', l: 'Percentual (índice + adicional)' },
                { v: 'fixo', l: 'Novo valor fixo' },
                { v: 'acrescimo', l: 'Acréscimo em R$' },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setTipo(o.v)}
                className={`cursor-pointer rounded-xl border px-3 py-2 text-sm font-semibold transition ${tipo === o.v ? 'border-brand-500 bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3 lg:col-span-2">
          {tipo === 'percentual' && (
            <>
              <Field label="Índice (%) · ex.: IPCA">
                <input className="input w-32" inputMode="decimal" value={indice} onChange={(e) => setIndice(e.target.value)} placeholder="4,50" />
              </Field>
              <Field label="Adicional (%)">
                <input className="input w-32" inputMode="decimal" value={adicional} onChange={(e) => setAdicional(e.target.value)} placeholder="2,00" />
              </Field>
              <div className="pb-2.5 text-sm text-slate-600">
                = reajuste de <b className="text-slate-900">{pct.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%</b>
              </div>
            </>
          )}
          {tipo === 'fixo' && (
            <Field label="Novo valor para todos os selecionados">
              <input
                className="input w-44"
                inputMode="decimal"
                value={fixo}
                onChange={(e) => setFixo(e.target.value)}
                onBlur={() => setFixo(moedaDigitada(fixo))}
                placeholder="R$ 0,00"
              />
            </Field>
          )}
          {tipo === 'acrescimo' && (
            <Field label="Acréscimo (R$)">
              <input
                className="input w-44"
                inputMode="decimal"
                value={acrescimo}
                onChange={(e) => setAcrescimo(e.target.value)}
                onBlur={() => setAcrescimo(moedaDigitada(acrescimo))}
                placeholder="R$ 0,00"
              />
            </Field>
          )}
          <Field label="Arredondamento">
            <select className="input w-auto" value={arred} onChange={(e) => setArred(e.target.value as Arredondamento)}>
              <option value="centavos">Centavos (exato)</option>
              <option value="inteiro">Real inteiro mais próximo</option>
              <option value="cima">Real inteiro para cima</option>
            </select>
          </Field>
          <Field label="Descrição no histórico" className="min-w-64 flex-1">
            <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={textoPadrao} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl bg-white ring-1 ring-slate-200/70">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10" placeholder="Razão social ou código" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <input
            className="input w-44"
            inputMode="decimal"
            placeholder="Honorário (ex.: 360)"
            value={valorFiltro}
            onChange={(e) => setValorFiltro(e.target.value)}
          />
          <button className="btn-secondary btn-sm" onClick={() => filtrados.forEach((b) => !bloqueado(b.desde) && alternar(b.cliente.id, true))}>
            Selecionar {filtrados.length} da lista
          </button>
          <button className="btn-secondary btn-sm" onClick={() => setSel(new Set())}>
            Limpar seleção
          </button>
        </div>
        <div className="max-h-[45vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
              <tr className="border-b border-slate-100">
                <th className="w-10 py-2 pl-4">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-600"
                    aria-label="Selecionar todos da lista"
                    checked={filtrados.length > 0 && filtrados.every((b) => bloqueado(b.desde) || sel.has(b.cliente.id))}
                    onChange={(e) => filtrados.forEach((b) => !bloqueado(b.desde) && alternar(b.cliente.id, e.target.checked))}
                  />
                </th>
                <th className="px-2 py-2">Cliente</th>
                <th className="px-2 py-2 text-right">Atual</th>
                <th className="px-2 py-2 text-right">Novo</th>
                <th className="py-2 pr-4 pl-2 text-right">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map((b) => {
                const trava = bloqueado(b.desde)
                const marcado = sel.has(b.cliente.id) && !trava
                const novo = valorFinal(b)
                return (
                  <tr key={b.cliente.id} className={marcado ? 'bg-brand-50/40' : ''}>
                    <td className="py-2 pl-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        disabled={trava}
                        checked={marcado}
                        onChange={(e) => alternar(b.cliente.id, e.target.checked)}
                        aria-label={`Selecionar ${b.cliente.razao_social}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-mono text-xs text-slate-400">{String(b.cliente.codigo).padStart(3, '0')}</span>{' '}
                      <span className="font-semibold text-slate-800">{b.cliente.razao_social}</span>
                      {trava && <div className="text-[0.6875rem] text-amber-700">Já tem honorário a partir de {formatarData(b.desde)}</div>}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{valorTexto(b.atual)}</td>
                    <td className="px-2 py-2 text-right">
                      {marcado ? (
                        <input
                          className="input ml-auto w-32 py-1 text-right tabular-nums"
                          inputMode="decimal"
                          value={manual.get(b.cliente.id) ?? moedaDigitada(String(calcular(b.atual)))}
                          onChange={(e) => setManual((m) => new Map(m).set(b.cliente.id, e.target.value))}
                          onBlur={(e) => setManual((m) => new Map(m).set(b.cliente.id, moedaDigitada(e.target.value)))}
                          title="Pode ajustar o valor deste cliente"
                        />
                      ) : (
                        <span className="text-slate-400 tabular-nums">{valorTexto(calcular(b.atual))}</span>
                      )}
                    </td>
                    <td className={`py-2 pr-4 pl-2 text-right whitespace-nowrap tabular-nums ${novo - b.atual >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {marcado ? `${novo - b.atual >= 0 ? '+' : ''}${valorTexto(novo - b.atual)}` : ''}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!filtrados.length && <p className="p-8 text-center text-sm text-slate-400">Nenhum cliente com esses filtros.</p>}
        </div>
        <p className="flex items-center gap-1.5 border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          <TrendingUp className="h-3.5 w-3.5" />
          Até {mesCurto(somarMes(inicio, -1))} continua valendo o honorário atual; o novo vale a partir de {mesCurto(inicio)}. O valor de cada cliente pode ser
          ajustado na coluna Novo.
        </p>
      </div>
    </Modal>
  )
}
