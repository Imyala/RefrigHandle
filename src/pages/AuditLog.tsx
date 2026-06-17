import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, Field, Pill, TextInput } from '../components/ui'
import { DateInput } from '../components/DateInput'
import { useStore } from '../lib/store'
import { formatDateTime, localDateTimeInput } from '../lib/datetime'
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONE,
  AUDIT_ENTITY_LABELS,
} from '../lib/audit'
import type { AuditEntity } from '../lib/types'
import { profileFor } from '../lib/compliance'

// The entity filter bar — mirrors the kind filter on the activity log.
// 'all' first, then the records people most often want to audit. The
// rarer buckets (refrigerant / preset / data) fall under "Other".
const ENTITY_FILTERS: readonly (AuditEntity | 'all' | 'other')[] = [
  'all',
  'bottle',
  'site',
  'unit',
  'transaction',
  'technician',
  'settings',
  'other',
]

const OTHER_ENTITIES: ReadonlySet<AuditEntity> = new Set<AuditEntity>([
  'refrigerant',
  'preset',
  'data',
])

function filterLabel(f: (typeof ENTITY_FILTERS)[number]): string {
  if (f === 'all') return 'All'
  if (f === 'other') return 'Other'
  return AUDIT_ENTITY_LABELS[f]
}

export default function AuditLog() {
  const { state } = useStore()
  const { auditLog } = state
  const tz = state.location.timezone
  const licShort = profileFor(state.jurisdiction).techLicenceShort

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<(typeof ENTITY_FILTERS)[number]>('all')
  // Date-range filter (ISO YYYY-MM-DD, inclusive). Behind a toggle so it
  // stays out of the way until needed — handy for scoping a years-long
  // history down to a specific month/year for an audit.
  const [showDateRange, setShowDateRange] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    // auditLog is already newest-first (the store prepends).
    return auditLog
      .filter((e) => {
        if (filter === 'all') return true
        if (filter === 'other') return OTHER_ENTITIES.has(e.entity)
        return e.entity === filter
      })
      .filter((e) => {
        if (!fromDate && !toDate) return true
        const day = localDateTimeInput(new Date(e.at), tz).slice(0, 10)
        if (fromDate && day < fromDate) return false
        if (toDate && day > toDate) return false
        return true
      })
      .filter((e) => {
        if (!q) return true
        // Search spans the affected record, the summary, who made the
        // change, and the field-level before/after text.
        return [
          e.target,
          e.summary,
          e.by,
          e.byLicence,
          AUDIT_ACTION_LABELS[e.action],
          AUDIT_ENTITY_LABELS[e.entity],
          ...(e.changes?.flatMap((c) => [c.field, c.from, c.to]) ?? []),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      })
  }, [auditLog, filter, query, fromDate, toDate, tz])

  // Render a window, not the whole history — a busy crew accumulates
  // tens of thousands of entries over the 5-year retention period and
  // mounting a Card per entry locks the page up. "Show older" grows
  // the window; changing any filter snaps it back to the first page.
  const PAGE = 100
  const [limit, setLimit] = useState(PAGE)
  const filterKey = `${filter}|${query}|${fromDate}|${toDate}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setLimit(PAGE)
  }
  const visible = rows.length > limit ? rows.slice(0, limit) : rows

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Change log
        </h2>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          A time-stamped record of every change — what changed, who changed it,
          and when. Covers bottles, sites, equipment, technicians and settings;
          refrigerant movements are on the Refrigerant log. Read-only.
        </p>
      </div>

      {auditLog.length > 0 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search changes by record, technician, or detail"
        />
      )}

      {auditLog.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {filterLabel(f)}
            </button>
          ))}
        </div>
      )}

      {auditLog.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDateRange((v) => !v)}
            className="text-sm font-medium text-brand-600 hover:underline"
            aria-expanded={showDateRange}
          >
            {showDateRange ? 'Hide date range' : 'Filter by date range'}
            {!showDateRange && (fromDate || toDate) ? ' ·' : ''}
          </button>
          {showDateRange && (
            <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Field label="From" className="flex-1">
                  <DateInput
                    value={fromDate}
                    onChange={setFromDate}
                    max={toDate || undefined}
                    ariaLabel="Filter from date"
                  />
                </Field>
                <Field label="To" className="flex-1">
                  <DateInput
                    value={toDate}
                    onChange={setToDate}
                    min={fromDate || undefined}
                    ariaLabel="Filter to date"
                  />
                </Field>
              </div>
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    setFromDate('')
                    setToDate('')
                  }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                >
                  Clear date range
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {auditLog.length === 0 ? (
        <EmptyState
          title="No changes recorded yet"
          body="From now on, every non-refrigerant action — adding or editing bottles, sites, units, technicians and settings — is logged here automatically."
        />
      ) : rows.length === 0 ? (
        <EmptyState title="No matches for this filter" />
      ) : (
        <div className="space-y-2">
          {visible.map((e) => (
            <Card key={e.id} className="!p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={AUDIT_ACTION_TONE[e.action]}>
                  {AUDIT_ACTION_LABELS[e.action]}
                </Pill>
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {AUDIT_ENTITY_LABELS[e.entity]}
                </span>
                <span className="min-w-0 truncate font-semibold text-slate-900 dark:text-slate-100">
                  {e.target}
                </span>
              </div>

              <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                {e.summary}
              </div>

              {e.changes && e.changes.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {e.changes.map((c, i) => (
                    <li
                      key={`${c.field}-${i}`}
                      className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
                    >
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {c.field}:
                      </span>
                      <span className="line-through decoration-slate-400/60">
                        {c.from}
                      </span>
                      <span aria-hidden className="text-slate-400">
                        →
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {c.to}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-1 text-xs text-slate-500">
                {formatDateTime(e.at, tz, state.clock)}
                {e.by && (
                  <>
                    {' · '}
                    {e.by}
                    {e.byLicence ? ` · ${licShort} ${e.byLicence}` : ''}
                  </>
                )}
              </div>
            </Card>
          ))}
          {rows.length > limit && (
            <Button
              variant="secondary"
              full
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Show older ({rows.length - limit} more)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
