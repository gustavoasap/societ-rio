import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react'

const EVENTO = 'rota-mudou'

export function navegar(para: string) {
  if (para === window.location.pathname) return
  window.history.pushState(null, '', para)
  window.dispatchEvent(new Event(EVENTO))
  window.scrollTo({ top: 0 })
}

export function useRota() {
  const [caminho, setCaminho] = useState(window.location.pathname)
  useEffect(() => {
    const atualizar = () => setCaminho(window.location.pathname)
    window.addEventListener('popstate', atualizar)
    window.addEventListener(EVENTO, atualizar)
    return () => {
      window.removeEventListener('popstate', atualizar)
      window.removeEventListener(EVENTO, atualizar)
    }
  }, [])
  return caminho.replace(/\/+$/, '') || '/'
}

export function Link({ para, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { para: string }) {
  function clicar(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navegar(para)
  }
  return <a href={para} onClick={clicar} {...props} />
}
