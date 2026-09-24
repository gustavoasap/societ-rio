import { ArrowRight, Plus, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from '../lib/rotas'
import { corDe, iconeDe } from './icones'
import { ModuloCard } from './ModuloCard'
import type { Departamento, Modulo } from './tipos'

export function Trilha({ itens }: { itens: { label: string; para?: string }[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-400" aria-label="Você está em">
      {itens.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span>›</span>}
          {it.para ? (
            <Link para={it.para} className="font-semibold text-brand-600 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span>{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

export function Cabecalho({ trilha, titulo, descricao, acoes }: { trilha: ReactNode; titulo: string; descricao?: string | null; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {trilha}
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-balance text-slate-900">{titulo}</h2>
        {descricao && <p className="mt-1 max-w-2xl text-sm text-slate-500">{descricao}</p>}
      </div>
      {acoes}
    </div>
  )
}

export function Vazio({ icone: I = SearchX, children }: { icone?: typeof SearchX; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-sm text-slate-500">
      <I className="h-8 w-8 text-slate-300" />
      {children}
    </div>
  )
}

export function Inicio({ departamentos, modulos }: { departamentos: Departamento[]; modulos: Modulo[] }) {
  return (
    <div className="space-y-5">
      <Cabecalho
        trilha={<Trilha itens={[{ label: 'Página inicial' }]} />}
        titulo="Departamentos"
        descricao="Todas as ferramentas do escritório, organizadas por departamento."
      />
      {departamentos.length === 0 ? (
        <Vazio>Nenhum departamento foi liberado para você ainda. Fale com um administrador do portal.</Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {departamentos.map((d) => {
            const I = iconeDe(d.icone)
            const cor = corDe(d.cor)
            const doDep = modulos.filter((m) => m.departamento_id === d.id)
            const disponiveis = doDep.filter((m) => m.status === 'disponivel').length
            return (
              <Link
                key={d.id}
                para={`/d/${d.slug}`}
                className="group flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand-500/10 hover:ring-brand-400"
              >
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${cor.fundo} ${cor.texto}`}>
                  <I className="h-6 w-6" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{d.nome}</h3>
                  {d.descricao && <p className="mt-0.5 text-sm text-slate-500">{d.descricao}</p>}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-sm">
                  <span className="text-slate-500 tabular-nums">
                    {doDep.length} {doDep.length === 1 ? 'ferramenta' : 'ferramentas'} · {disponiveis} {disponiveis === 1 ? 'disponível' : 'disponíveis'}
                  </span>
                  <span className="flex items-center gap-1 font-bold text-brand-600">
                    Entrar <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function PaginaDepartamento({
  departamento: d,
  modulos,
  admin,
  onNovaFerramenta,
}: {
  departamento: Departamento
  modulos: Modulo[]
  admin: boolean
  onNovaFerramenta: () => void
}) {
  const doDep = modulos.filter((m) => m.departamento_id === d.id)
  return (
    <div className="space-y-5">
      <Cabecalho
        trilha={<Trilha itens={[{ label: 'Página inicial', para: '/' }, { label: 'Departamentos' }]} />}
        titulo={`Departamento ${d.nome}`}
        descricao={d.descricao}
      />
      {doDep.length === 0 && !admin ? (
        <Vazio>Este departamento ainda não tem ferramentas.</Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {doDep.map((m) => (
            <ModuloCard key={m.id} modulo={m} departamento={d} />
          ))}
          {admin && (
            <button
              onClick={onNovaFerramenta}
              className="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-5 text-center text-slate-500 transition hover:border-brand-400 hover:bg-white hover:text-brand-600"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-dashed border-current">
                <Plus className="h-5 w-5" />
              </span>
              <span className="font-bold">Nova ferramenta</span>
              <span className="text-xs text-slate-400">Só administradores veem este botão</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function ResultadoBusca({ termo, departamentos, modulos }: { termo: string; departamentos: Departamento[]; modulos: Modulo[] }) {
  const t = termo.trim().toLowerCase()
  const achados = modulos.filter((m) => [m.nome, m.descricao].join(' ').toLowerCase().includes(t))
  return (
    <div className="space-y-5">
      <Cabecalho trilha={<Trilha itens={[{ label: 'Busca' }]} />} titulo={`${achados.length} ${achados.length === 1 ? 'ferramenta encontrada' : 'ferramentas encontradas'}`} descricao={`Resultado para “${termo.trim()}”`} />
      {achados.length === 0 ? (
        <Vazio>Nenhuma ferramenta com esse nome.</Vazio>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {achados.map((m) => (
            <ModuloCard key={m.id} modulo={m} departamento={departamentos.find((d) => d.id === m.departamento_id)} />
          ))}
        </div>
      )}
    </div>
  )
}
