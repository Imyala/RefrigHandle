import { useMemo, useState } from 'react'
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
  type BottleStatus,
  type TransactionKind,
  type TransactionReason,
  REFRIGERANT_TYPES,
  REASON_LABELS,
  netWeight,
  statusLabel,
  transactionLabel,
} from '../lib/types'
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
  const { bottles, jobs, customRefrigerants, unit } = state
  const toast = useToast()

  const [editing, setEditing] = useState<Bottle | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | BottleStatus>('all')
  const [query, setQuery] = useState('')

  // Action sheet — primary tap target
  const [sheetBottle, setSheetBottle] = useState<Bottle | null>(null)
  const [logKind, setLogKind] = useState<TransactionKind | null>(null)

  const allTypes = useMemo(
    () => [...REFRIGERANT_TYPES, ...customRefrigerants],
    [customRefrigerants],
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
            const job = jobs.find((j) => j.id === b.currentJobId)
            const net = netWeight(b)
            const initialNet = b.initialNetWeight || 0
            const pct =
              initialNet > 0 ? Math.min(100, Math.max(0, (net / initialNet) * 100)) : 0
            return (
              <Card key={b.id} className="!p-3">
                <button
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => setSheetBottle(b)}
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
                    </div>
                    {job && (
                      <div className="mt-1 text-sm text-slate-500">
                        📍 {job.name}
                      </div>
                    )}
                    {initialNet > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-brand-500"
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
        onClose={() => setSheetBottle(null)}
        onLog={(kind) => setLogKind(kind)}
        onEdit={() => {
          if (sheetBottle) {
            setEditing(sheetBottle)
            setSheetBottle(null)
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
            setSheetBottle(null)
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
  const job = state.jobs.find((j) => j.id === bottle.currentJobId)
  const net = netWeight(bottle)
  const history = state.transactions
    .filter((t) => t.bottleId === bottle.id)
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
          {job && (
            <div className="mt-1 text-sm text-brand-100">📍 {job.name}</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onLog('charge')} variant="primary">
            ↓ Charge
          </Button>
          <Button onClick={() => onLog('recover')} variant="primary">
            ↑ Recover
          </Button>
          <Button onClick={() => onLog('transfer')} variant="secondary">
            → Transfer to job
          </Button>
          <Button onClick={() => onLog('return')} variant="secondary">
            ⤴ Return bottle
          </Button>
        </div>

        <Button onClick={onEdit} variant="ghost" full>
          ✎ Edit details
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
                const j = state.jobs.find((x) => x.id === t.jobId)
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
    jobId?: string
    kind: TransactionKind
    amount: number
    date: string
    technician?: string
    equipment?: string
    reason?: TransactionReason
    notes?: string
  }) => void
}) {
  const { state } = useStore()
  const unit = state.unit
  const [amount, setAmount] = useState('')
  const [jobId, setJobId] = useState(bottle?.currentJobId ?? '')
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))

  const lastKey = `${bottle?.id}-${kind}-${open}`
  const [seenKey, setSeenKey] = useState('')
  if (open && seenKey !== lastKey) {
    setSeenKey(lastKey)
    setAmount('')
    setJobId(bottle?.currentJobId ?? '')
    setEquipment('')
    setReason('')
    setNotes('')
    setDate(new Date().toISOString().slice(0, 16))
  }

  if (!open || !bottle || !kind) return null

  const showAmount = kind === 'charge' || kind === 'recover'
  const showJob = kind !== 'return'
  const enteredAmountDisplay = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmountDisplay, unit)
  const projectedAfter =
    kind === 'charge'
      ? bottle.grossWeight - amountKg
      : kind === 'recover'
        ? bottle.grossWeight + amountKg
        : bottle.grossWeight
  const projectedNet = Math.max(0, projectedAfter - bottle.tareWeight)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!kind || !bottle) return
    onSave({
      bottleId: bottle.id,
      jobId: showJob && jobId ? jobId : undefined,
      kind,
      amount: showAmount ? Math.abs(amountKg) : 0,
      date: new Date(date).toISOString(),
      technician: state.technician || undefined,
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const titleMap: Record<TransactionKind, string> = {
    charge: 'Charge into equipment',
    recover: 'Recover from equipment',
    transfer: 'Transfer bottle to a job',
    return: 'Return bottle to stock',
    adjust: 'Manual adjustment',
  }

  return (
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

        {showAmount && (
          <Field
            label={
              kind === 'charge'
                ? `How much charged in? (${unit})`
                : `How much recovered? (${unit})`
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
              placeholder="e.g. 1.25"
            />
          </Field>
        )}

        {showAmount && enteredAmountDisplay > 0 && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-900/20 dark:text-brand-100">
            New bottle net: <strong>{formatWeight(projectedNet, unit)}</strong>
            {projectedAfter < bottle.tareWeight && (
              <span className="ml-2 text-red-600 dark:text-red-300">
                ⚠ goes below tare
              </span>
            )}
          </div>
        )}

        {showJob && (
          <Field label="Job">
            <Select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              required={kind === 'transfer'}
            >
              <option value="">— none —</option>
              {state.jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {(kind === 'charge' || kind === 'recover') && (
          <>
            <Field label="Equipment" hint="Helps with F-Gas log e.g. 'Daikin VRV unit #3'">
              <TextInput
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="e.g. Chiller AHU-2"
              />
            </Field>
            <Field label="Reason">
              <Select
                value={reason}
                onChange={(e) => setReason(e.target.value as TransactionReason | '')}
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

        <Button type="submit" full>
          Save
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
  const [initialNetWeight, setInitialNetWeight] = useState(
    initialDisplay(bottle?.initialNetWeight ?? 0),
  )
  const [status, setStatus] = useState<BottleStatus>(bottle?.status ?? 'in_stock')
  const [currentJobId, setCurrentJobId] = useState(bottle?.currentJobId ?? '')
  const [notes, setNotes] = useState(bottle?.notes ?? '')

  const key = bottle?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
    setBottleNumber(bottle?.bottleNumber ?? '')
    setRefrigerantType(bottle?.refrigerantType ?? types[0] ?? 'R410A')
    setTareWeight(initialDisplay(bottle?.tareWeight ?? 0))
    setGrossWeight(initialDisplay(bottle?.grossWeight ?? 0))
    setInitialNetWeight(initialDisplay(bottle?.initialNetWeight ?? 0))
    setStatus(bottle?.status ?? 'in_stock')
    setCurrentJobId(bottle?.currentJobId ?? '')
    setNotes(bottle?.notes ?? '')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const tare = displayToKg(parseFloat(tareWeight) || 0, unit)
    const gross = displayToKg(parseFloat(grossWeight) || 0, unit)
    const initialNet = parseFloat(initialNetWeight)
      ? displayToKg(parseFloat(initialNetWeight), unit)
      : Math.max(0, gross - tare)
    onSave({
      bottleNumber: bottleNumber.trim(),
      refrigerantType,
      tareWeight: tare,
      grossWeight: gross,
      initialNetWeight: initialNet,
      status,
      currentJobId: currentJobId || undefined,
      notes: notes.trim() || undefined,
    })
  }

  const liveNetKg =
    displayToKg(parseFloat(grossWeight) || 0, unit) -
    displayToKg(parseFloat(tareWeight) || 0, unit)
  const liveNet = Math.max(0, liveNetKg)

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Bottle ID / number" hint="Label or serial of the bottle">
          <TextInput
            required
            value={bottleNumber}
            onChange={(e) => setBottleNumber(e.target.value)}
            placeholder="e.g. B-102"
          />
        </Field>
        <Field label="Refrigerant type">
          <Select
            value={refrigerantType}
            onChange={(e) => setRefrigerantType(e.target.value)}
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Tare (empty) ${unit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tareWeight}
              onChange={(e) => setTareWeight(e.target.value)}
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

        {liveNet > 0 && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-900/20 dark:text-brand-100">
            Net refrigerant in bottle: <strong>{formatWeight(liveNet, unit)}</strong>
          </div>
        )}

        <Field
          label={`Initial net (when received) ${unit}`}
          hint="Optional — used for the fill-level bar. Defaults to gross − tare."
        >
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.01"
            value={initialNetWeight}
            onChange={(e) => setInitialNetWeight(e.target.value)}
            placeholder="e.g. 11.10"
          />
        </Field>

        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as BottleStatus)}
          >
            <option value="in_stock">In stock</option>
            <option value="on_site">On job</option>
            <option value="returned">Returned</option>
            <option value="empty">Empty</option>
          </Select>
        </Field>

        {status === 'on_site' && (
          <Field label="Current job">
            <Select
              value={currentJobId}
              onChange={(e) => setCurrentJobId(e.target.value)}
            >
              <option value="">— pick a job —</option>
              {state.jobs.map((j) => (
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
