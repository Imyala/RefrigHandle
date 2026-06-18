import { useState } from 'react'
import { Button, Modal } from './ui'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { dayShareText, transactionShareText } from '../lib/share'
import type { Transaction } from '../lib/types'

// Opens a sheet that lets a tech send a logged transaction straight into a
// job card or email — Share (device share sheet), Copy, or Email — with the
// formatted text shown so they can check or hand-edit it first.
export function ShareTxButton({
  t,
  label = 'Share',
  className,
}: {
  t: Transaction
  label?: string
  className?: string
}) {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  // Only build the text while the sheet is open — keeps a long log cheap.
  const text = open ? transactionShareText(t, state) : null

  const triggerCls =
    className ??
    'rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerCls}
        aria-label="Share this record"
      >
        {label}
      </button>
      {text && (
        <ShareModal
          open={open}
          onClose={() => setOpen(false)}
          subject={text.subject}
          body={text.body}
        />
      )}
    </>
  )
}

// Imperatively-opened share sheet for a single transaction — used by the
// "Save & share" buttons, which need to pop the sheet right after a save.
export function ShareTxModal({
  t,
  onClose,
}: {
  t: Transaction
  onClose: () => void
}) {
  const { state } = useStore()
  const { subject, body } = transactionShareText(t, state)
  return <ShareModal open onClose={onClose} subject={subject} body={body} />
}

// Bundles every job logged today into one shareable document. Toasts when
// there's nothing logged yet rather than opening an empty sheet.
export function ShareDayButton({
  label = "Share today's jobs",
  className,
}: {
  label?: string
  className?: string
}) {
  const { state } = useStore()
  const toast = useToast()
  const [text, setText] = useState<{ subject: string; body: string } | null>(
    null,
  )

  function openSheet() {
    const built = dayShareText(state.transactions, state)
    if (!built) {
      toast.show('No jobs logged today yet.')
      return
    }
    setText(built)
  }

  return (
    <>
      <button type="button" onClick={openSheet} className={className}>
        {label}
      </button>
      {text && (
        <ShareModal
          open
          onClose={() => setText(null)}
          subject={text.subject}
          body={text.body}
        />
      )}
    </>
  )
}

function ShareModal({
  open,
  onClose,
  subject,
  body,
}: {
  open: boolean
  onClose: () => void
  subject: string
  body: string
}) {
  const toast = useToast()
  const canShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function doShare() {
    try {
      await navigator.share({ title: subject, text: body })
    } catch {
      // User dismissed the share sheet, or it's unavailable — no-op.
    }
  }

  async function doCopy() {
    try {
      await navigator.clipboard.writeText(body)
      toast.show('Copied to clipboard', 'success')
    } catch {
      toast.show('Could not copy — select the text and copy manually.', 'error')
    }
  }

  function doEmail() {
    const url = `mailto:?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`
    window.location.href = url
  }

  return (
    <Modal open={open} onClose={onClose} title="Share record">
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Ready to drop into a job card or email — copy it, email it, or use
          your device's share sheet. Edit it first if you like.
        </p>
        <textarea
          readOnly
          value={body}
          onFocus={(e) => e.currentTarget.select()}
          className="h-72 w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          aria-label="Record text"
        />
        <div className="flex flex-wrap gap-2">
          {canShare && <Button onClick={doShare}>Share…</Button>}
          <Button variant={canShare ? 'secondary' : 'primary'} onClick={doCopy}>
            Copy
          </Button>
          <Button variant="secondary" onClick={doEmail}>
            Email
          </Button>
        </div>
      </div>
    </Modal>
  )
}
