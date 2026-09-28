import { Link, useRota } from '../lib/rotas'

/** Alterna entre Metas financeiras e Objetivos de vida (útil no celular, onde só "Metas" fica na barra). */
export function AbasMetas() {
  const rota = useRota()
  const item = (para: string, label: string) => (
    <Link
      para={para}
      className={`flex-1 rounded-lg px-3 py-2 text-center text-sm font-semibold transition ${rota === para ? 'bg-white text-azul-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
    >
      {label}
    </Link>
  )
  return (
    <div className="flex rounded-xl bg-slate-200/60 p-1 lg:hidden">
      {item('/metas', 'Metas financeiras')}
      {item('/objetivos', 'Objetivos de vida')}
    </div>
  )
}
