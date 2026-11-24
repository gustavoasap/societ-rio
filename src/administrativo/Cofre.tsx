import { useEffect, useState } from 'react'
import { Copy, Eye, EyeOff, KeyRound, Loader2, Lock, LockOpen, Pencil, Trash2, Upload } from 'lucide-react'
import { Modal } from '../components/ui'
import {
  bloquearCofre,
  clientesComSenha,
  configCofre,
  copiarTemporario,
  criarSenhaMestra,
  desbloquearCofre,
  excluirSenha,
  gravarSenha,
  revelarSenha,
  trocarSenhaMestra,
  useCofre,
} from './cofre'
import { problemaSenhaMestra } from './cofreCripto'
import { apagarSenhasTxtDrive, lerSenhasTxtDrive, type SenhaTxt } from './drive'
import type { Cliente } from './tipos'

const cod = (n: number) => String(n).padStart(3, '0')

/** Abre o cofre com a senha-mestra (ou cria a senha-mestra no primeiro uso). */
export function AbrirCofre({ onAberto, onClose }: { onAberto: () => void; onClose: () => void }) {
  const [existe, setExiste] = useState<boolean | null>(null)
  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [ciente, setCiente] = useState(false)
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    configCofre()
      .then((c) => setExiste(!!c))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [])

  async function enviar() {
    setErro(null)
    if (!existe) {
      const p = problemaSenhaMestra(senha)
      if (p) return setErro(p)
      if (senha !== confirma) return setErro('A confirmação não confere com a senha-mestra.')
      if (!ciente) return setErro('Confirme que entendeu que a senha-mestra não pode ser recuperada.')
    }
    setOcupado(true)
    try {
      if (existe) await desbloquearCofre(senha)
      else await criarSenhaMestra(senha)
      setSenha('')
      setConfirma('')
      onAberto()
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setOcupado(false)
  }

  return (
    <Modal
      title={existe === false ? 'Criar a senha-mestra do cofre' : 'Abrir o cofre de senhas'}
      subtitulo="Senhas dos certificados digitais, criptografadas no seu navegador"
      onClose={onClose}
      largura="max-w-md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-primary" onClick={enviar} disabled={ocupado || existe === null || !senha}>
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />}
            {existe === false ? 'Criar e abrir' : 'Abrir'}
          </button>
        </>
      }
    >
      {existe === false && (
        <div className="space-y-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <p>
            <b>Você define a senha-mestra.</b> Ela não é guardada em lugar nenhum (nem no portal, nem no banco): só quem souber consegue abrir as senhas.
          </p>
          <p>
            <b>Se for esquecida, as senhas guardadas não podem ser recuperadas</b> por ninguém. Guarde em lugar seguro e compartilhe só com os sócios.
          </p>
        </div>
      )}
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-slate-600">Senha-mestra</span>
        <div className="relative">
          <input
            type={ver ? 'text' : 'password'}
            className="input pr-10"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={existe === false ? 'new-password' : 'current-password'}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && existe && enviar()}
          />
          <button
            type="button"
            className="icon-btn absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2"
            onClick={() => setVer((v) => !v)}
            aria-label="Mostrar senha"
          >
            {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </label>
      {existe === false && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Confirme a senha-mestra</span>
            <input
              type={ver ? 'text' : 'password'}
              className="input"
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              autoComplete="new-password"
            />
          </label>
          <p className="text-xs text-slate-500">Mínimo de 10 caracteres, misturando letras e números.</p>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={ciente} onChange={(e) => setCiente(e.target.checked)} />
            Entendi que, se a senha-mestra for esquecida, as senhas guardadas não podem ser recuperadas.
          </label>
        </>
      )}
      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{erro}</p>}
    </Modal>
  )
}

/** Garante o cofre aberto antes de uma ação (abre a janela da senha-mestra se precisar). */
function useComCofre() {
  const { aberto } = useCofre()
  const [pendente, setPendente] = useState<null | (() => void)>(null)
  const executar = (f: () => void) => (aberto ? f() : setPendente(() => f))
  const janela = pendente ? (
    <AbrirCofre
      onClose={() => setPendente(null)}
      onAberto={() => {
        const f = pendente
        setPendente(null)
        f()
      }}
    />
  ) : null
  return { executar, janela }
}

