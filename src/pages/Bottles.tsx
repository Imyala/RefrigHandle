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
  REFRIGERANT_TYPES,
  netWeight,
  statusLabel,
} from '../lib/types'

const statusTone: Record<BottleStatus, 'green' | 'amber' | 'slate' | 'red'> = {
  in_stock: 'green',
  on_site: 'amber',
  returned: 'slate',
  empty: 'red',
}

export default function Bottles() {
  const { state, addBottle, updateBottle, deleteBottle } = useStore()
  const { bottles, locations, customRefrigerants } = state

  const [editing, setEditing] = useState<Bottle | null>(null)
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<'all' | BottleStatus>('all')

  const allTypes = useMemo(
    () => [...REFRIGERANT_TYPES, ...customRefrigerants],
    [customRefrigerants],
  )

  const visible = useMemo(
    () =>
      bottles
        .filter((b) => filter === 'all' || b.status === filter)
        .sort((a, b) => a.bottleNumber.localeCompare(b.bottleNumber)),
    [bottles, filter],
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Bottles
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'in_stock', 'on_site', 'returned', 'empty'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
              filter === f
                ? 'bg-brand-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            {f === 'all' ? 'All' : statusLabel(f)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={bottles.length === 0 ? 'No bottles yet' : 'No matches'}
          body={
            bottles.length === 0
              ? 'Add your first bottle to start tracking refrigerant.'
              : 'Try a different filter.'
          }
          action={
            bottles.length === 0 && (
              <Button onClick={() => setAdding(true)}>+ Add bottle</Button>
            )
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((b) => {
            const loc = locations.find((l) => l.id === b.currentLocationId)
            return (
              <Card key={b.id} className="!p-3">
                <button
                  className="flex w-full items-start justify-between gap-3 text-left"
                  onClick={() => setEditing(b)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {b.bottleNumber}
                      </span>
                      <Pill tone={statusTone[b.status]}>{statusLabel(b.status)}</Pill>
                    </div>
                    <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      {b.refrigerantType}
                      {loc ? ` · ${loc.name}` : ''}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {netWeight(b).toFixed(2)} kg
                    </div>
                    <div className="text-xs text-slate-500">
                      gross {b.grossWeight.toFixed(2)}
                    </div>
                  </div>
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <BottleForm
        open={adding}
        title="New bottle"
        types={allTypes}
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addBottle(data)
          setAdding(false)
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
        }}
        onDelete={
          editing
            ? () => {
                if (confirm('Delete this bottle and all its transactions?')) {
                  deleteBottle(editing.id)
                  setEditing(null)
                }
              }
            : undefined
        }
      />
    </div>
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
  const [bottleNumber, setBottleNumber] = useState(bottle?.bottleNumber ?? '')
  const [refrigerantType, setRefrigerantType] = useState(
    bottle?.refrigerantType ?? types[0] ?? 'R410A',
  )
  const [tareWeight, setTareWeight] = useState(String(bottle?.tareWeight ?? ''))
  const [grossWeight, setGrossWeight] = useState(String(bottle?.grossWeight ?? ''))
  const [initialNetWeight, setInitialNetWeight] = useState(
    String(bottle?.initialNetWeight ?? ''),
  )
  const [status, setStatus] = useState<BottleStatus>(bottle?.status ?? 'in_stock')
  const [currentLocationId, setCurrentLocationId] = useState(
    bottle?.currentLocationId ?? '',
  )
  const [notes, setNotes] = useState(bottle?.notes ?? '')

  // Reset on open
  const key = bottle?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
    setBottleNumber(bottle?.bottleNumber ?? '')
    setRefrigerantType(bottle?.refrigerantType ?? types[0] ?? 'R410A')
    setTareWeight(String(bottle?.tareWeight ?? ''))
    setGrossWeight(String(bottle?.grossWeight ?? ''))
    setInitialNetWeight(String(bottle?.initialNetWeight ?? ''))
    setStatus(bottle?.status ?? 'in_stock')
    setCurrentLocationId(bottle?.currentLocationId ?? '')
    setNotes(bottle?.notes ?? '')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const tare = parseFloat(tareWeight) || 0
    const gross = parseFloat(grossWeight) || 0
    const initialNet = parseFloat(initialNetWeight) || Math.max(0, gross - tare)
    onSave({
      bottleNumber: bottleNumber.trim(),
      refrigerantType,
      tareWeight: tare,
      grossWeight: gross,
      initialNetWeight: initialNet,
      status,
      currentLocationId: currentLocationId || undefined,
      notes: notes.trim() || undefined,
    })
  }

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
          <Field label="Tare (empty) kg">
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tareWeight}
              onChange={(e) => setTareWeight(e.target.value)}
              placeholder="e.g. 5.20"
            />
          </Field>
          <Field label="Gross (current) kg">
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

        <Field label="Initial net (when received) kg" hint="Optional — defaults to gross − tare">
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
            <option value="on_site">On site</option>
            <option value="returned">Returned</option>
            <option value="empty">Empty</option>
          </Select>
        </Field>

        {status === 'on_site' && (
          <Field label="Current site">
            <Select
              value={currentLocationId}
              onChange={(e) => setCurrentLocationId(e.target.value)}
            >
              <option value="">— pick a site —</option>
              {state.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
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
