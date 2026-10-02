import { useState, type FormEvent } from 'react'
import { ArrowDownRight, ArrowUpRight, CalendarClock, Pause, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
import { CampoDia } from '../components/CampoDia'
import { SeletorPessoa } from '../components/SeletorPessoa'
import { Bolinha, Cabecalho, Campo, CampoValor, Carregando, Erro, Modal, Segmentado, Selecao, Vazio } from '../components/ui'
import { COR_NATUREZA, corDe, iconeDe } from '../components/visual'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { dataDaRecorrencia, hoje, type ModoDiaUtil } from '../lib/datas'
import { avisarMudanca, buscarRecorrencias, gerarRecorrencias, salvar, useDados } from '../lib/dados'
import { dataBR, moeda } from '../lib/formato'
import { mensalizado } from '../lib/plano'
import { Link } from '../lib/rotas'
import { supabase } from '../lib/supabase'
import { FREQUENCIAS, NATUREZAS, rotuloDe, type Natureza, type Recorrencia } from '../tipos'

export function Recorrentes() {
  const { categorias, contas, pessoas } = useApp()
  const d = useDados(buscarRecorrencias, [])
  const [edit, setEdit] = useState<Recorrencia | { tipo: 'receita' | 'despesa' } | null>(null)

  if (d.carregando) return <Carregando />
  const lista = d.dados ?? []
  const ativas = lista.filter((r) => r.ativa)
  const cats = new Map(categorias.map((c) => [c.id, c]))
  const nat = (r: Recorrencia): Natureza => r.natureza ?? (r.categoria_id ? cats.get(r.categoria_id)?.natureza : undefined) ?? 'fixa'
  const minhas = ativas.filter((r) => !r.pessoa_id)

  const receitas = somar(minhas.filter((r) => r.tipo === 'receita').map(mensalizado))
  const fixos = somar(minhas.filter((r) => r.tipo === 'despesa').map(mensalizado))
  // variáveis: o que está previsto no orçamento das categorias variáveis
  const variaveisPrev = categorias.filter((c) => c.tipo === 'despesa' && c.ativa && c.natureza !== 'fixa' && c.orcamento_mensal)
  const variaveis = somar(variaveisPrev.map((c) => c.orcamento_mensal!))
  const sobra = somar([receitas, -fixos, -variaveis])

  const grupo = (titulo: string, itens: Recorrencia[], tipo: 'receita' | 'despesa') => (
    <section className="cartao">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          {tipo === 'receita' ? <ArrowUpRight className="h-4 w-4 text-emerald-600" /> : <ArrowDownRight className="h-4 w-4 text-orange-600" />}
          {titulo}
        </h2>
        <button className="btn-secondary btn-sm" onClick={() => setEdit({ tipo })}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </div>
      {itens.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">{tipo === 'receita' ? 'Cadastre seu salário / pró-labore.' : 'Cadastre aluguel, condomínio, escola, plano de saúde, assinaturas, IPVA, IPTU...'}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {itens.map((r) => {
            const c = r.categoria_id ? cats.get(r.categoria_id) : undefined
            const cor = corDe(c?.cor)
            const conta = contas.find((x) => x.id === r.conta_id)
            const pessoa = pessoas.find((p) => p.id === r.pessoa_id)
            const n = nat(r)
            return (
              <button key={r.id} className={`flex w-full cursor-pointer items-center gap-3 py-2.5 text-left ${r.ativa ? '' : 'opacity-50'}`} onClick={() => setEdit(r)}>
                <Bolinha icone={iconeDe(c?.icone)} fundo={cor.fundo} texto={cor.texto} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{r.descricao}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500">
                    <span>{r.dia_util ? `${r.dia}º dia útil` : `dia ${r.dia}`}</span>
                    {r.intervalo_meses > 1 && <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-800">{FREQUENCIAS.find((f) => f.value === r.intervalo_meses)?.curto}</span>}·<span>{conta?.tipo === 'cartao' ? `💳 ${conta.nome}` : (conta?.nome ?? '?')}</span>
                    {tipo === 'despesa' && (
                      <span className="inline-flex items-center gap-1">
                        · <span className="h-2 w-2 rounded-sm" style={{ background: COR_NATUREZA[n] }} />
                        {rotuloDe(NATUREZAS, n)}
                      </span>
                    )}
                    {pessoa && <span className="rounded-full bg-amber-100 px-1.5 font-semibold text-amber-800">{pessoa.nome}</span>}
                    {r.fim && <span>· até {dataBR(r.fim)}</span>}
                    {!r.ativa && <span>· encerrada</span>}
                  </span>
                </span>
                <span className={`shrink-0 text-sm font-bold tabular-nums ${tipo === 'receita' ? 'text-emerald-600' : 'text-slate-900'}`}>{moeda(r.valor)}</span>
                <Pencil className="h-4 w-4 shrink-0 text-slate-300" />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )

  return (
    <div className="space-y-5">
      <Cabecalho
        titulo="Fixos e salário"
        descricao="Salário, aluguel, assinaturas e também despesas anuais (IPVA, IPTU, seguro, anuidade). Cadastre uma vez: o app lança sozinho, sempre até o mês seguinte."
      />
      {d.erro && <Erro>{d.erro}</Erro>}

      <section className="rounded-2xl bg-gradient-to-br from-azul-800 to-azul-950 p-5 text-white">
        <div className="text-xs font-semibold text-white/70">Meu mês planejado</div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Plano rotulo="Receitas fixas" valor={receitas} />
          <Plano rotulo="(−) Fixos e anuais (por mês)" valor={fixos} />
          <Plano rotulo="(−) Variáveis previstos" valor={variaveis} dica={variaveisPrev.length ? undefined : 'defina em Orçamento'} />
          <Plano rotulo="(=) Sobra prevista" valor={sobra} destaque />
        </div>
        {receitas > 0 && (
          <p className="mt-3 text-xs text-white/70">
            Custos fixos comprometem <b className="text-white">{Math.round((fixos / receitas) * 100)}%</b> da receita fixa.{' '}
            {fixos / receitas > 0.6 ? 'Acima de 60% é sinal de atenção.' : 'Dentro de uma faixa saudável.'}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {grupo(
          'Receitas recorrentes (salário, pró-labore...)',
          lista.filter((r) => r.tipo === 'receita'),
          'receita',
        )}
        {grupo(
          'Despesas recorrentes (fixas, assinaturas, anuais...)',
          lista.filter((r) => r.tipo === 'despesa'),
          'despesa',
        )}
      </div>

      <section className="cartao">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">Custos variáveis previstos por mês</h2>
          <Link para="/orcamento" className="btn-secondary btn-sm">
            Ajustar no Orçamento
          </Link>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Gastos que mudam todo mês (mercado, combustível, restaurantes). Não são lançados sozinhos: você lança cada gasto, e aqui entra o limite que você definiu para cada categoria.
        </p>
        {variaveisPrev.length === 0 ? (
          <Vazio>Nenhum limite definido para as categorias variáveis ainda.</Vazio>
        ) : (
          <div className="grid gap-x-6 sm:grid-cols-2">
            {variaveisPrev.map((c) => (
              <div key={c.id} className="flex justify-between border-b border-slate-100 py-1.5 text-sm">
                <span className="text-slate-700">{c.nome}</span>
                <span className="font-semibold tabular-nums">{moeda(c.orcamento_mensal)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {edit && <RecorrenciaForm inicial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

function Plano({ rotulo, valor, destaque, dica }: { rotulo: string; valor: number; destaque?: boolean; dica?: string }) {
  return (
    <div className={destaque ? 'rounded-xl bg-white/10 p-3 ring-1 ring-white/20' : 'p-3'}>
      <div className="text-[0.6875rem] font-semibold text-white/60">{rotulo}</div>
      <div className={`mt-0.5 text-base font-extrabold tabular-nums sm:text-xl ${destaque && valor < 0 ? 'text-rose-300' : ''}`}>{moeda(valor)}</div>
      {dica && <div className="text-[0.6875rem] text-white/50">{dica}</div>}
    </div>
  )
}

function RecorrenciaForm({ inicial, onClose }: { inicial: Recorrencia | { tipo: 'receita' | 'despesa' }; onClose: () => void }) {
  const { contas, categorias } = useApp()
  const edicao = 'id' in inicial ? inicial : null
  const [tipo, setTipo] = useState(inicial.tipo)
  const [descricao, setDescricao] = useState(edicao?.descricao ?? '')
  const [valor, setValor] = useState<number | null>(edicao?.valor ?? null)
  const [dia, setDia] = useState(edicao?.dia ?? 5)
  const [diaUtil, setDiaUtil] = useState<ModoDiaUtil | null>(edicao?.dia_util ?? null)
  const [intervalo, setIntervalo] = useState(edicao?.intervalo_meses ?? 1)
  const [contaId, setContaId] = useState(edicao?.conta_id ?? contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id ?? contas[0]?.id ?? '')
  const [categoriaId, setCategoriaId] = useState(edicao?.categoria_id ?? '')
  const [natureza, setNatureza] = useState<Natureza | ''>(edicao?.natureza ?? '')
  const [pessoaId, setPessoaId] = useState(edicao?.pessoa_id ?? '')
  const [autoPago, setAutoPago] = useState(edicao?.auto_pago ?? false)
  const [inicio, setInicio] = useState(edicao?.inicio ?? hoje().slice(0, 8) + '01')
  const [fim, setFim] = useState(edicao?.fim ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const cats = categorias.filter((c) => c.tipo === tipo && (c.ativa || c.id === categoriaId))
  const cat = categorias.find((c) => c.id === categoriaId)
  const ehCartao = contas.find((c) => c.id === contaId)?.tipo === 'cartao'

  async function gravar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!valor || valor <= 0) return setErro('Informe o valor.')
    if (!contaId) return setErro('Cadastre uma conta primeiro.')
    const desc = descricao.trim() || cat?.nome || ''
    if (!desc) return setErro('Informe uma descrição.')
    if (!dia || dia < 1 || dia > (diaUtil ? 23 : 31)) return setErro(diaUtil ? 'Informe qual dia útil (de 1 a 23).' : 'Informe o dia do mês (de 1 a 31).')
    const d = Math.floor(dia)
    const campos = {
      tipo,
      descricao: desc,
      valor,
      dia: d,
      dia_util: diaUtil,
      intervalo_meses: intervalo,
      conta_id: contaId,
      categoria_id: categoriaId || null,
      natureza: natureza || null,
      pessoa_id: tipo === 'despesa' ? pessoaId || null : null,
      auto_pago: autoPago,
      inicio,
      fim: fim || null,
    }
    setSalvando(true)
    try {
      await salvar('pes_recorrencias', edicao?.id, campos)
      if (edicao) {
        // atualiza os meses já lançados daqui para frente (reajuste, troca de conta, dia...)
        const hj = hoje()
        const { data: futuros, error } = await supabase.from('pes_lancamentos').select('id, competencia').eq('recorrencia_id', edicao.id).gte('data', hj)
        if (error) throw new Error(error.message)
        for (const l of futuros ?? []) {
          await supabase
            .from('pes_lancamentos')
            .update({
              descricao: desc,
              valor,
              conta_id: contaId,
              categoria_id: campos.categoria_id,
              natureza: campos.natureza,
              pessoa_id: campos.pessoa_id,
              ...(l.competencia ? { data: dataDaRecorrencia(l.competencia.slice(0, 7), d, diaUtil) } : {}),
            })
            .eq('id', l.id)
        }
        if (fim) await supabase.from('pes_lancamentos').delete().eq('recorrencia_id', edicao.id).gt('data', fim)
        avisarMudanca()
      }
      await gerarRecorrencias()
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  async function encerrar(apagar: boolean) {
    if (!edicao) return
    const msg = apagar
      ? 'Excluir esta recorrência? Os meses que já passaram continuam nos lançamentos; os futuros são apagados.'
      : 'Encerrar esta recorrência hoje? Os lançamentos futuros são apagados.'
    if (!window.confirm(msg)) return
    try {
      const hj = hoje()
      const { error } = await supabase.from('pes_lancamentos').delete().eq('recorrencia_id', edicao.id).gt('data', hj)
      if (error) throw new Error(error.message)
      if (apagar) {
        const r = await supabase.from('pes_recorrencias').delete().eq('id', edicao.id)
        if (r.error) throw new Error(r.error.message)
      } else await supabase.from('pes_recorrencias').update({ ativa: false, fim: hj }).eq('id', edicao.id)
      avisarMudanca()
      onClose()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      titulo={edicao ? 'Editar recorrência' : tipo === 'receita' ? 'Nova receita recorrente' : 'Nova despesa recorrente'}
      onClose={onClose}
      rodape={
        <>
          {edicao && (
            <div className="mr-auto flex gap-1">
              {edicao.ativa && (
                <button type="button" className="btn-secondary btn-sm" onClick={() => encerrar(false)}>
                  <Pause className="h-3.5 w-3.5" /> Encerrar
                </button>
              )}
              <button type="button" className="btn-danger btn-sm" onClick={() => encerrar(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Excluir
              </button>
            </div>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" form="form-recorrencia" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="form-recorrencia" onSubmit={gravar} className="space-y-4">
        {!edicao && (
          <Segmentado
            valor={tipo}
            onChange={(t) => {
              setTipo(t)
              setCategoriaId('')
            }}
            opcoes={[
              { value: 'receita', label: 'Receita (salário...)', ativo: 'text-emerald-600' },
              { value: 'despesa', label: 'Despesa fixa', ativo: 'text-rose-600' },
            ]}
          />
        )}
        <Campo label="Descrição">
          <input className="input" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'receita' ? 'Ex.: Pró-labore ASAP' : 'Ex.: Aluguel, condomínio, Netflix'} autoFocus={!edicao} />
        </Campo>
        <Campo label="Valor mensal">
          <CampoValor valor={valor} onChange={setValor} />
        </Campo>
        <div className="rounded-xl bg-azul-50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-600">{tipo === 'receita' ? 'Quando cai na conta' : 'Quando vence'}</div>
          <CampoDia dia={dia} setDia={setDia} modo={diaUtil} setModo={setDiaUtil} aPartirDe={inicio} intervalo={intervalo} setIntervalo={setIntervalo} valor={valor} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Categoria">
            <Selecao value={categoriaId} onChange={setCategoriaId} opcoes={cats.map((c) => ({ value: c.id, label: c.nome }))} vazio="Sem categoria" />
          </Campo>
          <Campo label={tipo === 'receita' ? 'Entra em' : 'Pago com'}>
            <Selecao value={contaId} onChange={setContaId} opcoes={contas.filter((c) => c.ativa || c.id === contaId).map((c) => ({ value: c.id, label: c.tipo === 'cartao' ? `💳 ${c.nome}` : c.nome }))} />
          </Campo>
          <Campo label="Classificação">
            <Selecao value={natureza} onChange={(v) => setNatureza(v as Natureza | '')} vazio={`${rotuloDe(NATUREZAS, cat?.natureza ?? 'variavel')} (padrão)`} opcoes={NATUREZAS} />
          </Campo>
          {tipo === 'despesa' && (
            <Campo label="Responsável">
              <SeletorPessoa valor={pessoaId} onChange={setPessoaId} />
            </Campo>
          )}
          <Campo label="Começa em">
            <input className="input" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required />
          </Campo>
          <Campo label="Termina em (opcional)">
            <input className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
          </Campo>
        </div>
        {!ehCartao && (
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-700">
            <input type="checkbox" className="h-5 w-5 accent-azul-600" checked={autoPago} onChange={(e) => setAutoPago(e.target.checked)} />
            {tipo === 'receita' ? 'Cai sozinho na conta (já nasce como recebido)' : 'Débito automático (já nasce como pago)'}
          </label>
        )}
        <p className="flex items-start gap-2 text-xs text-slate-500">
          {edicao ? <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {edicao
            ? 'Ao salvar, os meses a partir de hoje são atualizados com o novo valor, dia, conta e categoria. Os meses que já passaram ficam como estão.'
            : 'Ao salvar, o app lança os meses desde o início até o mês que vem, e continua lançando sozinho.'}
        </p>
        <Erro>{erro}</Erro>
      </form>
    </Modal>
  )
}
