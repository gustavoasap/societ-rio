import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, Loader2, Trash2, Upload } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const BUCKET = 'legalizacao'
const LIMITE_MB = 10

interface Arquivo {
  nome: string
  caminho: string
  tamanho: number
  enviadoEm: string | null
}

const pasta = (clienteId: string) => `licenciamento/${clienteId}`

function nomeSeguro(nome: string) {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_')
  return `${Date.now()}-${base}`
}

// O nome salvo começa com um carimbo de tempo (para não sobrescrever); na tela mostramos sem ele
const nomeExibido = (nome: string) => nome.replace(/^\d{10,}-/, '')

function tamanho(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Documentos de licenciamento da empresa, guardados no Storage do Supabase (bucket privado). */
export function Documentos({ clienteId }: { clienteId: string }) {
  const [arquivos, setArquivos] = useState<Arquivo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const listar = useCallback(async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list(pasta(clienteId), { sortBy: { column: 'created_at', order: 'desc' } })
    if (error) setErro(error.message)
    setArquivos(
      (data ?? [])
        .filter((f) => f.id)
        .map((f) => ({ nome: f.name, caminho: `${pasta(clienteId)}/${f.name}`, tamanho: (f.metadata?.size as number) ?? 0, enviadoEm: f.created_at ?? null })),
    )
    setCarregando(false)
  }, [clienteId])

  useEffect(() => {
    listar()
  }, [listar])

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return
    setErro(null)
    const grandes = [...lista].filter((f) => f.size > LIMITE_MB * 1024 * 1024)
    if (grandes.length) return setErro(`Arquivo acima de ${LIMITE_MB} MB: ${grandes.map((f) => f.name).join(', ')}`)
    setEnviando(true)
    for (const f of lista) {
      const { error } = await supabase.storage.from(BUCKET).upload(`${pasta(clienteId)}/${nomeSeguro(f.name)}`, f, { contentType: f.type || undefined })
      if (error) setErro(`${f.name}: ${error.message}`)
    }
    setEnviando(false)
    if (input.current) input.current.value = ''
    listar()
  }

  async function baixar(a: Arquivo) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.caminho, 60, { download: nomeExibido(a.nome) })
    if (error || !data) return setErro(error?.message ?? 'Não foi possível gerar o link.')
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function excluir(a: Arquivo) {
    if (!confirm(`Excluir o documento "${nomeExibido(a.nome)}"?`)) return
    const { error } = await supabase.storage.from(BUCKET).remove([a.caminho])
    if (error) return setErro(error.message)
    listar()
  }

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          enviar(e.dataTransfer.files)
        }}
      >
        <p className="text-sm text-slate-500">Arraste o PDF ou a imagem aqui, ou escolha o arquivo (até {LIMITE_MB} MB).</p>
        <label className={`btn-secondary btn-sm cursor-pointer ${enviando ? 'pointer-events-none opacity-60' : ''}`}>
          {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {enviando ? 'Enviando...' : 'Anexar documento'}
          <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg" multiple className="hidden" onChange={(e) => enviar(e.target.files)} />
        </label>
      </div>

      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{erro}</p>}

      {carregando ? (
        <p className="text-sm text-slate-400">Carregando documentos...</p>
      ) : arquivos.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
          {arquivos.map((a) => (
            <li key={a.caminho} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-slate-700">{nomeExibido(a.nome)}</div>
                <div className="text-xs text-slate-400">
                  {tamanho(a.tamanho)}
                  {a.enviadoEm && ` · enviado em ${new Date(a.enviadoEm).toLocaleDateString('pt-BR')}`}
                </div>
              </div>
              <button type="button" className="icon-btn" title="Baixar" onClick={() => baixar(a)}>
                <Download className="h-4 w-4" />
              </button>
              <button type="button" className="icon-btn hover:bg-rose-50 hover:text-rose-600" title="Excluir" onClick={() => excluir(a)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
