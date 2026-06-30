import { useMemo, useState } from 'react'
import {
  Button,
  Field,
  Modal,
  TextArea,
  TextInput,
} from './ui'
import { Picker, type PickerOption } from './Picker'
import { useStore } from '../lib/store'
import {
  type Bottle,
  type Technician,
  type Transaction,
  type TransactionKind,
  type TransactionReason,
  REASON_LABELS,
  REFRIGERANT_TYPES,
  netWeight,
  overfillKg,
  scaleDeltaKg,
  siteLabel,
  sortRefrigerants,
  transactionLabel,
} from '../lib/types'
import { computeLog } from '../lib/logCalc'
import { useToast } from '../lib/toast'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { SiteForm, UnitForm } from '../pages/Sites'
import { BottleQuickAdd } from './QuickAdd'
import { BottleSelect } from './BottleSelect'
import { DateTimeInput } from './DateTimeInput'
import {
  dateTimeInputToIso,
  deviceTimeZone,
  localDateTimeInput,
  tzAbbrev,
} from '../lib/datetime'
import { PasswordPromptModal } from './PasswordPromptModal'
import { ScanButton } from './ScanButton'
import { profileFor } from '../lib/compliance'
import {
  EntryModeToggle,
  ScaleReadingField,
  type EntryMode,
} from './ScaleEntry'
import { PendingPhotoPicker } from './Photos'

const KIND_OPTIONS: readonly PickerOption[] = [
  { value: 'charge', label: 'Charge', hint: 'into equipment (bottle weight decreases)' },
  { value: 'recover', label: 'Recover', hint: 'from equipment or another bottle (bottle weight increases)' },
  { value: 'transfer', label: 'Transfer bottle to a site' },
  { value: 'return', label: 'Return bottle to stock/supplier' },
  { value: 'adjust', label: 'Manual adjust (signed)' },
]

// The payload every save emits. Superset of what each entry point used to
// send on its own, so one form drives both the bottle quick-log and the
// Refrigerant-log "+ Log" button.
export type LogFormData = {
  bottleId: string
  sourceBottleId?: string
  siteId?: string
  unitId?: string
  jobId?: string
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
  refrigerantContamination?: { sourceType: string; destType: string }
  savedOverSafeFill?: boolean
  // Staged camera shots, bound to the row's id after the save (they live
  // in the attachment store, never in the transaction itself).
  photos?: File[]
}

