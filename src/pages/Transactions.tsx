import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  TextArea,
  TextInput,
} from '../components/ui'
import { Picker, type PickerOption } from '../components/Picker'
import { DateInput } from '../components/DateInput'
import { useStore } from '../lib/store'
import {
  type Transaction,
  type TransactionKind,
  type TransactionReason,
  REASON_LABELS,
  canCorrectRecords,
  canDeleteRecords,
  chargeSanity,
  netWeight,
  overfillKg,
  roleInfo,
  scaleDeltaKg,
  siteLabel,
  transactionLabel,
} from '../lib/types'
import { useToast } from '../lib/toast'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { SiteForm, UnitForm } from './Sites'
import { DateTimeInput } from '../components/DateTimeInput'
import {
  dateTimeInputToIso,
  deviceTimeZone,
  localDateTimeInput,
  tzAbbrev,
} from '../lib/datetime'
import { PasswordPromptModal } from '../components/PasswordPromptModal'
import { ShareTxButton, ShareTxModal, SharePeriodButton } from '../components/ShareSheet'
import { Alerts } from '../components/Alerts'
import { ScanButton } from '../components/ScanButton'
import { profileFor } from '../lib/compliance'
import {
  EntryModeToggle,
  ScaleReadingField,
  type EntryMode,
} from '../components/ScaleEntry'
import type { Technician } from '../lib/types'
import { PendingPhotoPicker, PhotoSection } from '../components/Photos'
import { SignatureSection } from '../components/Signatures'
import { addPhoto, attachmentCounts } from '../lib/attachments'
import { TransactionDetails } from '../components/TransactionDetails'

