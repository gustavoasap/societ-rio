import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Check, Copy, FilePen, House, ListChecks, LogOut, RotateCcw, Save, Search, Settings2, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { Link } from '../lib/rotas'
import { comRetentativa } from '../lib/retentar'
import { Section } from '../components/ui'
import { extrairCodigos, formatarCnae, gerarObjetoSocial, OPCOES_PADRAO, type AtividadeCnae, type OpcoesObjeto } from './gerador'

interface ObjetoSalvo {
  id: string
  titulo: string
  texto: string
  cnaes: string[]
  created_at: string
}

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto)
  } catch {
    const area = document.createElement('textarea')
    area.value = texto
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    document.execCommand('copy')
    area.remove()
  }
}

function BotaoCopiar({ texto, className = 'btn-secondary' }: { texto: string; className?: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <button
      type="button"
      className={className}
      disabled={!texto}
      onClick={async () => {
        await copiar(texto)
        setCopiado(true)
        setTimeout(() => setCopiado(false), 1800)
      }}
    >
      {copiado ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copiado ? 'Copiado!' : 'Copiar'}
    </button>
  )
}

function Opcao({ id, marcado, onChange, titulo, ajuda }: { id: string; marcado: boolean; onChange: (v: boolean) => void; titulo: string; ajuda: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl p-2 transition hover:bg-slate-50">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-brand-600" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{titulo}</span>
        <span className="block text-xs text-slate-500">{ajuda}</span>
      </span>
    </label>
  )
}

