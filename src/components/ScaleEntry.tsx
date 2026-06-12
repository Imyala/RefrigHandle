import { scaleDeltaKg, type TransactionKind, type WeightUnit } from '../lib/types'
import { displayToKg, formatWeight } from '../lib/units'
import { Field, TextInput } from './ui'

// Scale-reading entry for charge / recover / adjust. Techs read the
// bottle's NEW GROSS weight off the scale — making them do the
// subtraction in their head is both slow and the main source of
// arithmetic errors. In scale mode the tech types the reading and the
// app derives the moved amount. Shared between the quick-log form
// (Bottles) and the main Refrigerant Log form so the two can't drift.
// The delta maths lives in lib/types (scaleDeltaKg).

export type EntryMode = 'amount' | 'scale'

export function EntryModeToggle({
  mode,
  onChange,
}: {
  mode: EntryMode
  onChange: (m: EntryMode) => void
}) {
  return (
    <Field label="How do you want to enter it?">
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ['amount', 'Type the amount'],
            ['scale', 'New scale reading'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => onChange(val)}
            className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
              mode === val
                ? 'bg-brand-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </Field>
  )
}

export function ScaleReadingField({
  kind,
  unit,
  currentGrossKg,
  value,
  onChange,
}: {
  kind: TransactionKind
  unit: WeightUnit
  currentGrossKg: number
  value: string
  onChange: (v: string) => void
}) {
  const readingKg = displayToKg(parseFloat(value) || 0, unit)
  const delta = scaleDeltaKg(kind, currentGrossKg, readingKg)
  const invalid = value !== '' && kind !== 'adjust' && delta <= 0
  return (
    <>
      <Field
        label={`New gross weight (${unit})`}
        hint={`Current gross is ${formatWeight(currentGrossKg, unit)} — put the bottle on the scale and type the reading. The app works out the amount.`}
      >
        <TextInput
          type="number"
          inputMode="decimal"
          step="0.01"
          required
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 23.40"
        />
      </Field>
      {invalid && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
          {kind === 'charge'
            ? '⛔ A charge takes refrigerant OUT of the bottle — the new reading must be lower than the current gross.'
            : '⛔ A recovery puts refrigerant INTO the bottle — the new reading must be higher than the current gross.'}
        </div>
      )}
    </>
  )
}