// The single logging form, shared by the Refrigerant-log "+ Log" button and
// the bottle quick-log. It covers the union of what those two used to do
// separately: kind picker + bottle picker + scan + corrections (full path),
// quick-amount chips + bottle-to-bottle recovery (quick path), plus photos,
// signatures-via-attachments, the tech picker and scale entry for both.
//
// initialBottleId / initialKind pre-select the cylinder and movement when
// launched from a bottle's action sheet; correcting puts it in re-statement
// mode. Otherwise it opens blank on the most-recently-used bottle.
export function LogForm({
  open,
  correcting,
  initialBottleId,
  initialKind,
  onClose,
  onSave,
}: {
  open: boolean
  correcting?: Transaction | null
  initialBottleId?: string
  initialKind?: TransactionKind
  onClose: () => void
  onSave: (data: LogFormData, share?: boolean) => void
}) {
  const {
    state,
    addSite,
    addUnit,
    addBottle,
    addJob,
    addCustomRefrigerant,
    addTechnician,
    setActiveTechnicianId,
  } = useStore()
  const { bottles, sites, unit } = state
  // Interpret and default the entered time in THIS device's timezone, so a
  // tech in Perth logs in Perth time and a tech in Brisbane in Brisbane
  // time even on the same synced account. The zone is stamped onto the
  // saved row (see Transaction.tz) so the audit reads unambiguously.
  const tz = deviceTimeZone() || state.location.timezone
  const clock = state.clock
  const tzLabel = tzAbbrev(new Date().toISOString(), tz)
  const toast = useToast()

  const allRefrigerantTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...state.customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [state.customRefrigerants, state.favoriteRefrigerants],
  )

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
  // 'equipment' = recover out of a unit; 'bottle' = decant from another
  // cylinder into this one (bottle-to-bottle recovery).
  const [recoverSource, setRecoverSource] = useState<'equipment' | 'bottle'>(
    'equipment',
  )
  const [sourceBottleId, setSourceBottleId] = useState('')
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
  const [addingBottle, setAddingBottle] = useState(false)
  // Optional work-order grouping. Defaults to the most recent open job so a
  // run of movements on one visit gathers itself; '' opts out.
  const [jobId, setJobId] = useState('')
  const [addingJob, setAddingJob] = useState(false)
  const [newJobRef, setNewJobRef] = useState('')

  const openJobs = useMemo(
    () =>
      state.jobs
        .filter((j) => j.status === 'open')
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [state.jobs],
  )

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
    // start on the launch bottle (bottle action sheet), the most recently
    // used bottle, or the first.
    const startBottleId =
      correcting?.bottleId ?? initialBottleId ?? lastBottleId ?? bottles[0]?.id ?? ''
    setBottleId(startBottleId)
    const startBottle = bottles.find((b) => b.id === startBottleId)
    // Re-statements start from a copy of the original: the tech fixes
    // what was wrong (usually the amount) and saves. The work date is
    // the ORIGINAL's date so leak windows and quarterly bucketing stay
    // on the day the refrigerant actually moved.
    const restateSiteId =
      restating && correcting.siteId &&
      sites.some((s) => s.id === correcting.siteId)
        ? correcting.siteId
        : ''
    // Default the site to the launch bottle's current site on a fresh log
    // (matches the old quick path); blank otherwise.
    setSiteId(restateSiteId || (correcting ? '' : startBottle?.currentSiteId ?? ''))
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
    setKind(
      restating
        ? correcting.kind
        : correcting
          ? 'adjust'
          : initialKind ?? 'charge',
    )
    setRecoverSource('equipment')
    setSourceBottleId('')
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
    // Keep a correction on its original's job; otherwise default to the
    // most recent open job (the visit you're working) if there is one.
    setJobId(correcting ? (correcting.jobId ?? '') : (openJobs[0]?.id ?? ''))
    setAddingJob(false)
    setNewJobRef('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const bottle = bottles.find((b) => b.id === bottleId)
  const enteredAmount = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmount, unit)
  const enteredBottle = parseFloat(bottleAmount) || 0

  // Bottle-to-bottle recovery: this cylinder is the destination, the picked
  // source is decanted into it. Only offered for a fresh recover (a
  // correction of one stays a legacy signed adjustment).
  const isBottleToBottleRecover =
    !correcting && kind === 'recover' && recoverSource === 'bottle'
  const sourceBottle =
    isBottleToBottleRecover && sourceBottleId
      ? bottles.find((b) => b.id === sourceBottleId)
      : null

  // Scale mode (charge / recover / adjust): the typed reading is the
  // bottle's new gross weight; the moved amount is derived from it. Not
  // available for a bottle-to-bottle decant.
  const scaleKinds =
    kind === 'charge' || kind === 'recover' || kind === 'adjust'
  const scaleMode =
    entryMode === 'scale' && scaleKinds && !!bottle && !isBottleToBottleRecover
  const scaleReadingKg = displayToKg(parseFloat(newGross) || 0, unit)

  const showAmount = kind !== 'transfer' && kind !== 'return'
  const showSite = kind !== 'adjust' && !isBottleToBottleRecover
  const showCompliance =
    (kind === 'charge' || kind === 'recover') && !isBottleToBottleRecover
  const supportsLoss =
    (kind === 'charge' || kind === 'recover') && !isBottleToBottleRecover
  const selectedUnit = unitId
    ? siteUnits.find((u) => u.id === unitId)
    : undefined

  // Shared weight math + weight-based guards — identical logic to the rest
  // of the app (see lib/logCalc). For a re-statement only the delta beyond
  // the original bottle amount moves the bottle; for a bottle-to-bottle
  // decant the source over-draw is checked too.
  const calc = computeLog({
    kind,
    bottleGross: bottle ? bottle.grossWeight : null,
    bottleTare: bottle?.tareWeight ?? 0,
    bottleSafeFillCap: bottle?.initialNetWeight ?? 0,
    amountKg,
    enteredBottleKg: displayToKg(enteredBottle, unit),
    scaleReadingKg,
    scaleMode,
    showAmount,
    showLoss,
    restateOriginalBottleKg: restating
      ? (correcting.bottleAmount ?? correcting.amount)
      : 0,
    sourceGross: sourceBottle ? sourceBottle.grossWeight : null,
    sourceTare: sourceBottle?.tareWeight ?? 0,
    unitKind: selectedUnit?.kind,
    recordedChargeKg: selectedUnit?.refrigerantCharge,
  })
  const {
    scaleInvalid,
    bottleAmountKg,
    lossKg,
    projectedAfter,
    projectedOverSafeFill,
    projectedSourceNet,
    blockOverdraw,
    blockSourceOverdraw,
    blockNoOp,
    sanity,
    blockImplausible,
  } = calc
  const currentNet = bottle ? netWeight(bottle) : 0

  // Source-bottle refrigerant must match the destination — mixing is a
  // contamination event that ruins both bottles for reclamation. Warn
  // strongly but don't auto-block (intentional "mixed waste" consolidation).
  const refrigerantContaminationWarn =
    isBottleToBottleRecover &&
    !!sourceBottle &&
    !!bottle &&
    sourceBottle.refrigerantType.toUpperCase() !==
      bottle.refrigerantType.toUpperCase()

  // Bottle-vs-unit refrigerant mismatch — charging R410A into a unit
  // labelled R32 (or vice-versa) is almost always a wrong-bottle mistake.
  // Warn loudly but don't auto-block; the tech may be retrofitting.
  const unitRefrigerantMismatch =
    !!bottle &&
    (kind === 'charge' || kind === 'recover') &&
    !!selectedUnit?.refrigerantType &&
    selectedUnit.refrigerantType.toUpperCase() !==
      bottle.refrigerantType.toUpperCase()

  // Form-specific gates (the weight-based blocks live in computeLog above).
  const blockAlreadyReturned =
    !!bottle && kind === 'return' && bottle.status === 'returned'
  const missingSource = isBottleToBottleRecover && !sourceBottleId
  const missingReason = showCompliance && !reason
  const missingLeakTest = showCompliance && leakTest === null
  const missingCorrectionReason = !!correcting && !correctionReason.trim()
  const submitBlocked =
    blockOverdraw ||
    blockSourceOverdraw ||
    blockAlreadyReturned ||
    missingSource ||
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
      sourceBottleId:
        isBottleToBottleRecover && sourceBottleId ? sourceBottleId : undefined,
      siteId: showSite && siteId ? siteId : undefined,
      unitId: showSite && unitId ? unitId : undefined,
      jobId: jobId || undefined,
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
      refrigerantContamination:
        refrigerantContaminationWarn && sourceBottle && bottle
          ? {
              sourceType: sourceBottle.refrigerantType,
              destType: bottle.refrigerantType,
            }
          : undefined,
      savedOverSafeFill: projectedOverSafeFill || undefined,
    }, share)
  }

  function commitNewJob() {
    const ref = newJobRef.trim()
    if (!ref) return
    const created = addJob({
      reference: ref,
      siteId: siteId || undefined,
      date: dateTimeInputToIso(date, tz),
    })
    setJobId(created.id)
    setAddingJob(false)
    setNewJobRef('')
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

        {/* Recover source: out of equipment, or decant from another bottle. */}
        {!correcting && kind === 'recover' && (
          <Field label="Recover from">
            <div className="grid grid-cols-2 gap-2">
              {([
                ['Equipment', 'equipment'],
                ['Another bottle', 'bottle'],
              ] as const).map(([label, val]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRecoverSource(val)}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                    recoverSource === val
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {isBottleToBottleRecover && (
          <Field
            label="Source bottle"
            hint="Refrigerant will be removed from this bottle and added to the one above"
          >
            <BottleSelect
              required
              value={sourceBottleId}
              onChange={setSourceBottleId}
              excludeId={bottleId}
              allowAddNew
              onAddNew={() => setAddingBottle(true)}
              placeholder="Tap to pick a source bottle"
              modalTitle="Pick source bottle"
              candidateFilter={(b) => b.status !== 'returned'}
            />
          </Field>
        )}

        {refrigerantContaminationWarn && sourceBottle && bottle && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-100">
            <div className="font-semibold">
              ⚠ Refrigerant mismatch — this would contaminate both bottles
            </div>
            <div className="mt-1 text-xs">
              Source is <strong>{sourceBottle.refrigerantType}</strong>,
              destination is <strong>{bottle.refrigerantType}</strong>. Mixed
              refrigerants can't be reused or reclaimed without expensive
              separation — check both bottles before continuing.
            </div>
          </div>
        )}

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
        {showAmount && scaleKinds && bottle && !correcting && !isBottleToBottleRecover && (
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
                  : isBottleToBottleRecover
                    ? `How much to transfer? (${unit})`
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
            {/* One-tap common amounts so a routine top-up needs no typing
                with gloves on. Manual-entry only — in scale mode the amount
                is derived from the weighed reading; adjust is a signed
                stocktake delta where a preset makes no sense. */}
            {!scaleMode && kind !== 'adjust' && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(unit === 'lb' ? [1, 2, 5, 10] : [0.5, 1, 2, 5]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAmount(String(n))}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    {n} {unit}
                  </button>
                ))}
              </div>
            )}
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
            {sourceBottle && (
              <div>
                Source bottle net after:{' '}
                <strong>{formatWeight(projectedSourceNet, unit)}</strong>
                {blockSourceOverdraw && (
                  <div className="mt-1 font-semibold text-red-600 dark:text-red-300">
                    ⛔ More than the source bottle has (
                    {formatWeight(netWeight(sourceBottle), unit)} available) — can't save
                  </div>
                )}
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

        <Field
          label="Job (optional)"
          hint="Group this movement under a work-order / site visit, so the whole visit prints as one service report."
        >
          <Picker
            title="Job"
            value={jobId}
            onChange={(v) => {
              if (v === '__newjob__') {
                setAddingJob(true)
                return
              }
              setJobId(v)
            }}
            emptyLabel="— none —"
            placeholder="— none —"
            options={[
              ...openJobs.map((j) => ({
                value: j.id,
                label: j.reference,
                hint: j.siteName || undefined,
              })),
              { value: '__newjob__', label: '+ New job…' },
            ]}
          />
        </Field>

        {addingJob && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              New job
            </div>
            <Field label="Reference / title">
              <TextInput
                autoFocus
                value={newJobRef}
                onChange={(e) => setNewJobRef(e.target.value)}
                placeholder="e.g. WO-1042, AC service — Smith"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" onClick={commitNewJob}>
                Open job
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAddingJob(false)
                  setNewJobRef('')
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
              : blockOverdraw || blockSourceOverdraw
                ? 'Amount exceeds bottle contents'
                : blockImplausible
                  ? 'Amount looks wrong — check it'
                  : blockNoOp
                    ? kind === 'adjust'
                      ? 'Enter a non-zero change'
                      : 'Enter an amount'
                    : missingSource
                      ? 'Pick a source bottle'
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

      <BottleQuickAdd
        open={addingBottle}
        types={allRefrigerantTypes}
        onClose={() => setAddingBottle(false)}
        onCreate={(data, customType) => {
          if (customType) addCustomRefrigerant(customType)
          const created = addBottle(data as Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>)
          setSourceBottleId(created.id)
          setAddingBottle(false)
        }}
      />

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
