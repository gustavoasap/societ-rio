import { useState } from 'react'
import { CheckCircle2, Loader2, UploadCloud, XCircle } from 'lucide-react'
import { Modal, Select } from '../../components/ui'
import { mascaraCnpj } from '../../lib/format'
import { nomeMes } from '../engine/base'
import { ICMS_INTERNO_UF } from '../engine/tabelas'
import type { RegimeAtual } from '../engine/tipos'
import { adicionarEstabelecimento, gravarImportacao, importacoesSobrepostas, listarEmpresas, salvarEmpresa, type EmpresaComEstab } from '../dados'
import { NOMES_MOV, prepararLinhas, tipoMovimentoDe, type TipoServico } from '../importacao/preparar'
import { NOMES_RELATORIO, lerRelatorio, type RelatorioLido } from '../importacao/relatorios'
import { moeda } from '../formatacao'

interface Item {
  chave: string
  rel: RelatorioLido
  tipoServico: TipoServico
  modo: 'unica' | 'ratear'
  inicio: string
  fim: string
  status: 'pronto' | 'gravando' | 'ok' | 'pulado' | 'erro'
  mensagem?: string
}

type Destino = { tipo: 'existente'; empresa: EmpresaComEstab; estab: string } | { tipo: 'filial'; empresa: EmpresaComEstab } | { tipo: 'nova' } | { tipo: 'sem_cnpj' }

function destinoDe(rel: RelatorioLido, empresas: EmpresaComEstab[]): Destino {
  if (rel.cnpj.length !== 14) return { tipo: 'sem_cnpj' }
  for (const e of empresas) {
    const estab = e.trib_estabelecimentos.find((x) => x.cnpj === rel.cnpj)
    if (estab) return { tipo: 'existente', empresa: e, estab: estab.nome }
  }
  const raiz = rel.cnpj.slice(0, 8)
  const empresa = empresas.find((e) => e.trib_estabelecimentos.some((x) => x.cnpj.startsWith(raiz)))
  return empresa ? { tipo: 'filial', empresa } : { tipo: 'nova' }
}

/**
 * Importação de relatórios de vários clientes de uma vez: cada arquivo vai para a empresa/estabelecimento do CNPJ do cabeçalho.
 * CNPJs novos viram empresa (ou filial, se a raiz já existir).
 */
