import { useMemo, useState, type ReactNode } from 'react'
import { FileDown, Printer } from 'lucide-react'
import { mascaraCnpj } from '../../../lib/format'
import { apurar } from '../../engine/apuracao'
import { nomeMes } from '../../engine/base'
import { linhasDre } from '../../engine/dre'
import { LEGISLACAO } from '../../engine/legislacao'
import { montarAnoBase } from '../../engine/projecao'
import { regrasDoAno } from '../../engine/tabelas'
import { REGIMES, type RegimeId, type Resultado } from '../../engine/tipos'
import { COR_REGIME, moeda, nomeRegime, pct, recomendacao } from '../../formatacao'
import type { EmpresaComEstab } from '../../dados'
import { PontoRegime, TabelaTributos } from '../comum'
import type { DadosAnalise } from '../contexto'
import { BarrasAgrupadas, Legenda } from '../graficos'

type Secao = 'resumo' | 'comparativo' | 'dre' | 'icms' | 'reforma' | 'premissas' | 'legislacao'

const SECOES: { id: Secao; label: string }[] = [
  { id: 'resumo', label: 'Resumo executivo' },
  { id: 'comparativo', label: 'Comparativo de regimes' },
  { id: 'dre', label: 'DRE por regime' },
  { id: 'icms', label: 'ICMS, DIFAL e créditos' },
  { id: 'reforma', label: 'Reforma 2026–2033' },
  { id: 'premissas', label: 'Premissas' },
  { id: 'legislacao', label: 'Legislação' },
]

const REGIMES_HOJE: RegimeId[] = ['simples', 'presumido', 'real']

function Bloco({ titulo, children, quebra }: { titulo: string; children: ReactNode; quebra?: boolean }) {
  return (
    <section className={`relatorio-bloco ${quebra ? 'relatorio-quebra' : ''}`}>
      <h2 className="mb-3 border-b-2 border-asap-900 pb-1 text-base font-extrabold tracking-tight text-asap-900 uppercase">{titulo}</h2>
      {children}
    </section>
  )
}