/** Senha do certificado de um cliente: cadastrar, revelar (20 s), copiar (limpa em 30 s), alterar e excluir. */
export function SenhaCertificado({ clienteId, tem, onAlterado }: { clienteId: string; tem: boolean; onAlterado: () => void }) {
  const { executar, janela } = useComCofre()
  const [visivel, setVisivel] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [nova, setNova] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!visivel) return
    const t = setTimeout(() => setVisivel(null), 20_000)
    return () => clearTimeout(t)
  }, [visivel])

  const tentar = (f: () => Promise<void>) =>
    executar(() => {
      setErro(null)
      f().catch((e) => setErro(e instanceof Error ? e.message : String(e)))
    })

  return (
    <div className="space-y-1">
      {editando ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            className="input w-44 py-1.5 font-mono text-sm"
            placeholder="Senha do certificado"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          <button
            className="btn-primary btn-sm"
            disabled={!nova}
            onClick={() =>
              tentar(async () => {
                await gravarSenha(clienteId, nova)
                setNova('')
                setEditando(false)
                setAviso('Senha guardada no cofre.')
                onAlterado()
              })
            }
          >
            Guardar
          </button>
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setNova('')
              setEditando(false)
            }}
          >
            Cancelar
          </button>
        </div>
      ) : tem ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm text-slate-800">{visivel ?? '••••••••'}</span>
          <button
            className="icon-btn h-7 w-7"
            title={visivel ? 'Esconder' : 'Revelar (20 segundos)'}
            aria-label="Revelar senha"
            onClick={() => (visivel ? setVisivel(null) : tentar(async () => setVisivel(await revelarSenha(clienteId))))}
          >
            {visivel ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            className="icon-btn h-7 w-7"
            title="Copiar (a área de transferência é limpa em 30 segundos)"
            aria-label="Copiar senha"
            onClick={() =>
              tentar(async () => {
                await copiarTemporario(await revelarSenha(clienteId, 'copiar'))
                setAviso('Copiada. A área de transferência é limpa em 30 segundos.')
              })
            }
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button className="icon-btn h-7 w-7" title="Alterar a senha" aria-label="Alterar senha" onClick={() => executar(() => setEditando(true))}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            className="icon-btn h-7 w-7 hover:text-rose-600"
            title="Excluir a senha do cofre"
            aria-label="Excluir senha"
            onClick={() =>
              confirm('Excluir a senha deste certificado do cofre?') &&
              tentar(async () => {
                await excluirSenha(clienteId)
                setVisivel(null)
                onAlterado()
              })
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button className="btn-secondary btn-sm whitespace-nowrap" onClick={() => executar(() => setEditando(true))}>
          <KeyRound className="h-3.5 w-3.5" />
          Guardar senha
        </button>
      )}
      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="text-xs font-medium text-rose-600">{erro}</p>}
      {janela}
    </div>
  )
}

/** Barra do cofre: aberto/fechado, fechar, trocar senha-mestra e importar as senhas do Drive. */
export function BarraCofre({ clientes, onAlterado }: { clientes: Cliente[]; onAlterado: () => void }) {
  const { aberto, fechaEm } = useCofre()
  const { executar, janela } = useComCofre()
  const [importar, setImportar] = useState(false)
  const [trocar, setTrocar] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!aberto) return
    const t = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [aberto, fechaEm])
  const minutos = Math.max(1, Math.ceil((fechaEm - Math.max(agora, fechaEm - 15 * 60_000)) / 60_000))

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
      {aberto ? (
        <>
          <LockOpen className="h-4 w-4 text-emerald-600" />
          <span className="text-slate-700">
            Cofre de senhas <b className="text-emerald-700">aberto</b> · fecha sozinho em {minutos} min
          </span>
          <button className="btn-secondary btn-sm" onClick={bloquearCofre}>
            <Lock className="h-3.5 w-3.5" />
            Fechar agora
          </button>
        </>
      ) : (
        <>
          <Lock className="h-4 w-4 text-slate-500" />
          <span className="text-slate-700">
            Cofre de senhas <b>fechado</b>
          </span>
          <button className="btn-secondary btn-sm" onClick={() => executar(() => {})}>
            <LockOpen className="h-3.5 w-3.5" />
            Abrir
          </button>
        </>
      )}
      <span className="flex-1" />
      <button
        className="btn-secondary btn-sm"
        onClick={() => executar(() => setImportar(true))}
        title="Lê os SENHA CERTIFICADO.txt das pastas e guarda no cofre"
      >
        <Upload className="h-3.5 w-3.5" />
        Importar senhas do Drive
      </button>
      <button className="btn-secondary btn-sm" onClick={() => executar(() => setTrocar(true))}>
        <KeyRound className="h-3.5 w-3.5" />
        Trocar senha-mestra
      </button>
      {janela}
      {importar && (
        <ImportarSenhasDrive
          clientes={clientes}
          onClose={() => setImportar(false)}
          onFeito={() => {
            onAlterado()
          }}
        />
      )}
      {trocar && <TrocarSenhaMestra onClose={() => setTrocar(false)} />}
    </div>
  )
}

