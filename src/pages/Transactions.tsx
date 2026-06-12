import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Pill,
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
  chargeSanity,
  isRestatement,
  movementSummary,
  netWeight,
  overfillKg,
  scaleDeltaKg,
  transactionLabel,
  transactionLoss,
} from '../lib/types'
import { useToast } from '../lib/toast'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { SiteForm, UnitForm } from './Sites'
import { DateTimeInput } from '../components/DateTimeInput'
import {
  dateTimeInputToIso,
  formatDateTime,
  localDateTimeInput,
} from '../lib/datetime'
import { PasswordPromptModal } from '../components/PasswordPromptModal'
import { Alerts } from '../components/Alerts'
import { ScanButton } from '../components/ScanButton'
import { profileFor } from '../lib/compliance'
import {
  EntryModeToggle,
  ScaleReadingField,
  type EntryMode,
} from '../components/ScaleEntry'
import type { Technician } from '../lib/types'

const KIND_OPTIONS: readonly PickerOption[] = [
  { value: 'charge', label: 'Charge', hint: 'into equipment (bottle weight decreases)' },
  { value: 'recover', label: 'Recover', hint: 'from equipment (bottle weight increases)' },
  { value: 'transfer', label: 'Transfer bottle to a site' },
  { value: 'return', label: 'Return bottle to stock/supplier' },
  { value: 'adjust', label: 'Manual adjust (signed)' },
]

const kindTone: Record<
  TransactionKind,
  'green' | 'amber' | 'blue' | 'slate' | 'red'
> = {
  charge: 'amber',
  recover: 'green',
  transfer: 'blue',
  return: 'slate',
  adjust: 'red',
  intake: 'green',
}

