import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installGlobalErrorHandlers } from './lib/diagnostics'

// Capture uncaught errors / rejections into the local diagnostics buffer so
// a field issue is recoverable from Settings → Diagnostics instead of lost.
installGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
