import { useEffect, type ReactNode } from 'react'
import { Button, Card } from './ui'
import { useStore } from '../lib/store'
import { formatDateTime } from '../lib/datetime'
import { RetentionNotice } from './RetentionNotice'
import type { AccountClosure } from '../lib/types'

// How long the closed-account screen stays up before the device is wiped
// back to the welcome screen. The business already has its records (a ZIP
// is downloaded at closure), so there's nothing to lose by returning to a
// clean slate once they've read the closure notice.
const CLOSURE_RESET_MS = 3 * 60 * 1000

// When this module was (re)loaded. A closure requested BEFORE this moment
// means the page was reloaded after closing — the notice was already shown
// once, so a refresh goes straight back to the welcome screen instead of
// re-showing it for the rest of the countdown.
const PAGE_LOADED_AT = Date.now()

// Once account closure has been requested, the app shows the closed screen
// instead of the normal UI. There is deliberately no in-app way to reopen —
// that takes a request we formally review (or restoring a pre-closure
// backup / clearing app data).
export function AccountClosedGate({ children }: { children: ReactNode }) {
  const { state } = useStore()
  if (state.accountClosure) {
    return <AccountClosedScreen closure={state.accountClosure} />
  }
  return <>{children}</>
}

function AccountClosedScreen({ closure }: { closure: AccountClosure }) {
  const { state, resetToFreshInstall } = useStore()
  const stamp = formatDateTime(
    closure.requestedAt,
    state.location.timezone,
    state.clock,
    true,
  )

  // The device returns to the welcome screen on a page refresh OR after
  // CLOSURE_RESET_MS — whichever comes first. A closure stamped before this
  // page load means we're on a reload (or the next open), so reset straight
  // away; otherwise run the countdown from when closure was requested.
  useEffect(() => {
    const requestedAt = new Date(closure.requestedAt).getTime()
    if (requestedAt < PAGE_LOADED_AT) {
      resetToFreshInstall()
      return
    }
    const remaining = Math.max(0, CLOSURE_RESET_MS - (Date.now() - requestedAt))
    const handle = setTimeout(resetToFreshInstall, remaining)
    return () => clearTimeout(handle)
  }, [closure.requestedAt, resetToFreshInstall])

  const requestText = [
    'ACCOUNT CLOSURE REQUEST',
    '',
    `Requested: ${stamp}`,
    `Business: ${closure.businessName || '—'}`,
    closure.businessAbn ? `ABN: ${closure.businessAbn}` : '',
    closure.arcAuthorisationNumber ? `RTA: ${closure.arcAuthorisationNumber}` : '',
    `Contact: ${closure.contactName}`,
    closure.contactEmail ? `Email: ${closure.contactEmail}` : '',
    closure.contactPhone ? `Phone: ${closure.contactPhone}` : '',
    `Reason: ${closure.reason}`,
    closure.details ? `Details: ${closure.details}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  function emailRequest() {
    window.location.href = `mailto:?subject=${encodeURIComponent(
      `Account closure — ${closure.businessName || 'RefrigHandle'}`,
    )}&body=${encodeURIComponent(requestText)}`
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Refrigerant Handling
          </h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-red-600 dark:text-red-400">
            Account closed
          </p>
        </div>

        <Card>
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Your account was closed on <strong>{stamp}</strong>.
          </p>
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
            To use RefrigHandle again, set the app up fresh — and restore the
            backup that downloaded at closure to bring your records back.
          </p>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            This device returns to the start screen in a few minutes (or as
            soon as the page is reloaded) — email or print your closure record
            below before it does.
          </p>
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
            <p className="font-semibold">Records retention</p>
            <RetentionNotice />
          </div>
        </Card>

        <Card>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Closure record
          </div>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            A copy of your closure details, for your own records. Email or
            print it to keep.
          </p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {requestText}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={emailRequest}>Email a copy</Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
