import { useMemo, useState } from 'react'
import { Check, FileUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { lerPlanilhaArquivo } from '../lib/planilhaSimples'
import { Field, Modal } from '../components/ui'
import { competenciaStatus, type EmpresaFech, type Obrigacao } from './tipos'

const formatarCnpj = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')

interface Leitura {
  arquivo: string
  coluna: string
  encontrados: EmpresaFech[]
  fora: { cnpj: string; nome: string }[]
  semCnpj: number
}

/** Marca uma opção (ex.: Concluído) para todas as empresas cujo CNPJ está numa planilha (.xlsx ou .csv). */
export function ImportarMarcacoes({
  obrigacoes,
  empresas,
  referencia,
  onClose,
  onSalvo,
}: {
  obrigacoes: Obrigacao[]
  empresas: EmpresaFech[]
  /** Mês de referência (AAAA-MM): competência para as mensais, ano para as anuais */
  referencia: string
  onClose: () => void
  onSalvo: () => void
}) {
  const [obrigacaoId, setObrigacaoId] = useState(obrigacoes[0]?.id ?? '')
  const ob = obrigacoes.find((o) => o.id === obrigacaoId)
  const [opcao, setOpcao] = useState('')
  const opcaoEscolhida = opcao || ob?.opcoes.find((x) => x.concluido)?.id || ob?.opcoes[0]?.id || ''
  const [leitura, setLeitura] = useState<Leitura | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [feito, setFeito] = useState<number | null>(null)

  const porCnpj = useMemo(() => new Map(empresas.filter((e) => e.cnpj).map((e) => [e.cnpj!.replace(/\D/g, ''), e])), [empresas])

  async function ler(f: File) {
    setErro(null)
    setFeito(null)
    try {
      const linhas = await lerPlanilhaArquivo(f)
      if (linhas.length < 2) return setErro('A planilha está vazia.')
      const cab = linhas[0].map((c) => c.toLowerCase())
      // Coluna do CNPJ: pelo título; senão, a que tem mais valores com 14 dígitos
      let col = cab.findIndex((c) => c.includes('cnpj'))
      if (col < 0) {
        const n = Math.max(...linhas.map((l) => l.length))
        const conta = Array.from({ length: n }, (_, i) => linhas.slice(1).filter((l) => (l[i] ?? '').replace(/\D/g, '').length === 14).length)
        col = conta.indexOf(Math.max(...conta))
      }
      const iNome = cab.findIndex((c) => /raz[aã]o|nome/.test(c))
      const vistos = new Set<string>()
      const encontrados: EmpresaFech[] = []
      const fora: Leitura['fora'] = []
      let semCnpj = 0
      for (const l of linhas.slice(1)) {
        const d = (l[col] ?? '').replace(/\D/g, '')
        if (d.length !== 14) {
          if (l.some((x) => x.trim())) semCnpj++
          continue
        }
        if (vistos.has(d)) continue
        vistos.add(d)
        const e = porCnpj.get(d)
        if (e) encontrados.push(e)
        else fora.push({ cnpj: d, nome: iNome >= 0 ? (l[iNome] ?? '') : '' })
      }
      setLeitura({ arquivo: f.name, coluna: linhas[0][col] ?? `coluna ${col + 1}`, encontrados, fora, semCnpj })
    } catch (e) {
      setErro(`Não foi possível ler a planilha: ${e instanceof Error ? e.message : e}`)
    }
  }

  async function aplicar() {
    if (!ob || !leitura?.encontrados.length) return
    setSalvando(true)
    const competencia = competenciaStatus(ob, referencia)
    const agora = new Date().toISOString()
    const linhas = leitura.encontrados.map((e) => ({ obrigacao_id: ob.id, cliente_id: e.id, competencia, valor: opcaoEscolhida, atualizado_em: agora }))
    let falha: string | null = null
    for (let i = 0; i < linhas.length && !falha; i += 200) {
      const { error } = await supabase.from('fech_status').upsert(linhas.slice(i, i + 200), { onConflict: 'obrigacao_id,cliente_id,competencia' })
      if (error) falha = error.message
    }
    setSalvando(false)
    if (falha) return setErro(falha)
    setFeito(linhas.length)
    onSalvo()
  }

  const rotuloOpcao = ob?.opcoes.find((x) => x.id === opcaoEscolhida)?.label ?? ''

  return (
    <Modal
      title="Marcar pela planilha"
      subtitulo="Marca a opção escolhida para as empresas cujo CNPJ está na planilha"
      onClose={onClose}
      largura="max-w-3xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Fechar
          </button>
          {leitura && feito === null && (
            <button className="btn-primary" onClick={aplicar} disabled={salvando || !leitura.encontrados.length || !ob}>
              <Check className="h-4 w-4" />
              {salvando ? 'Marcando...' : `Marcar ${leitura.encontrados.length} empresa(s) como “${rotuloOpcao}”`}
            </button>
          )}
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      {feito !== null && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {feito} empresa(s) marcada(s) como “{rotuloOpcao}” em {ob?.nome}.
        </p>
      )}
      <div className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70 sm:grid-cols-2">
        <Field label="Coluna do controle">
          <select
            className="input"
            value={obrigacaoId}
            onChange={(e) => {
              setObrigacaoId(e.target.value)
              setOpcao('')
            }}
          >
            {obrigacoes.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Marcar como">
          <select className="input" value={opcaoEscolhida} onChange={(e) => setOpcao(e.target.value)}>
            {ob?.opcoes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-5 text-center hover:border-brand-400">
        <FileUp className="h-8 w-8 text-brand-500" />
        <span className="text-sm font-semibold text-slate-700">
          {leitura ? `Arquivo: ${leitura.arquivo} (clique para trocar)` : 'Clique para escolher a planilha'}
        </span>
        <span className="text-xs text-slate-500">Excel (.xlsx) ou CSV. O CNPJ pode estar só com números ou com pontuação.</span>
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) ler(f)
            e.target.value = ''
          }}
        />
      </label>
      {leitura && (
        <div className="space-y-2 rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200/70">
          <p>
            Coluna do CNPJ: <b>{leitura.coluna}</b>
          </p>
          <p className="text-emerald-700">
            <b>{leitura.encontrados.length}</b> empresa(s) encontrada(s) na Base de Clientes
          </p>
          {leitura.fora.length > 0 && (
            <details className="text-amber-700">
              <summary className="cursor-pointer">
                <b>{leitura.fora.length}</b> CNPJ(s) da planilha não estão na Base de Clientes (ou a empresa está inativa)
              </summary>
              <ul className="mt-1 grid gap-x-4 text-xs sm:grid-cols-2">
                {leitura.fora.map((f) => (
                  <li key={f.cnpj} className="truncate">
                    <span className="font-mono">{formatarCnpj(f.cnpj)}</span> {f.nome}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {leitura.semCnpj > 0 && <p className="text-slate-500">{leitura.semCnpj} linha(s) sem CNPJ válido ignorada(s).</p>}
        </div>
      )}
    </Modal>
  )
}
