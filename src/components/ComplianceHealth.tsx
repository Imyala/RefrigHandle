import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Card, Pill } from './ui'
import { useStore } from '../lib/store'
import {
  complianceRows,
  worstLevel,
  type ComplianceLevel,
} from '../lib/reports'
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

// Compliance-row data (the five signals) is computed by complianceRows in
// lib/reports so the printable Audit Pack reuses the identical numbers.
// This component owns only the presentation of it.

const ROW_PILL: Record<ComplianceLevel, { tone: 'green' | 'amber' | 'red'; text: string }> = {
  ok: { tone: 'green', text: 'OK' },
  attention: { tone: 'amber', text: 'Due soon' },
  action: { tone: 'red', text: 'Action' },
}

const OVERALL: Record<
  ComplianceLevel,
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

  const rows = useMemo(() => complianceRows(state), [state])

  const overall = worstLevel(rows.map((r) => r.level))
  const o = OVERALL[overall]

  // At-a-glance counts so the header is scannable before the rows are read.
  const actionCount = rows.filter((r) => r.level === 'action').length
  const attentionCount = rows.filter((r) => r.level === 'attention').length
  const countLine =
    actionCount || attentionCount
      ? joinParts([
          actionCount && `${actionCount} need${actionCount === 1 ? 's' : ''} action`,
          attentionCount && `${attentionCount} due soon`,
        ])
      : `All ${rows.length} checks clear`

  return (
    <Card className={o.card}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${o.title}`}>
            Compliance health
          </div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {countLine}
          </div>
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
