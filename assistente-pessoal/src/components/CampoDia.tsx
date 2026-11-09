import { dataDaRecorrencia, datasPorDias, hoje, mesAtual, mesDe, somarDias, somarMesesAoMes, type ModoDiaUtil } from '../lib/datas'
import { dataBR, mesPorExtenso } from '../lib/formato'
import { mensalizado, ocorreNoMes } from '../lib/plano'
import { FREQUENCIAS } from '../tipos'
import { Campo, Segmentado, Selecao } from './ui'

/**
 * Quando a recorrência cai: dia fixo do mês (ex.: dia 10), N-ésimo dia útil (ex.: 5º dia útil)
 * ou de N em N dias a partir da data de início (toda semana, a cada 15 dias...).
 */
export function CampoDia({
  dia,
  setDia,
  modo,
  setModo,
  aPartirDe,
  intervalo = 1,
  setIntervalo,
  intervaloDias = null,
  setIntervaloDias,
  valor,
}: {
  dia: number
  setDia: (n: number) => void
  modo: ModoDiaUtil | null
  setModo: (m: ModoDiaUtil | null) => void
  /** data de início (AAAA-MM-DD): define em que mês caem as recorrências anuais/periódicas */
  aPartirDe?: string
  intervalo?: number
  setIntervalo?: (n: number) => void
  /** de N em N dias (null = pelo mês) */
  intervaloDias?: number | null
  setIntervaloDias?: (n: number | null) => void
  /** valor da recorrência, para mostrar a provisão mensal das periódicas */
  valor?: number | null
}) {
  const porDias = !!intervaloDias
  const freq = porDias ? (intervaloDias === 7 ? 'd7' : intervaloDias === 15 ? 'd15' : 'dN') : String(intervalo)
  function mudarFrequencia(v: string) {
    if (v.startsWith('d')) {
      setIntervaloDias?.(v === 'd7' ? 7 : v === 'd15' ? 15 : intervaloDias && intervaloDias !== 7 && intervaloDias !== 15 ? intervaloDias : 10)
      setIntervalo?.(1)
    } else {
      setIntervaloDias?.(null)
      setIntervalo?.(Number(v))
    }
  }
  const inicioISO = aPartirDe && aPartirDe.length >= 10 ? aPartirDe : `${aPartirDe ?? mesAtual()}-01`
  const desde = mesDe(inicioISO) > mesAtual() ? mesDe(inicioISO) : mesAtual()
  const valido = dia >= 1 && dia <= (modo ? 23 : 31)
  const proximas: string[] = []
  if (porDias) {
    const de = inicioISO > hoje() ? inicioISO : hoje()
    proximas.push(...datasPorDias(inicioISO, intervaloDias!, de, somarDias(de, intervaloDias! * 3)).slice(0, 3))
  } else
    for (let i = 0; valido && proximas.length < 3 && i < 40; i++) {
      const m = somarMesesAoMes(desde, i)
      if (ocorreNoMes({ inicio: inicioISO, fim: null, intervalo_meses: intervalo, ativa: true }, m)) proximas.push(dataDaRecorrencia(m, dia, modo))
    }

  return (
    <div className="space-y-2">
      {setIntervalo && (
        <Campo label="Frequência">
          <Selecao
            value={freq}
            onChange={mudarFrequencia}
            opcoes={[
              ...(setIntervaloDias
                ? [
                    { value: 'd7', label: 'Toda semana (a cada 7 dias)' },
                    { value: 'd15', label: 'A cada 15 dias' },
                    { value: 'dN', label: 'A cada N dias…' },
                  ]
                : []),
              ...FREQUENCIAS.map((f) => ({ value: String(f.value), label: f.label })),
            ]}
          />
        </Campo>
      )}
      {porDias && (
        <div className="space-y-2">
          {freq === 'dN' && (
            <Campo label="A cada quantos dias?">
              <div className="relative">
                <input className="input pr-12" type="number" min={1} max={366} value={intervaloDias || ''} onChange={(e) => setIntervaloDias?.(Math.max(1, Math.min(366, Number(e.target.value) || 1)))} />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">dias</span>
              </div>
            </Campo>
          )}
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Conta a partir de <b>{dataBR(inicioISO)}</b> (a data de início), de {intervaloDias} em {intervaloDias} dias — cai em qualquer dia da semana, inclusive fim de semana.
            {valor ? (
              <>
                {' '}
                No mês dá cerca de {((365.25 / 12) / intervaloDias!).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} vezes: o plano conta{' '}
                <b>{mensalizado({ valor, intervalo_meses: 1, intervalo_dias: intervaloDias }).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b> por mês.
              </>
            ) : null}
          </p>
        </div>
      )}
      {!porDias && intervalo > 1 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Cai {intervalo === 12 ? `todo ano em ${mesPorExtenso(mesDe(inicioISO)).split(' de ')[0]}` : `a cada ${intervalo} meses, a partir de ${mesPorExtenso(mesDe(inicioISO))}`} (o mês vem da data de início).
          {valor ? (
            <>
              {' '}
              Para não pesar no mês, o plano separa <b>{(mensalizado({ valor, intervalo_meses: intervalo })).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</b> por mês.
            </>
          ) : null}
        </p>
      )}
      {!porDias && (
      <>
      <Segmentado
        valor={modo ? 'util' : 'fixo'}
        onChange={(v) => setModo(v === 'util' ? 'seg_sab' : null)}
        opcoes={[
          { value: 'fixo', label: 'Dia fixo' },
          { value: 'util', label: 'Nº dia útil' },
        ]}
      />
      <div className="grid grid-cols-2 items-end gap-3">
        <Campo label={modo ? 'Qual dia útil? (ex.: 5)' : 'Dia do mês'}>
          <div className="relative">
            <input className="input pr-16" type="number" min={1} max={modo ? 23 : 31} value={dia || ''} onChange={(e) => setDia(Number(e.target.value))} />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{modo ? 'º dia útil' : 'do mês'}</span>
          </div>
        </Campo>
        {modo && (
          <label className="flex cursor-pointer items-center gap-2 pb-3 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-azul-600" checked={modo === 'seg_sab'} onChange={(e) => setModo(e.target.checked ? 'seg_sab' : 'seg_sex')} />
            Sábado conta
          </label>
        )}
      </div>
      </>
      )}
      {!porDias && modo && (
        <p className="text-xs text-slate-500">
          Domingos e feriados nacionais não contam. Para salário, o sábado conta como dia útil (CLT art. 459 §1º; Instrução Normativa MTb/SNT nº 1/1989). Se o
          pagamento é por dia útil bancário, desmarque “Sábado conta”.
        </p>
      )}
      {proximas.length > 0 && (
        <p className="text-xs text-azul-800">
          Próximas datas: <b>{proximas.map(dataBR).join(' · ')}</b>
        </p>
      )}
    </div>
  )
}
