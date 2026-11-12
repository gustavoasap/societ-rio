import { useMemo, useState } from 'react'
import { Check, FileUp } from 'lucide-react'
import { formatarData } from '../../lib/format'
import { Modal } from '../../components/ui'
import { chaveMensal, type Linha } from './calculo'
import { decodificar, lerExtrato, sugerir, type Confianca, type Lancamento } from './extrato'
import { mesCurto, salvarMensal, valorTexto } from './util'

const COR: Record<Confianca, string> = {
  alta: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  media: 'bg-amber-50 text-amber-700 ring-amber-200',
  baixa: 'bg-slate-100 text-slate-600 ring-slate-200',
}

interface Item {
  lancamento: Lancamento
  chave: string
  marcado: boolean
  confianca: Confianca | null
  motivo: string
}

/** Importa o extrato (OFX ou CSV), sugere o honorário de cada crédito e marca os recebidos. */
export function ImportarExtrato({ abertos, usados, onClose, onSalvo }: { abertos: Linha[]; usados: Set<string>; onClose: () => void; onSalvo: () => void }) {
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [itens, setItens] = useState<Item[]>([])
  const [ignorados, setIgnorados] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feito, setFeito] = useState<number | null>(null)

  const porChave = useMemo(() => new Map(abertos.map((l) => [chaveMensal(l.cliente.id, l.competencia), l])), [abertos])
  const opcoes = useMemo(
    () =>
      [...abertos]
        .sort((a, b) => a.cliente.razao_social.localeCompare(b.cliente.razao_social) || a.competencia.localeCompare(b.competencia))
        .map((l) => ({
          value: chaveMensal(l.cliente.id, l.competencia),
          label: `${String(l.cliente.codigo).padStart(3, '0')} ${l.cliente.razao_social} · ${mesCurto(l.competencia)} · ${valorTexto(l.aberto)}`,
        })),
    [abertos],
  )

  async function ler(f: File) {
    setErro(null)
    setFeito(null)
    const texto = decodificar(await f.arrayBuffer())
    const lancs = lerExtrato(f.name, texto)
    if (!lancs.length) return setErro('Não encontrei lançamentos no arquivo. Use o extrato em OFX (recomendado) ou CSV exportado pelo banco.')
    const creditos = lancs.filter((l) => l.valor > 0)
    const sug = sugerir(creditos, abertos, usados)
    setArquivo(f.name)
    setIgnorados(lancs.length - creditos.length + sug.filter((s) => s.motivo === 'Já importado antes').length)
    setItens(
      sug
        .filter((s) => s.motivo !== 'Já importado antes')
        .map((s) => ({ lancamento: s.lancamento, chave: s.chave ?? '', marcado: s.confianca === 'alta', confianca: s.confianca, motivo: s.motivo })),
    )
  }

  const alterar = (i: number, m: Partial<Item>) => setItens((l) => l.map((x, j) => (j === i ? { ...x, ...m } : x)))
  const marcados = itens.filter((i) => i.marcado && i.chave)
  const repetidos = new Set(marcados.map((i) => i.chave)).size !== marcados.length

  async function aplicar() {
    if (repetidos) return setErro('Há dois créditos marcados para o mesmo honorário. Ajuste antes de confirmar.')
    setSalvando(true)
    const r = await Promise.all(
      marcados.map((i) => {
        const l = porChave.get(i.chave)!
        return salvarMensal(l.cliente.id, l.competencia, {
          recebido_em: i.lancamento.data,
          valor_recebido: Math.round((l.recebido + i.lancamento.valor) * 100) / 100,
          origem: 'extrato',
          extrato_id: i.lancamento.id,
          extrato_descricao: i.lancamento.descricao.slice(0, 300),
        })
      }),
    )
    setSalvando(false)
    const falha = r.find((x) => x.error)
    if (falha?.error) return setErro(falha.error.code === '23505' ? 'Algum crédito deste extrato já tinha sido importado.' : falha.error.message)
    setFeito(marcados.length)
    onSalvo()
  }

  return (
    <Modal
      title="Importar extrato bancário"
      subtitulo="O portal lê os créditos e marca os honorários recebidos"
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {itens.length > 0 && feito === null && (
            <button className="btn-primary from-emerald-500 to-emerald-600" onClick={aplicar} disabled={salvando || !marcados.length}>
              <Check className="h-4 w-4" />
              {salvando ? 'Marcando...' : `Marcar ${marcados.length} honorário(s) como recebido(s)`}
            </button>
          )}
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {feito !== null && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {feito} honorário(s) marcado(s) como recebido(s) com a data do crédito.
        </p>
      )}
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-6 text-center hover:border-brand-400">
        <FileUp className="h-8 w-8 text-brand-500" />
        <span className="text-sm font-semibold text-slate-700">{arquivo ? `Arquivo: ${arquivo} (clique para trocar)` : 'Clique para escolher o extrato'}</span>
        <span className="text-xs text-slate-500">OFX (recomendado, o “Exportar para Money/Quicken” do internet banking) ou CSV</span>
        <input
          type="file"
          accept=".ofx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) ler(f)
            e.target.value = ''
          }}
        />
      </label>

      {itens.length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70">
          <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-slate-100 px-4 py-3 text-sm">
            <span>
              <b>{itens.length}</b> crédito(s)
            </span>
            <span className="text-emerald-700">
              <b>{itens.filter((i) => i.confianca === 'alta').length}</b> identificado(s) com segurança
            </span>
            <span className="text-amber-700">
              <b>{itens.filter((i) => i.confianca === 'media' || i.confianca === 'baixa').length}</b> para conferir
            </span>
            <span className="text-slate-500">
              <b>{itens.filter((i) => !i.chave).length}</b> sem honorário (outros créditos)
            </span>
            {ignorados > 0 && <span className="text-slate-400">{ignorados} débito(s) ou já importado(s) ignorado(s)</span>}
          </div>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-2 py-2">Data</th>
                  <th className="px-2 py-2">Descrição no extrato</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2">Honorário</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itens.map((it, i) => {
                  const l = it.chave ? porChave.get(it.chave) : undefined
                  return (
                    <tr key={it.lancamento.id + i} className={it.marcado ? 'bg-emerald-50/40' : ''}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={it.marcado}
                          disabled={!it.chave}
                          onChange={(e) => alterar(i, { marcado: e.target.checked })}
                          aria-label="Marcar este crédito"
                        />
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">{formatarData(it.lancamento.data)}</td>
                      <td className="max-w-80 px-2 py-2 text-xs text-slate-600">{it.lancamento.descricao || '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold whitespace-nowrap tabular-nums">{valorTexto(it.lancamento.valor)}</td>
                      <td className="min-w-80 px-2 py-2">
                        <select
                          className="input w-full py-1.5 text-xs"
                          value={it.chave}
                          onChange={(e) =>
                            alterar(i, { chave: e.target.value, marcado: !!e.target.value, confianca: null, motivo: e.target.value ? 'Escolhido à mão' : '' })
                          }
                        >
                          <option value="">— Não é honorário —</option>
                          {opcoes.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {it.motivo && (
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ${it.confianca ? COR[it.confianca] : 'bg-slate-50 text-slate-500 ring-slate-200'}`}
                          >
                            {it.motivo}
                            {l && it.confianca === 'media' ? ` (em aberto ${valorTexto(l.aberto)})` : ''}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
            Os identificados com segurança já vêm marcados. Confira os demais, escolha o honorário certo e marque. O mesmo crédito não é importado duas vezes.
          </p>
        </div>
      )}
    </Modal>
  )
}
