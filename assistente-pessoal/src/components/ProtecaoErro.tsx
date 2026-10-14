import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'

/** Se uma tela quebrar, mostra um aviso com "Recarregar" em vez de deixar o app inteiro em branco. */
export class ProtecaoErro extends Component<{ children: ReactNode; onFechar?: () => void }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error(erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-azul-950/60 p-4">
        <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-6 text-center shadow-2xl">
          <TriangleAlert className="mx-auto h-10 w-10 text-amber-500" />
          <h2 className="text-lg font-bold text-slate-900">Algo deu errado nesta tela</h2>
          <p className="text-sm text-slate-500">Seus dados estão salvos. Recarregue para continuar.</p>
          <p className="break-words rounded-lg bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-400">{this.state.erro.message}</p>
          <div className="flex justify-center gap-2">
            {this.props.onFechar && (
              <button
                className="btn-secondary"
                onClick={() => {
                  this.setState({ erro: null })
                  this.props.onFechar?.()
                }}
              >
                Fechar
              </button>
            )}
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Recarregar
            </button>
          </div>
        </div>
      </div>
    )
  }
}
