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
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