const KIND_OPTIONS: readonly PickerOption[] = [
  { value: 'charge', label: 'Charge', hint: 'into equipment (bottle weight decreases)' },
  { value: 'recover', label: 'Recover', hint: 'from equipment (bottle weight increases)' },
  { value: 'transfer', label: 'Transfer bottle to a site' },
  { value: 'return', label: 'Return bottle to stock/supplier' },
  { value: 'adjust', label: 'Manual adjust (signed)' },
]

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
          {(['all', 'intake', 'charge', 'recover', 'transfer', 'return', 'adjust'] as const).map(
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

      <TransactionForm
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

function TransactionForm({
  open,
  correcting,
  onClose,
  onSave,
}: {
  open: boolean
  // When set, the form is in "correction mode": it logs a new linked
  // entry that references this original (never editing the original).
  correcting?: Transaction | null
  onClose: () => void
  onSave: (data: {
    bottleId: string
    siteId?: string
    unitId?: string
    kind: TransactionKind
    amount: number
    bottleAmount?: number
    date: string
    tz?: string
    technician?: string
    technicianLicence?: string
    equipment?: string
    reason?: TransactionReason
    leakTestPerformed?: boolean
    notes?: string
    returnDestination?: string
    docketNumber?: string
    correctsId?: string
    correctionReason?: string
    refrigerantMismatch?: { bottleType: string; unitType: string }
    savedOverSafeFill?: boolean
    // Staged camera shots, bound to the row's id after the save (they
    // live in the attachment store, never in the transaction itself).
    photos?: File[]
  }, share?: boolean) => void
}) {
  const { state, addSite, addUnit, addTechnician, setActiveTechnicianId } =
    useStore()
  const { bottles, sites, unit } = state
  // Interpret and default the entered time in THIS device's timezone, so a
  // tech in Perth logs in Perth time and a tech in Brisbane in Brisbane
  // time even on the same synced account. The zone is stamped onto the
  // saved row (see Transaction.tz) so the audit reads unambiguously.
  const tz = deviceTimeZone() || state.location.timezone
  const clock = state.clock
  const tzLabel = tzAbbrev(new Date().toISOString(), tz)
  const toast = useToast()

  // One pass over the live log for the two "repeat yourself less"
  // defaults: the bottle used most recently (pre-picked on open) and
  // the most recent job with a site (offered as a one-tap prefill).
  const { lastJob, lastBottleId } = useMemo(() => {
    let job: Transaction | null = null
    let last: Transaction | null = null
    for (const t of state.transactions) {
      if (t.deletedAt) continue
      if (!last || t.date > last.date) last = t
      if (
        t.siteId &&
        (t.kind === 'charge' || t.kind === 'recover' || t.kind === 'transfer')
      ) {
        if (!job || t.date > job.date) job = t
      }
    }
    return {
      lastJob: job,
      lastBottleId:
        last && bottles.some((b) => b.id === last!.bottleId)
          ? last.bottleId
          : undefined,
    }
  }, [state.transactions, bottles])

  const [bottleId, setBottleId] = useState(bottles[0]?.id ?? '')
  const [siteId, setSiteId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [kind, setKind] = useState<TransactionKind>('charge')
  const [amount, setAmount] = useState('')
  const [bottleAmount, setBottleAmount] = useState('')
  const [showLoss, setShowLoss] = useState(false)
  // 'amount' = type the kg moved; 'scale' = type the bottle's new gross
  // weight off the scale and the app derives the amount.
  const [entryMode, setEntryMode] = useState<EntryMode>('amount')
  const [newGross, setNewGross] = useState('')
  const [date, setDate] = useState(() => localDateTimeInput(new Date(), tz))
  // Tech selection: profile id, or '__other__' for free-text fallback.
  // Defaults to the active profile so single-tech crews don't have to
  // touch this control on every log.
  const [techId, setTechId] = useState<string>(
    state.activeTechnicianId ?? (state.technicians[0]?.id ?? '__other__'),
  )
  const [techOther, setTechOther] = useState(state.technician)
  const [addingTech, setAddingTech] = useState(false)
  const [newTechName, setNewTechName] = useState('')
  const [newTechRhl, setNewTechRhl] = useState('')
  const [pwPromptTech, setPwPromptTech] = useState<Technician | null>(null)
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  // Leak test performed during this job. null = not answered yet (forces
  // a deliberate Yes/No on charge/recover work); true/false once picked.
  const [leakTest, setLeakTest] = useState<boolean | null>(null)
  // Required when in correction mode — why the original was wrong.
  const [correctionReason, setCorrectionReason] = useState('')
  const [returnDestination, setReturnDestination] = useState('')
  const [docketNumber, setDocketNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([])
  const [addingSite, setAddingSite] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)

  const siteUnits = state.units.filter(
    (u) => u.siteId === siteId && u.status === 'active',
  )

  // Correction shape. Equipment work (charge / recover from equipment)
  // is corrected by RE-STATING it: same kind, site, unit and work date,
  // with the corrected amount — the original is superseded everywhere
  // amounts aggregate, and the bottle moves by the delta. Everything
  // else (intake / transfer / return / adjust / bottle-to-bottle
  // decants) keeps the legacy signed bottle adjustment.
  const restating =
    !!correcting &&
    (correcting.kind === 'charge' ||
      (correcting.kind === 'recover' && !correcting.sourceBottleId))

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    // In correction mode, pin to the corrected entry's bottle; otherwise
    // start on the most recently used bottle (falling back to the first).
    setBottleId(correcting?.bottleId ?? lastBottleId ?? bottles[0]?.id ?? '')
    // Re-statements start from a copy of the original: the tech fixes
    // what was wrong (usually the amount) and saves. The work date is
    // the ORIGINAL's date so leak windows and quarterly bucketing stay
    // on the day the refrigerant actually moved.
    const restateSiteId =
      restating && correcting.siteId &&
      sites.some((s) => s.id === correcting.siteId)
        ? correcting.siteId
        : ''
    setSiteId(restateSiteId)
    setUnitId(
      restating &&
        restateSiteId &&
        correcting.unitId &&
        state.units.some(
          (u) =>
            u.id === correcting.unitId &&
            u.siteId === restateSiteId &&
            u.status === 'active',
        )
        ? correcting.unitId
        : '',
    )
    setKind(restating ? correcting.kind : correcting ? 'adjust' : 'charge')
    setCorrectionReason('')
    const round3 = (n: number) => Math.round(n * 1000) / 1000
    setAmount(
      restating ? String(round3(kgToDisplay(correcting.amount, unit))) : '',
    )
    const restateBottleAmount =
      restating &&
      correcting.bottleAmount != null &&
      correcting.bottleAmount !== correcting.amount
    setBottleAmount(
      restateBottleAmount
        ? String(round3(kgToDisplay(correcting.bottleAmount!, unit)))
        : '',
    )
    setShowLoss(restateBottleAmount)
    setEntryMode('amount')
    setNewGross('')
    setDate(
      restating
        ? localDateTimeInput(new Date(correcting.date), tz)
        : localDateTimeInput(new Date(), tz),
    )
    setTechId(
      state.activeTechnicianId ??
        (state.technicians[0]?.id ?? '__other__'),
    )
    setTechOther(state.technician)
    setAddingTech(false)
    setNewTechName('')
    setNewTechRhl('')
    setEquipment(restating ? (correcting.equipment ?? '') : '')
    setReason(restating ? (correcting.reason ?? '') : '')
    setLeakTest(restating ? (correcting.leakTestPerformed ?? null) : null)
    setReturnDestination('')
    setDocketNumber('')
    setNotes('')
    setPendingPhotos([])
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const bottle = bottles.find((b) => b.id === bottleId)
  const enteredAmount = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmount, unit)
  const enteredBottle = parseFloat(bottleAmount) || 0
  // Scale mode (charge / recover / adjust): the typed reading is the
  // bottle's new gross weight; the moved amount is derived from it. For
  // charge/recover the derived delta is the bottle side, and any gap to
  // the equipment amount is recorded as loss automatically. For adjust
  // the signed delta IS the adjustment (stocktake weigh-in).
  const scaleKinds =
    kind === 'charge' || kind === 'recover' || kind === 'adjust'
  const scaleMode = entryMode === 'scale' && scaleKinds && !!bottle
  const scaleReadingKg = displayToKg(parseFloat(newGross) || 0, unit)
  const scaleDelta =
    scaleMode && bottle ? scaleDeltaKg(kind, bottle.grossWeight, scaleReadingKg) : 0
  const scaleInvalid =
    scaleMode && (newGross === '' || (kind !== 'adjust' && scaleDelta <= 0))
  const bottleAmountKg =
    scaleMode && kind !== 'adjust'
      ? Math.max(0, scaleDelta)
      : showLoss && enteredBottle > 0
        ? displayToKg(enteredBottle, unit)
        : amountKg
  const lossKg =
    showLoss || scaleMode
      ? kind === 'charge'
        ? Math.max(0, bottleAmountKg - amountKg)
        : kind === 'recover'
          ? Math.max(0, amountKg - bottleAmountKg)
          : 0
      : 0
  // Bottle-side effect of saving this entry. For a re-statement the
  // original already moved refrigerant, so only the difference between
  // the corrected and original bottle amounts hits the bottle (mirrors
  // the store's addTransaction logic).
  const restateOriginalBottleKg = restating
    ? (correcting.bottleAmount ?? correcting.amount)
    : 0
  const bottleEffectKg = restating
    ? bottleAmountKg - restateOriginalBottleKg
    : bottleAmountKg
  let projectedAfter = bottle?.grossWeight ?? 0
  if (bottle) {
    if (kind === 'charge') projectedAfter = bottle.grossWeight - bottleEffectKg
    else if (kind === 'recover') projectedAfter = bottle.grossWeight + bottleEffectKg
    else if (kind === 'adjust') projectedAfter = bottle.grossWeight + amountKg
  }

  const showAmount = kind !== 'transfer' && kind !== 'return'
  const showSite = kind !== 'adjust'
  const showCompliance = kind === 'charge' || kind === 'recover'
  const supportsLoss = kind === 'charge' || kind === 'recover'
  // Whether the projected move leaves the bottle over its safe-fill limit
  // (warn-only, allowed past). Persisted on the row so the override shows
  // up for a supervisor reviewing the log later, not just at entry.
  const projectedOverSafeFill =
    !!bottle &&
    showAmount &&
    overfillKg(
      Math.max(0, projectedAfter - bottle.tareWeight),
      bottle.initialNetWeight,
    ) > 0

  // Bottle-vs-unit refrigerant mismatch — charging R410A into a unit
  // labelled R32 (or vice-versa) is almost always a wrong-bottle mistake
  // and the resulting blend can damage the equipment. Warn loudly but
  // don't auto-block; the tech may be intentionally retrofitting.
  const selectedUnit = unitId
    ? siteUnits.find((u) => u.id === unitId)
    : undefined
  const unitRefrigerantMismatch =
    !!bottle &&
    (kind === 'charge' || kind === 'recover') &&
    !!selectedUnit?.refrigerantType &&
    selectedUnit.refrigerantType.toUpperCase() !==
      bottle.refrigerantType.toUpperCase()

  // Block over-draw on charge: can't take more refrigerant than the bottle
  // currently holds. Adjust is a manual signed correction — left unblocked.
  // Re-statements only draw the delta beyond what the original already took.
  const currentNet = bottle ? netWeight(bottle) : 0
  const blockOverdraw =
    !!bottle && kind === 'charge' && bottleEffectKg > currentNet + 0.01
  // Already-returned bottles can't be returned again — they need to be
  // put back into service first.
  const blockAlreadyReturned =
    !!bottle && kind === 'return' && bottle.status === 'returned'
  // Audit-required fields on equipment work: a Purpose/Reason must be
  // picked, and the leak-test question must be answered Yes or No.
  const missingReason = showCompliance && !reason
  const missingLeakTest = showCompliance && leakTest === null
  // A correction must say why the original was wrong.
  const missingCorrectionReason = !!correcting && !correctionReason.trim()
  // Plausibility guard on charges AND recoveries — catches gross typos
  // (e.g. 50 kg into / out of a split). Recovery from one unit can't
  // sensibly exceed the unit's charge by much, so the same thresholds
  // apply. Uses the selected unit's kind + recorded charge when known.
  const sanity =
    kind === 'charge' || kind === 'recover'
      ? chargeSanity(amountKg, {
          unitKind: selectedUnit?.kind,
          recordedChargeKg: selectedUnit?.refrigerantCharge,
        })
      : { level: 'ok' as const }
  const blockImplausible = sanity.level === 'block'
  // No-op guard: a charge/recover of 0, or an adjust that changes nothing,
  // would just litter the permanent log (rows are never hard-deleted).
  const blockNoOp =
    kind === 'charge' || kind === 'recover'
      ? amountKg <= 0.0005
      : kind === 'adjust'
        ? Math.abs(amountKg) <= 0.0005
        : false
  const submitBlocked =
    blockOverdraw ||
    blockAlreadyReturned ||
    missingReason ||
    missingLeakTest ||
    missingCorrectionReason ||
    blockImplausible ||
    blockNoOp ||
    scaleInvalid

  // Resolve identity stamps from the picked profile (or the free-text
  // "Other" field). The store still adds fallbacks on top of these for
  // legacy single-tech state.
  const pickedTech =
    techId !== '__other__'
      ? state.technicians.find((t) => t.id === techId)
      : null
  const stampedTechName = pickedTech
    ? pickedTech.name
    : techOther.trim() || undefined
  const stampedRhl = pickedTech?.arcLicenceNumber || undefined

  function doSave(share: boolean) {
    if (!bottleId) return
    if (submitBlocked) return
    const signedAmountKg = kind === 'adjust' ? amountKg : Math.abs(amountKg)
    onSave({
      bottleId,
      siteId: siteId || undefined,
      unitId: unitId || undefined,
      kind,
      amount: showAmount ? signedAmountKg : 0,
      bottleAmount:
        scaleMode && kind !== 'adjust'
          ? Math.abs(bottleAmountKg)
          : supportsLoss && showLoss && enteredBottle > 0
            ? Math.abs(bottleAmountKg)
            : undefined,
      date: dateTimeInputToIso(date, tz),
      tz,
      technician: stampedTechName,
      technicianLicence: stampedRhl,
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      leakTestPerformed: showCompliance && leakTest !== null ? leakTest : undefined,
      returnDestination:
        kind === 'return' && returnDestination.trim()
          ? returnDestination.trim()
          : undefined,
      docketNumber:
        kind === 'return' && docketNumber.trim()
          ? docketNumber.trim()
          : undefined,
      notes: notes.trim() || undefined,
      photos: pendingPhotos.length > 0 ? pendingPhotos : undefined,
      correctsId: correcting?.id,
      correctionReason: correcting ? correctionReason.trim() : undefined,
      refrigerantMismatch:
        unitRefrigerantMismatch &&
        bottle &&
        selectedUnit?.refrigerantType
          ? {
              bottleType: bottle.refrigerantType,
              unitType: selectedUnit.refrigerantType,
            }
          : undefined,
      savedOverSafeFill: projectedOverSafeFill || undefined,
    }, share)
  }

  function commitNewTech() {
    const trimmed = newTechName.trim()
    if (!trimmed) return
    const created = addTechnician({
      name: trimmed,
      arcLicenceNumber: newTechRhl.trim(),
    })
    setActiveTechnicianId(created.id)
    setTechId(created.id)
    setAddingTech(false)
    setNewTechName('')
    setNewTechRhl('')
  }

  return (
    <Modal
      open={open}
      title={correcting ? 'Log correction' : 'Log transaction'}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          doSave(false)
        }}
        className="space-y-3"
      >
        {correcting && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
            <div className="font-semibold">Correcting an earlier entry</div>
            <div className="mt-0.5 text-xs">
              {restating ? (
                <>
                  The original {transactionLabel(correcting.kind).toLowerCase()}{' '}
                  of {formatWeight(correcting.amount, unit)} stays on the record
                  but is superseded — this logs a re-statement with the corrected
                  details, and the equipment logbook, leak stats and totals count
                  this entry instead. The bottle only moves by the difference.
                  Keep the pre-filled work date unless the date itself was wrong.
                </>
              ) : (
                <>
                  The original {transactionLabel(correcting.kind).toLowerCase()}{' '}
                  of {formatWeight(correcting.amount, unit)} stays on the record —
                  this logs a linked signed adjustment that fixes the bottle
                  ledger.
                </>
              )}
            </div>
          </div>
        )}
        {correcting && (
          <Field label="Why is the original wrong?" hint="Required — kept on the audit trail.">
            <TextInput
              autoFocus
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="e.g. logged 5 kg, actually charged 3 kg"
            />
          </Field>
        )}
        {/* Kind is fixed in correction mode: a re-statement must keep the
            original's kind for the supersede link to hold, and a legacy
            correction is always a signed adjustment. */}
        {!correcting && (
          <Field label="What happened?">
            <Picker
              title="What happened?"
              value={kind}
              onChange={(v) => setKind(v as TransactionKind)}
              options={KIND_OPTIONS}
            />
          </Field>
        )}

        <Field
          label="Bottle"
          hint={
            correcting
              ? 'Locked to the original entry’s bottle — a correction can’t move the work to a different cylinder.'
              : undefined
          }
        >
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Picker
                required
                disabled={!!correcting}
                title="Pick a bottle"
                value={bottleId}
                onChange={setBottleId}
                placeholder="— pick a bottle —"
                options={bottles.map((b) => ({
                  value: b.id,
                  label: `${b.bottleNumber} · ${b.refrigerantType}`,
                  hint: `${formatWeight(b.grossWeight, unit)} gross`,
                }))}
              />
            </div>
            {!correcting && (
              <ScanButton
                title="Scan a cylinder barcode"
                onScan={(text) => {
                  const hit = bottles.find(
                    (b) =>
                      b.bottleNumber.trim().toLowerCase() ===
                      text.trim().toLowerCase(),
                  )
                  if (hit) setBottleId(hit.id)
                  else toast.show(`No bottle matched “${text}”`, 'info')
                }}
              />
            )}
          </div>
        </Field>

        {showSite && (
          <>
            <Field label="Site">
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <Picker
                    title="Site"
                    value={siteId}
                    onChange={(v) => {
                      setSiteId(v)
                      setUnitId('')
                    }}
                    required={kind === 'transfer'}
                    emptyLabel="— none —"
                    placeholder="— none —"
                    options={sites.map((j) => ({ value: j.id, label: siteLabel(j) }))}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAddingSite(true)}
                >
                  + New
                </Button>
              </div>
            </Field>
            {!siteId && !correcting && lastJob?.siteId && (() => {
              const ls = sites.find((s) => s.id === lastJob.siteId)
              if (!ls) return null
              const lu = state.units.find(
                (u) =>
                  u.id === lastJob.unitId &&
                  u.siteId === lastJob.siteId &&
                  u.status === 'active',
              )
              return (
                <button
                  type="button"
                  onClick={() => {
                    setSiteId(lastJob.siteId!)
                    setUnitId(lu ? lu.id : '')
                    if (showCompliance && !reason && lastJob.reason) {
                      setReason(lastJob.reason)
                    }
                  }}
                  className="text-left text-xs font-medium text-brand-600 hover:underline"
                >
                  Same as last job: {ls.name}
                  {lu ? ` · ${lu.name}` : ''}
                  {lastJob.reason ? ` · ${REASON_LABELS[lastJob.reason]}` : ''}
                </button>
              )
            })()}
            {(kind === 'charge' || kind === 'recover') && siteId && (
              <Field
                label="Unit (optional)"
                hint={
                  siteUnits.length > 0
                    ? 'Pick the equipment this charge applies to'
                    : 'No units recorded at this site yet — tap + New to add one.'
                }
              >
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Picker
                      title="Unit"
                      value={unitId}
                      onChange={setUnitId}
                      emptyLabel="— none —"
                      placeholder="— none —"
                      options={siteUnits.map((u) => ({
                        value: u.id,
                        label: u.name,
                        hint: u.refrigerantType || undefined,
                      }))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAddingUnit(true)}
                  >
                    + New
                  </Button>
                </div>
              </Field>
            )}
            {unitRefrigerantMismatch && bottle && selectedUnit && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
                <div className="font-semibold">
                  ⚠ Refrigerant mismatch — bottle and unit don't match
                </div>
                <div className="mt-1 text-xs">
                  Bottle is{' '}
                  <strong>{bottle.refrigerantType}</strong>, unit{' '}
                  <strong>{selectedUnit.name}</strong> is set up for{' '}
                  <strong>{selectedUnit.refrigerantType}</strong>. Double-check
                  you've grabbed the right bottle — mixing types can damage
                  the equipment and invalidates the charge record.
                </div>
              </div>
            )}
          </>
        )}

        {/* Scale entry reads the bottle's CURRENT weight, which already
            includes the original's move — meaningless while correcting. */}
        {showAmount && scaleKinds && bottle && !correcting && (
          <EntryModeToggle mode={entryMode} onChange={setEntryMode} />
        )}

        {scaleMode && bottle && (
          <ScaleReadingField
            kind={kind}
            unit={unit}
            currentGrossKg={bottle.grossWeight}
            value={newGross}
            onChange={(v) => {
              setNewGross(v)
              // Auto-fill the amount from the reading. Charge/recover
              // only fill plausible (positive) deltas; adjust takes the
              // signed delta directly — that's the stocktake workflow.
              const g = displayToKg(parseFloat(v) || 0, unit)
              const d = scaleDeltaKg(kind, bottle.grossWeight, g)
              if (kind === 'adjust') setAmount(kgToDisplay(d, unit).toFixed(2))
              else if (d > 0) setAmount(kgToDisplay(d, unit).toFixed(2))
            }}
          />
        )}

        {showAmount && (
          <Field
            label={
              kind === 'adjust'
                ? `Adjustment ${unit} (use − for removal)`
                : kind === 'charge'
                  ? `How much went into unit? (${unit})`
                  : kind === 'recover'
                    ? `How much came out of equipment? (${unit})`
                    : `Amount ${unit}`
            }
            hint={
              scaleMode && kind !== 'adjust'
                ? 'Auto-filled from the scale reading — adjust it if some refrigerant never made it between the bottle and the equipment (the gap is logged as loss).'
                : scaleMode
                  ? 'Auto-filled from the scale reading.'
                  : undefined
            }
          >
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 3.00"
            />
          </Field>
        )}

        {supportsLoss && !scaleMode && (
          <button
            type="button"
            onClick={() => setShowLoss((v) => !v)}
            className="text-left text-xs font-medium text-brand-600 hover:underline"
          >
            {showLoss
              ? 'Hide hose / decant loss field'
              : kind === 'charge'
                ? 'Bottle dropped by more than that? (decant / hose loss)'
                : 'Bottle gained less than that? (hose residual)'}
          </button>
        )}

        {supportsLoss && showLoss && !scaleMode && (
          <Field
            label={
              kind === 'charge'
                ? `Actually removed from bottle (${unit})`
                : `Actually added to bottle (${unit})`
            }
            hint={`Defaults to the amount above. Difference is recorded as a loss.`}
          >
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={bottleAmount}
              onChange={(e) => setBottleAmount(e.target.value)}
              placeholder={enteredAmount > 0 ? enteredAmount.toFixed(2) : 'e.g. 3.50'}
            />
          </Field>
        )}

        {bottle && showAmount && enteredAmount !== 0 && (() => {
          const projectedNet = Math.max(0, projectedAfter - bottle.tareWeight)
          const over = overfillKg(projectedNet, bottle.initialNetWeight)
          return (
          <div
            className={`rounded-xl p-3 text-sm ${
              blockOverdraw
                ? 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100'
                : over > 0
                  ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
                  : 'bg-brand-50 text-brand-900 dark:bg-brand-900/20 dark:text-brand-100'
            }`}
          >
            New gross weight:{' '}
            <strong>{formatWeight(Math.max(0, projectedAfter), unit)}</strong>
            <br />
            Net refrigerant:{' '}
            <strong>{formatWeight(projectedNet, unit)}</strong>
            {blockOverdraw && (
              <div className="mt-1 font-semibold">
                ⛔ More than this bottle has ({formatWeight(currentNet, unit)} available) — can't save
              </div>
            )}
            {over > 0 && (
              <div className="mt-1 font-semibold">
                ⚠ Over safe-fill limit by {formatWeight(over, unit)} (cap.{' '}
                {formatWeight(bottle.initialNetWeight, unit)})
              </div>
            )}
            {lossKg > 0 && (
              <div>
                Loss: <strong>{formatWeight(lossKg, unit)}</strong>{' '}
                <span className="text-xs">(in hoses / vented)</span>
              </div>
            )}
          </div>
          )
        })()}

        {sanity.level !== 'ok' && sanity.message && (
          <div
            className={`rounded-xl p-3 text-sm ${
              sanity.level === 'block'
                ? 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100'
                : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
            }`}
          >
            <span className="font-semibold">
              {sanity.level === 'block' ? '⛔ ' : '⚠ '}
            </span>
            {sanity.message}
          </div>
        )}

        {showCompliance && (
          <>
            {!unitId && (
              <Field
                label="Equipment (free text)"
                hint="Use only if the equipment isn't tracked as a Unit at the site above"
              >
                <TextInput
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  placeholder="e.g. Chiller AHU-2"
                />
              </Field>
            )}
            <Field label="Reason" hint="Required — the purpose of this job.">
              <Picker
                required
                title="Reason"
                value={reason}
                onChange={(v) => setReason(v as TransactionReason | '')}
                placeholder="— pick reason —"
                options={(Object.keys(REASON_LABELS) as TransactionReason[]).map(
                  (r) => ({ value: r, label: REASON_LABELS[r] }),
                )}
              />
            </Field>
            <Field label="Leak test performed?">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['Yes', true],
                  ['No', false],
                ] as const).map(([label, val]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setLeakTest(val)}
                    className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                      leakTest === val
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          </>
        )}

        {kind === 'return' && (
          <>
            <Field
              label="Store / supplier"
              hint="Where is the bottle being returned? Optional."
            >
              <TextInput
                value={returnDestination}
                onChange={(e) => setReturnDestination(e.target.value)}
                placeholder="e.g. BOC, Refco depot, Beijer Ref"
              />
            </Field>
            <Field
              label="Docket / consignment #"
              hint="The paper trail an audit follows — e.g. an RRA consignment note for refrigerant sent for destruction."
            >
              <TextInput
                value={docketNumber}
                onChange={(e) => setDocketNumber(e.target.value)}
                placeholder="e.g. RRA-102938"
              />
            </Field>
          </>
        )}

        <Field
          label="Date / time"
          hint={
            tzLabel
              ? `Recorded in ${tzLabel} — this device's timezone. The audit shows each entry in the zone it was logged.`
              : undefined
          }
        >
          <DateTimeInput
            value={date}
            onChange={setDate}
            timezone={tz}
            clock={clock}
            ariaLabel="Transaction date and time"
          />
        </Field>

        <Field
          label="Technician"
          hint={(() => {
            const short = profileFor(state.jurisdiction).techLicenceShort
            return pickedTech?.arcLicenceNumber
              ? `Stamps ${short} ${pickedTech.arcLicenceNumber} on this transaction.`
              : pickedTech
                ? `No ${short} on this profile — add one in Settings to stamp it.`
                : `Pick a profile to stamp a name + ${short}, or use Other for a one-off entry.`
          })()}
        >
          <Picker
            title="Technician"
            value={techId}
            onChange={(v) => {
              if (v === '__add__') {
                setAddingTech(true)
                return
              }
              if (v === '__other__') {
                setTechId(v)
                return
              }
              const target = state.technicians.find((t) => t.id === v)
              if (target?.passwordHash && state.activeTechnicianId !== v) {
                setPwPromptTech(target)
                return
              }
              setTechId(v)
              setActiveTechnicianId(v)
            }}
            options={[
              ...state.technicians.map((t) => ({
                value: t.id,
                label: t.name,
                hint: t.arcLicenceNumber
                  ? `${profileFor(state.jurisdiction).techLicenceShort} ${t.arcLicenceNumber}`
                  : undefined,
              })),
              { value: '__other__', label: 'Other (manual entry)' },
              { value: '__add__', label: '+ Add new tech…' },
            ]}
          />
        </Field>

        {techId === '__other__' && (
          <Field label="Technician name">
            <TextInput
              value={techOther}
              onChange={(e) => setTechOther(e.target.value)}
              placeholder="One-off name (no RHL stamped)"
            />
          </Field>
        )}

        {addingTech && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              New tech profile
            </div>
            <Field label="Name">
              <TextInput
                autoFocus
                value={newTechName}
                onChange={(e) => setNewTechName(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </Field>
            <Field label={profileFor(state.jurisdiction).techLicenceShort}>
              <TextInput
                value={newTechRhl}
                onChange={(e) => setNewTechRhl(e.target.value)}
                placeholder="e.g. L000000"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" onClick={commitNewTech}>
                Save tech
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAddingTech(false)
                  setNewTechName('')
                  setNewTechRhl('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <PendingPhotoPicker
          files={pendingPhotos}
          onChange={setPendingPhotos}
          hint="Snap the docket, gauges or nameplate now — saved with this entry."
        />

        {blockAlreadyReturned && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ This bottle is already marked as returned. Edit the bottle
            first and set its status back to In stock to log another return.
          </div>
        )}

        <Button type="submit" full disabled={submitBlocked}>
          {blockAlreadyReturned
            ? 'Already returned'
            : scaleInvalid
              ? 'Check the scale reading'
              : blockOverdraw
                ? 'Amount exceeds bottle contents'
                : blockImplausible
                  ? 'Amount looks wrong — check it'
                  : blockNoOp
                    ? kind === 'adjust'
                      ? 'Enter a non-zero change'
                      : 'Enter an amount'
                    : missingCorrectionReason
                      ? 'Add a correction reason'
                      : missingReason
                        ? 'Pick a reason'
                        : missingLeakTest
                          ? 'Answer leak test'
                          : correcting
                            ? 'Log correction'
                            : 'Save'}
        </Button>
        {/* Save, then open the share sheet for the new record so it can go
            straight into a job card / email. */}
        <Button
          type="button"
          variant="secondary"
          full
          disabled={submitBlocked}
          onClick={() => doSave(true)}
        >
          {correcting ? 'Log correction & share' : 'Save & share'}
        </Button>
      </form>

      <SiteForm
        open={addingSite}
        title="New site"
        onClose={() => setAddingSite(false)}
        onSave={(data) => {
          const created = addSite(data)
          setSiteId(created.id)
          setUnitId('')
          setAddingSite(false)
        }}
      />

      {siteId && (
        <UnitForm
          open={addingUnit}
          siteId={siteId}
          title="New unit"
          onClose={() => setAddingUnit(false)}
          onSave={(data) => {
            const created = addUnit({ ...data, siteId })
            setUnitId(created.id)
            setAddingUnit(false)
          }}
        />
      )}

      <PasswordPromptModal
        tech={pwPromptTech}
        onClose={() => setPwPromptTech(null)}
        onVerified={(t) => {
          setTechId(t.id)
          setActiveTechnicianId(t.id)
          setPwPromptTech(null)
        }}
      />
    </Modal>
  )
}
