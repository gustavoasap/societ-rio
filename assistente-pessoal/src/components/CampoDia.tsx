import { dataDaRecorrencia, mesAtual, somarMesesAoMes, type ModoDiaUtil } from '../lib/datas'
import { dataBR } from '../lib/formato'
import { Campo, Segmentado } from './ui'

/** Quando a recorrência cai: dia fixo do mês (ex.: dia 10) ou N-ésimo dia útil (ex.: 5º dia útil). */
export function CampoDia({
  dia,
  setDia,
  modo,
  setModo,
  aPartirDe,
}: {
  dia: number
  setDia: (n: number) => void
  modo: ModoDiaUtil | null
  setModo: (m: ModoDiaUtil | null) => void
  /** mês "AAAA-MM" a partir do qual mostrar as próximas datas */
  aPartirDe?: string
}) {
  const inicio = aPartirDe && aPartirDe > mesAtual() ? aPartirDe : mesAtual()
  const valido = dia >= 1 && dia <= (modo ? 23 : 31)
  const proximas = valido ? [0, 1, 2].map((i) => dataDaRecorrencia(somarMesesAoMes(inicio, i), dia, modo)) : []

  return (
    <div className="space-y-2">
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
      {modo && (
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
