import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Pill } from './ui'
import { useStore } from '../lib/store'
import { expiryStatus, hydroStatusFor, type ExpiryStatus } from '../lib/types'
import { profileFor } from '../lib/compliance'
import { formatPlainDate } from '../lib/datetime'
import {
  BACKUP_STALE_DAYS,
  backupStatus,
  downloadBackup,
  snoozeBackupReminder,
} from '../lib/backup'
import { isStoragePersisted, requestPersistentStorage } from '../lib/storage'
import { isAlertSnoozed, snoozeAlert } from '../lib/alertSnooze'
import { useToast } from '../lib/toast'

// Shared alert panel surfaced on both the Home and Log pages so a tech
// sees compliance warnings no matter which screen they land on. Covers
// AS 2030 cylinder hydrostatic test dates (overdue / due soon),
// ARC licence/authorisation expiry (RHL per tech, RTA for the
// business), and overdue full backups (records exist only in this
// browser until team accounts land). Renders nothing when there's
// nothing to warn about.
export function Alerts() {
  return (
    <>
      <LicenceAlerts />
      <HydroAlerts />
      <BackupAlert />
    </>
  )
}

// RTA permit conditions require records kept five years and producible
// on request — but until server-side accounts exist, those records
// live in one browser's storage. This card nags (gently, snoozable)
// when the newest full JSON backup is stale, and quietly asks the
// browser for persistent storage so the origin isn't evicted.
function BackupAlert() {
  const { state } = useStore()
  const toast = useToast()
  // Bumped after "Back up now" / "Later" so the card re-evaluates the
  // localStorage stamps it just wrote.
  const [refresh, setRefresh] = useState(0)
  const status = useMemo(
    () => backupStatus(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, refresh],
  )
  const [persisted, setPersisted] = useState(true)

  // Silently request persistent storage once real data exists.
  // Chrome/Edge auto-grant for installed/bookmarked PWAs, Firefox may
  // prompt, iOS Safari grants only once installed to Home Screen —
  // all harmless to ask. The answer drives the eviction note below.
  const hasData = state.transactions.length > 0
  useEffect(() => {
    if (!hasData) return
    let cancelled = false
    isStoragePersisted().then((p) => {
      if (cancelled) return
      if (p) {
        setPersisted(true)
        return
      }
      requestPersistentStorage().then((granted) => {
        if (!cancelled) setPersisted(granted)
      })
    })
    return () => {
      cancelled = true
    }
  }, [hasData])

  if (!status.due) return null

  return (
    <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {status.lastBackupAt ? 'Backup overdue' : 'No backup yet'}
        </div>
        <Link
          to="/settings"
          className="text-xs font-medium text-amber-900 hover:underline dark:text-amber-200"
        >
          Settings
        </Link>
      </div>
      <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
        {status.lastBackupAt
          ? `Last full backup was ${status.daysSinceBackup} days ago.`
          : 'This device has never saved a full backup.'}{' '}
        Refrigerant records must be kept and producible for the period
        required by applicable regulations, but right
        now they exist only in this browser
        {persisted
          ? '.'
          : ' — and the browser hasn’t guaranteed it won’t clear them under storage pressure.'}{' '}
        Save a copy somewhere safe (files, email, cloud drive).
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            void downloadBackup(state).then(() => {
              setRefresh((n) => n + 1)
              toast.show('Backup saved — keep the file somewhere safe', 'success')
            })
          }}
        >
          Back up now
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            snoozeBackupReminder()
            setRefresh((n) => n + 1)
          }}
        >
          Remind me in 7 days
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-amber-900/60 dark:text-amber-100/60">
        Reminder repeats every {BACKUP_STALE_DAYS} days after a backup.
      </p>
    </Card>
  )
}

function LicenceAlerts() {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)
  // Hidden for 24h once dismissed, then it re-alerts (see alertSnooze).
  const [snoozed, setSnoozed] = useState(() => isAlertSnoozed('licence'))

  const rows: { key: string; label: string; expiry: string; ex: ExpiryStatus }[] = []
  for (const t of state.technicians) {
    if (!t.licenceExpiry) continue
    const ex = expiryStatus(t.licenceExpiry)
    if (ex.level === 'expired' || ex.level === 'due_soon') {
      rows.push({
        key: `tech:${t.id}`,
        label: `${t.name}${t.arcLicenceNumber ? ` · ${profile.techLicenceShort} ${t.arcLicenceNumber}` : ''}`,
        expiry: t.licenceExpiry,
        ex,
      })
    }
  }
  if (profile.hasBusinessAuthorisation && state.arcAuthorisationExpiry) {
    const ex = expiryStatus(state.arcAuthorisationExpiry)
    if (ex.level === 'expired' || ex.level === 'due_soon') {
      rows.push({
        key: 'rta',
        label: `Business ${profile.businessAuthShort}${state.arcAuthorisationNumber ? ` ${state.arcAuthorisationNumber}` : ''}`,
        expiry: state.arcAuthorisationExpiry,
        ex,
      })
    }
  }
  // Most urgent first (already expired, then soonest to lapse).
  rows.sort((a, b) => (a.ex.daysLeft ?? 0) - (b.ex.daysLeft ?? 0))

  if (rows.length === 0 || snoozed) return null

  // Deep-link to the "Business & people" section in Settings (which holds
  // both technician profiles and the compliance/RTA card) and force it open.
  const scrollTo = 'business'

  return (
    <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Licence / authorisation expiry
        </div>
        <Link
          to="/settings"
          state={{ scrollTo }}
          className="text-xs font-medium text-amber-900 hover:underline dark:text-amber-200"
        >
          Settings
        </Link>
      </div>
      <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
        Work logged against a lapsed licence or authorisation is a
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
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            snoozeAlert('licence')
            setSnoozed(true)
          }}
        >
          Hide
        </Button>
        <span className="text-[11px] text-amber-900/60 dark:text-amber-100/60">
          Reappears in 24 hours.
        </span>
      </div>
    </Card>
  )
}

function HydroAlerts() {
  const { state } = useStore()
  const { bottles } = state
  // Hidden for 24h once dismissed, then it re-alerts (see alertSnooze).
  const [snoozed, setSnoozed] = useState(() => isAlertSnoozed('hydro'))

  const hydroAlerts = bottles
    .map((b) => ({ b, h: hydroStatusFor(b) }))
    .filter((x) => x.h.status === 'overdue' || x.h.status === 'due_soon')
    .sort((a, b) => (a.h.monthsUntilDue ?? 0) - (b.h.monthsUntilDue ?? 0))

  if (hydroAlerts.length === 0 || snoozed) return null

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
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          onClick={() => {
            snoozeAlert('hydro')
            setSnoozed(true)
          }}
        >
          Hide
        </Button>
        <span className="text-[11px] text-red-900/60 dark:text-red-100/60">
          Reappears in 24 hours.
        </span>
      </div>
    </Card>
  )
}

function pluralMonths(n: number): string {
  return `${n} ${n === 1 ? 'month' : 'months'}`
}
