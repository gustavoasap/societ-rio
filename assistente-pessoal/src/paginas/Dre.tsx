import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { AbasAnalise } from '../components/Abas'
import { Cabecalho, Carregando, Erro, Modal, SeletorMes } from '../components/ui'
import { COR_NATUREZA } from '../components/visual'
import { useApp } from '../contexto'
import { somar } from '../lib/calculos'
import { mesAtual, somarMesesAoMes } from '../lib/datas'
import { buscarLancamentos, useDados } from '../lib/dados'
import { ehMeu, montarDre, naturezaDe, type Dre, type GrupoDre } from '../lib/financas'
import { dataBR, mesAbreviado, mesPorExtenso, moeda, percentual } from '../lib/formato'
import { mesDe } from '../lib/datas'
import type { Lancamento, Natureza } from '../tipos'

/** O que abrir no detalhe: uma linha (categoria) de um grupo, no ano todo ou num mês. */
interface AlvoDetalhe {
  tipo: 'receita' | 'despesa'
  natureza: Natureza
  categoriaId: string
  rotulo: string
  /** índice do mês (0–11) ou null = ano todo */
  mes: number | null
}
type AbrirDetalhe = (a: Omit<AlvoDetalhe, 'tipo'>) => void

const fmt = (v: number) => (v === 0 ? '–' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export function DrePagina() {
  const { categorias, pessoas } = useApp()
  const [ano, setAno] = useState(() => Number(mesAtual().slice(0, 4)))
  const [mes, setMes] = useState(mesAtual)
  const [detalhe, setDetalhe] = useState<AlvoDetalhe | null>(null)
  const lanc = useDados(() => buscarLancamentos(`${ano - 1}-12-01`, `${ano}-12-31`), [ano])

  if (lanc.carregando) return <Carregando />
  const meses = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)
  const dre = montarDre(lanc.dados ?? [], categorias, pessoas, meses)
  const ateHoje = meses.filter((m) => m <= mesAtual()).length || 12

  function exportar() {
    const linhas: string[][] = [['DRE pessoal', ...meses.map(mesAbreviado), 'Total']]
    const add = (r: string, v: number[], t: number) => linhas.push([r, ...v.map((x) => x.toFixed(2).replace('.', ',')), t.toFixed(2).replace('.', ',')])
    for (const g of dre.receitas) {
      add(g.rotulo, g.valores, g.total)
      for (const l of g.linhas) add(`   ${l.rotulo}`, l.valores, l.total)
    }
    add('RECEITA TOTAL', dre.receitaTotal, somar(dre.receitaTotal))
    for (const g of dre.despesas) {
      add(`(-) ${g.rotulo}`, g.valores, g.total)
      for (const l of g.linhas) add(`   ${l.rotulo}`, l.valores, l.total)
    }
    add('(-) DESPESA TOTAL', dre.despesaTotal, somar(dre.despesaTotal))
    add('(=) RESULTADO', dre.resultado, somar(dre.resultado))
    for (const t of dre.terceiros) add(`Gastos de terceiros: ${t.rotulo}`, t.valores, t.total)
    const csv = '﻿' + linhas.map((l) => l.map((c) => `"${c}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `dre-pessoal-${ano}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-5">
      <AbasAnalise />
      <Cabecalho
        titulo="DRE pessoal"
        descricao="Demonstração do resultado por competência: receitas, custos fixos, variáveis e eventuais. Só entra o que é meu."
        acoes={
          <button className="btn-secondary" onClick={exportar}>
            <Download className="h-4 w-4" /> Exportar (Excel/CSV)
          </button>
        }
      />
      {lanc.erro && <Erro>{lanc.erro}</Erro>}

      {/* Celular: um mês por vez, comparando com o anterior */}
      <div className="lg:hidden">
        <DreMes dre={dre} lancAno={ano} mes={mes} setMes={(m) => {
            if (Number(m.slice(0, 4)) !== ano) setAno(Number(m.slice(0, 4)))
            setMes(m)
          }} abrir={setDetalhe} />
      </div>

      {/* Computador: o ano inteiro */}
      <section className="cartao hidden overflow-hidden p-0 sm:p-0 lg:block">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-1">
            <button className="icon-btn" onClick={() => setAno(ano - 1)} aria-label="Ano anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 text-lg font-extrabold text-slate-900">{ano}</span>
            <button className="icon-btn" onClick={() => setAno(ano + 1)} aria-label="Próximo ano">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-xs text-slate-400">Valores em R$ · AV% = análise vertical sobre a receita total do ano · média considera {ateHoje} {ateHoje === 1 ? 'mês' : 'meses'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="sticky left-0 z-10 min-w-52 bg-slate-50 px-4 py-2 text-left font-semibold">Conta</th>
                {meses.map((m) => (
                  <th key={m} className={`px-2 py-2 text-right font-semibold ${m === mesAtual() ? 'text-azul-700' : ''}`}>
                    {mesAbreviado(m)}
                  </th>
                ))}
                <th className="bg-slate-100 px-3 py-2 text-right font-bold text-slate-700">Total</th>
                <th className="px-3 py-2 text-right font-semibold">Média</th>
                <th className="px-3 py-2 text-right font-semibold">AV%</th>
              </tr>
            </thead>
            <tbody>
              <Secao titulo="Receitas" />
              {dre.receitas.map((g) => (
                <Grupo key={g.natureza} g={g} receita={somar(dre.receitaTotal)} n={ateHoje} abrir={(a) => setDetalhe({ ...a, tipo: 'receita' })} />
              ))}
              <Total rotulo="Receita total" valores={dre.receitaTotal} receita={somar(dre.receitaTotal)} n={ateHoje} tom="azul" />
              <Secao titulo="Despesas" />
              {dre.despesas.map((g) => (
                <Grupo key={g.natureza} g={g} receita={somar(dre.receitaTotal)} n={ateHoje} negativo abrir={(a) => setDetalhe({ ...a, tipo: 'despesa' })} />
              ))}
              <Total rotulo="(−) Despesa total" valores={dre.despesaTotal} receita={somar(dre.receitaTotal)} n={ateHoje} tom="cinza" />
              <Total rotulo="(=) Resultado (sobra para investir)" valores={dre.resultado} receita={somar(dre.receitaTotal)} n={ateHoje} tom="resultado" />
              {dre.terceiros.length > 0 && (
                <>
                  <Secao titulo="Fora do resultado · gastos de terceiros (a reembolsar)" />
                  {dre.terceiros.map((t) => (
                    <tr key={t.id} className="text-slate-500">
                      <td className="sticky left-0 bg-white px-4 py-1.5 pl-6">{t.rotulo}</td>
                      {t.valores.map((v, i) => (
                        <td key={i} className="px-2 py-1.5 text-right">
                          {fmt(v)}
                        </td>
                      ))}
                      <td className="bg-slate-50 px-3 py-1.5 text-right font-semibold">{fmt(t.total)}</td>
                      <td />
                      <td />
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
        {dre.receitas.length === 0 && dre.despesas.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-400">Nenhum lançamento em {ano}.</p>}
      </section>
      <p className="hidden text-xs text-slate-400 lg:block">Clique no nome de uma categoria para ver os lançamentos do ano, ou num valor para ver os do mês.</p>
      {detalhe && <DetalheDre alvo={detalhe} meses={meses} lancamentos={lanc.dados ?? []} onClose={() => setDetalhe(null)} />}
    </div>
  )
}

/** Os lançamentos que formam um número da DRE: valor, data, descrição, de onde vem. */
function DetalheDre({ alvo, meses, lancamentos, onClose }: { alvo: AlvoDetalhe; meses: string[]; lancamentos: Lancamento[]; onClose: () => void }) {
  const { contas, categorias, abrirLancamento } = useApp()
  const cats = new Map(categorias.map((c) => [c.id, c]))
  const periodo = alvo.mes === null ? meses : [meses[alvo.mes]]
  const lista = lancamentos
    .filter(
      (l) =>
        l.tipo === alvo.tipo &&
        ehMeu(l) &&
        periodo.includes(mesDe(l.data)) &&
        (l.categoria_id ?? '') === alvo.categoriaId &&
        naturezaDe(l, cats) === alvo.natureza,
    )
    .sort((a, b) => a.data.localeCompare(b.data))
  const total = somar(lista.map((l) => l.valor))
  const origem = (l: Lancamento) => {
    const c = contas.find((x) => x.id === l.conta_id)
    const partes = [c ? (c.tipo === 'cartao' ? `💳 ${c.nome}` : c.nome) : '?']
    if (l.parcelas) partes.push(`parcela ${l.parcela}/${l.parcelas}`)
    if (l.recorrencia_id) partes.push('recorrente (Fixos)')
    if (l.compartilhado_id) partes.push('sua parte de despesa compartilhada')
    if (!l.pago) partes.push('não pago')
    return partes.join(' · ')
  }
  return (
    <Modal
      titulo={`${alvo.rotulo} · ${alvo.mes === null ? `ano de ${meses[0].slice(0, 4)}` : mesPorExtenso(meses[alvo.mes])}`}
      onClose={onClose}
      rodape={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Fechar
        </button>
      }
    >
      {lista.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum lançamento.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {lista.map((l) => (
            <button
              key={l.id}
              className="flex w-full cursor-pointer items-start gap-3 py-2.5 text-left hover:bg-slate-50"
              onClick={() => {
                onClose()
                abrirLancamento(l)
              }}
              title="Abrir o lançamento"
            >
              <span className="w-20 shrink-0 text-xs text-slate-500 tabular-nums">{dataBR(l.data)}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-800">{l.descricao}</span>
                {l.observacao && <span className="block text-xs text-slate-600">{l.observacao}</span>}
                <span className="block text-xs text-slate-400">{origem(l)}</span>
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums">{moeda(l.valor)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm font-bold">
        <span>
          Total ({lista.length} {lista.length === 1 ? 'lançamento' : 'lançamentos'})
        </span>
        <span className="tabular-nums">{moeda(total)}</span>
      </div>
      <p className="text-xs text-slate-400">Pela data do lançamento (no cartão, a data da compra ou da parcela). Toque num lançamento para abrir e editar.</p>
    </Modal>
  )
}

function Secao({ titulo }: { titulo: string }) {
  return (
    <tr>
      <td colSpan={16} className="sticky left-0 bg-white px-4 pt-4 pb-1 text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
        {titulo}
      </td>
    </tr>
  )
}

function Grupo({ g, receita, n, negativo, abrir }: { g: GrupoDre; receita: number; n: number; negativo?: boolean; abrir: AbrirDetalhe }) {
  const [aberto, setAberto] = useState(true)
  return (
    <>
      <tr className="cursor-pointer border-t border-slate-100 font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setAberto(!aberto)}>
        <td className="sticky left-0 bg-white px-4 py-2">
          <span className="flex items-center gap-2">
            <ChevronRight className={`h-3.5 w-3.5 text-slate-400 transition ${aberto ? 'rotate-90' : ''}`} />
            {negativo && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_NATUREZA[g.natureza] }} />}
            {negativo ? '(−) ' : ''}
            {g.rotulo}
          </span>
        </td>
        {g.valores.map((v, i) => (
          <td key={i} className="px-2 py-2 text-right">
            {fmt(v)}
          </td>
        ))}
        <td className="bg-slate-50 px-3 py-2 text-right">{fmt(g.total)}</td>
        <td className="px-3 py-2 text-right text-slate-500">{fmt(g.total / n)}</td>
        <td className="px-3 py-2 text-right text-slate-500">{receita ? percentual(g.total / receita, 1) : '–'}</td>
      </tr>
      {aberto &&
        g.linhas.map((l) => (
          <tr key={l.id} className="text-slate-600">
            <td className="sticky left-0 bg-white py-1.5 pr-4 pl-12">
              <button className="cursor-pointer text-left hover:text-azul-700 hover:underline" title="Ver os lançamentos do ano" onClick={() => abrir({ natureza: g.natureza, categoriaId: l.id, rotulo: l.rotulo, mes: null })}>
                {l.rotulo}
              </button>
            </td>
            {l.valores.map((v, i) => (
              <td key={i} className="px-2 py-1.5 text-right">
                {v ? (
                  <button className="cursor-pointer rounded px-1 hover:bg-azul-50 hover:text-azul-700" title="Ver os lançamentos do mês" onClick={() => abrir({ natureza: g.natureza, categoriaId: l.id, rotulo: l.rotulo, mes: i })}>
                    {fmt(v)}
                  </button>
                ) : (
                  fmt(v)
                )}
              </td>
            ))}
            <td className="bg-slate-50 px-3 py-1.5 text-right">{fmt(l.total)}</td>
            <td className="px-3 py-1.5 text-right text-slate-400">{fmt(l.total / n)}</td>
            <td className="px-3 py-1.5 text-right text-slate-400">{receita ? percentual(l.total / receita, 1) : '–'}</td>
          </tr>
        ))}
    </>
  )
}

function Total({ rotulo, valores, receita, n, tom }: { rotulo: string; valores: number[]; receita: number; n: number; tom: 'azul' | 'cinza' | 'resultado' }) {
  const total = somar(valores)
  const cls = tom === 'resultado' ? 'bg-azul-800 text-white' : tom === 'azul' ? 'bg-azul-50 text-azul-900' : 'bg-slate-100 text-slate-800'
  const sticky = tom === 'resultado' ? 'bg-azul-800' : tom === 'azul' ? 'bg-azul-50' : 'bg-slate-100'
  const neg = (v: number) => (tom === 'resultado' && v < 0 ? 'text-rose-300' : '')
  return (
    <tr className={`font-bold ${cls}`}>
      <td className={`sticky left-0 px-4 py-2.5 ${sticky}`}>{rotulo}</td>
      {valores.map((v, i) => (
        <td key={i} className={`px-2 py-2.5 text-right ${neg(v)}`}>
          {fmt(v)}
        </td>
      ))}
      <td className={`px-3 py-2.5 text-right ${neg(total)}`}>{fmt(total)}</td>
      <td className={`px-3 py-2.5 text-right ${neg(total)}`}>{fmt(total / n)}</td>
      <td className="px-3 py-2.5 text-right">{receita ? percentual(total / receita, 1) : '–'}</td>
    </tr>
  )
}

/** DRE de um mês, com a variação em relação ao mês anterior (visão do celular). */
function DreMes({ dre, lancAno, mes, setMes, abrir }: { dre: Dre; lancAno: number; mes: string; setMes: (m: string) => void; abrir: (a: AlvoDetalhe) => void }) {
  const i = Number(mes.slice(5, 7)) - 1
  const valido = Number(mes.slice(0, 4)) === lancAno
  const ant = i - 1
  const receita = valido ? dre.receitaTotal[i] : 0
  const linha = (rotulo: ReactNode, v: number, anterior: number | null, cls = '', sub = false) => (
    <div className={`flex items-center justify-between gap-2 py-1.5 ${sub ? 'pl-5 text-slate-600' : 'font-semibold text-slate-800'} ${cls}`}>
      <span className="min-w-0 truncate">{rotulo}</span>
      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
        {anterior !== null && anterior !== 0 && v !== anterior && (
          <span className="text-[0.6875rem] text-slate-400">
            {v > anterior ? '▲' : '▼'} {percentual(Math.abs(v - anterior) / anterior)}
          </span>
        )}
        {moeda(v)}
      </span>
    </div>
  )
  return (
    <div className="space-y-3">
      <SeletorMes mes={mes} onChange={setMes} />
      {!valido ? (
        <Carregando />
      ) : (
        <section className="cartao text-sm">
          <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase first-letter:uppercase">{mesPorExtenso(mes)}</div>
          {dre.receitas.map((g) => (
            <div key={g.natureza}>
              {linha(g.rotulo, g.valores[i], ant >= 0 ? g.valores[ant] : null)}
              {g.linhas.filter((l) => l.valores[i]).map((l) => linha(<button className="text-left hover:underline" onClick={() => abrir({ tipo: 'receita', natureza: g.natureza, categoriaId: l.id, rotulo: l.rotulo, mes: i })}>{l.rotulo}</button>, l.valores[i], null, '', true))}
            </div>
          ))}
          {linha('Receita total', dre.receitaTotal[i], ant >= 0 ? dre.receitaTotal[ant] : null, 'mt-1 rounded-lg bg-azul-50 px-2 text-azul-900')}
          <div className="h-2" />
          {dre.despesas.map((g) => (
            <div key={g.natureza}>
              {linha(
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_NATUREZA[g.natureza] }} />
                  (−) {g.rotulo}
                  {receita > 0 && g.valores[i] > 0 && <span className="text-xs font-normal text-slate-400">{percentual(g.valores[i] / receita)}</span>}
                </span>,
                g.valores[i],
                ant >= 0 ? g.valores[ant] : null,
              )}
              {g.linhas.filter((l) => l.valores[i]).map((l) => linha(<button className="text-left hover:underline" onClick={() => abrir({ tipo: 'despesa', natureza: g.natureza, categoriaId: l.id, rotulo: l.rotulo, mes: i })}>{l.rotulo}</button>, l.valores[i], null, '', true))}
            </div>
          ))}
          {linha('(−) Despesa total', dre.despesaTotal[i], ant >= 0 ? dre.despesaTotal[ant] : null, 'mt-1 rounded-lg bg-slate-100 px-2')}
          {linha(
            '(=) Resultado',
            dre.resultado[i],
            null,
            `mt-2 rounded-lg px-2 py-2.5 text-white ${dre.resultado[i] < 0 ? 'bg-rose-600' : 'bg-azul-800'}`,
          )}
          {receita > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Taxa de poupança: <b>{percentual(dre.resultado[i] / receita)}</b>
            </p>
          )}
          {dre.terceiros.some((t) => t.valores[i]) && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <div className="text-xs font-bold text-slate-400 uppercase">Fora do resultado · gastos de terceiros</div>
              {dre.terceiros.filter((t) => t.valores[i]).map((t) => linha(t.rotulo, t.valores[i], null, 'text-slate-500', true))}
            </div>
          )}
        </section>
      )}
      <p className="text-center text-xs text-slate-400">
        No computador, a DRE mostra o ano inteiro, mês a mês.{' '}
        <button className="font-semibold text-azul-600" onClick={() => setMes(somarMesesAoMes(mesAtual(), 0))}>
          Ir para o mês atual
        </button>
      </p>
    </div>
  )
}
