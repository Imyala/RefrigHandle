import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  TextInput,
} from '../components/ui'
import { DateInput } from '../components/DateInput'
import { useStore } from '../lib/store'
import {
  type Transaction,
  type TransactionKind,
  canCorrectRecords,
  canDeleteRecords,
  roleInfo,
  transactionLabel,
} from '../lib/types'
import { useToast } from '../lib/toast'
import { localDateTimeInput } from '../lib/datetime'
import { ShareTxButton, ShareTxModal, SharePeriodButton } from '../components/ShareSheet'
import { Alerts } from '../components/Alerts'
import { PhotoSection } from '../components/Photos'
import { SignatureSection } from '../components/Signatures'
import { addPhoto, attachmentCounts } from '../lib/attachments'
import { TransactionDetails } from '../components/TransactionDetails'
import { LogForm } from '../components/LogForm'

export default function Transactions() {
  const { state, addTransaction, deleteTransaction } = useStore()
  const { bottles, sites, transactions } = state
  const toast = useToast()

  // Role gates for the active profile. Correcting a record is lead-tech and
  // above; deleting (soft-delete) is supervisor and above. These match the
  // capability blurbs shown on each role in Settings — without enforcement
  // here the UI would promise a boundary it doesn't keep.
  const activeRole = state.technicians.find(
    (x) => x.id === state.activeTechnicianId,
  )?.role
  const mayCorrect = canCorrectRecords(activeRole)
  const mayDelete = canDeleteRecords(activeRole)

  const [adding, setAdding] = useState(false)
  // Row whose photos / customer sign-off are being viewed or added.
  const [attachFor, setAttachFor] = useState<Transaction | null>(null)
  // transaction id → number of photos+signatures, for the row badge.
  // Loaded with a key-only cursor so it stays cheap; refreshed whenever
  // the attachments modal closes or staged form photos are bound.
  const [attachCounts, setAttachCounts] = useState<Map<string, number>>(
    () => new Map(),
  )
  const refreshAttachCounts = useCallback(() => {
    void attachmentCounts('transaction').then(setAttachCounts)
  }, [])
  useEffect(() => {
    refreshAttachCounts()
  }, [refreshAttachCounts])
  // The original entry currently being corrected (opens the log form in
  // correction mode), or null. Kept separate from `adding` so the form
  // can pre-fill + stamp the correction link.
  const [correcting, setCorrecting] = useState<Transaction | null>(null)
  // Set after a "Save & share" so the share sheet pops for the new record.
  const [shareTx, setShareTx] = useState<Transaction | null>(null)
  const [filterKind, setFilterKind] = useState<'all' | TransactionKind>('all')
  const [query, setQuery] = useState('')
  // Date-range filter (ISO YYYY-MM-DD, inclusive on both ends). Empty
  // strings mean "open ended" so you can search "everything since March"
  // or "everything up to a date" as well as a closed window. Kept behind
  // a toggle so the common case (just typing in the search box) stays
  // uncluttered. Useful once the log spans years — pick a year+month
  // range to pull a specific period for an audit.
  const [showDateRange, setShowDateRange] = useState(false)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  // Replace native prompt() with an in-app Modal so the delete flow
  // looks consistent with the rest of the UI. Tracks the transaction
  // being deleted + the typed reason; null means closed.
  const [deleting, setDeleting] = useState<{ id: string; reason: string } | null>(
    null,
  )

  const tz = state.location.timezone

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (
      [...transactions]
        // Soft-deleted rows are kept in storage for the audit trail
        // but hidden from the working activity log. Admins can review
        // the full entry and restore them from the Change log.
        .filter((t) => !t.deletedAt)
        .filter((t) => filterKind === 'all' || t.kind === filterKind)
        .filter((t) => {
          // Date-range gate: compare the transaction's *local* calendar
          // day (in the configured tz) against the inclusive from/to
          // bounds. Both bounds are optional so a one-sided range works.
          if (!fromDate && !toDate) return true
          const day = localDateTimeInput(new Date(t.date), tz).slice(0, 10)
          if (fromDate && day < fromDate) return false
          if (toDate && day > toDate) return false
          return true
        })
        .filter((t) => {
          if (!q) return true
          // Log search spans the bottle, equipment, where it happened,
          // who logged it (name + RHL licence) and the note — everything
          // a tech might remember a job by.
          const bottle = bottles.find((b) => b.id === t.bottleId)
          const site = sites.find((j) => j.id === t.siteId)
          const txUnit = t.unitId
            ? state.units.find((u) => u.id === t.unitId)
            : undefined
          return [
            bottle?.bottleNumber,
            txUnit?.name,
            t.unitName,
            t.equipment,
            site?.name,
            t.siteName,
            site?.address,
            t.technician,
            t.technicianLicence,
            t.businessName,
            t.notes,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        })
        .sort((a, b) => b.date.localeCompare(a.date))
    )
  }, [transactions, filterKind, query, fromDate, toDate, tz, bottles, sites, state.units])

  // Map each original entry's id → the (live) correction that supersedes
  // it, so the original can show a "superseded" badge and link.
  const correctionFor = useMemo(() => {
    const m = new Map<string, Transaction>()
    for (const t of transactions) {
      if (!t.correctsId || t.deletedAt) continue
      // If several live corrections point at the same original (possible
      // in legacy data), surface the most recently logged one.
      const prev = m.get(t.correctsId)
      if (!prev || (t.loggedAt ?? t.date) > (prev.loggedAt ?? prev.date)) {
        m.set(t.correctsId, t)
      }
    }
    return m
  }, [transactions])

  // Render a window, not the whole multi-year log — same pattern as the
  // Change log. "Show older" grows the window; any filter change snaps
  // back to the first page.
  const PAGE = 100
  const [limit, setLimit] = useState(PAGE)
  const filterKey = `${filterKind}|${query}|${fromDate}|${toDate}`
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey)
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey)
    setLimit(PAGE)
  }
  const visible = sorted.length > limit ? sorted.slice(0, limit) : sorted

  // When a filter/search is active, offer a "current results" share bundle
  // alongside the today/week/month options. The label describes the filter
  // so the shared document says what it covers.
  const hasFilter =
    filterKind !== 'all' || query.trim() !== '' || !!fromDate || !!toDate
  const filterLabel = (() => {
    const parts: string[] = []
    if (fromDate || toDate) parts.push(`${fromDate || 'start'} to ${toDate || 'now'}`)
    if (filterKind !== 'all') parts.push(transactionLabel(filterKind))
    if (query.trim()) parts.push(`“${query.trim()}”`)
    return parts.length ? `Filtered: ${parts.join(' · ')}` : 'Filtered results'
  })()

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Refrigerant log
        </h2>
        <div className="flex items-center gap-2">
          {transactions.some((t) => !t.deletedAt) && (
            <SharePeriodButton
              label="Share…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-900/20"
              filtered={
                hasFilter ? { transactions: sorted, label: filterLabel } : undefined
              }
            />
          )}
          <Button onClick={() => setAdding(true)} disabled={bottles.length === 0}>
            + Log
          </Button>
        </div>
      </div>

      {/* Disambiguate the two "logs" and give the audit trail a way in from
          here — it otherwise only lives in Settings. */}
      <p className="-mt-1 text-xs text-slate-500">
        Refrigerant movements — charges, recoveries, transfers, returns.
        Looking for who changed what?{' '}
        <Link
          to="/history"
          className="font-medium text-brand-600 hover:underline"
        >
          Change log (audit trail) →
        </Link>
      </p>

      <Alerts />

      {transactions.length > 0 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by bottle number, unit, address, technician, notes"
        />
      )}

      {transactions.length > 0 && (
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

      {transactions.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(() => {
            // Only offer filters for kinds that actually appear in the log,
            // so a new account isn't shown chips for things it has none of
            // (e.g. 'intake', which is created automatically on bottle
            // entry and can't be logged by hand).
            const present = new Set(transactions.map((t) => t.kind))
            const order: TransactionKind[] = [
              'intake',
              'charge',
              'recover',
              'transfer',
              'return',
              'adjust',
            ]
            return ['all', ...order.filter((k) => present.has(k))] as (
              | 'all'
              | TransactionKind
            )[]
          })().map(
            (k) => (
              <button
                key={k}
                onClick={() => setFilterKind(k)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium capitalize transition ${
                  filterKind === k
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {k === 'all' ? 'All' : transactionLabel(k)}
              </button>
            ),
          )}
        </div>
      )}

      {bottles.length === 0 ? (
        <EmptyState
          title="No bottles to log against"
          body="Add a bottle first, then come back to record charges, recoveries, transfers and returns."
          action={
            <Link to="/bottles">
              <Button>+ Add a bottle</Button>
            </Link>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          title={
            transactions.length === 0
              ? 'No transactions yet'
              : 'No matches for this filter'
          }
          body={
            transactions.length === 0
              ? 'Tip: tap a bottle on the Bottles tab for a faster way to log.'
              : undefined
          }
          action={
            transactions.length === 0 && (
              <Button onClick={() => setAdding(true)}>+ Log first transaction</Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {!mayCorrect && !mayDelete && (
            <p className="px-1 text-xs text-slate-500 dark:text-slate-400">
              You're signed in as {roleInfo(activeRole).label}. Correcting or
              deleting records is reserved for senior roles — log a new entry
              to record any change.
            </p>
          )}
          {visible.map((t) => {
            // Correction linkage: the entry this one corrects (if it's a
            // correction), and the live correction that supersedes this
            // one (if it's an original that was corrected).
            const corrects = t.correctsId
              ? transactions.find((x) => x.id === t.correctsId)
              : undefined
            const supersededBy = correctionFor.get(t.id)
            return (
              <Card key={t.id} className="!p-3">
                <div className="flex items-start justify-between gap-3">
                  <TransactionDetails
                    t={t}
                    corrects={corrects}
                    supersededBy={supersededBy}
                  />
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <ShareTxButton t={t} />
                    {(() => {
                      const n = attachCounts.get(t.id) ?? 0
                      return (
                        <button
                          onClick={() => setAttachFor(t)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                          aria-label="Photos and sign-off for this transaction"
                        >
                          📎 {n > 0 ? n : 'Attach'}
                        </button>
                      )
                    })()}
                    {/* Correct an entry only while no live correction points
                        at it (a corrected entry's fix is corrected instead —
                        that keeps the supersede chain unambiguous). Legacy
                        bottle adjustments can't be re-corrected; log a manual
                        adjustment if one was wrong. */}
                    {mayCorrect &&
                      !supersededBy &&
                      !(t.correctsId && t.kind === 'adjust') && (
                        <button
                          onClick={() => setCorrecting(t)}
                          className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                          aria-label="Log a correction for this transaction"
                        >
                          Correct
                        </button>
                      )}
                    {mayDelete && (
                      <button
                        onClick={() => setDeleting({ id: t.id, reason: '' })}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                        aria-label="Delete transaction"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
          {sorted.length > limit && (
            <Button
              variant="secondary"
              full
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Show older ({sorted.length - limit} more)
            </Button>
          )}
        </div>
      )}

      <LogForm
        open={adding || !!correcting}
        correcting={correcting}
        onClose={() => {
          setAdding(false)
          setCorrecting(null)
        }}
        onSave={(data, share) => {
          // Staged photos are NOT part of the transaction record — they
          // go to the attachment store, keyed to the new row's id.
          const { photos, ...txData } = data
          const result = addTransaction(txData)
          if (result) {
            if (photos && photos.length > 0) {
              const txId = result.id
              void Promise.all(
                photos.map((f) => addPhoto('transaction', txId, f)),
              )
                .then(() => refreshAttachCounts())
                .catch(() =>
                  toast.show('Logged, but a photo could not be saved', 'error'),
                )
            }
            setAdding(false)
            setCorrecting(null)
            toast.show(correcting ? 'Correction logged' : `${transactionLabel(data.kind)} logged`)
            if (share) setShareTx(result)
          }
        }}
      />

      {shareTx && (
        <ShareTxModal t={shareTx} onClose={() => setShareTx(null)} />
      )}

      {/* Photos + customer sign-off for a logged row. Counts refresh on
          close so the row badge stays current. */}
      <Modal
        open={!!attachFor}
        title="Photos & sign-off"
        onClose={() => {
          setAttachFor(null)
          refreshAttachCounts()
        }}
      >
        {attachFor && (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                Photos
              </div>
              <PhotoSection
                entityType="transaction"
                entityId={attachFor.id}
                hint="Invoice / docket, gauges, the job — stored on this device and included in the JSON backup."
              />
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                Customer sign-off
              </div>
              <SignatureSection entityType="transaction" entityId={attachFor.id} />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!deleting}
        title="Delete this transaction?"
        onClose={() => setDeleting(null)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          It will be hidden from the activity log but kept in storage so an
          admin can review the full entry or restore it from the{' '}
          <span className="font-medium">Change log</span>.
        </p>
        <Field label="Reason (optional)">
          <TextInput
            autoFocus
            value={deleting?.reason ?? ''}
            onChange={(e) =>
              setDeleting((d) => (d ? { ...d, reason: e.target.value } : d))
            }
            placeholder="e.g. duplicate entry, wrong bottle"
          />
        </Field>
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            full
            onClick={() => setDeleting(null)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            full
            onClick={() => {
              if (!deleting) return
              deleteTransaction(deleting.id, deleting.reason)
              setDeleting(null)
              toast.show(
                'Transaction deleted — restore it from the Change log',
                'info',
              )
            }}
          >
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  )
}
