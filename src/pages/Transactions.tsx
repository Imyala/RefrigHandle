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
                    <div className="text-xs text-slate-500">
                      {new Date(t.date).toLocaleString()}
                      {t.technician && ` · ${t.technician}`}
                      {t.amount > 0 && (
                        <>
                          {' · '}gross {kgToDisplay(t.weightBefore, unit).toFixed(2)} to{' '}
                          {formatWeight(t.weightAfter, unit)}
                        </>
                      )}
                    </div>
                    {t.notes && (
                      <div className="mt-1 text-xs italic text-slate-500">
                        “{t.notes}”
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
    date: string
    technician?: string
    equipment?: string
    reason?: TransactionReason
    notes?: string
  }) => void
}) {
  const { state } = useStore()
  const { bottles, sites, technician, unit } = state

  const [bottleId, setBottleId] = useState(bottles[0]?.id ?? '')
  const [siteId, setSiteId] = useState('')
  const [unitId, setUnitId] = useState('')
  const [kind, setKind] = useState<TransactionKind>('charge')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [tech, setTech] = useState(technician)
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  const [notes, setNotes] = useState('')

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
    setDate(new Date().toISOString().slice(0, 16))
    setTech(technician)
    setEquipment('')
    setReason('')
    setNotes('')
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
  const showSite = kind !== 'adjust'
  const showCompliance = kind === 'charge' || kind === 'recover'

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!bottleId) return
    const signedAmountKg = kind === 'adjust' ? amountKg : Math.abs(amountKg)
    onSave({
      bottleId,
      siteId: siteId || undefined,
      unitId: unitId || undefined,
      kind,
      amount: showAmount ? signedAmountKg : 0,
      date: new Date(date).toISOString(),
      technician: tech.trim() || undefined,
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      notes: notes.trim() || undefined,
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
            <option value="charge">Charge — into equipment (bottle weight decreases)</option>
            <option value="recover">Recover — from equipment (bottle weight increases)</option>
            <option value="transfer">Transfer bottle to a site</option>
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
                {sites.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </Select>
            </Field>
            {(kind === 'charge' || kind === 'recover') && siteUnits.length > 0 && (
              <Field
                label="Unit (optional)"
                hint="Pick the equipment this charge applies to"
              >
                <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <option value="">— none —</option>
                  {siteUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.refrigerantType ? ` (${u.refrigerantType})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </>
        )}

        {showAmount && (
          <Field
            label={
              kind === 'adjust'
                ? `Adjustment ${unit} (use − for removal)`
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
              placeholder="e.g. 1.25"
            />
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

        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}
