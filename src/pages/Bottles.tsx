import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Pill,
  Select,
  TextArea,
  TextInput,
} from '../components/ui'
import { useStore } from '../lib/store'
import {
  type Bottle,
  type BottlePreset,
  type BottleStatus,
  type TransactionKind,
  type TransactionReason,
  type Unit,
  BOTTLE_PRESETS,
  REFRIGERANT_TYPES,
  REASON_LABELS,
  netWeight,
  overfillKg,
  safeFillKgFor,
  sortRefrigerants,
  statusLabel,
  transactionLabel,
} from '../lib/types'
import { RefrigerantSelect } from '../components/RefrigerantSelect'
import { BottleSelect } from '../components/BottleSelect'
import { CylinderPresetSelect } from '../components/CylinderPresetSelect'
import { useToast } from '../lib/toast'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'

const statusTone: Record<BottleStatus, 'green' | 'amber' | 'slate' | 'red'> = {
  in_stock: 'green',
  on_site: 'amber',
  returned: 'slate',
  empty: 'red',
}

export default function Bottles() {
  const { state, addBottle, updateBottle, deleteBottle, addTransaction } =
    useStore()
  const { bottles, sites, customRefrigerants, unit } = state
  const toast = useToast()

  const [editing, setEditing] = useState<Bottle | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | BottleStatus>('all')
  const [query, setQuery] = useState('')

  // Action sheet — primary tap target
  // Track by id so the action sheet always reflects the latest bottle state
  // from the store (no stale snapshot after a charge updates the bottle).
  const [sheetBottleId, setSheetBottleId] = useState<string | null>(null)
  const sheetBottle = useMemo(
    () =>
      sheetBottleId ? bottles.find((b) => b.id === sheetBottleId) ?? null : null,
    [bottles, sheetBottleId],
  )
  const [logKind, setLogKind] = useState<TransactionKind | null>(null)

  const allTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [customRefrigerants, state.favoriteRefrigerants],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bottles
      .filter((b) => filter === 'all' || b.status === filter)
      .filter((b) => {
        if (!q) return true
        return (
          b.bottleNumber.toLowerCase().includes(q) ||
          b.refrigerantType.toLowerCase().includes(q) ||
          (b.notes ?? '').toLowerCase().includes(q)
        )
      })
      .sort((a, b) => a.bottleNumber.localeCompare(b.bottleNumber))
  }, [bottles, filter, query])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Bottles
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      {bottles.length > 0 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by number, type, or notes…"
        />
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(['all', 'in_stock', 'on_site', 'returned', 'empty'] as const).map(
          (f) => {
            const count =
              f === 'all'
                ? bottles.length
                : bottles.filter((b) => b.status === f).length
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {f === 'all' ? 'All' : statusLabel(f)} · {count}
              </button>
            )
          },
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={bottles.length === 0 ? 'No bottles yet' : 'No matches'}
          body={
            bottles.length === 0
              ? 'Add your first bottle to start tracking refrigerant.'
              : 'Try a different filter or search.'
          }
          action={
            bottles.length === 0 ? (
              <Button onClick={() => setAdding(true)}>+ Add bottle</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((b) => {
            const site = sites.find((j) => j.id === b.currentSiteId)
            const net = netWeight(b)
            const initialNet = b.initialNetWeight || 0
            const pct =
              initialNet > 0 ? Math.min(100, Math.max(0, (net / initialNet) * 100)) : 0
            const over = overfillKg(net, initialNet)
            return (
              <Card key={b.id} className="!p-3">
                <button
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => setSheetBottleId(b.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {b.bottleNumber}
                      </span>
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                        {b.refrigerantType}
                      </span>
                      <Pill tone={statusTone[b.status]}>
                        {statusLabel(b.status)}
                      </Pill>
                      {over > 0 && (
                        <Pill tone="amber">Overfill +{formatWeight(over, unit)}</Pill>
                      )}
                    </div>
                    {site && (
                      <div className="mt-1 text-sm text-slate-500">
                        {site.name}
                      </div>
                    )}
                    {initialNet > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={`h-full rounded-full ${over > 0 ? 'bg-amber-500' : 'bg-brand-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {kgToDisplay(net, unit).toFixed(2)}
                      <span className="ml-1 text-xs font-medium text-slate-500">
                        {unit}
                      </span>
                    </div>
                    {initialNet > 0 && (
                      <div className="text-xs text-slate-500">
                        of {formatWeight(initialNet, unit, 1)}
                      </div>
                    )}
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <BottleActionSheet
        bottle={sheetBottle}
        onClose={() => setSheetBottleId(null)}
        onLog={(kind) => setLogKind(kind)}
        onEdit={() => {
          if (sheetBottle) {
            setEditing(sheetBottle)
            setSheetBottleId(null)
          }
        }}
      />

      <QuickLogModal
        open={!!sheetBottle && !!logKind}
        bottle={sheetBottle}
        kind={logKind}
        onClose={() => setLogKind(null)}
        onSave={(data) => {
          const result = addTransaction(data)
          if (result) {
            toast.show(
              `${transactionLabel(data.kind)} logged: ${data.amount > 0 ? `${data.amount.toFixed(2)} kg` : 'OK'}`,
            )
            setLogKind(null)
            setSheetBottleId(null)
          }
        }}
      />

      <BottleForm
        open={adding}
        title="New bottle"
        types={allTypes}
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addBottle(data)
          setAdding(false)
          toast.show('Bottle added')
        }}
      />

      <BottleForm
        open={!!editing}
        title="Edit bottle"
        types={allTypes}
        bottle={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing) updateBottle(editing.id, data)
          setEditing(null)
          toast.show('Bottle updated')
        }}
        onDelete={
          editing
            ? () => {
                if (confirm('Delete this bottle and all its transactions?')) {
                  deleteBottle(editing.id)
                  setEditing(null)
                  toast.show('Bottle deleted', 'info')
                }
              }
            : undefined
        }
      />
    </div>
  )
}

function BottleActionSheet({
  bottle,
  onClose,
  onLog,
  onEdit,
}: {
  bottle: Bottle | null
  onClose: () => void
  onLog: (kind: TransactionKind) => void
  onEdit: () => void
}) {
  const { state } = useStore()
  if (!bottle) return null
  const unit = state.unit
  const site = state.sites.find((j) => j.id === bottle.currentSiteId)
  const net = netWeight(bottle)
  const history = state.transactions
    .filter((t) => t.bottleId === bottle.id || t.sourceBottleId === bottle.id)
    .slice(0, 5)

  return (
    <Modal open={!!bottle} title={bottle.bottleNumber} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 p-4 text-white">
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold tabular-nums">
              {kgToDisplay(net, unit).toFixed(2)}
            </div>
            <div className="text-base font-medium text-brand-100">{unit}</div>
            <div className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
              {bottle.refrigerantType}
            </div>
          </div>
          <div className="mt-1 text-sm text-brand-100">
            Gross {formatWeight(bottle.grossWeight, unit)} · Tare{' '}
            {formatWeight(bottle.tareWeight, unit)} ·{' '}
            {statusLabel(bottle.status)}
          </div>
          {site && (
            <div className="mt-1 text-sm text-brand-100">{site.name}</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onLog('charge')} variant="primary">
            Charge
          </Button>
          <Button onClick={() => onLog('recover')} variant="primary">
            Recover
          </Button>
        </div>

        <Button
          onClick={() => onLog('return')}
          variant="secondary"
          full
          disabled={bottle.status === 'returned'}
        >
          {bottle.status === 'returned' ? 'Already returned' : 'Return bottle'}
        </Button>

        <Button onClick={onEdit} variant="ghost" full>
          Edit details
        </Button>

        <div>
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recent activity
          </div>
          {history.length === 0 ? (
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">
              No transactions for this bottle yet.
            </div>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {history.map((t) => {
                const j = state.sites.find((x) => x.id === t.siteId)
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {transactionLabel(t.kind)}
                        {t.amount > 0 && ` · ${formatWeight(t.amount, unit)}`}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {new Date(t.date).toLocaleString()}
                        {j ? ` · ${j.name}` : ''}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

function QuickLogModal({
  open,
  bottle,
  kind,
  onClose,
  onSave,
}: {
  open: boolean
  bottle: Bottle | null
  kind: TransactionKind | null
  onClose: () => void
  onSave: (data: {
    bottleId: string
    sourceBottleId?: string
    siteId?: string
    unitId?: string
    kind: TransactionKind
    amount: number
    bottleAmount?: number
    date: string
    technician?: string
    equipment?: string
    reason?: TransactionReason
    notes?: string
    returnDestination?: string
  }) => void
}) {
  const { state, addBottle, addUnit, addCustomRefrigerant } = useStore()
  const unit = state.unit
  const allRefrigerantTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...state.customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [state.customRefrigerants, state.favoriteRefrigerants],
  )

  type RecoverSource = 'equipment' | 'bottle'

  const [amount, setAmount] = useState('')
  const [bottleAmount, setBottleAmount] = useState('')
  const [showLoss, setShowLoss] = useState(false)
  const [siteId, setSiteId] = useState(bottle?.currentSiteId ?? '')
  const [unitId, setUnitId] = useState('')
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [recoverSource, setRecoverSource] = useState<RecoverSource>('equipment')
  const [sourceBottleId, setSourceBottleId] = useState('')
  const [returnDestination, setReturnDestination] = useState('')

  // Quick-add modals
  const [quickAddBottleOpen, setQuickAddBottleOpen] = useState(false)
  const [quickAddUnitOpen, setQuickAddUnitOpen] = useState(false)

  const lastKey = `${bottle?.id}-${kind}-${open}`
  const [seenKey, setSeenKey] = useState('')
  if (open && seenKey !== lastKey) {
    setSeenKey(lastKey)
    setAmount('')
    setBottleAmount('')
    setShowLoss(false)
    setSiteId(bottle?.currentSiteId ?? '')
    setUnitId('')
    setEquipment('')
    setReason('')
    setNotes('')
    setDate(new Date().toISOString().slice(0, 16))
    setRecoverSource('equipment')
    setSourceBottleId('')
    setReturnDestination('')
  }

  if (!open || !bottle || !kind) return null

  const showAmount = kind === 'charge' || kind === 'recover'
  const isBottleToBottleRecover =
    kind === 'recover' && recoverSource === 'bottle'
  const showSite = kind !== 'return' && !isBottleToBottleRecover
  const showCompliance =
    (kind === 'charge' || kind === 'recover') && !isBottleToBottleRecover

  const siteUnits = state.units.filter(
    (u) => u.siteId === siteId && u.status === 'active',
  )
  const sourceBottle =
    isBottleToBottleRecover && sourceBottleId
      ? state.bottles.find((b) => b.id === sourceBottleId)
      : null

  const enteredAmountDisplay = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmountDisplay, unit)
  const enteredBottleDisplay = parseFloat(bottleAmount) || 0
  const bottleAmountKg =
    showLoss && enteredBottleDisplay > 0
      ? displayToKg(enteredBottleDisplay, unit)
      : amountKg
  const lossKg = showLoss
    ? kind === 'charge'
      ? Math.max(0, bottleAmountKg - amountKg)
      : kind === 'recover'
        ? Math.max(0, amountKg - bottleAmountKg)
        : 0
    : 0
  const projectedAfter =
    kind === 'charge'
      ? bottle.grossWeight - bottleAmountKg
      : kind === 'recover'
        ? bottle.grossWeight + bottleAmountKg
        : bottle.grossWeight
  const projectedNet = Math.max(0, projectedAfter - bottle.tareWeight)
  const projectedSourceAfter = sourceBottle
    ? Math.max(0, sourceBottle.grossWeight - amountKg)
    : 0
  const projectedSourceNet = sourceBottle
    ? Math.max(0, projectedSourceAfter - sourceBottle.tareWeight)
    : 0

  // Physical-impossibility blocks. You can't take out what isn't there.
  // Charges of equipment, and bottle-to-bottle recovers from a source,
  // can't exceed the source bottle's current net refrigerant. Adjust is
  // a manual correction — left unblocked. Over-fill on a destination
  // recover is still allowed (just warned), per AS 2030.5 verification
  // workflows where techs over-fill in practice.
  const currentNet = netWeight(bottle)
  const blockOverdraw =
    kind === 'charge' && bottleAmountKg > currentNet + 0.01
  const blockSourceOverdraw =
    isBottleToBottleRecover &&
    !!sourceBottle &&
    amountKg > netWeight(sourceBottle) + 0.01
  // A bottle that's already been returned can't be returned again. To
  // log another return the tech needs to first put the bottle back into
  // service (edit → status: in stock).
  const blockAlreadyReturned =
    kind === 'return' && bottle.status === 'returned'
  const submitBlocked =
    blockOverdraw || blockSourceOverdraw || blockAlreadyReturned

  function handleUnitChange(value: string) {
    if (value === '__new__') {
      setQuickAddUnitOpen(true)
      return
    }
    setUnitId(value)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!kind || !bottle) return
    if (submitBlocked) return
    onSave({
      bottleId: bottle.id,
      sourceBottleId: isBottleToBottleRecover && sourceBottleId ? sourceBottleId : undefined,
      siteId: showSite && siteId ? siteId : undefined,
      unitId: showSite && unitId ? unitId : undefined,
      kind,
      amount: showAmount ? Math.abs(amountKg) : 0,
      bottleAmount:
        showAmount && showLoss && enteredBottleDisplay > 0
          ? Math.abs(bottleAmountKg)
          : undefined,
      date: new Date(date).toISOString(),
      technician: state.technician || undefined,
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      notes: notes.trim() || undefined,
      returnDestination:
        kind === 'return' && returnDestination.trim()
          ? returnDestination.trim()
          : undefined,
    })
  }

  const titleMap: Record<TransactionKind, string> = {
    charge: 'Charge into equipment',
    recover: 'Recover refrigerant',
    transfer: 'Transfer bottle to a site',
    return: 'Return bottle to store',
    adjust: 'Manual adjustment',
  }

  return (
    <>
      <Modal open={open} title={titleMap[kind]} onClose={onClose}>
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {bottle.bottleNumber} · {bottle.refrigerantType}
            </div>
            <div className="text-slate-600 dark:text-slate-300">
              Currently {formatWeight(netWeight(bottle), unit)} net (
              {formatWeight(bottle.grossWeight, unit)} gross)
            </div>
          </div>

          {kind === 'recover' && (
            <Field label="Recover from">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecoverSource('equipment')}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                    recoverSource === 'equipment'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  Equipment
                </button>
                <button
                  type="button"
                  onClick={() => setRecoverSource('bottle')}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                    recoverSource === 'bottle'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  Another bottle
                </button>
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
                excludeId={bottle.id}
                allowAddNew
                onAddNew={() => setQuickAddBottleOpen(true)}
                placeholder="Tap to pick a source bottle"
                modalTitle="Pick source bottle"
              />
            </Field>
          )}

          {showAmount && (
            <Field
              label={
                kind === 'charge'
                  ? `How much went into unit? (${unit})`
                  : isBottleToBottleRecover
                    ? `How much to transfer? (${unit})`
                    : `How much came out of equipment? (${unit})`
              }
              hint={
                kind === 'charge'
                  ? 'The amount that ended up in the equipment'
                  : isBottleToBottleRecover
                    ? 'How much refrigerant moves from the source bottle to this one'
                    : kind === 'recover'
                      ? 'The amount pulled out of the equipment'
                      : undefined
              }
            >
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 3.00"
              />
            </Field>
          )}

          {showAmount && !isBottleToBottleRecover && (
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

          {showAmount && showLoss && !isBottleToBottleRecover && (
            <Field
              label={
                kind === 'charge'
                  ? `Actually removed from bottle (${unit})`
                  : `Actually added to bottle (${unit})`
              }
              hint={`Defaults to ${enteredAmountDisplay.toFixed(2)} ${unit}. Difference is recorded as a loss.`}
            >
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                value={bottleAmount}
                onChange={(e) => setBottleAmount(e.target.value)}
                placeholder={enteredAmountDisplay > 0 ? enteredAmountDisplay.toFixed(2) : 'e.g. 3.50'}
              />
            </Field>
          )}

          {showAmount && enteredAmountDisplay > 0 && (() => {
            const overDest = overfillKg(projectedNet, bottle.initialNetWeight)
            return (
              <div
                className={`rounded-xl p-3 text-sm ${
                  overDest > 0
                    ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
                    : 'bg-brand-50 text-brand-900 dark:bg-brand-900/20 dark:text-brand-100'
                }`}
              >
                New bottle net: <strong>{formatWeight(projectedNet, unit)}</strong>
                {blockOverdraw && (
                  <div className="mt-1 font-semibold text-red-600 dark:text-red-300">
                    ⛔ More than this bottle has ({formatWeight(currentNet, unit)} available) — can't save
                  </div>
                )}
                {!blockOverdraw && projectedAfter < bottle.tareWeight && (
                  <span className="ml-2 text-red-600 dark:text-red-300">
                    goes below tare
                  </span>
                )}
                {overDest > 0 && (
                  <div className="mt-1 font-semibold">
                    ⚠ Over safe-fill limit by {formatWeight(overDest, unit)} (cap.{' '}
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

          {showSite && (
            <>
              <Field label="Site">
                <Select
                  value={siteId}
                  onChange={(e) => {
                    setSiteId(e.target.value)
                    setUnitId('')
                  }}
                  required={kind === 'transfer'}
                >
                  <option value="">— none —</option>
                  {state.sites.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {(kind === 'charge' || kind === 'recover') && siteId && (
                <Field
                  label="Unit (optional)"
                  hint="Pick the equipment this charge applies to"
                >
                  <Select
                    value={unitId}
                    onChange={(e) => handleUnitChange(e.target.value)}
                  >
                    <option value="">— none —</option>
                    {siteUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.refrigerantType ? ` (${u.refrigerantType})` : ''}
                      </option>
                    ))}
                    <option value="__new__">+ Add new unit at this site…</option>
                  </Select>
                </Field>
              )}
            </>
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
              <Field label="Reason">
                <Select
                  value={reason}
                  onChange={(e) =>
                    setReason(e.target.value as TransactionReason | '')
                  }
                >
                  <option value="">— pick reason —</option>
                  {(Object.keys(REASON_LABELS) as TransactionReason[]).map((r) => (
                    <option key={r} value={r}>
                      {REASON_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          {kind === 'return' && blockAlreadyReturned && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
              ⛔ This bottle is already marked as returned. To log another
              return, edit the bottle first and set its status back to In
              stock.
            </div>
          )}

          {kind === 'return' && !blockAlreadyReturned && (
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
          )}

          <Field label="Date / time">
            <TextInput
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Notes">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <Button type="submit" full disabled={submitBlocked}>
            {blockAlreadyReturned
              ? 'Already returned'
              : submitBlocked
                ? 'Amount exceeds bottle contents'
                : 'Save'}
          </Button>
        </form>
      </Modal>

      <BottleQuickAdd
        open={quickAddBottleOpen}
        types={allRefrigerantTypes}
        onClose={() => setQuickAddBottleOpen(false)}
        onCreate={(data, customType) => {
          if (customType) addCustomRefrigerant(customType)
          const created = addBottle(data)
          setSourceBottleId(created.id)
          setQuickAddBottleOpen(false)
        }}
      />

      <UnitQuickAdd
        open={quickAddUnitOpen}
        siteId={siteId}
        onClose={() => setQuickAddUnitOpen(false)}
        onCreate={(data) => {
          const created = addUnit({ ...data, siteId })
          setUnitId(created.id)
          setQuickAddUnitOpen(false)
        }}
      />
    </>
  )
}

function BottleQuickAdd({
  open,
  types,
  onClose,
  onCreate,
}: {
  open: boolean
  types: string[]
  onClose: () => void
  onCreate: (
    data: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>,
    customType?: string,
  ) => void
}) {
  const { state } = useStore()
  const displayUnit = state.unit
  const [bottleNumber, setBottleNumber] = useState('')
  const [refrigerantType, setRefrigerantType] = useState(types[0] ?? 'R410A')
  const [tare, setTare] = useState('')
  const [gross, setGross] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setBottleNumber('')
    setRefrigerantType(types[0] ?? 'R410A')
    setTare('')
    setGross('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const tareKg = displayToKg(parseFloat(tare) || 0, displayUnit)
    const grossKg = displayToKg(parseFloat(gross) || 0, displayUnit)
    onCreate({
      bottleNumber: bottleNumber.trim(),
      refrigerantType,
      tareWeight: tareKg,
      grossWeight: grossKg,
      initialNetWeight: Math.max(0, grossKg - tareKg),
      status: 'in_stock',
    })
  }

  return (
    <Modal open={open} title="Quick add bottle" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Bottle ID / number">
          <TextInput
            required
            autoFocus
            value={bottleNumber}
            onChange={(e) => setBottleNumber(e.target.value)}
            placeholder="e.g. B-205"
          />
        </Field>
        <Field label="Refrigerant type">
          <RefrigerantSelect
            required
            value={refrigerantType}
            onChange={setRefrigerantType}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Tare ${displayUnit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tare}
              onChange={(e) => setTare(e.target.value)}
            />
          </Field>
          <Field label={`Gross ${displayUnit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={gross}
              onChange={(e) => setGross(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          For full details (notes, status, current site) edit the bottle from the Bottles tab after saving.
        </p>
        <Button type="submit" full>
          Add bottle
        </Button>
      </form>
    </Modal>
  )
}

function UnitQuickAdd({
  open,
  siteId,
  onClose,
  onCreate,
}: {
  open: boolean
  siteId: string
  onClose: () => void
  onCreate: (
    data: Omit<Unit, 'id' | 'createdAt' | 'status' | 'siteId'>,
  ) => void
}) {
  const [name, setName] = useState('')
  const [refrigerantType, setRefrigerantType] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setName('')
    setRefrigerantType('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onCreate({
      name: name.trim(),
      refrigerantType: refrigerantType || undefined,
    })
  }

  if (!siteId) return null

  return (
    <Modal open={open} title="Quick add unit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Unit name / label">
          <TextInput
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Living room split, AHU-2"
          />
        </Field>
        <Field label="Refrigerant (optional)">
          <RefrigerantSelect
            allowEmpty
            value={refrigerantType}
            onChange={setRefrigerantType}
          />
        </Field>
        <p className="text-xs text-slate-500">
          For equipment type, model, serial etc. edit the unit from the Sites tab after saving.
        </p>
        <Button type="submit" full>
          Add unit
        </Button>
      </form>
    </Modal>
  )
}

function BottleForm({
  open,
  title,
  types,
  bottle,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  title: string
  types: string[]
  bottle?: Bottle
  onClose: () => void
  onSave: (data: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>) => void
  onDelete?: () => void
}) {
  const { state } = useStore()
  const unit = state.unit
  const initialDisplay = (kg: number) =>
    kg ? kgToDisplay(kg, unit).toFixed(2) : ''

  const [bottleNumber, setBottleNumber] = useState(bottle?.bottleNumber ?? '')
  const [refrigerantType, setRefrigerantType] = useState(
    bottle?.refrigerantType ?? types[0] ?? 'R410A',
  )
  const [tareWeight, setTareWeight] = useState(initialDisplay(bottle?.tareWeight ?? 0))
  const [grossWeight, setGrossWeight] = useState(
    initialDisplay(bottle?.grossWeight ?? 0),
  )
  const [status, setStatus] = useState<BottleStatus>(bottle?.status ?? 'in_stock')
  const [currentSiteId, setCurrentSiteId] = useState(bottle?.currentSiteId ?? '')
  const [notes, setNotes] = useState(bottle?.notes ?? '')

  // "Manual capacity" only matters for bottles received partially used.
  // For the common case (fresh full bottle from supplier) capacity == net.
  const liveNetKgRaw =
    displayToKg(parseFloat(grossWeight) || 0, unit) -
    displayToKg(parseFloat(tareWeight) || 0, unit)
  const liveNet = Math.max(0, liveNetKgRaw)

  const [capacityWeight, setCapacityWeight] = useState(
    initialDisplay(bottle?.initialNetWeight ?? 0),
  )
  const [appliedPresetId, setAppliedPresetId] = useState('')

  // When the refrigerant changes AND a preset is applied, recompute safe
  // fill from the preset's water capacity × FR for the new refrigerant.
  // No-op if the user has manually edited tare/capacity (which clears
  // appliedPresetId).
  useEffect(() => {
    if (!appliedPresetId) return
    const preset = [
      ...BOTTLE_PRESETS,
      ...state.customBottlePresets.map((p) => ({ ...p, custom: true })),
    ].find((p) => p.id === appliedPresetId)
    if (!preset?.waterCapacityKg) return
    const newSafe = safeFillKgFor(preset.waterCapacityKg, refrigerantType)
    setCapacityWeight(kgToDisplay(newSafe, unit).toFixed(2))
  }, [refrigerantType, appliedPresetId, state.customBottlePresets, unit])

  const key = bottle?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
    setBottleNumber(bottle?.bottleNumber ?? '')
    setRefrigerantType(bottle?.refrigerantType ?? types[0] ?? 'R410A')
    setTareWeight(initialDisplay(bottle?.tareWeight ?? 0))
    setGrossWeight(initialDisplay(bottle?.grossWeight ?? 0))
    setStatus(bottle?.status ?? 'in_stock')
    setCurrentSiteId(bottle?.currentSiteId ?? '')
    setNotes(bottle?.notes ?? '')
    setCapacityWeight(initialDisplay(bottle?.initialNetWeight ?? 0))
    setAppliedPresetId('')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const tare = displayToKg(parseFloat(tareWeight) || 0, unit)
    const gross = displayToKg(parseFloat(grossWeight) || 0, unit)
    const currentNet = Math.max(0, gross - tare)
    const enteredCap = parseFloat(capacityWeight)
    const initialNet =
      enteredCap && enteredCap > 0
        ? displayToKg(enteredCap, unit)
        : currentNet
    onSave({
      bottleNumber: bottleNumber.trim(),
      refrigerantType,
      tareWeight: tare,
      grossWeight: gross,
      initialNetWeight: initialNet,
      status,
      currentSiteId: currentSiteId || undefined,
      notes: notes.trim() || undefined,
    })
  }

  function applyPreset(preset: BottlePreset) {
    setTareWeight(kgToDisplay(preset.tareKg, unit).toFixed(2))
    // Use the refrigerant-specific filling ratio when the preset has a
    // water capacity. Custom presets without a WC fall back to the
    // user-entered safeFillKg.
    const safeFill = preset.waterCapacityKg
      ? safeFillKgFor(preset.waterCapacityKg, refrigerantType)
      : (preset.safeFillKg ?? 0)
    setCapacityWeight(kgToDisplay(safeFill, unit).toFixed(2))
    setAppliedPresetId(preset.id)
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Cylinder preset"
          hint="Optional — tap to apply a standard size's tare and safe-fill capacity. Star presets you use often, or add your own."
        >
          <CylinderPresetSelect
            value={appliedPresetId}
            onApply={applyPreset}
            refrigerantType={refrigerantType}
          />
        </Field>

        <Field label="Bottle ID / number" hint="Label or serial of the bottle">
          <TextInput
            required
            value={bottleNumber}
            onChange={(e) => setBottleNumber(e.target.value)}
            placeholder="e.g. B-102"
          />
        </Field>
        <Field label="Refrigerant type">
          <RefrigerantSelect
            required
            value={refrigerantType}
            onChange={setRefrigerantType}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Tare (empty) ${unit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tareWeight}
              onChange={(e) => {
                setTareWeight(e.target.value)
                setAppliedPresetId('')
              }}
              placeholder="e.g. 5.20"
            />
          </Field>
          <Field label={`Gross (current) ${unit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={grossWeight}
              onChange={(e) => setGrossWeight(e.target.value)}
              placeholder="e.g. 16.30"
            />
          </Field>
        </div>

        {liveNet > 0 && (() => {
          const capacityKg = displayToKg(parseFloat(capacityWeight) || 0, unit)
          const over = capacityKg > 0 ? overfillKg(liveNet, capacityKg) : 0
          return (
            <div
              className={`rounded-xl p-3 text-sm ${
                over > 0
                  ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
                  : 'bg-brand-50 text-brand-900 dark:bg-brand-900/20 dark:text-brand-100'
              }`}
            >
              Net refrigerant in bottle:{' '}
              <strong>{formatWeight(liveNet, unit)}</strong>
              <div className="mt-0.5 text-xs">
                (gross − tare, calculated automatically)
              </div>
              {over > 0 && (
                <div className="mt-1 font-semibold">
                  ⚠ Over safe-fill limit by {formatWeight(over, unit)}
                </div>
              )}
            </div>
          )
        })()}

        <Field
          label={`Safe fill / cylinder capacity (${unit})`}
          hint="Auto-set when you pick a cylinder preset and a refrigerant. Edit to override. Used for the % remaining bar and the overfill warning."
        >
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.01"
            value={capacityWeight}
            onChange={(e) => {
              setCapacityWeight(e.target.value)
              setAppliedPresetId('')
            }}
            placeholder={`e.g. ${unit === 'kg' ? '11.10' : '24.47'}`}
          />
        </Field>

        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as BottleStatus)}
          >
            <option value="in_stock">In stock</option>
            <option value="on_site">On site</option>
            <option value="returned">Returned</option>
            <option value="empty">Empty</option>
          </Select>
        </Field>

        {status === 'on_site' && (
          <Field label="Current site">
            <Select
              value={currentSiteId}
              onChange={(e) => setCurrentSiteId(e.target.value)}
            >
              <option value="">— pick a site —</option>
              {state.sites.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button type="submit" full>
            Save
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
