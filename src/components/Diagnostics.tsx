import { useState } from 'react'
import { Button } from './ui'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import {
  clearDiagnostics,
  diagnosticsToText,
  getDiagnostics,
  type DiagEntry,
} from '../lib/diagnostics'
import { formatDateTime } from '../lib/datetime'
import { useStore } from '../lib/store'

// Settings card for the local diagnostics buffer (see lib/diagnostics).
// Lets a tech see that something went wrong and copy the details to send,
// without a developer having to be in the room. Read from localStorage on
// demand — these are rare and not reactive, so a manual Refresh is enough.
export function DiagnosticsCard() {
  const { state } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const [entries, setEntries] = useState<DiagEntry[]>(() => getDiagnostics())
  const [expanded, setExpanded] = useState(false)

  async function copy() {
    const text = diagnosticsToText()
    try {
      await navigator.clipboard.writeText(text)
      toast.show('Diagnostics copied — paste them into an email or message', 'success')
    } catch {
      toast.show('Could not copy to the clipboard on this device', 'error')
    }
  }

  async function clear() {
    const ok = await confirm({
      title: 'Clear diagnostics?',
      message: 'Removes the recorded issues from this device. This only affects the diagnostics log — your records are untouched.',
      confirmLabel: 'Clear',
    })
    if (!ok) return
    clearDiagnostics()
    setEntries([])
    setExpanded(false)
  }

  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Diagnostics
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Recent app errors recorded on this device only — nothing is sent
        anywhere. If something misbehaves, copy these and send them so the
        issue can be diagnosed.
      </p>

      {entries.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No issues recorded.{' '}
          <button
            type="button"
            onClick={() => setEntries(getDiagnostics())}
            className="font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Refresh
          </button>
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-700 dark:text-slate-200">
              {entries.length} recent{' '}
              {entries.length === 1 ? 'issue' : 'issues'}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              {expanded ? 'Hide' : 'View'}
            </button>
          </div>

          {expanded && (
            <ul className="space-y-2">
              {entries.map((e, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-slate-50 p-2.5 text-xs dark:bg-slate-800/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {e.kind}
                    </span>
                    <span className="shrink-0 text-slate-400">
                      {formatDateTime(e.at, state.location.timezone, state.clock)}
                    </span>
                  </div>
                  <div className="mt-0.5 break-words text-slate-600 dark:text-slate-300">
                    {e.message}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void copy()}>
              Copy to send
            </Button>
            <Button variant="ghost" onClick={() => void clear()}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
