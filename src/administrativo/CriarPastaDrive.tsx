import { useState } from 'react'
import { FolderPlus, Settings } from 'lucide-react'
import { Field, Modal } from '../components/ui'
import { criarPastasDrive, obterUrlDrive, salvarUrlDrive, urlDriveValida } from './drive'

/** Configurar o endereço do App da Web do script de pastas. */
export function ConfigDrive({ atual, onClose, onSalvo }: { atual: string | null; onClose: () => void; onSalvo: (url: string) => void }) {
  const [url, setUrl] = useState(atual ?? '')
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (!urlDriveValida(url)) return setErro('A URL do App da Web começa com https://script.google.com/macros/s/ e termina em /exec.')
    const { error } = await salvarUrlDrive(url)
    if (error) return setErro(error.message)
    onSalvo(url.trim())
  }

  return (
    <Modal
      title="Pastas no Google Drive"
      subtitulo="Ligar o botão “Criar pasta no Drive” ao script da automação"
      onClose={onClose}
      largura="max-w-2xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={salvar}>
            <Settings className="h-4 w-4" />
            Salvar
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">{erro}</p>}
      <div className="space-y-3 rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200/70">
        <ol className="list-decimal space-y-1 pl-5">
          <li>No Apps Script da automação de pastas, cole a versão nova do código e salve.</li>
          <li>
            Clique em <b>Implantar → Nova implantação</b>, escolha o tipo <b>App da Web</b>.
          </li>
          <li>
            <b>Executar como:</b> Eu · <b>Quem pode acessar:</b> Qualquer pessoa → <b>Implantar</b> (autorize se pedir).
          </li>
          <li>
            Copie a <b>URL do App da Web</b> (termina em <code>/exec</code>) e cole abaixo.
          </li>
        </ol>
        <Field label="URL do App da Web">
          <input
            className="input font-mono text-xs"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
          />
        </Field>
        <p className="text-xs text-slate-500">
          O endereço só pede ao script para verificar os clientes sem pasta; ele não recebe nenhum dado. Mesmo sem o botão, o script cria as pastas sozinho a
          cada 5 minutos.
        </p>
      </div>
    </Modal>
  )
}

/** Botão que cria agora a pasta no Drive dos clientes sem pasta (e grava o link). */
export function CriarPastaDrive({
  onFeito,
  className = 'btn-secondary btn-sm',
  rotulo = 'Criar pasta no Drive',
}: {
  onFeito: () => void
  className?: string
  rotulo?: string
}) {
  const [rodando, setRodando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const [config, setConfig] = useState<{ atual: string | null } | null>(null)

  async function executar(url?: string) {
    setMsg(null)
    const endereco = url ?? (await obterUrlDrive())
    if (!endereco) return setConfig({ atual: null })
    setRodando(true)
    try {
      const r = await criarPastasDrive(endereco)
      if (r.erro) setMsg({ ok: false, texto: `Erro no script: ${r.erro}` })
      else if (r.ocupado) setMsg({ ok: false, texto: 'O script estava rodando a verificação automática. Tente de novo em alguns segundos.' })
      else
        setMsg({
          ok: true,
          texto:
            r.pastasCriadas || r.linksGravados ? `${r.pastasCriadas} pasta(s) criada(s) e ${r.linksGravados} link(s) gravado(s).` : 'Nenhum cliente sem pasta.',
        })
      onFeito()
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : String(e) })
    } finally {
      setRodando(false)
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" className={className} onClick={() => executar()} disabled={rodando}>
        <FolderPlus className={`h-3.5 w-3.5 ${rodando ? 'animate-pulse' : ''}`} />
        {rodando ? 'Criando pasta...' : rotulo}
      </button>
      <button
        type="button"
        className="icon-btn h-7 w-7"
        title="Configurar ligação com o Drive"
        aria-label="Configurar ligação com o Drive"
        onClick={async () => setConfig({ atual: await obterUrlDrive() })}
      >
        <Settings className="h-3.5 w-3.5" />
      </button>
      {msg && <span className={`text-xs font-medium ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.texto}</span>}
      {config && (
        <ConfigDrive
          atual={config.atual}
          onClose={() => setConfig(null)}
          onSalvo={(u) => {
            setConfig(null)
            executar(u)
          }}
        />
      )}
    </span>
  )
}