function TrocarSenhaMestra({ onClose }: { onClose: () => void }) {
  const [nova, setNova] = useState('')
  const [confirma, setConfirma] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  async function trocar() {
    const p = problemaSenhaMestra(nova)
    if (p) return setErro(p)
    if (nova !== confirma) return setErro('A confirmação não confere.')
    setOcupado(true)
    setErro(null)
    try {
      await trocarSenhaMestra(nova)
      setOk(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setOcupado(false)
  }
  return (
    <Modal
      title="Trocar a senha-mestra"
      subtitulo="Todas as senhas são recriptografadas com a nova senha-mestra"
      onClose={onClose}
      largura="max-w-md"
      footer={
        ok ? (
          <button className="btn-primary" onClick={onClose}>
            Fechar
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" onClick={trocar} disabled={ocupado || !nova}>
              {ocupado && <Loader2 className="h-4 w-4 animate-spin" />}
              Trocar
            </button>
          </>
        )
      }
    >
      {ok ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Senha-mestra trocada. Avise os outros sócios da nova senha.</p>
      ) : (
        <>
          <input
            type="password"
            className="input"
            placeholder="Nova senha-mestra"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            autoComplete="new-password"
          />
          <input
            type="password"
            className="input"
            placeholder="Confirme a nova senha-mestra"
            value={confirma}
            onChange={(e) => setConfirma(e.target.value)}
            autoComplete="new-password"
          />
          <p className="text-xs text-slate-500">Mínimo de 10 caracteres, misturando letras e números. A antiga deixa de funcionar.</p>
        </>
      )}
      {erro && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{erro}</p>}
    </Modal>
  )
}

interface LinhaTxt extends SenhaTxt {
  cliente: Cliente | null
  jaTem: boolean
  marcado: boolean
  status: 'novo' | 'ok' | 'erro'
  msg: string | null
}

/** Migra os SENHA CERTIFICADO.txt do Drive para o cofre (criptografados no navegador) e, depois, apaga os .txt. */
function ImportarSenhasDrive({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [linhas, setLinhas] = useState<LinhaTxt[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState<Set<string>>(new Set())
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [apagados, setApagados] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([lerSenhasTxtDrive(), clientesComSenha()])
      .then(([itens, tem]) => {
        const porCodigo = new Map(clientes.map((c) => [c.codigo, c]))
        setLinhas(
          itens
            .map((i) => {
              const cliente = porCodigo.get(i.codigo) ?? null
              const jaTem = !!cliente && tem.has(cliente.id)
              return { ...i, cliente, jaTem, marcado: !i.padrao && !!cliente && !jaTem, status: 'novo' as const, msg: null }
            })
            .sort((a, b) => Number(a.padrao) - Number(b.padrao) || a.codigo - b.codigo),
        )
      })
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
  }, [clientes])

  const alterar = (id: string, p: Partial<LinhaTxt>) => setLinhas((l) => l!.map((x) => (x.drive_id === id ? { ...x, ...p } : x)))

  async function guardar() {
    setOcupado('guardar')
    for (const l of linhas!.filter((x) => x.marcado && x.cliente && x.status !== 'ok')) {
      try {
        await gravarSenha(l.cliente!.id, l.conteudo, 'drive')
        alterar(l.drive_id, { status: 'ok', msg: 'Guardada no cofre', jaTem: true, marcado: false })
      } catch (e) {
        alterar(l.drive_id, { status: 'erro', msg: e instanceof Error ? e.message : String(e) })
      }
    }
    setOcupado(null)
    onFeito()
  }

  // Pode apagar do Drive: o que já está no cofre e os que só têm o texto padrão
  const apagaveis = (linhas ?? []).filter((l) => l.padrao || l.jaTem || l.status === 'ok')
  async function apagar() {
    if (
      !confirm(`Mandar para a lixeira do Drive ${apagaveis.length} arquivo(s) SENHA CERTIFICADO.txt? (os que já estão no cofre e os que só têm o texto padrão)`)
    )
      return
    setOcupado('apagar')
    try {
      setApagados(await apagarSenhasTxtDrive(apagaveis.map((l) => l.drive_id)))
      setLinhas((l) => l!.filter((x) => !apagaveis.includes(x)))
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setOcupado(null)
  }

  const marcados = (linhas ?? []).filter((l) => l.marcado).length
  const reais = (linhas ?? []).filter((l) => !l.padrao).length

  return (
    <Modal
      title="Importar senhas do Drive"
      subtitulo="Arquivos SENHA CERTIFICADO.txt das pastas CERTIFICADO DIGITAL"
      onClose={() => !ocupado && onClose()}
      largura="max-w-[min(96vw,1100px)]"
      footer={
        <>
          <button className="btn-secondary mr-auto" onClick={apagar} disabled={!!ocupado || !apagaveis.length}>
            {ocupado === 'apagar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Apagar do Drive {apagaveis.length} arquivo(s) .txt
          </button>
          <button className="btn-secondary" onClick={onClose} disabled={!!ocupado}>
            Fechar
          </button>
          <button className="btn-primary" onClick={guardar} disabled={!!ocupado || !marcados}>
            {ocupado === 'guardar' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Guardar {marcados} no cofre
          </button>
        </>
      }
    >
      {erro && <p className="rounded-xl bg-rose-50 px-4 py-2 text-sm text-rose-600">{erro}</p>}
      {apagados !== null && (
        <p className="rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{apagados} arquivo(s) .txt enviados para a lixeira do Drive.</p>
      )}
      {!linhas && !erro && (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Lendo os arquivos de senha nas pastas do Drive... (pode levar alguns minutos)
        </p>
      )}
      {linhas && (
        <>
          <p className="text-sm text-slate-600">
            {linhas.length} arquivo(s) encontrado(s): <b>{reais} com senha</b> e {linhas.length - reais} só com o texto padrão. As senhas são criptografadas no
            seu navegador antes de ir para o banco. Confira e clique em “Guardar no cofre”; depois, apague os .txt do Drive.
          </p>
          <div className="max-h-[50vh] overflow-auto rounded-2xl bg-white ring-1 ring-slate-200/70">
            <table className="w-full table-fixed text-sm">
              <thead className="sticky top-0 bg-white text-left text-[0.6875rem] font-bold tracking-wide text-slate-400 uppercase">
                <tr className="border-b border-slate-100">
                  <th className="w-10 py-2.5 pl-4" />
                  <th className="w-[40%] px-2 py-2.5">Cliente</th>
                  <th className="w-[28%] px-2 py-2.5">Senha no arquivo</th>
                  <th className="py-2.5 pr-4 pl-2">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {linhas.map((l) => (
                  <tr key={l.drive_id} className={l.padrao ? 'text-slate-400' : ''}>
                    <td className="py-2 pl-4">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-600"
                        disabled={l.padrao || !l.cliente || l.status === 'ok'}
                        checked={l.marcado}
                        onChange={(e) => alterar(l.drive_id, { marcado: e.target.checked })}
                        aria-label={`Importar senha do cliente ${l.codigo}`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <span className="font-mono text-xs text-slate-400">{cod(l.codigo)}</span>{' '}
                      {l.cliente?.razao_social ?? <i>cliente não encontrado na Base</i>}
                    </td>
                    <td className="px-2 py-2">
                      {l.padrao ? (
                        <span className="text-xs">texto padrão (sem senha)</span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="truncate font-mono text-xs">{mostrar.has(l.drive_id) ? l.conteudo : '••••••••'}</span>
                          <button
                            className="icon-btn h-6 w-6"
                            onClick={() =>
                              setMostrar((m) => {
                                const n = new Set(m)
                                if (n.has(l.drive_id)) n.delete(l.drive_id)
                                else n.add(l.drive_id)
                                return n
                              })
                            }
                            aria-label="Mostrar senha"
                          >
                            {mostrar.has(l.drive_id) ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 pl-2 text-xs">
                      {l.status === 'ok' ? (
                        <span className="text-emerald-700">{l.msg}</span>
                      ) : l.status === 'erro' ? (
                        <span className="text-rose-600">{l.msg}</span>
                      ) : l.jaTem && !l.padrao ? (
                        <span className="text-slate-500">Já tem senha no cofre (marque para substituir)</span>
                      ) : l.padrao ? (
                        <span>Nada a importar</span>
                      ) : !l.cliente ? (
                        <span className="text-amber-700">Pasta sem cliente correspondente</span>
                      ) : (
                        <span className="text-slate-500">Pronto para guardar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
