import { useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Square, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { camposDoCartao, consultarCnpj, responsavelDoQsa } from '../lib/cnpj'
import { consultarSerpro } from '../lib/cnpjSerpro'
import { Modal } from '../components/ui'
import { formatarCnpj, type Cliente } from './tipos'
import { lerLote } from './loteParse'
import { criarPastasDrive, obterUrlDrive } from './drive'

interface Resultado {
  linha: number
  cnpj: string
  codigo: number | null
  ok: boolean
  texto: string
}

/** Cadastra vários clientes de uma vez: informe código e CNPJ; o resto vem da Receita (Serpro). */
export function CadastroLote({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [texto, setTexto] = useState('')
  const [criarPastas, setCriarPastas] = useState(true)
  const [rodando, setRodando] = useState(false)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [drive, setDrive] = useState<string | null>(null)
  const ctrl = useRef<AbortController | null>(null)

  const linhas = useMemo(() => {
    const cnpjs = new Map(clientes.filter((c) => c.cnpj).map((c) => [c.cnpj!, c]))
    const codigos = new Map(clientes.map((c) => [c.codigo, c]))
    const vistosCnpj = new Set<string>()
    const vistosCod = new Set<number>()
    return lerLote(texto).map((l) => {
      let erro = l.erro
      if (!erro && cnpjs.has(l.cnpj!)) erro = `CNPJ já cadastrado (${String(cnpjs.get(l.cnpj!)!.codigo).padStart(3, '0')} ${cnpjs.get(l.cnpj!)!.razao_social})`
      if (!erro && l.codigo !== null && codigos.has(l.codigo)) erro = `Código já usado por ${codigos.get(l.codigo)!.razao_social}`
      if (!erro && vistosCnpj.has(l.cnpj!)) erro = 'CNPJ repetido na lista'
      if (!erro && l.codigo !== null && vistosCod.has(l.codigo)) erro = 'Código repetido na lista'
      if (l.cnpj) vistosCnpj.add(l.cnpj)
      if (l.codigo !== null) vistosCod.add(l.codigo)
      return { ...l, erro }
    })
  }, [texto, clientes])
  const validas = linhas.filter((l) => !l.erro)

  async function cadastrar() {
    const c = new AbortController()
    ctrl.current = c
    setRodando(true)
    setResultados([])
    setDrive(null)
    for (const l of validas) {
      if (c.signal.aborted) break
      let r: Resultado
      try {
        const d = await consultarCnpj(l.cnpj!, c.signal, { serpro: consultarSerpro })
        const campos = camposDoCartao(d)
        const { error } = await supabase.from('adm_clientes').insert({
          ...(l.codigo !== null ? { codigo: l.codigo } : {}),
          cnpj: l.cnpj,
          ...campos,
          responsavel: responsavelDoQsa(d),
          status: 'pendente',
          empresa: 'ASAP',
          procuracao: 'pendente',
          onboarding: 'pendente',
        })
        r = error
          ? { linha: l.linha, cnpj: l.cnpj!, codigo: l.codigo, ok: false, texto: error.code === '23505' ? 'CNPJ ou código já cadastrado' : error.message }
          : { linha: l.linha, cnpj: l.cnpj!, codigo: l.codigo, ok: true, texto: `${campos.razao_social} (fonte: ${d.fonte})` }
      } catch (e) {
        if (c.signal.aborted) break
        r = { linha: l.linha, cnpj: l.cnpj!, codigo: l.codigo, ok: false, texto: e instanceof Error ? e.message : String(e) }
      }
      setResultados((x) => [...x, r])
    }
    onFeito()
    if (criarPastas && !c.signal.aborted) {
      const url = await obterUrlDrive()
      if (!url) setDrive('Ligação com o Drive não configurada: o script cria as pastas sozinho em até 5 minutos.')
      else {
        setDrive('Criando as pastas no Drive...')
        try {
          const r = await criarPastasDrive(url)
          setDrive(r.erro ? `Erro no script do Drive: ${r.erro}` : `${r.pastasCriadas} pasta(s) criada(s) no Drive e ${r.linksGravados} link(s) gravado(s).`)
          onFeito()
        } catch (e) {
          setDrive(`${e instanceof Error ? e.message : e} O script cria as pastas sozinho em até 5 minutos.`)
        }
      }
    }
    setRodando(false)
  }

  const ok = resultados.filter((r) => r.ok).length
  const falhas = resultados.filter((r) => !r.ok)

  return (
    <Modal
      title="Cadastrar clientes em lote"
      subtitulo="Informe o código e o CNPJ; razão social, endereço, abertura, contato e responsável vêm da Receita"
      onClose={() => {
        ctrl.current?.abort()
        onClose()
      }}
      largura="max-w-4xl"
      footer={
        rodando ? (
          <button className="btn-secondary" onClick={() => ctrl.current?.abort()}>
            <Square className="h-4 w-4" />
            Parar
          </button>
        ) : (
          <>
            <label className="mr-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={criarPastas} onChange={(e) => setCriarPastas(e.target.checked)} />
              Criar as pastas no Drive ao final
            </label>
            <button className="btn-secondary" onClick={onClose}>
              Fechar
            </button>
            <button className="btn-primary" onClick={cadastrar} disabled={!validas.length || resultados.length > 0}>
              <Upload className="h-4 w-4" />
              Cadastrar {validas.length} cliente(s)
            </button>
          </>
        )
      }
    >
      {!resultados.length && !rodando && (
        <div className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <label htmlFor="lote" className="text-sm font-semibold text-slate-700">
            Uma empresa por linha: código e CNPJ (pode colar do Excel)
          </label>
          <textarea
            id="lote"
            className="input min-h-44 font-mono text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={'225  12.345.678/0001-90\n226  98765432000110\n12345678000199   (sem código: usa o próximo número)'}
          />
          <p className="text-xs text-slate-500">
            Cada CNPJ é consultado na Receita pelo Serpro (consulta paga, uma por empresa). Os clientes entram com contrato pendente; os demais dados você
            completa depois no cadastro.
          </p>
        </div>
      )}

      {linhas.length > 0 && !resultados.length && !rodando && (
        <div className="max-h-72 overflow-y-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-2">Linha</th>
                <th className="px-2 py-2">Código</th>
                <th className="px-2 py-2">CNPJ</th>
                <th className="px-2 py-2">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l) => (
                <tr key={l.linha}>
                  <td className="px-4 py-1.5 text-slate-400">{l.linha}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {l.codigo !== null ? String(l.codigo).padStart(3, '0') : <span className="text-slate-400">automático</span>}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{l.cnpj ? formatarCnpj(l.cnpj) : l.texto}</td>
                  <td className={`px-2 py-1.5 text-xs font-semibold ${l.erro ? 'text-rose-600' : 'text-emerald-700'}`}>{l.erro ?? 'Pronto para cadastrar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(rodando || resultados.length > 0) && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <div className="text-sm font-semibold text-slate-700">
            {resultados.length} de {validas.length} · <span className="text-emerald-700">{ok} cadastrado(s)</span>
            {falhas.length > 0 && <span className="text-rose-600"> · {falhas.length} com erro</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all"
              style={{ width: `${validas.length ? (resultados.length / validas.length) * 100 : 0}%` }}
            />
          </div>
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs">
            {resultados.map((r) => (
              <li key={r.linha} className="flex items-start gap-2 py-1.5">
                {r.ok ? (
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                ) : (
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                )}
                <span className="font-mono text-slate-400">{r.codigo !== null ? String(r.codigo).padStart(3, '0') : '---'}</span>
                <span className="font-mono text-slate-500">{formatarCnpj(r.cnpj)}</span>
                <span className={r.ok ? 'font-semibold text-slate-700' : 'text-rose-600'}>{r.texto}</span>
              </li>
            ))}
          </ul>
          {drive && <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-800 ring-1 ring-sky-200">{drive}</p>}
        </div>
      )}
    </Modal>
  )
}
