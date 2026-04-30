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
  transactionLabel,
} from '../lib/types'

const kindTone: Record<TransactionKind, 'green' | 'amber' | 'blue' | 'slate' | 'red'> = {
  charge: 'amber',
  recover: 'green',
  transfer: 'blue',
  return: 'slate',
  adjust: 'red',
}

export default function Transactions() {
  const { state, addTransaction, deleteTransaction } = useStore()
  const { bottles, locations, transactions } = state

  const [adding, setAdding] = useState(false)

  const sorted = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date)),
    [transactions],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Transaction log
        </h2>
        <Button onClick={() => setAdding(true)} disabled={bottles.length === 0}>
          + Log
        </Button>
      </div>

      {bottles.length === 0 ? (
        <EmptyState
          title="No bottles to log against"
          body="Add a bottle first, then come back to record charges, recoveries, transfers and returns."
        />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No transactions yet"
          body="Record refrigerant charged into equipment, recovered, transferred to a site, or returned to stock."
          action={<Button onClick={() => setAdding(true)}>+ Log first transaction</Button>}
        />
      ) : (
        <div className="space-y-2">
          {sorted.map((t) => {
            const bottle = bottles.find((b) => b.id === t.bottleId)
            const loc = locations.find((l) => l.id === t.locationId)
            return (
              <Card key={t.id} className="!p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone={kindTone[t.kind]}>{transactionLabel(t.kind)}</Pill>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {t.amount.toFixed(2)} kg
                      </span>
                      <span className="text-sm text-slate-500">
                        {bottle?.refrigerantType ?? '?'}
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      Bottle {bottle?.bottleNumber ?? '(deleted)'}
                      {loc ? ` · ${loc.name}` : ''}
                      {t.technician ? ` · ${t.technician}` : ''}
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(t.date).toLocaleString()} · gross{' '}
                      {t.weightBefore.toFixed(2)} → {t.weightAfter.toFixed(2)} kg
                    </div>
                    {t.notes && (
                      <div className="mt-1 text-xs italic text-slate-500">
                        {t.notes}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('Delete this transaction? Bottle weight will NOT auto-revert.')) {
                        deleteTransaction(t.id)
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
          if (result) setAdding(false)
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
    locationId?: string
    kind: TransactionKind
    amount: number
    date: string
    technician?: string
    notes?: string
  }) => void
}) {
  const { state } = useStore()
  const { bottles, locations, technician } = state

  const [bottleId, setBottleId] = useState(bottles[0]?.id ?? '')
  const [locationId, setLocationId] = useState('')
  const [kind, setKind] = useState<TransactionKind>('charge')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [tech, setTech] = useState(technician)
  const [notes, setNotes] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setBottleId(bottles[0]?.id ?? '')
    setLocationId('')
    setKind('charge')
    setAmount('')
    setDate(new Date().toISOString().slice(0, 16))
    setTech(technician)
    setNotes('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const bottle = bottles.find((b) => b.id === bottleId)
  const amountNum = parseFloat(amount) || 0
  let projectedAfter = bottle?.grossWeight ?? 0
  if (bottle) {
    if (kind === 'charge') projectedAfter = bottle.grossWeight - amountNum
    else if (kind === 'recover') projectedAfter = bottle.grossWeight + amountNum
    else if (kind === 'adjust') projectedAfter = bottle.grossWeight + amountNum
  }

  const showAmount = kind !== 'transfer' && kind !== 'return'
  const showLocation = kind !== 'adjust'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!bottleId) return
    onSave({
      bottleId,
      locationId: locationId || undefined,
      kind,
      amount: showAmount ? Math.abs(amountNum) : 0,
      date: new Date(date).toISOString(),
      technician: tech.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Modal open={open} title="Log transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Type">
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as TransactionKind)}
          >
            <option value="charge">Charge — into equipment (bottle ↓)</option>
            <option value="recover">Recover — from equipment (bottle ↑)</option>
            <option value="transfer">Transfer bottle to site</option>
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
                {b.bottleNumber} · {b.refrigerantType} · {b.grossWeight.toFixed(2)} kg gross
              </option>
            ))}
          </Select>
        </Field>

        {showLocation && (
          <Field label="Site">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              <option value="">— none —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {showAmount && (
          <Field
            label={kind === 'adjust' ? 'Adjustment kg (use − for removal)' : 'Amount kg'}
          >
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 1.25"
            />
          </Field>
        )}

        {bottle && showAmount && amountNum > 0 && (
          <div className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
            New gross weight: <strong>{Math.max(0, projectedAfter).toFixed(2)} kg</strong>
            <br />
            Net refrigerant:{' '}
            <strong>
              {Math.max(0, projectedAfter - bottle.tareWeight).toFixed(2)} kg
            </strong>
          </div>
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

        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}
