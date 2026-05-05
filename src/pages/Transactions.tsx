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
import { useStore } from '../lib/store'
import {
  type TransactionKind,
  type TransactionReason,
  REASON_LABELS,
  netWeight,
  overfillKg,
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
}

export default function Transactions() {
  const { state, addTransaction, deleteTransaction } = useStore()
  const { bottles, sites, transactions, unit } = state
  const toast = useToast()

  const [adding, setAdding] = useState(false)
  const [filterKind, setFilterKind] = useState<'all' | TransactionKind>('all')

  const sorted = useMemo(
    () =>
      [...transactions]
        // Soft-deleted rows are kept in storage for the audit trail
        // but hidden from the working activity log. Admins can review
        // and restore them from Settings → Deleted transactions.
        .filter((t) => !t.deletedAt)
        .filter((t) => filterKind === 'all' || t.kind === filterKind)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, filterKind],
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Activity log
        </h2>
        <Button onClick={() => setAdding(true)} disabled={bottles.length === 0}>
          + Log
        </Button>
      </div>

      {transactions.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(['all', 'charge', 'recover', 'transfer', 'return', 'adjust'] as const).map(
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
                    </div>
                    <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                      {bottle?.bottleNumber ?? '(deleted)'}
                      {sourceBottle && ` ← ${sourceBottle.bottleNumber}`}
                      {site ? ` · ${site.name}` : ''}
                    </div>
                    {(txUnit || t.equipment || t.reason) && (
                      <div className="text-xs text-slate-500">
                        {txUnit && txUnit.name}
                        {!txUnit && t.equipment && t.equipment}
                        {(txUnit || t.equipment) && t.reason && ' · '}
                        {t.reason && REASON_LABELS[t.reason]}
                      </div>
                    )}
                    {t.kind === 'return' && t.returnDestination && (
                      <div className="text-xs text-slate-500">
                        Returned to: {t.returnDestination}
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
                      t.arcAuthorisationNumber) && (
                      <div className="mt-1 text-xs text-slate-500">
                        {[
                          t.technician &&
                            `${t.technician}${t.technicianLicence ? ` · RHL ${t.technicianLicence}` : ''}`,
                          !t.technician && t.technicianLicence && `RHL ${t.technicianLicence}`,
                          t.businessName &&
                            `${t.businessName}${t.arcAuthorisationNumber ? ` · RTA ${t.arcAuthorisationNumber}` : ''}`,
                          !t.businessName && t.arcAuthorisationNumber && `RTA ${t.arcAuthorisationNumber}`,
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
                  <button
                    onClick={() => {
                      const reason = prompt(
                        'Delete this transaction?\n\n' +
                          'It will be hidden from the activity log but kept in storage so an admin can review or restore it from Settings → Deleted transactions.\n\n' +
                          'Reason (optional):',
                        '',
                      )
                      // prompt() returns null on Cancel — only proceed
                      // when the user actually confirmed (returned a
                      // string, even if empty).
                      if (reason === null) return
                      deleteTransaction(t.id, reason)
                      toast.show(
                        'Transaction deleted — recoverable in Settings',
                        'info',
                      )
                    }}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                    aria-label="Delete transaction"
                  >
                    Delete
                  </button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <TransactionForm
        open={adding}
        onClose={() => setAdding(false)}
        onSave={(data) => {
          const result = addTransaction(data)
          if (result) {
            setAdding(false)
            toast.show(`${transactionLabel(data.kind)} logged`)
          }
        }}
      />
    </div>
  )
}

function TransactionForm({
  open,
  onClose,
  onSave,
}: {
  open: boolean
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
    notes?: string
    refrigerantMismatch?: { bottleType: string; unitType: string }
  }) => void
}) {
  const { state, addSite, addUnit, addTechnician, setActiveTechnicianId } =
    useStore()
  const { bottles, sites, unit } = state
  const tz = state.location.timezone
  const clock = state.clock

  const [bottleId, setBottleId] = useState(bottles[0]?.id ?? '')
  const [siteId, setSiteId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [kind, setKind] = useState<TransactionKind>('charge')
  const [amount, setAmount] = useState('')
  const [bottleAmount, setBottleAmount] = useState('')
  const [showLoss, setShowLoss] = useState(false)
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
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  const [notes, setNotes] = useState('')
  const [addingSite, setAddingSite] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)

  const siteUnits = state.units.filter(
    (u) => u.siteId === siteId && u.status === 'active',
  )

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setBottleId(bottles[0]?.id ?? '')
    setSiteId('')
    setUnitId('')
    setKind('charge')
    setAmount('')
    setBottleAmount('')
    setShowLoss(false)
    setDate(localDateTimeInput(new Date(), tz))
    setTechId(
      state.activeTechnicianId ??
        (state.technicians[0]?.id ?? '__other__'),
    )
    setTechOther(state.technician)
    setAddingTech(false)
    setNewTechName('')
    setNewTechRhl('')
    setEquipment('')
    setReason('')
    setNotes('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const bottle = bottles.find((b) => b.id === bottleId)
  const enteredAmount = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmount, unit)
  const enteredBottle = parseFloat(bottleAmount) || 0
  const bottleAmountKg =
    showLoss && enteredBottle > 0 ? displayToKg(enteredBottle, unit) : amountKg
  const lossKg = showLoss
    ? kind === 'charge'
      ? Math.max(0, bottleAmountKg - amountKg)
      : kind === 'recover'
        ? Math.max(0, amountKg - bottleAmountKg)
        : 0
    : 0
  let projectedAfter = bottle?.grossWeight ?? 0
  if (bottle) {
    if (kind === 'charge') projectedAfter = bottle.grossWeight - bottleAmountKg
    else if (kind === 'recover') projectedAfter = bottle.grossWeight + bottleAmountKg
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
  const currentNet = bottle ? netWeight(bottle) : 0
  const blockOverdraw =
    !!bottle && kind === 'charge' && bottleAmountKg > currentNet + 0.01
  // Already-returned bottles can't be returned again — they need to be
  // put back into service first.
  const blockAlreadyReturned =
    !!bottle && kind === 'return' && bottle.status === 'returned'
  const submitBlocked = blockOverdraw || blockAlreadyReturned

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
        supportsLoss && showLoss && enteredBottle > 0
          ? Math.abs(bottleAmountKg)
          : undefined,
      date: dateTimeInputToIso(date, tz),
      technician: stampedTechName,
      technicianLicence: stampedRhl,
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      notes: notes.trim() || undefined,
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
    <Modal open={open} title="Log transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="What happened?">
          <Picker
            title="What happened?"
            value={kind}
            onChange={(v) => setKind(v as TransactionKind)}
            options={KIND_OPTIONS}
          />
        </Field>

        <Field label="Bottle">
          <Picker
            required
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

        {supportsLoss && (
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

        {supportsLoss && showLoss && (
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
            <Field label="Reason">
              <Picker
                title="Reason"
                value={reason}
                onChange={(v) => setReason(v as TransactionReason | '')}
                placeholder="— pick reason —"
                options={(Object.keys(REASON_LABELS) as TransactionReason[]).map(
                  (r) => ({ value: r, label: REASON_LABELS[r] }),
                )}
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
          hint={
            pickedTech?.arcLicenceNumber
              ? `Stamps RHL ${pickedTech.arcLicenceNumber} on this transaction.`
              : pickedTech
                ? 'No RHL on this profile — add one in Settings to stamp it.'
                : 'Pick a profile to stamp a name + RHL, or use Other for a one-off entry.'
          }
        >
          <Picker
            title="Technician"
            value={techId}
            onChange={(v) => {
              if (v === '__add__') {
                setAddingTech(true)
                return
              }
              setTechId(v)
              if (v !== '__other__') setActiveTechnicianId(v)
            }}
            options={[
              ...state.technicians.map((t) => ({
                value: t.id,
                label: t.name,
                hint: t.arcLicenceNumber
                  ? `RHL ${t.arcLicenceNumber}`
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
            <Field label="RHL">
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

        {blockAlreadyReturned && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ This bottle is already marked as returned. Edit the bottle
            first and set its status back to In stock to log another return.
          </div>
        )}

        <Button type="submit" full disabled={submitBlocked}>
          {blockAlreadyReturned
            ? 'Already returned'
            : blockOverdraw
              ? 'Amount exceeds bottle contents'
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
    </Modal>
  )
}
