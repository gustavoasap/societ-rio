import { createElement } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'
import { Link } from '../lib/rotas'
import { corDe, iconeDe } from './icones'
import { linkExterno, type Departamento, type Modulo } from './tipos'

const PILL = {
  disponivel: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  em_breve: 'bg-slate-100 text-slate-500 ring-slate-200',
  oculto: 'bg-amber-50 text-amber-700 ring-amber-200',
}
const TEXTO = { disponivel: 'Disponível', em_breve: 'Em breve', oculto: 'Oculto' }

export function ModuloCard({ modulo: m, departamento }: { modulo: Modulo; departamento?: Departamento }) {
  const cor = corDe(departamento?.cor ?? 'brand')
  const abre = m.status !== 'em_breve' && !!m.link
  const externo = linkExterno(m.link)

  const conteudo = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${abre ? `${cor.fundo} ${cor.texto}` : 'bg-slate-100 text-slate-400'}`}>
        {createElement(iconeDe(m.icone), { className: 'h-5 w-5' })}
      </span>
      <div>
        <h3 className="font-bold text-slate-900">{m.nome}</h3>
        {departamento && <p className="text-xs font-semibold text-slate-400">{departamento.nome}</p>}
        {m.descricao && <p className="mt-1 text-sm text-slate-500">{m.descricao}</p>}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${PILL[m.status]}`}>
          {m.status === 'disponivel' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          {TEXTO[m.status]}
        </span>
        {abre && (
          <span className="flex items-center gap-1 text-sm font-bold text-brand-600">
            Abrir {externo ? <ArrowUpRight className="h-4 w-4" /> : <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />}
          </span>
        )}
      </div>
    </>
  )

  const base = 'flex flex-col gap-3 rounded-2xl p-5 text-left ring-1'
  if (!abre) return <div className={`${base} bg-slate-50/70 ring-slate-200/70`}>{conteudo}</div>

  const ativo = `${base} group bg-white shadow-sm ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-500/10 hover:ring-brand-400 focus-visible:outline-3 focus-visible:outline-brand-500`
  if (externo)
    return (
      <a href={m.link!} target="_blank" rel="noopener noreferrer" className={ativo}>
        {conteudo}
      </a>
    )
  return (
    <Link para={m.link!} className={ativo}>
      {conteudo}
    </Link>
  )
}
