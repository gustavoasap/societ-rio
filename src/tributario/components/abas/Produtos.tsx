import { useMemo, useState } from 'react'
import { Barcode, Search } from 'lucide-react'
import { Section } from '../../../components/ui'
import { naturezaDe } from '../../engine/base'
import { ncmMonofasico, reducaoIbsCbs, tratamentoNcm } from '../../engine/ncm'
import { itensStDoNcm, type ItemListaSt } from '../../engine/listaSt'
import type { FonteIcms, PerfilIcmsNcm } from '../../engine/perfilNcm'
import type { MovimentoLinha, Parametros } from '../../engine/tipos'
import type { CamposNcm, NcmRegistro } from '../../dados'
import { moeda, pct } from '../../formatacao'

type Campos = CamposNcm

const NOME_FONTE: Record<FonteIcms, string> = { saidas: 'vendas internas da empresa', entradas: 'compras internas de fornecedores do regime normal' }
const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })

const mascaraNcm = (n: string) => (n.length === 8 ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : n)

function SimNao({ valor, padrao, onChange }: { valor: boolean | null; padrao: boolean; onChange: (v: boolean | null) => void }) {
  return (
    <select
      className={`input w-36 py-1.5 ${valor === null ? 'text-slate-500' : valor ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-300'}`}
      value={valor === null ? '' : valor ? 's' : 'n'}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 's')}
    >
      <option value="">Padrão ({padrao ? 'sim' : 'não'})</option>
      <option value="s">Sim</option>
      <option value="n">Não</option>
    </select>
  )
}

/** Campo numérico que só grava ao sair do campo (evita uma gravação por tecla). */
function NumeroNcm({ valor, placeholder, onChange }: { valor: number | null; placeholder: string; onChange: (v: number | null) => void }) {
  return (
    <input
      key={String(valor)}
      className={`input w-24 py-1.5 text-right ${valor !== null ? 'border-emerald-300 bg-emerald-50 font-semibold' : ''}`}
      type="number"
      step="0.01"
      min={0}
      defaultValue={valor ?? ''}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value === '' ? null : Number(e.target.value)
        if (v !== valor) onChange(v)
      }}
    />
  )
}

