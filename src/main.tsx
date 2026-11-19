import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { avisarPortalAtualizado } from './lib/importar'

// Portal atualizado com a página aberta: faixa no topo pedindo para recarregar (sem recarregar sozinho,
// para não perder o que está sendo feito)
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  avisarPortalAtualizado()
})
window.addEventListener('portal:atualizado', () => {
  if (document.getElementById('aviso-atualizado')) return
  const d = document.createElement('div')
  d.id = 'aviso-atualizado'
  d.setAttribute('role', 'alert')
  d.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;gap:12px;align-items:center;justify-content:center;padding:10px 16px;background:#b45309;color:#fff;font:600 14px system-ui,sans-serif'
  d.textContent = 'O portal foi atualizado. Recarregue a página para continuar.'
  const b = document.createElement('button')
  b.textContent = 'Recarregar'
  b.style.cssText = 'background:#fff;color:#b45309;border:0;border-radius:8px;padding:6px 14px;font:700 13px system-ui,sans-serif;cursor:pointer'
  b.onclick = () => location.reload()
  d.appendChild(b)
  document.body.appendChild(d)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
