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
  type TransactionKind,
  type TransactionReason,
  REASON_LABELS,
  transactionLabel,
} from '../lib/types'
import { useToast } from '../lib/toast'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { ScaleButton } from '../components/ScaleButton'
import { PhotoPicker, Thumbnail } from '../components/PhotoPicker'

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
  const { bottles, jobs, transactions, unit } = state
  const toast = useToast()

  const [adding, setAdding] = useState(false)
  const [filterKind, setFilterKind] = useState<'all' | TransactionKind>('all')

  const sorted = useMemo(
    () =>
      [...transactions]
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
            const job = jobs.find((j) => j.id === t.jobId)
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
                      🛢 {bottle?.bottleNumber ?? '(deleted)'}
                      {job ? ` · 📍 ${job.name}` : ''}
                    </div>
                    {(t.equipment || t.reason) && (
                      <div className="text-xs text-slate-500">
                        {t.equipment && `🔧 ${t.equipment}`}
                        {t.equipment && t.reason && ' · '}
                        {t.reason && REASON_LABELS[t.reason]}
                      </div>
                    )}
                    <div className="text-xs text-slate-500">
                      {new Date(t.date).toLocaleString()}
                      {t.technician && ` · ${t.technician}`}
                      {t.amount > 0 && (
                        <>
                          {' · '}gross {kgToDisplay(t.weightBefore, unit).toFixed(2)} →{' '}
                          {formatWeight(t.weightAfter, unit)}
                        </>
                      )}
                    </div>
                    {t.notes && (
                      <div className="mt-1 text-xs italic text-slate-500">
                        “{t.notes}”
                      </div>
                    )}
                    {t.photoIds && t.photoIds.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {t.photoIds.map((p) => (
                          <Thumbnail key={p} id={p} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (
                        confirm(
                          'Delete this transaction? Bottle weight will NOT auto-revert.',
                        )
                      ) {
                        deleteTransaction(t.id)
                        toast.show('Transaction deleted', 'info')
                      }
                    }}
                    className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                    aria-label="Delete"
                  >
                    🗑
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
    jobId?: string
    kind: TransactionKind
    amount: number
    date: string
    technician?: string
    equipment?: string
    reason?: TransactionReason
    notes?: string
    photoIds?: string[]
  }) => void
}) {
  const { state } = useStore()
  const { bottles, jobs, technician, unit } = state

  const [bottleId, setBottleId] = useState(bottles[0]?.id ?? '')
  const [jobId, setJobId] = useState('')
  const [kind, setKind] = useState<TransactionKind>('charge')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [tech, setTech] = useState(technician)
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  const [notes, setNotes] = useState('')
  const [photoIds, setPhotoIds] = useState<string[]>([])

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setBottleId(bottles[0]?.id ?? '')
    setJobId('')
    setKind('charge')
    setAmount('')
    setDate(new Date().toISOString().slice(0, 16))
    setTech(technician)
    setEquipment('')
    setReason('')
    setNotes('')
    setPhotoIds([])
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const bottle = bottles.find((b) => b.id === bottleId)
  const enteredAmount = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmount, unit)
  let projectedAfter = bottle?.grossWeight ?? 0
  if (bottle) {
    if (kind === 'charge') projectedAfter = bottle.grossWeight - amountKg
    else if (kind === 'recover') projectedAfter = bottle.grossWeight + amountKg
    else if (kind === 'adjust') projectedAfter = bottle.grossWeight + amountKg
  }

  const showAmount = kind !== 'transfer' && kind !== 'return'
  const showJob = kind !== 'adjust'
  const showCompliance = kind === 'charge' || kind === 'recover'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!bottleId) return
    const signedAmountKg = kind === 'adjust' ? amountKg : Math.abs(amountKg)
    onSave({
      bottleId,
      jobId: jobId || undefined,
      kind,
      amount: showAmount ? signedAmountKg : 0,
      date: new Date(date).toISOString(),
      technician: tech.trim() || undefined,
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      notes: notes.trim() || undefined,
      photoIds: photoIds.length > 0 ? photoIds : undefined,
    })
  }

  return (
    <Modal open={open} title="Log transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="What happened?">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as TransactionKind)}
          >
            <option value="charge">Charge — into equipment (bottle ↓)</option>
            <option value="recover">Recover — from equipment (bottle ↑)</option>
            <option value="transfer">Transfer bottle to a job</option>
            <option value="return">Return bottle to stock/supplier</option>
            <option value="adjust">Manual adjust (signed)</option>
          </Select>
        </Field>

        <Field label="Bottle">
          <Select
            required
            value={bottleId}
            onChange={(e) => setBottleId(e.target.value)}
          >
            <option value="">— pick a bottle —</option>
            {bottles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bottleNumber} · {b.refrigerantType} ·{' '}
                {formatWeight(b.grossWeight, unit)} gross
              </option>
            ))}
          </Select>
        </Field>

        {showJob && (
          <Field label="Job">
            <Select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              required={kind === 'transfer'}
            >
              <option value="">— none —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {showAmount && (
          <Field
            label={
              kind === 'adjust'
                ? `Adjustment ${unit} (use − for removal)`
                : `Amount ${unit}`
            }
          >
            <div className="flex gap-2">
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1.25"
              />
              {bottle && (kind === 'charge' || kind === 'recover') && (
                <ScaleButton
                  onWeightKg={(kg) => {
                    const delta = Math.abs(kg - bottle.grossWeight)
                    setAmount(kgToDisplay(delta, unit).toFixed(2))
                  }}
                />
              )}
            </div>
          </Field>
        )}

        {bottle && showAmount && enteredAmount !== 0 && (
          <div className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900 dark:bg-brand-900/20 dark:text-brand-100">
            New gross weight:{' '}
            <strong>{formatWeight(Math.max(0, projectedAfter), unit)}</strong>
            <br />
            Net refrigerant:{' '}
            <strong>
              {formatWeight(
                Math.max(0, projectedAfter - bottle.tareWeight),
                unit,
              )}
            </strong>
          </div>
        )}

        {showCompliance && (
          <>
            <Field
              label="Equipment"
              hint="Helps with F-Gas log e.g. 'Daikin VRV unit #3'"
            >
              <TextInput
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="e.g. Chiller AHU-2"
              />
            </Field>
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

        <Field label="Date / time">
          <TextInput
            type="datetime-local"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>

        <Field label="Technician">
          <TextInput value={tech} onChange={(e) => setTech(e.target.value)} />
        </Field>

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Field label="Photos" hint="Optional — gauges, equipment plate, leak check">
          <PhotoPicker photoIds={photoIds} onChange={setPhotoIds} />
        </Field>

        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}