export function ImportarLote({ empresas, onClose, onConcluido }: { empresas: EmpresaComEstab[]; onClose: () => void; onConcluido: () => void }) {
  const [itens, setItens] = useState<Item[]>([])
  const [falhas, setFalhas] = useState<string[]>([])
  const [lendo, setLendo] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [regimeNovas, setRegimeNovas] = useState<RegimeAtual>('simples')
  const [substituir, setSubstituir] = useState(true)
  const [arrastando, setArrastando] = useState(false)

  async function adicionar(arquivos: FileList | File[]) {
    setLendo(true)
    const novos: Item[] = []
    const erros: string[] = []
    for (const f of Array.from(arquivos)) {
      try {
        const rel = lerRelatorio(new Uint8Array(await f.arrayBuffer()), f.name)
        const periodo = rel.periodo ?? { inicio: '', fim: '' }
        novos.push({ chave: crypto.randomUUID(), rel, tipoServico: rel.tipoServico ?? 'servico_tomado', modo: 'ratear', inicio: periodo.inicio, fim: periodo.fim, status: 'pronto' })
      } catch (e) {
        erros.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setItens((l) => [...l, ...novos])
    setFalhas(erros)
    setLendo(false)
  }

  /** Resumo por CFOP é dispensável quando veio também o relatório detalhado do mesmo CNPJ e movimento. */
  const resumoDispensavel = (i: Item) =>
    i.rel.tipo.endsWith('_resumo') &&
    itens.some((x) => x !== i && x.rel.cnpj === i.rel.cnpj && x.rel.tipo === i.rel.tipo.replace('_resumo', '_detalhado'))

  const alterar = (chave: string, campos: Partial<Item>) => setItens((l) => l.map((i) => (i.chave === chave ? { ...i, ...campos } : i)))

  async function importarTudo() {
    setRodando(true)
    try {
      // 1) cria as empresas e filiais que ainda não existem (agrupando os arquivos pela raiz do CNPJ)
      let lista = empresas
      for (const i of itens.filter(resumoDispensavel)) alterar(i.chave, { status: 'pulado', mensagem: 'Ignorado: veio o relatório detalhado do mesmo movimento.' })
      const pendentes = itens.filter((i) => (i.status === 'pronto' || i.status === 'erro') && !resumoDispensavel(i))
      const raizes = new Map<string, RelatorioLido[]>()
      for (const i of pendentes) {
        const d = destinoDe(i.rel, lista)
        if (d.tipo === 'nova') raizes.set(i.rel.cnpj.slice(0, 8), [...(raizes.get(i.rel.cnpj.slice(0, 8)) ?? []), i.rel])
      }
      for (const rels of raizes.values()) {
        const cnpjs = [...new Map(rels.map((r) => [r.cnpj, r])).values()]
        const matriz = cnpjs.find((r) => r.cnpj.slice(8, 12) === '0001') ?? cnpjs[0]
        await salvarEmpresa(
          { razao_social: matriz.empresa || `Empresa ${mascaraCnpj(matriz.cnpj)}`, cnpj: matriz.cnpj, regime_atual: regimeNovas, cnae: null, observacoes: null, parametros: {} },
          cnpjs.map((r) => ({
            cnpj: r.cnpj,
            nome: r.cnpj === matriz.cnpj ? 'Matriz' : `Filial ${r.municipio || r.cnpj.slice(8, 12)}`,
            matriz: r.cnpj === matriz.cnpj,
            uf: ICMS_INTERNO_UF[r.uf] ? r.uf : 'SP',
            municipio: r.municipio || null,
            aliquota_icms: null,
          })),
          [],
        )
      }
      lista = await listarEmpresas()
      for (const i of pendentes) {
        const d = destinoDe(i.rel, lista)
        if (d.tipo === 'filial') {
          await adicionarEstabelecimento(d.empresa.id, {
            cnpj: i.rel.cnpj,
            nome: `Filial ${i.rel.municipio || i.rel.cnpj.slice(8, 12)}`,
            matriz: false,
            uf: ICMS_INTERNO_UF[i.rel.uf] ? i.rel.uf : 'SP',
            municipio: i.rel.municipio || null,
            aliquota_icms: null,
          })
          lista = await listarEmpresas()
        }
      }

      // 2) grava cada relatório no estabelecimento do seu CNPJ
      for (const i of pendentes) {
        alterar(i.chave, { status: 'gravando', mensagem: undefined })
        try {
          const empresa = lista.find((e) => e.trib_estabelecimentos.some((x) => x.cnpj === i.rel.cnpj))
          const estab = empresa?.trib_estabelecimentos.find((x) => x.cnpj === i.rel.cnpj)
          if (!empresa || !estab) throw new Error('Relatório sem CNPJ no cabeçalho — importe pela tela da empresa.')
          const linhas = prepararLinhas(i.rel, i.modo, i.inicio, i.fim)
          const tipo = tipoMovimentoDe(i.rel, i.tipoServico)
          const comps = linhas.map((l) => l.competencia).sort()
          const antigas = await importacoesSobrepostas(estab.id, tipo, comps[0], comps[comps.length - 1])
          if (antigas.length && !substituir) {
            alterar(i.chave, { status: 'pulado', mensagem: 'Período já importado — mantido o anterior.' })
            continue
          }
          await gravarImportacao({
            empresaId: empresa.id,
            estabelecimentoId: estab.id,
            arquivo: i.rel.arquivo,
            tipoRelatorio: i.rel.tipo,
            tipoMovimento: tipo,
            linhas,
            registros: i.rel.registros,
            substituir: antigas.map((a) => a.id),
            produtos: i.rel.produtos,
            parceiros: i.rel.parceiros,
          })
          alterar(i.chave, { status: 'ok', mensagem: `${empresa.razao_social} · ${estab.nome}${antigas.length ? ' (substituiu importação anterior)' : ''}` })
        } catch (e) {
          alterar(i.chave, { status: 'erro', mensagem: (e as Error).message })
        }
      }
      onConcluido()
    } catch (e) {
      setFalhas([(e as Error).message])
    } finally {
      setRodando(false)
    }
  }

  const prontos = itens.filter((i) => (i.status === 'pronto' || i.status === 'erro') && !resumoDispensavel(i)).length
  const precisaCompetencia = itens.some((i) => i.rel.exigeCompetencia)

  return (
    <Modal
      title="Importar relatórios de vários clientes"
      subtitulo="Cada arquivo é direcionado pelo CNPJ do cabeçalho. CNPJs novos são cadastrados automaticamente (empresa ou filial)."
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          <button className="btn-primary" disabled={!prontos || rodando} onClick={importarTudo}>
            {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {rodando ? 'Importando...' : `Importar ${prontos} arquivo${prontos === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition ${arrastando ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400'}`}
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          adicionar(e.dataTransfer.files)
        }}
      >
        <UploadCloud className="h-9 w-9 text-brand-500" />
        <p className="mt-2 font-semibold text-slate-800">{lendo ? 'Lendo arquivos...' : 'Arraste aqui os relatórios de todos os clientes'}</p>
        <p className="text-sm text-slate-500">Entradas, saídas (detalhado ou resumo) e serviços, em .xlsx — de quantas empresas quiser.</p>
        <input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => e.target.files && adicionar(e.target.files)} />
      </label>

      {falhas.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {falhas.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
      )}

      {itens.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-slate-200/70">
            <label className="flex items-center gap-2">
              Regime das empresas novas:
              <Select
                className="input w-48 py-1.5"
                value={regimeNovas}
                onChange={(v) => setRegimeNovas(v as RegimeAtual)}
                opcoes={[
                  { value: 'simples', label: 'Simples Nacional' },
                  { value: 'presumido', label: 'Lucro Presumido' },
                  { value: 'real', label: 'Lucro Real' },
                ]}
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
              Substituir importações do mesmo período
            </label>
            {precisaCompetencia && <span className="text-amber-700">Resumos de vários meses: por padrão são rateados igualmente no período.</span>}
          </div>

          <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                  <th className="px-4 py-2.5">Arquivo</th>
                  <th className="px-3 py-2.5">Empresa / CNPJ</th>
                  <th className="px-3 py-2.5">Destino</th>
                  <th className="px-3 py-2.5">Movimento</th>
                  <th className="px-3 py-2.5">Período</th>
                  <th className="px-4 py-2.5">Situação</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const d = destinoDe(i.rel, empresas)
                  return (
                    <tr key={i.chave} className="border-b border-slate-100 align-top">
                      <td className="max-w-56 px-4 py-2.5">
                        <div className="truncate font-medium text-slate-700" title={i.rel.arquivo}>
                          {i.rel.arquivo}
                        </div>
                        <div className="text-xs text-slate-500">
                          {NOMES_RELATORIO[i.rel.tipo]} · {i.rel.registros.toLocaleString('pt-BR')} lanç. · {moeda(i.rel.valorTotal)}
                        </div>
                      </td>
                      <td className="min-w-48 px-3 py-2.5">
                        <div className="font-medium text-slate-700">{i.rel.empresa || '—'}</div>
                        <div className="text-xs text-slate-500">{i.rel.cnpj ? mascaraCnpj(i.rel.cnpj) : 'sem CNPJ'}</div>
                      </td>
                      <td className="min-w-56 px-3 py-2.5">
                        {resumoDispensavel(i) && i.status === 'pronto' && (
                          <div className="mb-1 text-xs font-semibold text-amber-700">Será ignorado — já há o detalhado</div>
                        )}
                        {d.tipo === 'existente' && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {d.empresa.razao_social} · {d.estab}
                          </span>
                        )}
                        {d.tipo === 'filial' && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">Nova filial de {d.empresa.razao_social}</span>}
                        {d.tipo === 'nova' && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Nova empresa</span>}
                        {d.tipo === 'sem_cnpj' && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">CNPJ não identificado</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {i.rel.tipo === 'servicos' ? (
                          <select className="input w-40 py-1" value={i.tipoServico} onChange={(e) => alterar(i.chave, { tipoServico: e.target.value as TipoServico })}>
                            <option value="servico_tomado">Serviços tomados</option>
                            <option value="servico_prestado">Serviços prestados</option>
                          </select>
                        ) : (
                          NOMES_MOV[tipoMovimentoDe(i.rel, i.tipoServico)]
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                        {i.rel.exigeCompetencia ? (
                          <div className="flex items-center gap-1">
                            <select className="input w-24 py-1" value={i.modo} onChange={(e) => alterar(i.chave, { modo: e.target.value as Item['modo'] })}>
                              <option value="ratear">Ratear</option>
                              <option value="unica">Mês</option>
                            </select>
                            <input className="input w-36 py-1" type="month" value={i.inicio} onChange={(e) => alterar(i.chave, { inicio: e.target.value })} />
                            {i.modo === 'ratear' && <input className="input w-36 py-1" type="month" value={i.fim} onChange={(e) => alterar(i.chave, { fim: e.target.value })} />}
                          </div>
                        ) : i.rel.periodo ? (
                          `${nomeMes(i.rel.periodo.inicio)} a ${nomeMes(i.rel.periodo.fim)}`
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {i.status === 'pronto' && (
                          <button
                            title="Remover da lista" className="text-xs font-semibold text-slate-400 hover:text-rose-600" onClick={() => setItens((l) => l.filter((x) => x.chave !== i.chave))}>
                            remover
                          </button>
                        )}
                        {i.status === 'gravando' && <Loader2 className="h-4 w-4 animate-spin text-brand-500" />}
                        {i.status === 'ok' && (
                          <span className="flex items-start gap-1 text-xs text-emerald-700">
                            <CheckCircle2 className="h-4 w-4 shrink-0" /> {i.mensagem}
                          </span>
                        )}
                        {(i.status === 'erro' || i.status === 'pulado') && (
                          <span className={`flex items-start gap-1 text-xs ${i.status === 'erro' ? 'text-rose-600' : 'text-amber-700'}`}>
                            <XCircle className="h-4 w-4 shrink-0" /> {i.mensagem}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
