import { BookOpen, ExternalLink } from 'lucide-react'
import { Section } from '../../../components/ui'
import { LEGISLACAO } from '../../engine/legislacao'

export function Legislacao() {
  const grupos = [...new Set(LEGISLACAO.map((n) => n.grupo))]
  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <Section key={g} title={g} icone={BookOpen}>
          <div className="divide-y divide-slate-100">
            {LEGISLACAO.filter((n) => n.grupo === g).map((n) => (
              <div key={n.sigla} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">
                    {n.sigla} <span className="font-normal text-slate-500">— {n.titulo}</span>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-600">{n.uso}</p>
                </div>
                <a href={n.url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm shrink-0">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir
                </a>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  )
}
