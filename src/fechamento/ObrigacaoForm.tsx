import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CampoMes } from '../components/CampoData'
import { Field, Modal } from '../components/ui'
import {
  CORES,
  MESES_CURTOS,
  OPCOES_PADRAO,
  PERIODICIDADES,
  TERMO,
  corDe,
  competenciaAtual,
  competenciaDe,
  mesDe,
  novoIdOpcao,
  type Cor,
  type Departamento,
  type Obrigacao,
  type Opcao,
  type Periodicidade,
} from './tipos'

export function ObrigacaoForm({
  departamento,
  obrigacao,
  nomeSugerido,
  proximaOrdem,
  onClose,
  onSalvo,
}: {
  departamento: Departamento
  obrigacao: Obrigacao | null
  nomeSugerido?: string
  proximaOrdem: number
  onClose: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(obrigacao?.nome ?? nomeSugerido ?? '')
  // Cadastro em sistema é feito uma vez por empresa
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>(obrigacao?.periodicidade ?? (departamento === 'cadastros' ? 'unica' : 'mensal'))
  const [meses, setMeses] = useState<number[]>(obrigacao?.meses_entrega ?? [])
  const [limitarInicio, setLimitarInicio] = useState(!!obrigacao?.inicio)
  const [inicio, setInicio] = useState(obrigacao?.inicio ? mesDe(obrigacao.inicio) : competenciaAtual())
  const [encerrar, setEncerrar] = useState(!!obrigacao?.fim)
  const [fim, setFim] = useState(obrigacao?.fim ? mesDe(obrigacao.fim) : competenciaAtual())
  const [opcoes, setOpcoes] = useState<Opcao[]>(() => (obrigacao?.opcoes ?? OPCOES_PADRAO).map((o) => ({ ...o })))
  const [erro, setErro] = useState<string | null>(null)
  const termo = TERMO[departamento]
  const [salvando, setSalvando] = useState(false)

  const alterar = (i: number, campo: keyof Opcao, valor: string | boolean) => setOpcoes((l) => l.map((o, j) => (j === i ? { ...o, [campo]: valor } : o)))
  const mover = (i: number, d: number) =>
    setOpcoes((l) => {
      const n = [...l]
      const [x] = n.splice(i, 1)
      n.splice(i + d, 0, x)
      return n
    })

  function adicionar() {
    setOpcoes((l) => [...l, { id: '', label: '', cor: CORES[(l.length + 3) % CORES.length].value, concluido: false }])
  }

  async function salvar() {
    const limpas = opcoes.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label)
    if (!nome.trim()) return setErro(`Informe o nome d${termo.artigo} ${termo.um}.`)
    if (!limpas.length) return setErro('Crie pelo menos uma opção.')
    if (new Set(limpas.map((o) => o.label.toLowerCase())).size !== limpas.length) return setErro('Há opções com o mesmo nome.')
    if (periodicidade === 'anual' && !meses.length) return setErro('Marque o mês (ou os meses) do período de entrega.')
    if (encerrar && limitarInicio && fim < inicio) return setErro('O último mês não pode ser antes do início.')
    // Opção nova recebe um identificador fixo (renomear depois não perde as marcações)
    const ids: string[] = limpas.filter((o) => o.id).map((o) => o.id)
    const finais = limpas.map((o) => {
      if (o.id) return o
      const id = novoIdOpcao(o.label, ids)
      ids.push(id)
      return { ...o, id }
    })
    setSalvando(true)
    setErro(null)
    const dados = {
      departamento,
      nome: nome.trim(),
      opcoes: finais,
      periodicidade,
      meses_entrega: periodicidade === 'anual' ? [...meses].sort((a, b) => a - b) : null,
      inicio: limitarInicio ? competenciaDe(inicio) : null,
      fim: encerrar ? competenciaDe(fim) : null,
      updated_at: new Date().toISOString(),
    }
    const { error } = obrigacao
      ? await supabase.from('fech_obrigacoes').update(dados).eq('id', obrigacao.id)
      : await supabase.from('fech_obrigacoes').insert({ ...dados, ordem: proximaOrdem })
    setSalvando(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  async function excluir() {
    if (!obrigacao) return
    if (
      !confirm(
        `Excluir ${termo.artigo} ${termo.um} "${obrigacao.nome}" e TODAS as marcações dela em todos os meses?\n\nSe ela só deixou de existir a partir de um mês, use "Encerrar a partir de" para manter o histórico.`,
      )
    )
      return
    const { error } = await supabase.from('fech_obrigacoes').delete().eq('id', obrigacao.id)
    if (error) return setErro(error.message)
    onSalvo()
  }

  const removidas = obrigacao ? obrigacao.opcoes.filter((o) => !opcoes.some((n) => n.id === o.id)) : []

  return (
    <Modal
      title={obrigacao ? `Editar ${termo.um}` : termo.novo}
      subtitulo="Defina o nome, a periodicidade e as opções da caixa de seleção"
      onClose={onClose}
      largura="max-w-3xl"
      footer={
        <>
          {obrigacao && (
            <button className="btn-secondary mr-auto text-rose-600" onClick={excluir}>
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar} disabled={salvando}>
            <Check className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
        <Field label={`Nome d${termo.artigo} ${termo.um} *`}>
          <input
            id="obrigacao-nome"
            className="input"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            placeholder={departamento === 'cadastros' ? 'Ex.: Sistema contábil, banco, portal da prefeitura' : 'Ex.: Conciliação bancária'}
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Periodicidade *</span>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Periodicidade">
            {PERIODICIDADES.map((p) => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={periodicidade === p.value}
                onClick={() => setPeriodicidade(p.value)}
                className={`cursor-pointer rounded-xl border p-3 text-left transition ${periodicidade === p.value ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="text-sm font-bold text-slate-800">{p.label}</div>
                <div className="mt-0.5 text-xs text-slate-500">{p.ajuda}</div>
              </button>
            ))}
          </div>
        </div>
        {periodicidade === 'anual' && (
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Período de entrega (marque um ou mais meses) *</span>
            <div className="flex flex-wrap gap-1.5">
              {MESES_CURTOS.map((m, i) => {
                const n = i + 1
                const ativo = meses.includes(n)
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setMeses((l) => (ativo ? l.filter((x) => x !== n) : [...l, n]))}
                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition ${ativo ? 'border-brand-500 bg-brand-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                  >
                    {m}
                  </button>
                )
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {termo.artigo === 'a' ? 'A' : 'O'} {termo.um} aparece na visão por competência nesses meses e fica com uma marcação por ano.
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={limitarInicio} onChange={(e) => setLimitarInicio(e.target.checked)} />
            Só a partir de uma competência
          </label>
          {limitarInicio && (
            <Field label="Vale a partir de">
              <CampoMes value={inicio} onChange={setInicio} className="input" />
            </Field>
          )}
          <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={encerrar} onChange={(e) => setEncerrar(e.target.checked)} />
            Encerrar após
          </label>
          {encerrar && (
            <Field label="Última competência">
              <CampoMes value={fim} onChange={setFim} className="input" />
            </Field>
          )}
        </div>
        {!limitarInicio && <p className="text-xs text-slate-500">Vale para cada empresa desde a competência da data de abertura.</p>}
      </div>

      <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-800">Opções da caixa de seleção</h3>
          <button
            type="button"
            className="btn-secondary btn-sm"
            onClick={() => setOpcoes(OPCOES_PADRAO.map((o) => ({ ...o })))}
            title="Voltar para Pendente, Em andamento, Concluído e N/A"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Padrão
          </button>
        </div>
        <p className="text-xs text-slate-500">
          A primeira opção é a situação de quem ainda não foi marcado. Marque “conta como concluído” nas opções que encerram a tarefa.
        </p>
        <ul className="space-y-2">
          {opcoes.map((o, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-2 ring-1 ring-slate-100">
              <span className={`h-3 w-3 shrink-0 rounded-full ${corDe(o.cor).ponto}`} />
              <input
                className="input min-w-36 flex-1 py-1.5"
                value={o.label}
                placeholder="Nome da opção"
                onChange={(e) => alterar(i, 'label', e.target.value)}
              />
              <div className="flex gap-1" role="radiogroup" aria-label="Cor">
                {CORES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    aria-checked={o.cor === c.value}
                    role="radio"
                    onClick={() => alterar(i, 'cor', c.value as Cor)}
                    className={`h-6 w-6 cursor-pointer rounded-full ${c.ponto} ring-offset-1 transition ${o.cor === c.value ? 'ring-2 ring-slate-700' : 'opacity-60 hover:opacity-100'}`}
                  />
                ))}
              </div>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-emerald-600"
                  checked={o.concluido}
                  onChange={(e) => alterar(i, 'concluido', e.target.checked)}
                />
                conta como concluído
              </label>
              <div className="ml-auto flex">
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir" aria-label="Subir">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button type="button" className="icon-btn" disabled={i === opcoes.length - 1} onClick={() => mover(i, 1)} title="Descer" aria-label="Descer">
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="icon-btn hover:text-rose-600"
                  disabled={opcoes.length === 1}
                  onClick={() => setOpcoes((l) => l.filter((_, j) => j !== i))}
                  title="Remover opção"
                  aria-label="Remover opção"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-secondary btn-sm" onClick={adicionar}>
          <Plus className="h-3.5 w-3.5" />
          Adicionar opção
        </button>
        {removidas.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
            Empresas marcadas como {removidas.map((r) => `“${r.label}”`).join(', ')} passam a aparecer como “{opcoes[0]?.label || '—'}”.
          </p>
        )}
      </div>
    </Modal>
  )
}
