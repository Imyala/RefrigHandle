import { useState } from 'react'
import { Button, Field, Modal, TextInput } from './ui'
import { RefrigerantSelect } from './RefrigerantSelect'
import { ScanButton } from './ScanButton'
import { useStore } from '../lib/store'
import { displayToKg } from '../lib/units'
import {
  type Bottle,
  type Unit,
  isDuplicateActiveBottleNumber,
  isDuplicateBottleNumber,
} from '../lib/types'

// Lightweight "just the essentials" creators for a bottle and a unit,
// used inline from the logging flow (and the Bottles page) so a tech can
// add a missing cylinder / piece of equipment without leaving the form.
// Extracted from the Bottles page so the shared LogForm can reuse them
// without a circular import.

export function BottleQuickAdd({
  open,
  types,
  onClose,
  onCreate,
  onMoreDetails,
}: {
  open: boolean
  types: string[]
  onClose: () => void
  onCreate: (
    data: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>,
    customType?: string,
  ) => void
  // When provided, shows a "More fields" link that hands off to the full
  // bottle form (supplier, water capacity, test dates, status…).
  onMoreDetails?: () => void
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

  const tareKgPreview = displayToKg(parseFloat(tare) || 0, displayUnit)
  const grossKgPreview = displayToKg(parseFloat(gross) || 0, displayUnit)
  const tareExceedsGross =
    tareKgPreview > 0 &&
    grossKgPreview > 0 &&
    tareKgPreview > grossKgPreview + 0.01
  // Duplicate guards — two cylinders sharing a number makes the audit
  // trail ambiguous. A duplicate of an ACTIVE bottle is blocked; a
  // duplicate only of a returned cylinder is allowed (re-using its number
  // is legitimate) but still warned.
  const duplicateActive = isDuplicateActiveBottleNumber(
    state.bottles,
    bottleNumber,
  )
  const duplicateNumber =
    !duplicateActive && isDuplicateBottleNumber(state.bottles, bottleNumber)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (tareExceedsGross || duplicateActive) return
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
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                required
                autoFocus
                value={bottleNumber}
                onChange={(e) => setBottleNumber(e.target.value)}
                placeholder="e.g. B-205"
              />
            </div>
            <ScanButton
              title="Scan the cylinder barcode"
              onScan={setBottleNumber}
            />
          </div>
        </Field>
        {duplicateActive && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ An in-service bottle numbered{' '}
            <strong>{bottleNumber.trim()}</strong> already exists. Two active
            cylinders can't share a number — it makes every scan and search
            ambiguous. Use a different number, or return the existing one
            first.
          </div>
        )}
        {duplicateNumber && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            ⚠ This number matches a cylinder that's been returned. Re-using it
            is allowed, but double-check it's the right number.
          </div>
        )}
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
        {tareExceedsGross && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ Tare can't be more than gross — gross is the total bottle
            weight (tare + refrigerant).
          </div>
        )}
        <p className="text-xs text-slate-500">
          Just the essentials — you can add notes, status and current site by
          editing the bottle afterwards.
          {onMoreDetails && (
            <>
              {' '}
              <button
                type="button"
                onClick={onMoreDetails}
                className="font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                Need supplier, water capacity or test dates? More fields →
              </button>
            </>
          )}
        </p>
        <Button type="submit" full disabled={tareExceedsGross || duplicateActive}>
          {tareExceedsGross
            ? 'Tare exceeds gross'
            : duplicateActive
              ? 'Number already in use'
              : 'Add bottle'}
        </Button>
      </form>
    </Modal>
  )
}

export function UnitQuickAdd({
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
