import { useMemo, useState } from 'react'
import { Button, Card, EmptyState, Field, Pill, TextInput } from '../components/ui'
import { DateInput } from '../components/DateInput'
import { useStore } from '../lib/store'
import { formatStampedTime, localDateTimeInput } from '../lib/datetime'
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTION_TONE,
  AUDIT_ENTITY_LABELS,
} from '../lib/audit'
import { canDeleteRecords } from '../lib/types'
import type { AuditEntity, RecycleBinEntry, Transaction } from '../lib/types'
import { profileFor } from '../lib/compliance'
import { TransactionDetails } from '../components/TransactionDetails'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'

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
  const { state, restoreTransaction, restoreFromRecycleBin } = useStore()
  const { auditLog } = state
  const tz = state.location.timezone
  const licShort = profileFor(state.jurisdiction).techLicenceShort
  const toast = useToast()
  const confirm = useConfirm()
  // Restoring a soft-deleted row reverses a deletion, so it carries the
  // same gate as deleting — supervisor and above.
  const mayRestore = canDeleteRecords(
    state.technicians.find((x) => x.id === state.activeTechnicianId)?.role,
  )

  // Restore a soft-deleted transaction straight from its change-log
  // entry, after a confirm so an accidental tap can't quietly resurrect
  // a removed row.
  async function handleRestore(t: Transaction) {
    const ok = await confirm({
      title: 'Restore this transaction?',
      message:
        'It returns to Refrigerant movements and is counted again in bottle and equipment totals. The original deletion stays on this change log.',
      confirmLabel: 'Restore',
    })
    if (!ok) return
    restoreTransaction(t.id)
    toast.show('Transaction restored', 'success')
  }

  // Recover a deleted record (bottle / site / unit / technician / preset /
  // refrigerant) from the recycle bin. Same supervisor gate as a restore.
  async function handleRestoreBin(entry: RecycleBinEntry) {
    const ok = await confirm({
      title: `Restore ${entry.label}?`,
      message:
        'It returns to the app and to every list and report it appears in. The original deletion stays on this change log.',
      confirmLabel: 'Restore',
    })
    if (!ok) return
    restoreFromRecycleBin(entry.id)
    toast.show(`${entry.label} restored`, 'success')
  }

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
          refrigerant movements live on the Movements tab. Read-only.
        </p>
      </div>

      {state.recycleBin.length > 0 && (
        <Card className="!p-3 border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-center gap-2">
            <span aria-hidden>♻️</span>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Recently deleted ({state.recycleBin.length})
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            Deleted bottles, sites, equipment, technicians and presets are kept
            here and can be restored — nothing is permanently removed.
          </p>
          <ul className="mt-2 space-y-1.5">
            {state.recycleBin.slice(0, 50).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/70 p-2 dark:bg-slate-900/30"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {entry.label}
                  </div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    Deleted {formatStampedTime(entry.deletedAt, undefined, tz, state.clock)}
                    {entry.deletedBy ? ` · ${entry.deletedBy}` : ''}
                    {entry.deletedReason ? ` · ${entry.deletedReason}` : ''}
                  </div>
                </div>
                {mayRestore ? (
                  <button
                    onClick={() => handleRestoreBin(entry)}
                    className="min-h-11 shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                    aria-label={`Restore ${entry.label}`}
                  >
                    ↩ Restore
                  </button>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">
                    Supervisor only
                  </span>
                )}
              </li>
            ))}
          </ul>
          {state.recycleBin.length > 50 && (
            <p className="mt-1.5 text-xs text-slate-500">
              Showing the 50 most recent of {state.recycleBin.length}.
            </p>
          )}
        </Card>
      )}

      {auditLog.length > 0 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search changes by record, technician, or detail"
        />
      )}

      {auditLog.length > 0 && (
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {ENTITY_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`min-h-11 shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
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
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand-600 hover:underline"
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
          {visible.map((e) => {
            // For a transaction change (a deletion, or a later restore),
            // pull the underlying row — still in storage when soft-deleted
            // — so the entry can show the full job details, not just a
            // one-line summary, and offer to restore it if it's deleted.
            const tx =
              e.entity === 'transaction' && e.entityId
                ? state.transactions.find((t) => t.id === e.entityId)
                : undefined
            return (
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

              {/* Full detail of the affected transaction, mirroring the
                  Refrigerant log so an owner can see exactly what the
                  removed (or restored) entry was — and put it back. */}
              {tx && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      Entry details
                    </span>
                    {tx.deletedAt && mayRestore && (
                      <button
                        onClick={() => handleRestore(tx)}
                        className="min-h-11 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                        aria-label="Restore this transaction"
                      >
                        ↩ Restore
                      </button>
                    )}
                  </div>
                  <TransactionDetails t={tx} />
                </div>
              )}

              <div className="mt-1 text-xs text-slate-500">
                {formatStampedTime(e.at, e.tz, tz, state.clock)}
                {e.by && (
                  <>
                    {' · '}
                    {e.by}
                    {e.byLicence ? ` · ${licShort} ${e.byLicence}` : ''}
                  </>
                )}
              </div>
            </Card>
            )
          })}
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