export default function Transactions() {
  const { state, addTransaction, deleteTransaction } = useStore()
  const { bottles, sites, transactions, unit } = state
  const toast = useToast()
  const licShort = profileFor(state.jurisdiction).techLicenceShort

  const [adding, setAdding] = useState(false)
  // The original entry currently being corrected (opens the log form in
  // correction mode), or null. Kept separate from `adding` so the form
  // can pre-fill + stamp the correction link.
  const [correcting, setCorrecting] = useState<Transaction | null>(null)
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
        // and restore them from Settings → Deleted transactions.
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Refrigerant log
        </h2>
        <Button onClick={() => setAdding(true)} disabled={bottles.length === 0}>
          + Log
        </Button>
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
          {sorted.map((t) => {
            const bottle = bottles.find((b) => b.id === t.bottleId)
            const sourceBottle = t.sourceBottleId
              ? bottles.find((b) => b.id === t.sourceBottleId)
              : null
            const site = sites.find((j) => j.id === t.siteId)
            const txUnit = state.units.find((u) => u.id === t.unitId)
            const move = movementSummary(
              t,
              transactions,
              (id) => sites.find((j) => j.id === id)?.name,
            )
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
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={kindTone[t.kind]}>{transactionLabel(t.kind)}</Pill>
                      {t.amount > 0 && (
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {formatWeight(t.amount, unit)}
                        </span>
                      )}
                      <span className="text-sm text-slate-500">
                        {bottle?.refrigerantType ?? '?'}
                      </span>
                      {corrects && <Pill tone="blue">Correction</Pill>}
                      {supersededBy && <Pill tone="amber">Corrected</Pill>}
                    </div>
                    {corrects && (
                      <div className="mt-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
                        {isRestatement(t) ? 'Re-states' : 'Corrects'} a{' '}
                        {transactionLabel(corrects.kind).toLowerCase()} of{' '}
                        {formatWeight(corrects.amount, unit)} from{' '}
                        {formatDateTime(corrects.date, state.location.timezone, state.clock)}
                        {t.correctionReason && <> — “{t.correctionReason}”</>}
                        {isRestatement(t) && (
                          <> · Equipment records and totals count this entry.</>
                        )}
                      </div>
                    )}
                    {supersededBy && (
                      <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
                        Superseded by a correction logged{' '}
                        {formatDateTime(
                          supersededBy.loggedAt ?? supersededBy.date,
                          state.location.timezone,
                          state.clock,
                        )}
                        {supersededBy.correctionReason && <> — “{supersededBy.correctionReason}”</>}
                        {isRestatement(supersededBy) && (
                          <> · Excluded from totals in favour of the correction.</>
                        )}
                      </div>
                    )}
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {bottle?.bottleNumber ?? '(deleted)'}
                      {sourceBottle && ` ← ${sourceBottle.bottleNumber}`}
                      {/* Fall back to the name frozen on the row when the
                          site record was deleted. */}
                      {!move && (site?.name ?? t.siteName)
                        ? ` · ${site?.name ?? t.siteName}`
                        : ''}
                    </div>
                    {move && (
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
                        <span className="text-xs uppercase tracking-wider text-slate-400">
                          From
                        </span>
                        <span className="font-medium">{move.from}</span>
                        <span aria-hidden className="text-slate-400">
                          →
                        </span>
                        <span className="text-xs uppercase tracking-wider text-slate-400">
                          to
                        </span>
                        <span className="font-medium">{move.to}</span>
                      </div>
                    )}
                    {(txUnit || t.unitName || t.equipment || t.reason) && (
                      <div className="text-xs text-slate-500">
                        {txUnit?.name ?? t.unitName ?? t.equipment}
                        {(txUnit || t.unitName || t.equipment) &&
                          t.reason &&
                          ' · '}
                        {t.reason && REASON_LABELS[t.reason]}
                      </div>
                    )}
                    {t.kind === 'return' && (t.returnDestination || t.docketNumber) && (
                      <div className="text-xs text-slate-500">
                        {t.returnDestination && `Returned to: ${t.returnDestination}`}
                        {t.returnDestination && t.docketNumber && ' · '}
                        {t.docketNumber && `Docket ${t.docketNumber}`}
                      </div>
                    )}
                    {t.kind === 'intake' && (t.supplier || t.invoiceNumber) && (
                      <div className="text-xs text-slate-500">
                        {t.supplier && `Supplier: ${t.supplier}`}
                        {t.supplier && t.invoiceNumber && ' · '}
                        {t.invoiceNumber && `Invoice ${t.invoiceNumber}`}
                      </div>
                    )}
                    {t.leakTestPerformed !== undefined && (
                      <div className="text-xs text-slate-500">
                        Leak test: {t.leakTestPerformed ? 'Yes' : 'No'}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">
                      {formatDateTime(t.date, state.location.timezone, state.clock)}
                      {t.amount > 0 && (
                        <>
                          {' · '}gross {kgToDisplay(t.weightBefore, unit).toFixed(2)} to{' '}
                          {formatWeight(t.weightAfter, unit)}
                        </>
                      )}
                    </div>
                    {(t.technician ||
                      t.technicianLicence ||
                      t.businessName ||
                      t.businessAbn ||
                      t.arcAuthorisationNumber) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {[
                          t.technician &&
                            `${t.technician}${t.technicianLicence ? ` · ${licShort} ${t.technicianLicence}` : ''}`,
                          !t.technician && t.technicianLicence && `${licShort} ${t.technicianLicence}`,
                          t.businessName &&
                            `${t.businessName}${t.arcAuthorisationNumber ? ` · ${profileFor(state.jurisdiction).businessAuthShort || 'Auth'} ${t.arcAuthorisationNumber}` : ''}`,
                          !t.businessName && t.arcAuthorisationNumber && `${profileFor(state.jurisdiction).businessAuthShort || 'Auth'} ${t.arcAuthorisationNumber}`,
                          t.businessAbn && `${profileFor(state.jurisdiction).businessNumberShort} ${t.businessAbn}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    )}
                    {transactionLoss(t) > 0 && (
                      <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
                        Loss: {formatWeight(transactionLoss(t), unit)}
                      </div>
                    )}
                    {t.refrigerantMismatch && (
                      <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
                        ⚠ Refrigerant mismatch acknowledged — bottle{' '}
                        <strong>{t.refrigerantMismatch.bottleType}</strong> into
                        unit set up for{' '}
                        <strong>{t.refrigerantMismatch.unitType}</strong>
                      </div>
                    )}
                    {t.notes && (
                      <div className="mt-1 text-xs italic text-slate-500">
                        “{t.notes}”
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {/* Correct an entry only while no live correction points
                        at it (a corrected entry's fix is corrected instead —
                        that keeps the supersede chain unambiguous). Legacy
                        bottle adjustments can't be re-corrected; log a manual
                        adjustment if one was wrong. */}
                    {!supersededBy && !(t.correctsId && t.kind === 'adjust') && (
                      <button
                        onClick={() => setCorrecting(t)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
                        aria-label="Log a correction for this transaction"
                      >
                        Correct
                      </button>
                    )}
                    <button
                      onClick={() => setDeleting({ id: t.id, reason: '' })}
                      className="rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                      aria-label="Delete transaction"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <TransactionForm
        open={adding || !!correcting}
        correcting={correcting}
        onClose={() => {
          setAdding(false)
          setCorrecting(null)
        }}
        onSave={(data) => {
          const result = addTransaction(data)
          if (result) {
            setAdding(false)
            setCorrecting(null)
            toast.show(correcting ? 'Correction logged' : `${transactionLabel(data.kind)} logged`)
          }
        }}
      />

      <Modal
        open={!!deleting}
        title="Delete this transaction?"
        onClose={() => setDeleting(null)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          It will be hidden from the activity log but kept in storage so an
          admin can review or restore it from{' '}
          <span className="font-medium">Settings → Deleted transactions</span>.
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
                'Transaction deleted — recoverable in Settings',
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
  }) => void
}) {
  const { state, addSite, addUnit, addTechnician, setActiveTechnicianId } =
    useStore()
  const { bottles, sites, unit } = state
  const tz = state.location.timezone
  const clock = state.clock
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
  // Plausibility guard on charges — catches gross typos (e.g. 50 kg into
  // a split). Uses the selected unit's kind + recorded charge when known.
  const sanity =
    kind === 'charge'
      ? chargeSanity(amountKg, {
          unitKind: selectedUnit?.kind,
          recordedChargeKg: selectedUnit?.refrigerantCharge,
        })
      : { level: 'ok' as const }
  const blockImplausible = sanity.level === 'block'
  const submitBlocked =
    blockOverdraw ||
    blockAlreadyReturned ||
    missingReason ||
    missingLeakTest ||
    missingCorrectionReason ||
    blockImplausible ||
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

  function submit(e: React.FormEvent) {
    e.preventDefault()
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
    })
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
      <form onSubmit={submit} className="space-y-3">
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
                    options={sites.map((j) => ({ value: j.id, label: j.name }))}
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

        <Field label="Date / time">
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
                placeholder={
                  state.jurisdiction === 'AU' ? 'e.g. L000000' : undefined
                }
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
