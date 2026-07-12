import { useCallback, useEffect, useState } from 'react'
import { Button } from './ui'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { useStore } from '../lib/store'
import {
  deleteCorruptedBackup,
  getStorageEstimate,
  isStoragePersisted,
  listCorruptedBackups,
  normalizeState,
  readCorruptedBackup,
  requestPersistentStorage,
  type CorruptedBackup,
  type StorageEstimate,
} from '../lib/storage'
import { formatDateTime } from '../lib/datetime'
import { canDeleteRecords } from '../lib/types'

// Settings → Storage health. The recovery surface the corrupted-load
// toast points at: how much storage the app is using, whether the
// browser has granted persistence, and any preserved damaged blobs —
// each downloadable, restorable (when it parses after all), or
// deletable. Without this card the preserved copies are only reachable
// through dev tools, which is no recovery path for a tech in the field.

function formatBytes(n?: number): string {
  if (n == null) return '—'
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function StorageHealthCard() {
  const { state, importState } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  // Deleting a preserved copy is destructive — the blob may be the only
  // copy of the records — so it carries the same supervisor gate as every
  // other destructive action (no crew set up = no boundary to enforce).
  const mayDelete =
    state.technicians.length === 0 ||
    canDeleteRecords(
      state.technicians.find((t) => t.id === state.activeTechnicianId)?.role,
    )
  const [estimate, setEstimate] = useState<StorageEstimate>({})
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [backups, setBackups] = useState<CorruptedBackup[]>(() =>
    listCorruptedBackups(),
  )

  const refresh = useCallback(() => {
    setBackups(listCorruptedBackups())
    void getStorageEstimate().then(setEstimate)
    void isStoragePersisted().then(setPersisted)
  }, [])
  useEffect(() => {
    void getStorageEstimate().then(setEstimate)
    void isStoragePersisted().then(setPersisted)
  }, [])

  function download(b: CorruptedBackup) {
    const raw = readCorruptedBackup(b.key)
    if (raw == null) {
      toast.show('Could not read that copy', 'error')
      refresh()
      return
    }
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refrigister-damaged-${b.savedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function tryRestore(b: CorruptedBackup) {
    const raw = readCorruptedBackup(b.key)
    if (raw == null) {
      toast.show('Could not read that copy', 'error')
      refresh()
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      toast.show(
        'That copy is damaged beyond automatic repair — download it and contact support.',
        'error',
        8000,
      )
      return
    }
    const ok = await confirm({
      title: 'Restore this saved copy?',
      message:
        'The copy parses cleanly, so it can be restored. It REPLACES what is currently in the app on this device (the preserved copy itself is kept until you delete it).',
      confirmLabel: 'Restore copy',
      danger: true,
    })
    if (!ok) return
    if (importState(normalizeState(parsed))) {
      toast.show('Saved copy restored', 'success')
    }
  }

  async function remove(b: CorruptedBackup) {
    const ok = await confirm({
      title: 'Delete this preserved copy?',
      message:
        "This permanently deletes the damaged copy. If you haven't downloaded it, whatever records it holds are gone for good.",
      confirmLabel: 'Delete copy',
      danger: true,
    })
    if (!ok) return
    deleteCorruptedBackup(b.key)
    refresh()
  }

  const usagePct =
    estimate.usageBytes != null &&
    estimate.quotaBytes != null &&
    estimate.quotaBytes > 0
      ? Math.min(100, Math.round((estimate.usageBytes / estimate.quotaBytes) * 100))
      : null

  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Storage health
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Your records live on this device. This shows how much space
        they're using, whether the browser has promised not to evict
        them, and any damaged saved copies preserved for recovery.
      </p>

      <div className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <span>Space used</span>
          <span className="tabular-nums text-slate-500">
            {formatBytes(estimate.usageBytes)}
            {estimate.quotaBytes != null &&
              ` of ${formatBytes(estimate.quotaBytes)}`}
            {usagePct != null && ` (${usagePct}%)`}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>Protected from eviction</span>
          {persisted ? (
            <span className="text-green-600 dark:text-green-400">Yes</span>
          ) : (
            <button
              type="button"
              className="min-h-11 font-medium text-brand-600 hover:underline"
              onClick={() =>
                void requestPersistentStorage().then((granted) => {
                  setPersisted(granted)
                  toast.show(
                    granted
                      ? 'Persistent storage granted'
                      : 'Not granted — installing the app to your home screen usually enables this',
                    granted ? 'success' : 'info',
                    7000,
                  )
                })
              }
            >
              {persisted == null ? '…' : 'No — request it'}
            </button>
          )}
        </div>
      </div>

      {backups.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Preserved damaged copies
          </div>
          {backups.map((b) => (
            <div
              key={b.key}
              className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20"
            >
              <div className="text-sm text-amber-900 dark:text-amber-100">
                Saved{' '}
                {formatDateTime(b.savedAt, state.location.timezone, state.clock)}{' '}
                · {formatBytes(b.sizeBytes)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => download(b)}>
                  Download
                </Button>
                <Button variant="secondary" onClick={() => void tryRestore(b)}>
                  Try restore
                </Button>
                {mayDelete && (
                  <Button variant="ghost" onClick={() => void remove(b)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
