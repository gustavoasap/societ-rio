import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Square, UsersRound, XCircle } from 'lucide-react'
import { Modal } from '../components/ui'
import { atualizarSociosDoCliente, contratosDoDrive, sociosIncompletos, type DocContrato, type ResultadoCliente } from './lerContratosDrive'
import type { Cliente } from './tipos'

const cod = (n: number) => String(n).padStart(3, '0')

function oQueFalta(c: Cliente) {
  const l = c.socios ?? []
  if (!l.length) return 'Sem sócios'
  const f = new Set<string>()
  for (const s of l) {
    if (!s.cpf) f.add('CPF')
    if (!s.doc_numero) f.add('documento')
    if (!s.rua || !s.cep) f.add('endereço')
  }
  return `Falta ${[...f].join(', ')}`
}

/**
 * Atualiza os sócios de todos os clientes ativos que estão sem sócios ou com dados faltando, lendo o
 * Contrato Social salvo no Drive (inclusive escaneado, com OCR). Só completa o que está vazio.
 */
export function AtualizarSocios({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [docs, setDocs] = useState<Map<string, DocContrato[]> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [rodando, setRodando] = useState(false)
  const [atual, setAtual] = useState<{ id: string; msg: string } | null>(null)
  const [resultados, setResultados] = useState<Map<string, ResultadoCliente>>(new Map())
  const parar = useRef(false)

  useEffect(() => {
    contratosDoDrive()
      .then(setDocs)
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [])

  const grupos = useMemo(() => {
    const ativos = clientes.filter((c) => c.status !== 'encerrado' && sociosIncompletos(c.socios))
    const temArquivo = (c: Cliente) => (docs?.get(c.id) ?? []).some((d) => d.drive_id)
    return {
      alvos: ativos.filter(temArquivo).sort((a, b) => a.codigo - b.codigo),
      semArquivo: ativos.filter((c) => docs?.has(c.id) && !temArquivo(c)),
      semContrato: ativos.filter((c) => !docs?.has(c.id)),
    }
  }, [clientes, docs])

  async function iniciar() {
    setRodando(true)
    setErro(null)
    parar.current = false
    for (const c of grupos.alvos) {
      if (parar.current) break
      if (resultados.get(c.id)?.tipo === 'preenchido') continue
      setAtual({ id: c.id, msg: 'começando' })
      try {
        const r = await atualizarSociosDoCliente(c, docs!.get(c.id)!, (m) => setAtual({ id: c.id, msg: m }))
        setResultados((m) => new Map(m).set(c.id, r))
      } catch (e) {
        // Problema geral (script do Drive, sessão, portal atualizado): para tudo e avisa
        setErro(e instanceof Error ? e.message : String(e))
        break
      }
    }
    setAtual(null)
    setRodando(false)
    const { encerrarOcr } = await import('./ocr')
    await encerrarOcr()
    onFeito()
  }

  const preenchidos = [...resultados.values()].filter((r) => r.tipo === 'preenchido').length

  return (
    <Modal
      title="Atualizar sócios pelo Contrato Social"
      subtitulo="Lê o contrato salvo no Drive de cada cliente sem sócios ou com dados faltando (inclusive escaneado, com OCR)"
      onClose={() => !rodando && onClose()}
      largura="max-w-[min(96vw,1300px)]"
      footer={
        <>
          <span className="mr-auto text-xs text-slate-500">Só completa campos vazios: o que já foi digitado não é alterado.</span>
          {rodando ? (
            <button className="btn-secondary" onClick={() => (parar.current = true)}>
              <Square className="h-4 w-4" />
              Parar depois deste
            </button>
          ) : (
            <button className="btn-secondary" onClick={onClose}>
              Fechar
            </button>
          )}
          <button className="btn-primary" onClick={iniciar} disabled={rodando || !docs || !grupos.alvos.length}>
            {rodando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
            {rodando ? 'Atualizando...' : `Atualizar ${grupos.alvos.length} cliente(s)`}
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600">{erro}</p>}
      {!docs && !erro && <p className="py-6 text-center text-sm text-slate-400">Carregando os contratos registrados...</p>}
      {docs && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
              <div className="text-xs text-slate-500">Com contrato no Drive para ler</div>
              <div className="text-2xl font-extrabold text-violet-700">{grupos.alvos.length}</div>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
              <div className="text-xs text-slate-500">Sem contrato registrado</div>
              <div className="text-2xl font-extrabold text-amber-700">{grupos.semContrato.length}</div>
              <div className="text-[0.6875rem] text-slate-400">envie pelo “Enviar Contratos e Cartão CNPJ” ou procure no Drive</div>
            </div>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
              <div className="text-xs text-slate-500">Atualizados agora</div>
              <div className="text-2xl font-extrabold text-emerald-700">{preenchidos}</div>
            </div>
          </div>
          {grupos.semArquivo.length > 0 && (
            <p className="text-xs text-slate-500">
              {grupos.semArquivo.length} cliente(s) têm contrato registrado sem o arquivo no Drive (enviado antes da gravação no Drive): reenvie o contrato.
            </p>
          )}
          <div className="max-h-[50vh] overflow-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr className="border-b border-slate-100">
                  <th className="py-2.5 pr-2 pl-4">Cliente</th>
                  <th className="px-2 py-2.5">Situação</th>
                  <th className="py-2.5 pr-4 pl-2">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top">
                {grupos.alvos.map((c) => {
                  const r = resultados.get(c.id)
                  return (
                    <tr key={c.id}>
                      <td className="py-2 pr-2 pl-4">
                        <span className="font-mono text-xs text-slate-400">{cod(c.codigo)}</span>{' '}
                        <span className="font-semibold text-slate-800">{c.razao_social}</span>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-600">{oQueFalta(c)}</td>
                      <td className="py-2 pr-4 pl-2 text-xs">
                        {atual?.id === c.id && (
                          <span className="flex items-center gap-1 text-brand-700">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {atual.msg}
                          </span>
                        )}
                        {r?.tipo === 'preenchido' && (
                          <span className="flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {r.socios} sócio(s) lido(s){r.ocr ? ' (OCR — confira)' : ''}
                          </span>
                        )}
                        {r?.tipo === 'sem_socios' && (
                          <span className="text-amber-700">
                            Não achei a qualificação dos sócios no contrato{r.ocr ? ' (nem com OCR)' : ''}: preencha em Detalhes da Empresa
                          </span>
                        )}
                        {r?.tipo === 'sem_arquivo' && <span className="text-slate-500">Sem arquivo no Drive</span>}
                        {r?.tipo === 'falha' && (
                          <span className="flex items-start gap-1 text-rose-600">
                            <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {r.erro}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!grupos.alvos.length && <p className="p-8 text-center text-sm text-slate-400">Nenhum cliente com contrato no Drive e sócios faltando.</p>}
          </div>
        </>
      )}
    </Modal>
  )
}
