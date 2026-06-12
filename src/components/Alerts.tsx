import { Link } from 'react-router-dom'
import { Card, Pill } from './ui'
import { useStore } from '../lib/store'
import { expiryStatus, hydroStatusFor, type ExpiryStatus } from '../lib/types'
import { formatPlainDate } from '../lib/datetime'

// Shared alert panel surfaced on both the Home and Log pages so a tech
// sees compliance warnings no matter which screen they land on. Covers
// AS 2030 cylinder hydrostatic test dates (overdue / due soon) and
// ARC licence/authorisation expiry (RHL per tech, RTA for the
// business). Renders nothing when there's nothing to warn about.
export function Alerts() {
  return (
    <>
      <LicenceAlerts />
      <HydroAlerts />
    </>
  )
}

function LicenceAlerts() {
  const { state } = useStore()

  const rows: { key: string; label: string; expiry: string; ex: ExpiryStatus }[] = []
  for (const t of state.technicians) {
    if (!t.licenceExpiry) continue
    const ex = expiryStatus(t.licenceExpiry)
    if (ex.level === 'expired' || ex.level === 'due_soon') {
      rows.push({
        key: `tech:${t.id}`,
        label: `${t.name}${t.arcLicenceNumber ? ` · RHL ${t.arcLicenceNumber}` : ''}`,
        expiry: t.licenceExpiry,
        ex,
      })
    }
  }
  if (state.arcAuthorisationExpiry) {
    const ex = expiryStatus(state.arcAuthorisationExpiry)
    if (ex.level === 'expired' || ex.level === 'due_soon') {
      rows.push({
        key: 'rta',
        label: `Business RTA${state.arcAuthorisationNumber ? ` ${state.arcAuthorisationNumber}` : ''}`,
        expiry: state.arcAuthorisationExpiry,
        ex,
      })
    }
  }
  // Most urgent first (already expired, then soonest to lapse).
  rows.sort((a, b) => (a.ex.daysLeft ?? 0) - (b.ex.daysLeft ?? 0))

  if (rows.length === 0) return null

  return (
    <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Licence / authorisation expiry
        </div>
        <Link
          to="/settings"
          className="text-xs font-medium text-amber-900 hover:underline dark:text-amber-200"
        >
          Settings
        </Link>
      </div>
      <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
        Work logged against a lapsed ARC licence or authorisation is a
        compliance breach — renew before the date below.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((r) => (
          <li
            key={r.key}
            className="flex items-center justify-between gap-2 text-amber-900 dark:text-amber-100"
          >
            <span>
              <strong>{r.label}</strong>
            </span>
            {r.ex.level === 'expired' ? (
              <Pill tone="red">Expired {formatPlainDate(r.expiry)}</Pill>
            ) : (
              <Pill tone="amber">
                {r.ex.daysLeft === 0
                  ? 'Expires today'
                  : `Expires in ${r.ex.daysLeft} day${r.ex.daysLeft === 1 ? '' : 's'}`}
              </Pill>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function HydroAlerts() {
  const { state } = useStore()
  const { bottles } = state

  const hydroAlerts = bottles
    .map((b) => ({ b, h: hydroStatusFor(b) }))
    .filter((x) => x.h.status === 'overdue' || x.h.status === 'due_soon')
    .sort((a, b) => (a.h.monthsUntilDue ?? 0) - (b.h.monthsUntilDue ?? 0))

  if (hydroAlerts.length === 0) return null

  return (
    <Card className="!border-red-300 !bg-red-50 dark:!border-red-900/50 dark:!bg-red-900/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-red-900 dark:text-red-200">
          Cylinder hydrostatic test (AS 2030)
        </div>
        <Link
          to="/bottles"
          className="text-xs font-medium text-red-900 hover:underline dark:text-red-200"
        >
          View bottles
        </Link>
      </div>
      <p className="mt-1 text-xs text-red-900/80 dark:text-red-100/80">
        Don't take a non-compliant cylinder to a job — periodic test is
        mandatory under AS 2030.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {hydroAlerts.slice(0, 6).map(({ b, h }) => (
          <li key={b.id}>
            {/* Tap a row to jump straight to that cylinder — the Bottles
                page reads the focus id from navigation state and opens
                the bottle's action sheet. Works from both Home and Log
                since this panel is shared. */}
            <Link
              to="/bottles"
              state={{ focusBottle: b.id }}
              className="-mx-1 flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-red-900 transition hover:bg-red-100/70 dark:text-red-100 dark:hover:bg-red-900/30"
            >
              <span>
                <strong>{b.bottleNumber}</strong> · {b.refrigerantType}
              </span>
              {h.status === 'overdue' ? (
                <Pill tone="red">
                  Overdue {pluralMonths(Math.abs(h.monthsUntilDue ?? 0))}
                </Pill>
              ) : h.monthsUntilDue === 0 ? (
                <Pill tone="amber">Due this month</Pill>
              ) : (
                <Pill tone="amber">Due next month</Pill>
              )}
            </Link>
          </li>
        ))}
        {hydroAlerts.length > 6 && (
          <li className="text-xs text-red-900/70 dark:text-red-100/70">
            +{hydroAlerts.length - 6} more
          </li>
        )}
      </ul>
    </Card>
  )
}

function pluralMonths(n: number): string {
  return `${n} ${n === 1 ? 'month' : 'months'}`
}
