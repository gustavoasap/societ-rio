import { useState } from 'react'
import { CheckCircle2, FileSpreadsheet, Trash2, UploadCloud } from 'lucide-react'
import { Select } from '../../../components/ui'
import { formatarData, mascaraCnpj } from '../../../lib/format'
import { nomeMes } from '../../engine/base'
import type { Estabelecimento } from '../../engine/tipos'
import { excluirImportacao, gravarImportacao, importacoesSobrepostas, type Importacao } from '../../dados'
import { NOMES_MOV, prepararLinhas, tipoMovimentoDe, type TipoServico } from '../../importacao/preparar'
import { NOMES_RELATORIO, lerRelatorio, type RelatorioLido } from '../../importacao/relatorios'
import { moeda } from '../../formatacao'


interface Pendente {
  chave: string
  rel: RelatorioLido
  estabelecimentoId: string
  tipoServico: TipoServico
  modo: 'unica' | 'ratear'
  inicio: string
  fim: string
  status: 'pronto' | 'gravando' | 'ok' | 'erro'
  mensagem?: string
}


export function Importar({
  empresaId,
  estabelecimentos,
  importacoes,
  onAlterado,
}: {
  empresaId: string
  estabelecimentos: Estabelecimento[]
  importacoes: Importacao[]
  onAlterado: () => void
}) {
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [erros, setErros] = useState<string[]>([])
  const [arrastando, setArrastando] = useState(false)
  const [lendo, setLendo] = useState(false)

  async function adicionar(arquivos: FileList | File[]) {
    setLendo(true)
    const novos: Pendente[] = []
    const falhas: string[] = []
    for (const f of Array.from(arquivos)) {
      try {
        const rel = lerRelatorio(new Uint8Array(await f.arrayBuffer()), f.name)
        const estab = estabelecimentos.find((e) => e.cnpj === rel.cnpj)
        const periodo = rel.periodo ?? { inicio: '', fim: '' }
        novos.push({
          chave: crypto.randomUUID(),
          rel,
          estabelecimentoId: estab?.id ?? (estabelecimentos.length === 1 ? estabelecimentos[0].id : ''),
          tipoServico: rel.tipoServico ?? 'servico_tomado',
          modo: 'unica',
          inicio: periodo.fim || periodo.inicio,
          fim: periodo.fim,
          status: 'pronto',
          mensagem: rel.cnpj && !estab ? `CNPJ ${mascaraCnpj(rel.cnpj)} do relatório não está cadastrado nesta empresa.` : undefined,
        })
      } catch (e) {
        falhas.push(`${f.name}: ${(e as Error).message}`)
      }
    }
    setPendentes((p) => [...p, ...novos])
    setErros(falhas)
    setLendo(false)
  }

  const alterar = (chave: string, campos: Partial<Pendente>) => setPendentes((l) => l.map((p) => (p.chave === chave ? { ...p, ...campos } : p)))

  async function gravar(p: Pendente) {
    if (!p.estabelecimentoId) return alterar(p.chave, { status: 'erro', mensagem: 'Escolha o estabelecimento.' })
    let linhas
    try {
      linhas = prepararLinhas(p.rel, p.modo, p.inicio, p.fim)
    } catch (e) {
      return alterar(p.chave, { status: 'erro', mensagem: (e as Error).message })
    }
    const tipo = tipoMovimentoDe(p.rel, p.tipoServico)
    const comps = linhas.map((l) => l.competencia).sort()
    alterar(p.chave, { status: 'gravando', mensagem: undefined })
    try {
      const antigas = await importacoesSobrepostas(p.estabelecimentoId, tipo, comps[0], comps[comps.length - 1])
      if (antigas.length) {
        const lista = antigas.map((a) => `• ${a.arquivo} (${a.competencia_inicio} a ${a.competencia_fim})`).join('\n')
        if (!confirm(`Já existem importações de ${NOMES_MOV[tipo].toLowerCase()} deste estabelecimento nesse período:\n\n${lista}\n\nSubstituir pelas novas?`)) {
          return alterar(p.chave, { status: 'pronto' })
        }
      }
      await gravarImportacao({
        empresaId,
        estabelecimentoId: p.estabelecimentoId,
        arquivo: p.rel.arquivo,
        tipoRelatorio: p.rel.tipo,
        tipoMovimento: tipo,
        linhas,
        registros: p.rel.registros,
        substituir: antigas.map((a) => a.id),
        produtos: p.rel.produtos,
        parceiros: p.rel.parceiros, itens: p.rel.itens,
      })
      alterar(p.chave, { status: 'ok' })
      onAlterado()
    } catch (e) {
      alterar(p.chave, { status: 'erro', mensagem: (e as Error).message })
    }
  }

  async function remover(i: Importacao) {
    if (!confirm(`Excluir a importação "${i.arquivo}" e todo o movimento dela?`)) return
    try {
      await excluirImportacao(i.id)
      onAlterado()
    } catch (e) {
      setErros([(e as Error).message])
    }
  }

  const nomeEstab = (id: string) => estabelecimentos.find((e) => e.id === id)?.nome ?? '—'

  return (
    <div className="space-y-5">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${arrastando ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400 hover:bg-brand-50/40'}`}
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
        <UploadCloud className="h-10 w-10 text-brand-500" />
        <p className="mt-3 font-semibold text-slate-800">{lendo ? 'Lendo arquivos...' : 'Arraste os relatórios aqui ou clique para escolher'}</p>
        <p className="mt-1 max-w-xl text-sm text-slate-500">
          Registro de Entradas detalhado, Registro de Saídas (detalhado ou resumo por CFOP) e Registro de Serviços, exportados em Excel (.xlsx). Pode enviar vários de uma vez — o
          estabelecimento é identificado pelo CNPJ do cabeçalho.
        </p>
        <input type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => e.target.files && adicionar(e.target.files)} />
      </label>

      {erros.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {erros.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      {pendentes.map((p) => (
        <div key={p.chave} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <FileSpreadsheet className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="truncate font-semibold text-slate-800">{p.rel.arquivo}</div>
                <div className="text-sm text-slate-500">
                  {NOMES_RELATORIO[p.rel.tipo]} · {p.rel.empresa} {p.rel.cnpj && `· ${mascaraCnpj(p.rel.cnpj)}`}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {p.rel.registros.toLocaleString('pt-BR')} lançamentos · {moeda(p.rel.valorTotal)}
                  {p.rel.periodo && ` · ${nomeMes(p.rel.periodo.inicio)} a ${nomeMes(p.rel.periodo.fim)}`}
                </div>
              </div>
            </div>
            {p.status === 'ok' ? (
              <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <CheckCircle2 className="h-5 w-5" /> Importado
              </span>
            ) : (
              <div className="flex gap-2">
                <button className="btn-ghost btn-sm" onClick={() => setPendentes((l) => l.filter((x) => x.chave !== p.chave))}>
                  Descartar
                </button>
                <button className="btn-primary btn-sm" disabled={p.status === 'gravando'} onClick={() => gravar(p)}>
                  {p.status === 'gravando' ? 'Gravando...' : 'Importar'}
                </button>
              </div>
            )}
          </div>

          {p.status !== 'ok' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Estabelecimento</span>
                <Select value={p.estabelecimentoId} onChange={(v) => alterar(p.chave, { estabelecimentoId: v })} vazio="Escolha..." opcoes={estabelecimentos.map((e) => ({ value: e.id, label: `${e.nome} (${mascaraCnpj(e.cnpj)})` }))} />
              </label>
              {p.rel.tipo === 'servicos' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Tipo de serviço</span>
                  <Select
                    value={p.tipoServico}
                    onChange={(v) => alterar(p.chave, { tipoServico: v as Pendente['tipoServico'] })}
                    opcoes={[
                      { value: 'servico_tomado', label: 'Serviços tomados' },
                      { value: 'servico_prestado', label: 'Serviços prestados (receita)' },
                    ]}
                  />
                </label>
              )}
              {p.rel.exigeCompetencia && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">Lançar como</span>
                    <Select
                      value={p.modo}
                      onChange={(v) => alterar(p.chave, { modo: v as Pendente['modo'] })}
                      opcoes={[
                        { value: 'unica', label: 'Uma competência' },
                        { value: 'ratear', label: 'Ratear igualmente entre meses' },
                      ]}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-slate-600">{p.modo === 'ratear' ? 'Período (de / até)' : 'Competência'}</span>
                    <div className="flex gap-2">
                      <input className="input" type="month" value={p.inicio} onChange={(e) => alterar(p.chave, { inicio: e.target.value })} />
                      {p.modo === 'ratear' && <input className="input" type="month" value={p.fim} onChange={(e) => alterar(p.chave, { fim: e.target.value })} />}
                    </div>
                  </label>
                </>
              )}
            </div>
          )}
          {[...p.rel.avisos, ...(p.mensagem ? [p.mensagem] : [])].map((a) => (
            <p key={a} className={`mt-3 rounded-xl px-3 py-2 text-sm ${p.status === 'erro' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
              {a}
            </p>
          ))}
        </div>
      ))}

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-800">Importações realizadas</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[45rem] text-sm">
            <thead>
              <tr className="text-left text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="px-5 py-2.5">Arquivo</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Estabelecimento</th>
                <th className="px-3 py-2.5">Competências</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5">Importado em</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {importacoes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Nenhum relatório importado ainda.
                  </td>
                </tr>
              )}
              {importacoes.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="max-w-64 truncate px-5 py-2.5 font-medium text-slate-700" title={i.arquivo}>
                    {i.arquivo}
                  </td>
                  <td className="px-3 py-2.5 text-slate-600">{NOMES_MOV[i.tipo_movimento]}</td>
                  <td className="px-3 py-2.5 text-slate-600">{nomeEstab(i.estabelecimento_id)}</td>
                  <td className="px-3 py-2.5 text-slate-600">
                    {nomeMes(i.competencia_inicio)}
                    {i.competencia_fim !== i.competencia_inicio && ` a ${nomeMes(i.competencia_fim)}`}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{moeda(Number(i.valor_total))}</td>
                  <td className="px-3 py-2.5 text-slate-500">{formatarData(i.created_at)}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button className="icon-btn hover:text-rose-600" title="Excluir importação" onClick={() => remover(i)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
