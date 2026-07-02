import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './lib/diagnostics'

// Capture uncaught errors / rejections into the local diagnostics buffer so
// a field issue is recoverable from Settings → Diagnostics instead of lost.
installGlobalErrorHandlers()

// The service worker auto-updates (skipWaiting) and every route is lazy —
// so a deploy landing mid-session can strand the running shell asking for
// an old chunk the new SW no longer precaches. Vite surfaces that failed
// dynamic import as `vite:preloadError`; a full reload picks up the fresh
// app instead of leaving the tab stuck on a Suspense fallback forever.
// One-shot per session: if the chunk is missing for a real reason (an
// offline device with a partial cache), reloading forever would brick the
// tab — after one attempt, let the failure surface normally.
window.addEventListener('vite:preloadError', (event) => {
  const FLAG = 'refrighandle.reloadedForChunk'
  try {
    if (sessionStorage.getItem(FLAG)) return
    sessionStorage.setItem(FLAG, '1')
  } catch {
    return
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
