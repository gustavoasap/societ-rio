import { useRef, useState } from 'react'
import { CircleAlert, CircleCheck, RefreshCw, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { consultarSerpro } from '../lib/cnpjSerpro'
import { camposDoCartao, consultarCnpj } from '../lib/cnpj'
import { Modal } from '../components/ui'
import type { Cliente } from './tipos'

interface Resultado {
  cliente: Cliente
  ok: boolean
  alterados: string[]
  erro?: string
}

const ROTULO: Record<string, string> = {
  razao_social: 'razão social',
  nome_fantasia: 'nome fantasia',
  data_abertura: 'abertura',
  endereco: 'endereço',
  situacao_cadastral: 'situação',
  email: 'e-mail',
  telefone: 'telefone',
}

const pausa = (ms: number, sinal: AbortSignal) =>
  new Promise<void>((ok) => {
    const t = setTimeout(ok, ms)
    sinal.addEventListener('abort', () => {
      clearTimeout(t)
      ok()
    })
  })

/** Consulta o Cartão CNPJ de todas as empresas da base e atualiza o cadastro. */
export function AtualizarTodas({ clientes, onClose, onFeito }: { clientes: Cliente[]; onClose: () => void; onFeito: () => void }) {
  const [incluirEncerrados, setIncluirEncerrados] = useState(false)
  const [usarSerpro, setUsarSerpro] = useState(false)
  const [rodando, setRodando] = useState(false)
  const [atual, setAtual] = useState<string | null>(null)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const ctrl = useRef<AbortController | null>(null)

  const alvo = clientes.filter((c) => (c.cnpj ?? '').length === 14 && (incluirEncerrados || c.status !== 'encerrado'))
  const semCnpj = clientes.filter((c) => (c.cnpj ?? '').length !== 14 && (incluirEncerrados || c.status !== 'encerrado'))

  async function iniciar() {
    const c = new AbortController()
    ctrl.current = c
    setRodando(true)
    setResultados([])
    for (const cli of alvo) {
      if (c.signal.aborted) break
      setAtual(cli.razao_social)
      let r: Resultado
      try {
        const dados = await consultarCnpj(cli.cnpj!, c.signal, { emLote: true, serpro: usarSerpro ? consultarSerpro : undefined })
        const campos = camposDoCartao(dados) as Record<string, string | null>
        const alterados = Object.keys(campos).filter((k) => campos[k] !== (cli[k as keyof Cliente] ?? null))
        const { error } = await supabase
          .from('adm_clientes')
          .update({ ...campos, receita_atualizada_em: new Date().toISOString() })
          .eq('id', cli.id)
        r = error ? { cliente: cli, ok: false, alterados: [], erro: error.message } : { cliente: cli, ok: true, alterados }
      } catch (e) {
        if (c.signal.aborted) break
        r = { cliente: cli, ok: false, alterados: [], erro: e instanceof Error ? e.message : String(e) }
      }
      setResultados((l) => [...l, r])
      // Intervalo entre consultas para não ser bloqueado pelas fontes públicas
      await pausa(350, c.signal)
    }
    setRodando(false)
    setAtual(null)
    onFeito()
  }

  const feitos = resultados.length
  const pct = alvo.length ? Math.round((feitos / alvo.length) * 100) : 0
  const atualizados = resultados.filter((r) => r.ok && r.alterados.length)
  const iguais = resultados.filter((r) => r.ok && !r.alterados.length)
  const erros = resultados.filter((r) => !r.ok)

  return (
    <Modal
      title="Atualizar dados de todas as empresas"
      subtitulo="Consulta o Cartão CNPJ na Receita Federal e atualiza o cadastro"
      onClose={() => {
        ctrl.current?.abort()
        onClose()
      }}
      largura="max-w-3xl"
      footer={
        rodando ? (
          <button className="btn-secondary" onClick={() => ctrl.current?.abort()}>
            <Square className="h-4 w-4" />
            Parar
          </button>
        ) : (
          <>
            <button className="btn-secondary" onClick={onClose}>
              Fechar
            </button>
            <button className="btn-primary" onClick={iniciar} disabled={!alvo.length}>
              <RefreshCw className="h-4 w-4" />
              {feitos ? 'Atualizar de novo' : `Atualizar ${alvo.length} empresa(s)`}
            </button>
          </>
        )
      }
    >
      <div className="space-y-2 rounded-2xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200/70">
        <p>
          Para cada empresa com CNPJ, o portal busca na Receita e atualiza: <b>razão social, nome fantasia, data de abertura, endereço, situação cadastral</b>,
          e também <b>e-mail e telefone</b> quando o Cartão CNPJ os informa (se a Receita não informar, o que já está no cadastro é mantido).
        </p>
        <p className="text-xs text-slate-500">
          Uma consulta por vez, com intervalo, para não sobrecarregar os serviços públicos: {alvo.length} empresa(s) levam cerca de{' '}
          {Math.max(1, Math.ceil((alvo.length * 1.2) / 60))} minuto(s). Pode deixar a janela aberta e acompanhar.
        </p>
        {!rodando && !feitos && (
          <label className="flex cursor-pointer items-center gap-2 pt-1 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={incluirEncerrados} onChange={(e) => setIncluirEncerrados(e.target.checked)} />
            Incluir clientes encerrados
          </label>
        )}
        {!rodando && !feitos && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={usarSerpro} onChange={(e) => setUsarSerpro(e.target.checked)} />
            Usar o Serpro (dados atualizados, consulta paga: {alvo.length} consulta(s))
          </label>
        )}
        {semCnpj.length > 0 && <p className="text-xs text-amber-700">{semCnpj.length} cliente(s) sem CNPJ completo ficam de fora.</p>}
      </div>

      {(rodando || feitos > 0) && (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200/70">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-700">
              {feitos} de {alvo.length} · {pct}%
            </span>
            {atual && <span className="truncate text-xs text-slate-500">Consultando: {atual}</span>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="font-semibold text-emerald-700">{atualizados.length} atualizada(s)</span>
            <span className="text-slate-500">{iguais.length} já estava(m) igual(is)</span>
            {erros.length > 0 && <span className="font-semibold text-rose-600">{erros.length} com erro</span>}
          </div>
          {(atualizados.length > 0 || erros.length > 0) && (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs">
              {[...erros, ...atualizados].map((r) => (
                <li key={r.cliente.id} className="flex items-start gap-2 py-1.5">
                  {r.ok ? (
                    <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
                  )}
                  <span className="font-mono text-slate-400">{String(r.cliente.codigo).padStart(3, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-700">{r.cliente.razao_social}</span>
                    <span className={r.ok ? 'text-slate-500' : 'text-rose-600'}> · {r.ok ? r.alterados.map((k) => ROTULO[k] ?? k).join(', ') : r.erro}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
