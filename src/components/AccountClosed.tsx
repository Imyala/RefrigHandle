import { useEffect, type ReactNode } from 'react'
import { Button, Card } from './ui'
import { useStore } from '../lib/store'
import { formatDateTime } from '../lib/datetime'
import { RetentionNotice } from './RetentionNotice'
import type { AccountClosure } from '../lib/types'

// How long the closed-account screen stays up before the device is wiped
// back to the account-creation screen. The business already has its
// records (a ZIP is downloaded at closure), so there's nothing to lose
// by returning to a clean slate once they've read the closure notice.
const CLOSURE_RESET_MS = 5 * 60 * 1000

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

  // Once the account has been closed for CLOSURE_RESET_MS, wipe the device
  // back to the account-creation screen. The countdown runs from when
  // closure was requested, so a reload partway through still fires on
  // time (a stale closure just resets immediately on next open).
  useEffect(() => {
    const elapsed = Date.now() - new Date(closure.requestedAt).getTime()
    const remaining = Math.max(0, CLOSURE_RESET_MS - elapsed)
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
            If you require your account to be reopened,{' '}
            <strong>submit a request</strong> — we'll formally review it before
            the account is reopened.
          </p>
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
            <p className="font-semibold">Records retention</p>
            <RetentionNotice />
          </div>
        </Card>

        <Card>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Your request
          </div>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {requestText}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={emailRequest}>Email request</Button>
            <Button variant="secondary" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
