// Lightweight, local-only diagnostics log. A field tech who hits a crash
// or a save error has no way to report it otherwise; this keeps a bounded
// ring buffer of recent uncaught errors in localStorage, surfaced in
// Settings → Diagnostics where it can be copied and sent. Deliberately
// device-local — nothing is transmitted anywhere — so no licence numbers,
// sites or signatures ever leave the device through it.

const KEY = 'refrighandle.diagnostics'
const MAX = 50

export type DiagKind = 'error' | 'rejection' | 'app' | 'sync'

export interface DiagEntry {
  at: string // ISO timestamp
  kind: DiagKind
  message: string
  detail?: string
}

function read(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as DiagEntry[]) : []
  } catch {
    return []
  }
}

function write(entries: DiagEntry[]) {
  try {
    // Keep only the most recent MAX so the buffer can never grow without
    // bound (or blow the localStorage quota on a long-running device).
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)))
  } catch {
    /* storage unavailable / full — diagnostics are best-effort */
  }
}

// Record one diagnostic. Messages/details are truncated so a pathological
// stack can't fill storage. Never throws — diagnostics must not themselves
// become a failure path.
export function logDiagnostic(kind: DiagKind, message: string, detail?: string) {
  try {
    const msg = (message || 'Unknown error').toString().slice(0, 500)
    const entry: DiagEntry = {
      at: new Date().toISOString(),
      kind,
      message: msg,
      detail: detail ? detail.toString().slice(0, 2000) : undefined,
    }
    const entries = read()
    entries.push(entry)
    write(entries)
  } catch {
    /* swallow — logging an error must never raise one */
  }
}

// Newest first, for display.
export function getDiagnostics(): DiagEntry[] {
  return read().reverse()
}

export function clearDiagnostics() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

// One plain-text block of every recorded entry, for the Copy button — the
// thing a tech pastes into an email so an issue can be diagnosed.
export function diagnosticsToText(): string {
  const entries = getDiagnostics()
  if (entries.length === 0) return 'No issues recorded.'
  return entries
    .map((e) => {
      const head = `[${e.at}] ${e.kind}: ${e.message}`
      return e.detail ? `${head}\n${e.detail}` : head
    })
    .join('\n\n')
}

let installed = false

// Attach global handlers once, at startup, so uncaught errors and rejected
// promises anywhere in the app land in the buffer.
export function installGlobalErrorHandlers() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('error', (e: ErrorEvent) => {
    // Resource-load errors fire here too with no message — skip those.
    const message = e.message || e.error?.message
    if (!message) return
    const detail =
      e.error?.stack ||
      (e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined)
    logDiagnostic('error', message, detail)
  })
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined
    const message =
      reason?.message || (reason ? String(reason) : 'Unhandled promise rejection')
    logDiagnostic('rejection', message, reason?.stack)
  })
}