export function Relatorio({ d, empresa }: { d: DadosAnalise; empresa: EmpresaComEstab }) {
  const { params } = d
  const [secoes, setSecoes] = useState<Set<Secao>>(new Set(SECOES.map((s) => s.id)))
  const tem = (s: Secao) => secoes.has(s)

  // período do relatório: último ano com movimento importado
  const anosDados = [...new Set(d.bases.map((b) => b.competencia.slice(0, 4)))].sort()
  const anoRef = anosDados[anosDados.length - 1]
  const meses = useMemo(() => d.bases.filter((b) => b.competencia.startsWith(anoRef)), [d.bases, anoRef])
  const resultados = useMemo(() => REGIMES_HOJE.map((r) => apurar(r, meses, d.ctx)), [meses, d.ctx])
  if (!meses.length) return null
  const periodo = `${nomeMes(meses[0].competencia)} a ${nomeMes(meses[meses.length - 1].competencia)}`
  const rec = recomendacao(resultados, d.regimeAtual, periodo)
  const atual = resultados.find((r) => r.regime === d.regimeAtual) ?? resultados[0]
  const melhor = resultados.find((r) => r.regime === rec?.melhor) ?? atual
  const fatorAno = meses.length ? 12 / meses.length : 1
  const economiaAno = (atual.total - melhor.total) * fatorAno
  const anoBase = montarAnoBase(d.bases)
  const matriz = empresa.trib_estabelecimentos.find((e) => e.matriz) ?? empresa.trib_estabelecimentos[0]
  const hoje = new Date().toLocaleDateString('pt-BR')
  const series = REGIMES.map((r) => ({ id: r.value, label: r.curto, cor: COR_REGIME[r.value] }))
  const alertas = [...new Set(resultados.flatMap((r) => r.alertas))]
  const regras27 = regrasDoAno(2027, params.cbsReferencia, params.ibsReferencia, params.aliquotasAno['2027'])
  const regras33 = regrasDoAno(2033, params.cbsReferencia, params.ibsReferencia, params.aliquotasAno['2033'])

  function gerarPdf() {
    const titulo = document.title
    document.title = `Planejamento tributário - ${empresa.razao_social} - ${hoje.replace(/\//g, '-')}`
    window.print()
    document.title = titulo
  }

  const dreDe = (r: Resultado) => linhasDre(r.dre)
  const chavesDre = ['rb', 'rl', 'lb', 'op', 'lair', 'irpj', 'csll', 'll']

  return (
    <div className="space-y-5">
      <div className="no-print rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-800">Relatório para o cliente</h3>
            <p className="text-sm text-slate-500">Escolha as seções, escreva suas observações e gere o PDF (na janela de impressão, selecione “Salvar como PDF”).</p>
          </div>
          <button className="btn-primary" onClick={gerarPdf}>
            <FileDown className="h-4 w-4" /> Gerar PDF
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
          {SECOES.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={tem(s.id)}
                onChange={(e) =>
                  setSecoes((x) => {
                    const n = new Set(x)
                    if (e.target.checked) n.add(s.id)
                    else n.delete(s.id)
                    return n
                  })
                }
              />
              {s.label}
            </label>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="text-xs font-semibold text-slate-500">Observações do contador (saem no relatório e ficam salvas)</span>
          <textarea
            className="input mt-1 min-h-24"
            value={params.observacoesRelatorio}
            placeholder="Ex.: recomendamos a mudança para o Lucro Presumido em janeiro, com revisão do cadastro de NCM..."
            onChange={(e) => d.onParams({ ...params, observacoesRelatorio: e.target.value })}
          />
        </label>
      </div>

      <article className="relatorio mx-auto max-w-[210mm] space-y-7 bg-white p-8 text-[0.8125rem] leading-relaxed text-slate-800 shadow-lg ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0">
        <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-brand-700 uppercase">Análise e planejamento tributário</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">{empresa.razao_social}</h1>
            <p className="text-slate-600">
              {matriz?.cnpj ? `CNPJ ${mascaraCnpj(matriz.cnpj)} · ` : ''}
              {matriz?.municipio ? `${matriz.municipio}/` : ''}
              {matriz?.uf} · Regime atual: <strong>{nomeRegime(d.regimeAtual)}</strong>
            </p>
            <p className="text-slate-600">
              Período analisado: <strong>{periodo}</strong> · {empresa.trib_estabelecimentos.length} estabelecimento(s) consolidados · Emitido em {hoje}
            </p>
          </div>
          <img src="/logo-asap.png" alt="ASAP Assessoria Contábil" className="h-10 w-auto shrink-0 rounded bg-asap-900 p-1.5" />
        </header>

        {tem('resumo') && (
          <Bloco titulo="Resumo executivo">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
              <Indicador titulo="Receita bruta no período" valor={moeda(atual.receita)} />
              <Indicador titulo={`Carga no regime atual (${nomeRegime(d.regimeAtual)})`} valor={pct(atual.carga)} detalhe={moeda(atual.total)} />
              <Indicador titulo="Regime de menor carga" valor={nomeRegime(melhor.regime)} detalhe={`${pct(melhor.carga)} · ${moeda(melhor.total)}`} />
              <Indicador titulo="Economia anual estimada" valor={economiaAno > 0.5 ? moeda(economiaAno) : '—'} detalhe={economiaAno > 0.5 ? 'trocando para o regime de menor carga' : 'o regime atual já é o mais econômico'} />
            </div>
            {rec && <p className="mt-3 rounded-lg bg-slate-50 px-4 py-3">{rec.texto}</p>}
            <p className="mt-3 font-semibold">Regime de menor carga em cada ano da Reforma Tributária:</p>
            <div className="mt-1 grid grid-cols-4 gap-2 sm:grid-cols-8 print:grid-cols-8">
              {d.anos.map((a) => (
                <div key={a.ano} className="rounded-lg border border-slate-200 px-2 py-1.5 text-center">
                  <div className="text-xs text-slate-500">{a.ano}</div>
                  <div className="flex items-center justify-center gap-1 text-xs font-bold">
                    {a.melhor && <PontoRegime regime={a.melhor} />}
                    {a.melhor ? nomeRegime(a.melhor) : '—'}
                  </div>
                </div>
              ))}
            </div>
            {params.observacoesRelatorio.trim() && (
              <div className="mt-4 rounded-lg border-l-4 border-brand-500 bg-brand-50/50 px-4 py-3">
                <p className="text-xs font-bold tracking-wider text-brand-700 uppercase">Observações do contador</p>
                <p className="mt-1 whitespace-pre-line">{params.observacoesRelatorio}</p>
              </div>
            )}
          </Bloco>
        )}

        {tem('comparativo') && (
          <Bloco titulo={`Comparativo de regimes — ${periodo}`}>
            <TabelaTributos
              receita
              destaque={rec?.melhor}
              colunas={resultados.map((r) => ({ id: r.regime, titulo: nomeRegime(r.regime), tributos: r.tributos, total: r.total, receita: r.receita }))}
            />
            {resultados.some((r) => !r.elegivel) && (
              <p className="mt-2 text-xs text-rose-700">{resultados.filter((r) => !r.elegivel).map((r) => `${nomeRegime(r.regime)}: ${r.motivo}`).join(' ')}</p>
            )}
          </Bloco>
        )}

        {tem('dre') && (
          <Bloco titulo={`DRE gerencial por regime — ${periodo}`} quebra>
            <table className="w-full text-right tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-[0.6875rem] font-bold tracking-wider text-slate-500 uppercase">
                  <th className="py-1.5 text-left" />
                  {resultados.map((r) => (
                    <th key={r.regime} className="px-2 py-1.5">
                      {nomeRegime(r.regime)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dreDe(resultados[0])
                  .filter((l) => chavesDre.includes(l.chave) || l.tipo === 'deducao')
                  .map((l) => l.chave)
                  .concat(resultados.flatMap((r) => dreDe(r).filter((l) => l.chave.startsWith('ded-')).map((l) => l.chave)))
                  .filter((k, i, arr) => arr.indexOf(k) === i)
                  .sort((a, b) => ordemDre(a) - ordemDre(b))
                  .map((k) => {
                    const linhas = resultados.map((r) => dreDe(r).find((l) => l.chave === k))
                    const ref = linhas.find(Boolean)!
                    const forte = ref.tipo === 'subtotal' || ref.tipo === 'resultado' || ref.tipo === 'receita'
                    return (
                      <tr key={k} className={`border-b border-slate-100 ${forte ? 'font-bold' : ''} ${ref.tipo === 'resultado' ? 'bg-slate-50' : ''}`}>
                        <td className="py-1 text-left">{ref.rotulo}</td>
                        {linhas.map((l, i) => (
                          <td key={i} className={`px-2 py-1 ${l && l.valor < 0 ? 'text-slate-600' : ''}`}>
                            {l && Math.abs(l.valor) >= 0.005 ? moeda(l.valor) : '—'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Custos pelo valor das notas de compra; despesas conforme parâmetros informados. Lucro Real apurado sobre o lucro da DRE.</p>
          </Bloco>
        )}

        {tem('icms') && (
          <Bloco titulo="ICMS, DIFAL e créditos">
            <table className="w-full text-right tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-[0.6875rem] font-bold tracking-wider text-slate-500 uppercase">
                  <th className="py-1.5 text-left" />
                  {resultados.map((r) => (
                    <th key={r.regime} className="px-2 py-1.5">
                      {nomeRegime(r.regime)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['ICMS dentro do DAS', (r: Resultado) => r.icms.noDas],
                    ['ICMS próprio (débito nas vendas)', (r: Resultado) => r.icms.proprio],
                    ['DIFAL — vendas a não contribuinte', (r: Resultado) => r.icms.difal],
                    ['(−) Créditos de ICMS', (r: Resultado) => -r.icms.credito],
                    ['ICMS-ST nas entradas', (r: Resultado) => r.icms.st],
                    ['Antecipação nas entradas', (r: Resultado) => r.icms.antecipacao],
                    ['Créditos de PIS/COFINS', (r: Resultado) => r.creditos.pisCofinsCompras + r.creditos.pisCofinsDespesas],
                  ] as [string, (r: Resultado) => number][]
                )
                  .filter(([, f]) => resultados.some((r) => Math.abs(f(r)) > 0.5))
                  .map(([rot, f]) => (
                    <tr key={rot} className="border-b border-slate-100">
                      <td className="py-1 text-left">{rot}</td>
                      {resultados.map((r) => (
                        <td key={r.regime} className="px-2 py-1">
                          {Math.abs(f(r)) > 0.005 ? moeda(f(r)) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              O Simples Nacional não recolhe DIFAL nas vendas a não contribuinte (STF, ADI 5464), mas paga ICMS-ST e antecipação nas entradas interestaduais (LC 123/2006, art. 13,
              §1º, XIII).
            </p>
          </Bloco>
        )}

        {tem('reforma') && (
          <Bloco titulo="Reforma Tributária — projeção 2026 a 2033" quebra>
            <p className="mb-2 text-slate-600">
              Ano-base de {anoBase.mesesReais} {anoBase.mesesReais === 1 ? 'mês' : 'meses'} importados{anoBase.anualizado ? ' (demais meses pela média)' : ''}, crescimento de{' '}
              {params.crescimentoAnual.toLocaleString('pt-BR')}% ao ano. Carga tributária total por regime:
            </p>
            <div className="mb-2">
              <Legenda series={series} />
            </div>
            <BarrasAgrupadas
              altura={220}
              series={series}
              formatar={moeda}
              destaque={(gi, s) => d.anos[gi]?.melhor === s}
              grupos={d.anos.map((a) => ({ rotulo: String(a.ano), valores: Object.fromEntries(Object.entries(a.resultados).map(([k, r]) => [k, r!.total])) }))}
            />
            <table className="mt-3 w-full text-right tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 text-[0.6875rem] font-bold tracking-wider text-slate-500 uppercase">
                  <th className="py-1.5 text-left">Ano</th>
                  <th className="px-2 py-1.5">Receita</th>
                  {REGIMES.map((r) => (
                    <th key={r.value} className="px-2 py-1.5">
                      {r.curto}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.anos.map((a) => (
                  <tr key={a.ano} className="border-b border-slate-100">
                    <td className="py-1 text-left font-semibold">{a.ano}</td>
                    <td className="px-2 py-1">{moeda(a.receita)}</td>
                    {REGIMES.map((r) => {
                      const x = a.resultados[r.value]
                      return (
                        <td key={r.value} className={`px-2 py-1 ${a.melhor === r.value ? 'bg-emerald-50 font-bold text-emerald-800' : ''}`}>
                          {x ? (
                            <>
                              {moeda(x.total)}
                              <div className="text-[0.625rem] text-slate-500">{pct(x.carga)}</div>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">
              Em destaque, o regime de menor carga de cada ano. Simples híbrido = DAS sem a CBS/IBS, que passam a ser recolhidos por fora com direito a crédito (LC 214/2025, art. 41).
            </p>
          </Bloco>
        )}

        {tem('premissas') && (
          <Bloco titulo="Premissas e pontos de atenção">
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Alíquotas de referência: CBS {params.cbsReferencia.toLocaleString('pt-BR')}% e IBS {params.ibsReferencia.toLocaleString('pt-BR')}% (2033). Em 2027 e 2028: CBS{' '}
                {pct(regras27.cbs)} e IBS {pct(regras27.ibs)}; de 2029 a 2032 o IBS sobe em 10% ao ano enquanto ICMS e ISS caem na mesma proporção; em 2033: CBS {pct(regras33.cbs)} e IBS{' '}
                {pct(regras33.ibs)}.
              </li>
              <li>
                Preço de venda na reforma:{' '}
                {params.premissaPreco === 'repasse'
                  ? 'o PIS/COFINS extinto sai do preço e a CBS/IBS é somada por fora (repasse).'
                  : 'o valor total ao cliente é mantido; a CBS/IBS passa a ocupar o espaço do PIS/COFINS extinto.'}
              </li>
              <li>PIS/COFINS no Lucro Real: {params.realPisCofinsCumulativo ? 'cumulativo (Lei 10.833/2003, art. 10).' : 'não cumulativo, com créditos (Leis 10.637/2002 e 10.833/2003).'}</li>
              <li>Exclusão do ICMS da base do PIS/COFINS (STF, Tema 69): {params.excluirIcmsBasePisCofins ? 'considerada' : 'não considerada'}.</li>
              <li>
                Crédito de CBS/IBS sobre compras: integral de fornecedores do regime regular; limitado ao valor pago no DAS de fornecedores do Simples; sem crédito de MEI e pessoa
                física (LC 214/2025, art. 47).
              </li>
              {params.cenarioIcms.ativo && <li>Cenário de ICMS simulado: {params.cenarioIcms.descricao || `saídas a partir de ${params.cenarioIcms.uf}`}.</li>}
              {(params.cfopsExcluidos.length > 0 || params.parceirosExcluidos.length > 0) && (
                <li>
                  Desconsiderados na análise: {params.cfopsExcluidos.length} CFOP(s) e {params.parceirosExcluidos.length} cliente(s)/fornecedor(es).
                </li>
              )}
              {alertas.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Bloco>
        )}

        {tem('legislacao') && (
          <Bloco titulo="Legislação aplicada" quebra>
            <ul className="space-y-1.5">
              {LEGISLACAO.map((n) => (
                <li key={n.sigla}>
                  <strong>{n.sigla}</strong> — {n.titulo}.{' '}
                  <a href={n.url} className="break-all text-brand-700 underline">
                    {n.url}
                  </a>
                </li>
              ))}
            </ul>
          </Bloco>
        )}

        <footer className="border-t border-slate-200 pt-3 text-[0.6875rem] text-slate-500">
          Estudo elaborado pela ASAP Assessoria Contábil com base nos relatórios fiscais importados e nos parâmetros informados. As projeções da Reforma Tributária dependem da
          regulamentação e das alíquotas de referência ainda a serem fixadas pelo Senado Federal (LC 214/2025, arts. 18 e 353 a 359). Este documento não substitui a análise
          individual de cada operação.
          <div className="mt-8 grid grid-cols-2 gap-10 text-center text-xs text-slate-600">
            <div className="border-t border-slate-400 pt-1">ASAP Assessoria Contábil</div>
            <div className="border-t border-slate-400 pt-1">{empresa.razao_social}</div>
          </div>
        </footer>
      </article>

      <div className="no-print flex justify-center">
        <button className="btn-secondary" onClick={gerarPdf}>
          <Printer className="h-4 w-4" /> Imprimir / salvar em PDF
        </button>
      </div>
    </div>
  )
}

const ORDEM_DRE = ['rb', 'dev', 'ded-', 'rl', 'cmv', 'lb', 'op', 'lair', 'irpj', 'csll', 'll']
function ordemDre(k: string) {
  const i = ORDEM_DRE.findIndex((o) => (o.endsWith('-') ? k.startsWith(o) : k === o))
  return i < 0 ? 99 : i
}

function Indicador({ titulo, valor, detalhe }: { titulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-[0.625rem] font-semibold tracking-wider text-slate-500 uppercase">{titulo}</div>
      <div className="text-lg font-extrabold text-slate-900 tabular-nums">{valor}</div>
      {detalhe && <div className="text-[0.6875rem] text-slate-500">{detalhe}</div>}
    </div>
  )
}