export function Produtos({
  linhas,
  registros,
  params,
  perfil,
  ufReferencia,
  aliquotaModal,
  onMudar,
}: {
  linhas: MovimentoLinha[]
  registros: NcmRegistro[]
  params: Parametros
  perfil: Map<string, PerfilIcmsNcm>
  ufReferencia: string
  aliquotaModal: number
  onMudar: (ncm: string, campos: Campos) => void
}) {
  const [busca, setBusca] = useState('')
  const [soVendidos, setSoVendidos] = useState(false)
  const [soListaSt, setSoListaSt] = useState(false)

  const lista = useMemo(() => {
    const m = new Map<string, { ncm: string; vendas: number; entradas: number }>()
    for (const l of linhas) {
      if (!l.ncm) continue
      const n = naturezaDe(l, params.cfopNatureza)
      const x = m.get(l.ncm) ?? { ncm: l.ncm, vendas: 0, entradas: 0 }
      if (l.tipo === 'saida' && n === 'venda') x.vendas += l.valor_contabil
      if (l.tipo === 'entrada' && (n === 'compra_revenda' || n === 'compra_insumo')) x.entradas += l.valor_contabil
      m.set(l.ncm, x)
    }
    for (const r of registros) if (!m.has(r.ncm)) m.set(r.ncm, { ncm: r.ncm, vendas: 0, entradas: 0 })
    const porNcm = new Map(registros.map((r) => [r.ncm, r]))
    return [...m.values()]
      .map((x) => ({ ...x, reg: porNcm.get(x.ncm), trat: tratamentoNcm(x.ncm, params.ncms), obs: perfil.get(x.ncm), listaSt: itensStDoNcm(x.ncm) }))
      .sort((a, b) => b.vendas - a.vendas || b.entradas - a.entradas)
  }, [linhas, registros, params.cfopNatureza, params.ncms, perfil])

  const totalVendas = lista.reduce((s, x) => s + x.vendas, 0)
  const resumo = {
    mono: lista.reduce((s, x) => s + (x.trat.monofasico ? x.vendas : 0), 0),
    st: lista.reduce((s, x) => s + (x.trat.st ? x.vendas : 0), 0),
    reducao: lista.reduce((s, x) => s + x.vendas * x.trat.reducao, 0),
    listaSt: lista.filter((x) => x.listaSt.length > 0),
  }
  const listaStSemMarcar = resumo.listaSt.filter((x) => !x.trat.st)
  const termo = busca.trim().toLowerCase()
  const filtrada = lista.filter(
    (x) => (!soVendidos || x.vendas > 0) && (!soListaSt || x.listaSt.length > 0) && (!termo || x.ncm.includes(termo.replace(/\D/g, '') || '§') || (x.reg?.descricao ?? '').toLowerCase().includes(termo)),
  )

  const campos = (x: (typeof lista)[number]): Campos => ({
    monofasico: x.reg?.monofasico ?? null,
    st: x.reg?.st ?? null,
    reducao: x.reg?.reducao ?? null,
    aliquota_icms: x.reg?.aliquota_icms ?? null,
    mva: x.reg?.mva ?? null,
  })

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { t: 'NCMs da empresa', v: String(lista.length), d: `${lista.filter((x) => x.vendas > 0).length} com vendas no período` },
          { t: 'Vendas monofásicas (PIS/COFINS)', v: totalVendas ? pct(resumo.mono / totalVendas, 1) : '—', d: moeda(resumo.mono) },
          { t: 'Vendas com ICMS-ST', v: totalVendas ? pct(resumo.st / totalVendas, 1) : '—', d: moeda(resumo.st) },
          {
            t: 'NCMs na lista de ST (Conv. 142/18)',
            v: String(resumo.listaSt.length),
            d: listaStSemMarcar.length ? `${listaStSemMarcar.length} sem ST marcada — confira` : 'todos conferidos',
          },
          { t: 'Redução média de IBS/CBS', v: totalVendas ? pct(resumo.reducao / totalVendas, 1) : '—', d: 'ponderada pelas vendas' },
        ].map((k) => (
          <div key={k.t} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
            <div className="text-xs font-semibold text-slate-500 uppercase">{k.t}</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900 tabular-nums">{k.v}</div>
            <div className="text-xs text-slate-500">{k.d}</div>
          </div>
        ))}
      </div>

      <Section
        title="Tratamento tributário por NCM"
        icone={Barcode}
        actions={
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={soListaSt} onChange={(e) => setSoListaSt(e.target.checked)} /> Só NCMs da lista de ST
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={soVendidos} onChange={(e) => setSoVendidos(e.target.checked)} /> Só NCMs vendidos
            </label>
          </div>
        }
      >
        <p className="-mt-2 mb-4 text-sm text-slate-500">
          Os NCMs chegam automaticamente de cada importação. Informe a alíquota interna de ICMS de cada NCM em {ufReferencia} — em branco, vale a modal de {num(aliquotaModal)}%.
          Ela é usada no ICMS das vendas internas, na ST e na antecipação das entradas. Como referência, aparece a alíquota destacada nas notas (vendas internas da empresa ou
          compras internas de fornecedores do regime normal): clique em “usar” para adotá-la. Informe também ICMS-ST e MVA dos produtos com substituição tributária. O aviso
          “Lista de ST” indica que o NCM consta no Convênio ICMS 142/2018 (lista nacional de mercadorias que podem estar sujeitas à ST, com o CEST); se a ST se aplica
          depende da UF e, entre estados, de protocolo ou convênio — confira e marque. "Padrão" é a sugestão do sistema: monofásico pelas Leis 10.147/2000, 10.485/2002 e 13.097/2015; redução de IBS/CBS
          pelo Anexo VIII (60%) e art. 147 (alíquota zero) da LC 214/2025. Ajuste o que for diferente para este cliente — vale na hora para todos os cálculos.
        </p>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar NCM ou produto..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[73.75rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[0.6875rem] font-bold tracking-wider text-slate-400 uppercase">
                <th className="py-2.5 pr-3">NCM</th>
                <th className="px-3 py-2.5">Produto (exemplo)</th>
                <th className="px-3 py-2.5 text-right">Vendas</th>
                <th className="px-3 py-2.5 text-right">Compras</th>
                <th className="px-3 py-2.5">ICMS interno %</th>
                <th className="px-3 py-2.5">PIS/COFINS monofásico</th>
                <th className="px-3 py-2.5">ICMS-ST</th>
                <th className="px-3 py-2.5">MVA %</th>
                <th className="px-3 py-2.5">Redução IBS/CBS</th>
              </tr>
            </thead>
            <tbody>
              {filtrada.map((x) => {
                const c = campos(x)
                const padraoReducao = reducaoIbsCbs(x.ncm) * 100
                return (
                  <tr key={x.ncm} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold whitespace-nowrap text-slate-800">{mascaraNcm(x.ncm)}</td>
                    <td className="max-w-72 truncate px-3 py-2 text-slate-600" title={x.reg?.descricao ?? ''}>
                      {x.reg?.descricao ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.vendas ? moeda(x.vendas) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{x.entradas ? moeda(x.entradas) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2">
                      <NumeroNcm
                        valor={c.aliquota_icms}
                        placeholder={num(aliquotaModal)}
                        onChange={(v) => onMudar(x.ncm, { ...c, aliquota_icms: v })}
                      />
                      {c.aliquota_icms === null && <div className="mt-0.5 text-[0.6875rem] text-slate-400">modal da UF</div>}
                      {x.obs?.nominal != null && x.obs.fonteAliquota && Math.abs(x.obs.nominal - (c.aliquota_icms ?? aliquotaModal)) > 0.01 && (
                        <button
                          type="button"
                          className="mt-0.5 block w-28 cursor-pointer text-left text-[0.6875rem] leading-tight text-sky-700 hover:underline"
                          title={`Referência: ${NOME_FONTE[x.obs.fonteAliquota]} (${moeda(x.obs.valorAliquota)} em notas), alíquota nominal ${num(x.obs.nominal)}%${x.obs.aliquota !== null && Math.abs(x.obs.aliquota - x.obs.nominal) > 0.1 ? `, carga efetiva ${num(x.obs.aliquota)}% (base reduzida)` : ''}. Clique para usar.`}
                          onClick={() => onMudar(x.ncm, { ...c, aliquota_icms: x.obs!.nominal })}
                        >
                          nas notas: {num(x.obs.nominal)}% · usar
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <SimNao valor={c.monofasico} padrao={ncmMonofasico(x.ncm)} onChange={(v) => onMudar(x.ncm, { ...c, monofasico: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <SimNao
                        valor={c.st}
                        padrao={false}
                        onChange={(v) => onMudar(x.ncm, { ...c, st: v })}
                      />
                      {x.listaSt.length > 0 && <AvisoListaSt itens={x.listaSt} marcado={x.trat.st} onMarcar={() => onMudar(x.ncm, { ...c, st: true })} />}
                      {x.obs?.st && c.st === null && x.obs.fonteSt && (
                        <button
                          type="button"
                          className="mt-0.5 block cursor-pointer text-[0.6875rem] text-sky-700 hover:underline"
                          title={`A maioria das ${NOME_FONTE[x.obs.fonteSt]} deste NCM veio com ST (CST 10/60/70 ou CSOSN 500). Clique para marcar.`}
                          onClick={() => onMudar(x.ncm, { ...c, st: true })}
                        >
                          nas notas: com ST · usar
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <NumeroNcm valor={c.mva} placeholder={x.trat.st ? 'informar' : '—'} onChange={(v) => onMudar(x.ncm, { ...c, mva: v })} />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={`input w-40 py-1.5 ${c.reducao === null ? 'text-slate-500' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}
                        value={c.reducao === null ? '' : String(c.reducao)}
                        onChange={(e) => onMudar(x.ncm, { ...c, reducao: e.target.value === '' ? null : Number(e.target.value) })}
                      >
                        <option value="">Padrão ({padraoReducao}%)</option>
                        <option value="0">Sem redução</option>
                        <option value="30">30% (profissionais)</option>
                        <option value="40">40%</option>
                        <option value="60">60%</option>
                        <option value="100">Alíquota zero</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
              {filtrada.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    Nenhum NCM encontrado. Importe relatórios detalhados (com NCM) de entradas ou saídas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}

/** Informativo: o NCM está na lista nacional de ST (Convênio ICMS 142/2018) — a aplicação depende da UF e de protocolo/convênio. */
function AvisoListaSt({ itens, marcado, onMarcar }: { itens: ItemListaSt[]; marcado: boolean; onMarcar: () => void }) {
  const segmentos = [...new Set(itens.map((i) => i.segmento))]
  const detalhe = itens.map((i) => `CEST ${i.cest} — ${i.descricao}`).join('\n')
  return (
    <div
      className="mt-1 w-40 rounded-md bg-amber-50 px-1.5 py-1 text-[0.6875rem] leading-tight text-amber-800 ring-1 ring-amber-200"
      title={`Consta na lista nacional de mercadorias sujeitas à ST (Convênio ICMS 142/2018, texto de 14/12/2018):\n${detalhe}\n\nA cobrança depende da legislação da UF e, nas operações interestaduais, de protocolo ou convênio entre os estados. Confira antes de marcar.`}
    >
      <span className="font-semibold">Lista de ST (Conv. 142/18)</span>
      <span className="block truncate">{segmentos.join(' · ')}</span>
      <span className="block text-amber-700">
        CEST {itens[0].cest}
        {itens.length > 1 ? ` +${itens.length - 1}` : ''}
      </span>
      {!marcado && (
        <button type="button" className="cursor-pointer font-semibold underline" onClick={onMarcar}>
          marcar ST
        </button>
      )}
    </div>
  )
}