const semAnimacao = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function ObjetoSocial({ session }: { session: Session }) {
  const [tabela, setTabela] = useState<Map<string, string> | null>(null)
  const [entrada, setEntrada] = useState('')
  const [ajustes, setAjustes] = useState<Record<string, string>>({})
  const [opcoes, setOpcoes] = useState<OpcoesObjeto>(OPCOES_PADRAO)

  const [texto, setTexto] = useState('')
  const [digitando, setDigitando] = useState(false)
  const [visivel, setVisivel] = useState(0)
  const [editado, setEditado] = useState(false)
  const [gerado, setGerado] = useState(false)
  const timer = useRef<number | null>(null)

  const [salvos, setSalvos] = useState<ObjetoSalvo[]>([])
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    import('./cnaes.json').then((m) => setTabela(new Map(m.default as [string, string][])))
  }, [])

  const carregarSalvos = useCallback(async () => {
    const [r] = await comRetentativa(() => Promise.all([supabase.from('soc_objetos_sociais').select('id, titulo, texto, cnaes, created_at').order('titulo')]))
    if (r.error) setErro(r.error.message)
    else setSalvos((r.data as ObjetoSalvo[]) ?? [])
  }, [])

  useEffect(() => {
    carregarSalvos()
  }, [carregarSalvos])

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), [])

  const { codigos, invalidos } = useMemo(() => extrairCodigos(entrada), [entrada])
  const atividades: (AtividadeCnae & { oficial: string | null })[] = useMemo(
    () =>
      codigos.map((codigo) => {
        const oficial = tabela?.get(codigo) ?? null
        return { codigo, oficial, descricao: ajustes[codigo] ?? oficial ?? '' }
      }),
    [codigos, tabela, ajustes],
  )
  const semDescricao = atividades.filter((a) => !a.descricao.trim())

  function pararDigitacao() {
    if (timer.current) clearInterval(timer.current)
    timer.current = null
    setDigitando(false)
  }

  function gerar(animar = true) {
    setErro(null)
    const novo = gerarObjetoSocial(atividades, opcoes)
    pararDigitacao()
    setTexto(novo)
    setEditado(false)
    setGerado(true)
    if (!animar || semAnimacao()) return setVisivel(novo.length)
    setVisivel(0)
    setDigitando(true)
    const passo = Math.max(2, Math.ceil(novo.length / 160))
    let pos = 0
    timer.current = window.setInterval(() => {
      pos += passo + Math.floor(Math.random() * 2)
      if (pos >= novo.length) {
        setVisivel(novo.length)
        pararDigitacao()
      } else setVisivel(pos)
    }, 18)
  }

  // Mudou uma opção depois de gerar e o texto não foi editado: refaz na hora
  function mudarOpcao(parcial: Partial<OpcoesObjeto>) {
    const novas = { ...opcoes, ...parcial }
    setOpcoes(novas)
    if (gerado && !editado && !digitando && atividades.length) {
      const novo = gerarObjetoSocial(atividades, novas)
      setTexto(novo)
      setVisivel(novo.length)
    }
  }

  async function salvar() {
    if (!titulo.trim() || !texto.trim()) return
    const { error } = await supabase.from('soc_objetos_sociais').insert({ titulo: titulo.trim(), texto: texto.trim(), cnaes: codigos })
    if (error) return setErro(error.message)
    setSalvando(false)
    setTitulo('')
    setAviso('Objeto social salvo.')
    setTimeout(() => setAviso(null), 2500)
    carregarSalvos()
  }

  async function excluir(o: ObjetoSalvo) {
    if (!confirm(`Excluir o objeto social salvo "${o.titulo}"?`)) return
    const { error } = await supabase.from('soc_objetos_sociais').delete().eq('id', o.id)
    if (error) return setErro(error.message)
    setSalvos((l) => l.filter((x) => x.id !== o.id))
  }

  function usar(o: ObjetoSalvo) {
    pararDigitacao()
    setEntrada(o.cnaes.map(formatarCnae).join('\n'))
    setAjustes({})
    setTexto(o.texto)
    setVisivel(o.texto.length)
    setEditado(true)
    setGerado(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const termo = busca.trim().toLowerCase()
  const termoDigitos = termo.replace(/\D/g, '')
  const filtrados = salvos.filter(
    (o) => !termo || `${o.titulo} ${o.texto}`.toLowerCase().includes(termo) || (termoDigitos.length >= 4 && o.cnaes.some((c) => c.includes(termoDigitos))),
  )
  const podeGerar = atividades.length > 0 && semDescricao.length === 0 && !!tabela

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-gradient-to-br from-asap-950 via-asap-900 to-asap-700 pb-8 text-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <header className="relative mx-auto flex max-w-7xl items-center gap-4 px-4 py-4 sm:px-6">
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
        <div className="relative mx-auto max-w-7xl px-4 pt-4 sm:px-6">
          <p className="text-sm font-medium text-cyan-300">
            <Link para="/" className="hover:underline">
              Página inicial
            </Link>{' '}
            ›{' '}
            <Link para="/d/societario" className="hover:underline">
              Societário
            </Link>{' '}
            · Gerador de Objeto Social
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Gerador de Objeto Social</h1>
          <p className="mt-1 text-sm text-white/60">Informe os CNAEs e receba a cláusula do objeto social pronta para o contrato social ou a alteração.</p>
        </div>
      </div>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6">
        {erro && (
          <p className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {erro}
            <button onClick={() => setErro(null)} className="icon-btn" aria-label="Fechar aviso">
              <X className="h-4 w-4" />
            </button>
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-5">
            <Section title="CNAEs da empresa" icone={ListChecks}>
              <label htmlFor="cnaes" className="mb-1.5 block text-xs font-semibold text-slate-600">
                Digite ou cole os códigos. O primeiro é a atividade principal.
              </label>
              <textarea
                id="cnaes"
                className="input min-h-32 font-mono"
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                placeholder={'4711-3/02\n4781-4/00, 4782-2/01\n5611201'}
                spellCheck={false}
              />
              {invalidos.length > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  Não reconhecido (o código da subclasse tem 7 dígitos): {invalidos.join(', ')}
                </p>
              )}

              {atividades.length > 0 && (
                <ol className="mt-4 space-y-2">
                  {atividades.map((a, i) => (
                    <li key={a.codigo} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200/70">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-slate-700">{formatarCnae(a.codigo)}</span>
                        {i === 0 && <span className="rounded-full bg-brand-600 px-2 py-0.5 font-semibold text-white">Principal</span>}
                        {!a.oficial && tabela && <span className="rounded-full bg-rose-100 px-2 py-0.5 font-semibold text-rose-700">Não encontrado na CNAE 2.3</span>}
                        {a.oficial && ajustes[a.codigo] !== undefined && ajustes[a.codigo] !== a.oficial && (
                          <button
                            className="ml-auto flex cursor-pointer items-center gap-1 font-semibold text-slate-400 hover:text-brand-600"
                            onClick={() =>
                              setAjustes((s) => {
                                const n = { ...s }
                                delete n[a.codigo]
                                return n
                              })
                            }
                            title="Voltar para a descrição oficial"
                          >
                            <RotateCcw className="h-3 w-3" /> Descrição oficial
                          </button>
                        )}
                      </div>
                      <textarea
                        aria-label={`Descrição da atividade ${formatarCnae(a.codigo)}`}
                        rows={Math.max(1, Math.ceil(a.descricao.length / 60))}
                        className="w-full resize-none rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-700 [field-sizing:content] outline-none hover:border-slate-200 focus:border-brand-500 focus:bg-white"
                        value={a.descricao}
                        placeholder="Digite a descrição da atividade"
                        onChange={(e) => setAjustes((s) => ({ ...s, [a.codigo]: e.target.value }))}
                      />
                    </li>
                  ))}
                </ol>
              )}
              {!tabela && <p className="mt-3 text-xs text-slate-400">Carregando a tabela CNAE...</p>}
            </Section>

            <Section title="Opções do texto" icone={Settings2} cor="violet">
              <div className="mb-3 flex gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Finalidade">
                {(
                  [
                    ['constituicao', 'Contrato social'],
                    ['alteracao', 'Alteração contratual'],
                  ] as const
                ).map(([v, l]) => (
                  <button
                    key={v}
                    role="radio"
                    aria-checked={opcoes.finalidade === v}
                    onClick={() => mudarOpcao({ finalidade: v })}
                    className={`flex-1 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold transition ${opcoes.finalidade === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <Opcao
                id="op-especiais"
                marcado={opcoes.caracteresEspeciais}
                onChange={(v) => mudarOpcao({ caracteresEspeciais: v })}
                titulo="Incluir caracteres especiais?"
                ajuda="Desmarcado: usa somente vírgula e ponto final (sem ponto e vírgula, dois-pontos, hífen, parênteses ou barra). Os acentos são mantidos."
              />
              <Opcao
                id="op-caixa-alta"
                marcado={opcoes.caixaAlta}
                onChange={(v) => mudarOpcao({ caixaAlta: v })}
                titulo="Incluir texto todo em caixa alta?"
                ajuda="Escreve o objeto social inteiro em letras maiúsculas."
              />
              <Opcao
                id="op-agrupar"
                marcado={opcoes.agrupar}
                onChange={(v) => mudarOpcao({ agrupar: v })}
                titulo="Agrupar atividades semelhantes"
                ajuda="Junta atividades com o mesmo começo. Ex.: comércio varejista de calçados e de artigos do vestuário."
              />
              <button className="btn-primary mt-3 w-full py-3" disabled={!podeGerar || digitando} onClick={() => gerar()}>
                <Sparkles className="h-4 w-4" />
                {gerado ? 'Gerar novamente' : 'Gerar objeto social'}
              </button>
              {semDescricao.length > 0 && (
                <p className="mt-2 text-center text-xs text-rose-600">Informe a descrição dos códigos não encontrados para gerar o texto.</p>
              )}
            </Section>
          </div>

          <Section
            title="Objeto social"
            icone={FilePen}
            cor="emerald"
            actions={texto && !digitando ? <span className="text-xs text-slate-400 tabular-nums">{texto.length} caracteres</span> : undefined}
          >
            {!gerado ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                <Sparkles className="h-8 w-8 text-slate-300" />
                Digite os CNAEs ao lado e clique em <b className="text-slate-500">Gerar objeto social</b>.
              </div>
            ) : digitando ? (
              <div className="min-h-64 rounded-xl bg-slate-50 p-4 text-[0.95rem] leading-relaxed whitespace-pre-wrap text-slate-800 ring-1 ring-slate-200/70" aria-live="polite">
                {texto.slice(0, visivel)}
                <span className="ml-0.5 inline-block h-[1.1em] w-0.5 translate-y-[0.15em] animate-pulse bg-brand-500" />
              </div>
            ) : (
              <textarea
                id="objeto-social"
                aria-label="Texto do objeto social"
                className="input min-h-64 text-[0.95rem] leading-relaxed"
                rows={Math.max(8, Math.ceil(texto.length / 90))}
                value={texto}
                onChange={(e) => {
                  setTexto(e.target.value)
                  setVisivel(e.target.value.length)
                  setEditado(true)
                }}
              />
            )}

            {gerado && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {digitando ? (
                  <button className="btn-secondary" onClick={() => (pararDigitacao(), setVisivel(texto.length))}>
                    Mostrar tudo
                  </button>
                ) : (
                  <>
                    <BotaoCopiar texto={texto} className="btn-primary" />
                    <button className="btn-secondary" onClick={() => setSalvando((v) => !v)} disabled={!texto.trim()}>
                      <Save className="h-4 w-4" />
                      Salvar como padrão
                    </button>
                    {editado && <span className="text-xs text-slate-400">Texto editado à mão. As opções só mudam o texto ao gerar novamente.</span>}
                  </>
                )}
                {aviso && <span className="text-sm font-semibold text-emerald-600">{aviso}</span>}
              </div>
            )}

            {salvando && !digitando && (
              <form
                className="mt-3 flex flex-wrap gap-2 rounded-xl bg-brand-50 p-3 ring-1 ring-brand-100"
                onSubmit={(e) => {
                  e.preventDefault()
                  salvar()
                }}
              >
                <input
                  id="titulo-objeto"
                  autoFocus
                  className="input min-w-48 flex-1"
                  placeholder="Nome para encontrar depois (ex.: Supermercado com padaria)"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  required
                />
                <button className="btn-primary">
                  <Check className="h-4 w-4" />
                  Salvar
                </button>
                <button type="button" className="btn-ghost" onClick={() => setSalvando(false)}>
                  Cancelar
                </button>
              </form>
            )}
          </Section>
        </div>

        <Section
          title={`Objetos sociais salvos (${salvos.length})`}
          icone={Save}
          cor="amber"
          actions={
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input id="busca-objetos" className="input py-2 pl-9" placeholder="Buscar por nome, texto ou CNAE" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          }
        >
          {salvos.length === 0 ? (
            <p className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              Nenhum objeto social salvo ainda. Gere um texto e clique em <b className="text-slate-500">Salvar como padrão</b>.
            </p>
          ) : filtrados.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-400">Nenhum objeto social encontrado.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtrados.map((o) => (
                <article key={o.id} className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200/70">
                  <h4 className="font-bold text-slate-900">{o.titulo}</h4>
                  {o.cnaes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {o.cnaes.map((c) => (
                        <span key={c} className="rounded-md bg-white px-1.5 py-0.5 font-mono text-[0.7rem] text-slate-500 ring-1 ring-slate-200">
                          {formatarCnae(c)}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="line-clamp-4 text-sm text-slate-600">{o.texto}</p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-1">
                    <BotaoCopiar texto={o.texto} className="btn-primary btn-sm" />
                    <button className="btn-secondary btn-sm" onClick={() => usar(o)} title="Abrir no gerador para ajustar">
                      <Upload className="h-3.5 w-3.5" />
                      Abrir
                    </button>
                    <button className="btn-ghost btn-sm ml-auto hover:text-rose-600" onClick={() => excluir(o)} title="Excluir">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Section>
      </main>
    </div>
  )
}
