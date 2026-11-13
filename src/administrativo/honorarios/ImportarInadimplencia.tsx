import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CircleCheck, FileSpreadsheet, FileUp, MinusCircle, XCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatarData } from '../../lib/format'
import { lerPlanilhaArquivo } from '../../lib/planilhaSimples'
import { baixarArquivo, gerarXlsx, TIPO_XLSX } from '../../lib/planilha'
import { Modal } from '../../components/ui'
import { analisarInadimplencia, type ClienteImport, type LinhaImport, type NivelImport } from './inadImport'
import { mesCurto, valorTexto } from './util'

const COR: Record<NivelImport, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  advertencia: 'bg-amber-50 text-amber-700 ring-amber-200',
  erro: 'bg-rose-50 text-rose-700 ring-rose-200',
  ignorado: 'bg-slate-100 text-slate-500 ring-slate-200',
}
const ROTULO: Record<NivelImport, string> = { ok: 'OK', advertencia: 'Advertência', erro: 'Erro', ignorado: 'Ignorada' }

/** Importa a inadimplência anterior ao controle automático, a partir da planilha do sistema de cobrança. */
export function ImportarInadimplencia({
  desde,
  honorarioNoMes,
  onClose,
  onSalvo,
}: {
  desde: string
  honorarioNoMes: (clienteId: string, mes: string) => number | null
  onClose: () => void
  onSalvo: () => void
}) {
  const [clientes, setClientes] = useState<ClienteImport[]>([])
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [colunas, setColunas] = useState<Record<string, string>>({})
  const [itens, setItens] = useState<LinhaImport[]>([])
  const [filtro, setFiltro] = useState<NivelImport | ''>('')
  const [substituir, setSubstituir] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feito, setFeito] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('adm_clientes')
      .select('id, codigo, razao_social, nome_fantasia, cnpj, status, sem_honorario')
      .then(({ data, error }) => {
        if (error) setErro(error.message)
        setClientes((data as ClienteImport[]) ?? [])
      })
  }, [])

  async function ler(f: File) {
    setErro(null)
    setFeito(null)
    try {
      const linhas = await lerPlanilhaArquivo(f)
      const r = analisarInadimplencia(linhas, clientes, desde, honorarioNoMes)
      if (!r.itens.length) return setErro('Não encontrei linhas na planilha.')
      setArquivo(f.name)
      setColunas(r.colunas)
      setItens(r.itens)
    } catch (e) {
      setErro(`Não foi possível ler a planilha: ${e instanceof Error ? e.message : e}`)
    }
  }

  const importaveis = itens.filter((i) => (i.nivel === 'ok' || i.nivel === 'advertencia') && i.cliente && i.valor && i.competencia)
  const conta = (n: NivelImport) => itens.filter((i) => i.nivel === n).length
  const visiveis = useMemo(() => itens.filter((i) => !filtro || i.nivel === filtro), [itens, filtro])

  async function importar() {
    setSalvando(true)
    setErro(null)
    if (substituir) {
      const { error } = await supabase.from('adm_hon_inad_importada').delete().is('recebido_em', null)
      if (error) {
        setSalvando(false)
        return setErro(error.message)
      }
    }
    const linhas = importaveis.map((i) => ({
      cliente_id: i.cliente!.id,
      vencimento: i.vencimento,
      competencia: i.competencia,
      valor: i.valor,
      descricao: i.descricao.slice(0, 300) || null,
      arquivo,
    }))
    for (let k = 0; k < linhas.length; k += 200) {
      const { error } = await supabase.from('adm_hon_inad_importada').insert(linhas.slice(k, k + 200))
      if (error) {
        setSalvando(false)
        return setErro(error.message)
      }
    }
    setSalvando(false)
    setFeito(linhas.length)
    onSalvo()
  }

  function relatorio() {
    const arq = gerarXlsx({
      aba: 'Importação inadimplência',
      colunas: [
        { titulo: 'Linha', tipo: 'numero', largura: 7 },
        { titulo: 'Resultado', largura: 13 },
        { titulo: 'Detalhes', largura: 60 },
        { titulo: 'Cód.', largura: 7 },
        { titulo: 'Cliente na Base', largura: 40 },
        { titulo: 'Vencimento', tipo: 'data', largura: 12 },
        { titulo: 'Valor', tipo: 'moeda', largura: 14 },
        { titulo: 'Linha da planilha', largura: 60 },
      ],
      linhas: itens.map((i) => [
        i.linha,
        { valor: ROTULO[i.nivel], destaque: i.nivel === 'erro' ? 'negativo' : i.nivel === 'ok' ? 'positivo' : undefined },
        i.motivos.join('; '),
        i.cliente ? String(i.cliente.codigo).padStart(3, '0') : '',
        i.cliente?.razao_social ?? '',
        i.vencimento,
        i.valor,
        i.texto,
      ]),
    })
    baixarArquivo(`importacao-inadimplencia-erros.xlsx`, arq as Uint8Array<ArrayBuffer>, TIPO_XLSX)
  }

  const cartoes: { n: NivelImport | ''; rotulo: string; qtd: number; icone: typeof Check; cor: string }[] = [
    { n: '', rotulo: 'Linhas', qtd: itens.length, icone: FileUp, cor: 'text-slate-800' },
    { n: 'ok', rotulo: 'OK', qtd: conta('ok'), icone: CircleCheck, cor: 'text-emerald-700' },
    { n: 'advertencia', rotulo: 'Advertências', qtd: conta('advertencia'), icone: AlertTriangle, cor: 'text-amber-700' },
    { n: 'erro', rotulo: 'Erros', qtd: conta('erro'), icone: XCircle, cor: 'text-rose-600' },
    { n: 'ignorado', rotulo: 'Ignoradas', qtd: conta('ignorado'), icone: MinusCircle, cor: 'text-slate-500' },
  ]

  return (
    <Modal
      title="Importar inadimplência do sistema"
      subtitulo={`Honorários em aberto até ${mesCurto(`${Number(desde.slice(0, 4)) - (desde.slice(5, 7) === '01' ? 1 : 0)}-${desde.slice(5, 7) === '01' ? '12' : String(Number(desde.slice(5, 7)) - 1).padStart(2, '0')}`)}; daí em diante o portal calcula sozinho`}
      onClose={onClose}
      largura="max-w-6xl"
      footer={
        <>
          {itens.length > 0 && (
            <button className="btn-secondary mr-auto" onClick={relatorio}>
              <FileSpreadsheet className="h-4 w-4" />
              Relatório de erros e advertências
            </button>
          )}
          {itens.length > 0 && feito === null && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} />
              Substituir a importação anterior
            </label>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {itens.length > 0 && feito === null && (
            <button className="btn-primary" onClick={importar} disabled={salvando || !importaveis.length}>
              <Check className="h-4 w-4" />
              {salvando ? 'Importando...' : `Importar ${importaveis.length} linha(s)`}
            </button>
          )}
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {feito !== null && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {feito} honorário(s) em aberto importado(s). Eles aparecem na aba Inadimplentes.
        </p>
      )}
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center hover:border-brand-400">
        <FileUp className="h-8 w-8 text-brand-500" />
        <span className="text-sm font-semibold text-slate-700">
          {arquivo ? `Arquivo: ${arquivo} (clique para trocar)` : 'Clique para escolher a planilha do sistema'}
        </span>
        <span className="text-xs text-slate-500">
          Excel (.xlsx) ou CSV com uma linha por honorário em aberto: cliente (CNPJ, código ou nome), vencimento e valor.
        </span>
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          className="hidden"
          disabled={!clientes.length}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) ler(f)
            e.target.value = ''
          }}
        />
      </label>

      {itens.length > 0 && (
        <>
          <p className="text-xs text-slate-500">
            Colunas reconhecidas:{' '}
            {Object.entries(colunas)
              .filter(([, v]) => v !== '—')
              .map(([k, v]) => `${k} = “${v}”`)
              .join(' · ')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {cartoes.map((c) => (
              <button
                key={c.rotulo}
                onClick={() => setFiltro(c.n)}
                className={`cursor-pointer rounded-2xl bg-white p-3 text-left ring-1 transition ${filtro === c.n ? 'ring-2 ring-brand-500' : 'ring-slate-200/70 hover:ring-slate-300'}`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <c.icone className={`h-3.5 w-3.5 ${c.cor}`} />
                  {c.rotulo}
                </div>
                <div className={`mt-1 text-xl font-extrabold tabular-nums ${c.cor}`}>{c.qtd}</div>
              </button>
            ))}
          </div>
          <div className="max-h-[45vh] overflow-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-2 py-2">Cliente na Base</th>
                  <th className="px-2 py-2">Vencimento</th>
                  <th className="px-2 py-2 text-right">Valor</th>
                  <th className="px-2 py-2">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visiveis.map((i) => (
                  <tr key={i.linha}>
                    <td className="px-3 py-2 text-slate-400 tabular-nums">{i.linha}</td>
                    <td className="px-2 py-2">
                      {i.cliente ? (
                        <>
                          <span className="font-mono text-xs text-slate-400">{String(i.cliente.codigo).padStart(3, '0')}</span>{' '}
                          <span className="font-semibold text-slate-800">{i.cliente.razao_social}</span>
                        </>
                      ) : (
                        <span className="text-xs text-slate-500">{i.descricao || i.texto}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      {i.vencimento ? formatarData(i.vencimento) : i.competencia ? mesCurto(i.competencia.slice(0, 7)) : '—'}
                    </td>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">{i.valor !== null ? valorTexto(i.valor) : '—'}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ring-1 ${COR[i.nivel]}`}>{ROTULO[i.nivel]}</span>
                      {i.motivos.length > 0 && <span className="ml-1.5 text-xs text-slate-600">{i.motivos.join(' · ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Entram as linhas OK e com advertência. Erros e linhas ignoradas (pagas, repetidas ou já controladas pelo portal) ficam de fora; confira no
            relatório.
          </p>
        </>
      )}
    </Modal>
  )
}
