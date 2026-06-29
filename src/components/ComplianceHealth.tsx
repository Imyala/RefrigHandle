import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill } from './ui'
import { useStore } from '../lib/store'
import {
  expiryStatus,
  hydroStatusFor,
  isTechnicianActive,
  leakStatusFor,
} from '../lib/types'
import { profileFor } from '../lib/compliance'
import { backupStatus } from '../lib/backup'
import { formatPlainDate } from '../lib/datetime'
import { isStoragePersisted, requestPersistentStorage } from '../lib/storage'

// At-a-glance compliance overview for the whole business. Rolls the
// things that actually get an operator in trouble — technician licences
// (RHL), the business authorisation (RTA), cylinder periodic testing
// (AS 2030), equipment leak rate (AIRAH DA19), and whether the records
// are backed up — into a single traffic-light card. Every compliance
// signal the app tracks surfaces here; anything red/amber deep-links to
// the fix. The detailed, actionable + snoozable alerts still
// live in <Alerts/> below; this is the "are we OK?" summary a supervisor
// can read in one glance and the headline demo of the app's value.

type Level = 'ok' | 'attention' | 'action'

const RANK: Record<Level, number> = { ok: 0, attention: 1, action: 2 }
function worst(levels: Level[]): Level {
  return levels.reduce<Level>((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok')
}

interface Row {
  id: string
  label: string
  level: Level
  summary: string
  to: string
  state?: Record<string, unknown>
}

const ROW_PILL: Record<Level, { tone: 'green' | 'amber' | 'red'; text: string }> = {
  ok: { tone: 'green', text: 'OK' },
  attention: { tone: 'amber', text: 'Due soon' },
  action: { tone: 'red', text: 'Action' },
}

const OVERALL: Record<
  Level,
  { label: string; card: string; title: string; tone: 'green' | 'amber' | 'red' }
> = {
  ok: {
    label: 'All compliant',
    tone: 'green',
    title: 'text-emerald-900 dark:text-emerald-200',
    card: '!border-emerald-300 !bg-emerald-50 dark:!border-emerald-900/50 dark:!bg-emerald-900/20',
  },
  attention: {
    label: 'Attention needed',
    tone: 'amber',
    title: 'text-amber-900 dark:text-amber-200',
    card: '!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20',
  },
  action: {
    label: 'Action needed',
    tone: 'red',
    title: 'text-red-900 dark:text-red-200',
    card: '!border-red-300 !bg-red-50 dark:!border-red-900/50 dark:!bg-red-900/20',
  },
}

function joinParts(parts: (string | false | 0)[]): string {
  return parts.filter(Boolean).join(' · ')
}

export function ComplianceHealth() {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)

  // Once real records exist, quietly ask the browser to keep storage so the
  // origin isn't evicted under pressure (harmless to ask; auto-granted for
  // installed PWAs). This used to ride on the home-screen backup alert —
  // kept here now that this card is the home compliance surface.
  const hasData = state.transactions.length > 0
  useEffect(() => {
    if (!hasData) return
    let cancelled = false
    void isStoragePersisted().then((persisted) => {
      if (cancelled || persisted) return
      void requestPersistentStorage()
    })
    return () => {
      cancelled = true
    }
  }, [hasData])

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = []

    // 1. Technician licences (RHL) — active technicians only.
    const actives = state.technicians.filter(isTechnicianActive)
    let licExpired = 0
    let licDueSoon = 0
    let licMissing = 0
    for (const t of actives) {
      if (!t.licenceExpiry) {
        licMissing += 1
        continue
      }
      const ex = expiryStatus(t.licenceExpiry)
      if (ex.level === 'expired') licExpired += 1
      else if (ex.level === 'due_soon') licDueSoon += 1
    }
    const licLevel: Level = licExpired
      ? 'action'
      : licDueSoon || licMissing
        ? 'attention'
        : 'ok'
    out.push({
      id: 'licences',
      label: `Technician ${profile.techLicenceShort}`,
      level: licLevel,
      summary:
        actives.length === 0
          ? 'No active technicians'
          : licExpired || licDueSoon || licMissing
            ? joinParts([
                licExpired && `${licExpired} expired`,
                licDueSoon && `${licDueSoon} due soon`,
                licMissing && `${licMissing} missing a date`,
              ])
            : `All ${actives.length} current`,
      to: '/settings',
      state: { scrollTo: 'business' },
    })

    // 2. Business authorisation (RTA) — only where the scheme has one.
    if (profile.hasBusinessAuthorisation) {
      let rtaLevel: Level = 'ok'
      let rtaSummary: string
      if (!state.arcAuthorisationExpiry) {
        rtaLevel = 'attention'
        rtaSummary = 'No expiry recorded'
      } else {
        const ex = expiryStatus(state.arcAuthorisationExpiry)
        if (ex.level === 'expired') {
          rtaLevel = 'action'
          rtaSummary = `Expired ${formatPlainDate(state.arcAuthorisationExpiry)}`
        } else if (ex.level === 'due_soon') {
          rtaLevel = 'attention'
          rtaSummary =
            ex.daysLeft === 0
              ? 'Expires today'
              : `Expires in ${ex.daysLeft} day${ex.daysLeft === 1 ? '' : 's'}`
        } else {
          rtaSummary = `Current${ex.daysLeft != null ? ` · ${ex.daysLeft} days left` : ''}`
        }
      }
      out.push({
        id: 'rta',
        label: `Business ${profile.businessAuthShort}`,
        level: rtaLevel,
        summary: rtaSummary,
        to: '/settings',
        state: { scrollTo: 'business' },
      })
    }

    // 3. Cylinder periodic testing (AS 2030) — cylinders still in service
    // (a returned cylinder has left our possession).
    const inService = state.bottles.filter((b) => b.status !== 'returned')
    let cOver = 0
    let cDue = 0
    let cUnknown = 0
    for (const b of inService) {
      const h = hydroStatusFor(b)
      if (h.status === 'overdue') cOver += 1
      else if (h.status === 'due_soon') cDue += 1
      else if (h.status === 'unknown') cUnknown += 1
    }
    const cylLevel: Level = cOver ? 'action' : cDue ? 'attention' : 'ok'
    out.push({
      id: 'cylinders',
      label: 'Cylinder testing (AS 2030)',
      level: cylLevel,
      summary:
        inService.length === 0
          ? 'No cylinders in service'
          : cOver || cDue
            ? joinParts([
                cOver && `${cOver} overdue`,
                cDue && `${cDue} due soon`,
                cUnknown && `${cUnknown} no date`,
              ])
            : cUnknown === inService.length
              ? 'No test dates recorded'
              : joinParts([
                  `All ${inService.length - cUnknown} in date`,
                  cUnknown && `${cUnknown} no date`,
                ]),
      to: '/bottles',
    })

    // 4. Equipment leak rate (AIRAH DA19) — active units topped up above
    // the leak-rate threshold over the trailing 12 months. A suspected
    // leak is a reportable refrigerant-loss concern, so it belongs on the
    // compliance summary, not just the separate leak-watch card.
    const activeUnits = state.units.filter((u) => u.status === 'active')
    let leakSuspected = 0
    let leakWatch = 0
    for (const u of activeUnits) {
      const lk = leakStatusFor(u, state.transactions)
      if (lk.level === 'suspected') leakSuspected += 1
      else if (lk.level === 'watch') leakWatch += 1
    }
    const leakLevel: Level = leakSuspected
      ? 'action'
      : leakWatch
        ? 'attention'
        : 'ok'
    out.push({
      id: 'leaks',
      label: 'Equipment leak rate (DA19)',
      level: leakLevel,
      summary:
        activeUnits.length === 0
          ? 'No equipment in service'
          : leakSuspected || leakWatch
            ? joinParts([
                leakSuspected &&
                  `${leakSuspected} suspected leak${leakSuspected === 1 ? '' : 's'}`,
                leakWatch && `${leakWatch} to watch`,
              ])
            : `All ${activeUnits.length} within range`,
      to: '/sites',
    })

    // 5. Records backup.
    const bs = backupStatus(state)
    let bkLevel: Level = 'ok'
    let bkSummary: string
    if (state.sync.enabled) {
      bkSummary = 'Syncing to your backend'
    } else if (bs.due) {
      bkLevel = 'attention'
      bkSummary = bs.lastBackupAt
        ? `Overdue · ${bs.daysSinceBackup} days since last`
        : 'No backup saved yet'
    } else {
      bkSummary = bs.lastBackupAt
        ? `Backed up ${bs.daysSinceBackup === 0 ? 'today' : `${bs.daysSinceBackup} days ago`}`
        : 'No records to back up yet'
    }
    out.push({
      id: 'backup',
      label: 'Records backup',
      level: bkLevel,
      summary: bkSummary,
      to: '/settings',
    })

    return out
  }, [state, profile])

  const overall = worst(rows.map((r) => r.level))
  const o = OVERALL[overall]

  return (
    <Card className={o.card}>
      <div className="flex items-center justify-between gap-2">
        <div className={`text-sm font-semibold ${o.title}`}>
          Compliance health
        </div>
        <Pill tone={o.tone}>{o.label}</Pill>
      </div>
      <ul className="mt-2 divide-y divide-black/5 dark:divide-white/5">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              to={r.to}
              state={r.state}
              className="-mx-1 flex items-center justify-between gap-3 rounded-lg px-1 py-2 transition hover:bg-black/5 dark:hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  {r.label}
                </div>
                <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {r.summary}
                </div>
              </div>
              <Pill tone={ROW_PILL[r.level].tone}>{ROW_PILL[r.level].text}</Pill>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
