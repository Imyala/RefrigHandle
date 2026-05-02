import { useMemo, useState } from 'react'
import { Button, Field, Modal, TextInput } from './ui'
import { useStore } from '../lib/store'
import {
  BOTTLE_PRESETS,
  FALLBACK_FR,
  fillingRatio,
  presetLabel,
  safeFillKgFor,
  type BottlePreset,
} from '../lib/types'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'

const triggerStyle =
  'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function CylinderPresetSelect({
  value,
  onApply,
  refrigerantType,
  placeholder = 'Pick a cylinder type',
}: {
  value?: string
  onApply: (preset: BottlePreset) => void
  refrigerantType?: string
  placeholder?: string
}) {
  const {
    state,
    addCustomBottlePreset,
    removeCustomBottlePreset,
    toggleFavoriteBottlePreset,
  } = useStore()
  const unit = state.unit
  const favorites = state.favoriteBottlePresets

  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)

  const allPresets: BottlePreset[] = useMemo(
    () => [
      ...BOTTLE_PRESETS,
      ...state.customBottlePresets.map((p) => ({ ...p, custom: true })),
    ],
    [state.customBottlePresets],
  )

  const sortedPresets = useMemo(() => {
    const fav = new Set(favorites)
    const favs = allPresets.filter((p) => fav.has(p.id))
    const rest = allPresets.filter((p) => !fav.has(p.id))
    return [...favs, ...rest]
  }, [allPresets, favorites])

  const selectedPreset = value
    ? allPresets.find((p) => p.id === value)
    : undefined
  const triggerText = selectedPreset
    ? presetLabel(selectedPreset, unit)
    : placeholder

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerStyle}
        aria-haspopup="dialog"
      >
        <span className={selectedPreset ? '' : 'text-slate-500'}>
          {triggerText}
        </span>
        <span aria-hidden className="text-slate-400">
          ▾
        </span>
      </button>

      <Modal open={open} title="Cylinder type" onClose={() => setOpen(false)}>
        <p className="mb-3 text-xs text-slate-500">
          Tap a row to apply tare and safe-fill capacity to the form. Tap the
          star to keep one at the top of the list.
        </p>
        {refrigerantType ? (
          <p className="mb-3 rounded-xl bg-slate-100 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Safe fill below is calculated for{' '}
            <strong>{refrigerantType}</strong> (FR{' '}
            {fillingRatio(refrigerantType).toFixed(2)}). Always verify against
            the FR stamped on the actual cylinder.
          </p>
        ) : (
          <p className="mb-3 rounded-xl bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            No refrigerant selected — safe fill below uses a conservative
            fallback (FR {FALLBACK_FR.toFixed(2)}). Pick a refrigerant first
            for a refrigerant-specific value.
          </p>
        )}
        {sortedPresets.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
            No saved cylinders yet. Tap{' '}
            <strong>Add custom cylinder</strong> below to save one — its tare
            and water capacity will be remembered for next time.
          </div>
        ) : (
          <div className="-mx-1 max-h-[60svh] overflow-y-auto">
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {sortedPresets.map((p) => {
              const starred = favorites.includes(p.id)
              const isCustom = p.custom === true
              const isSelected = value === p.id
              const display = presetLabel(p, unit)
              return (
                <div
                  key={p.id}
                  className={`flex items-stretch ${
                    isSelected ? 'bg-brand-50 dark:bg-brand-900/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFavoriteBottlePreset(p.id)}
                    className={`shrink-0 px-4 text-xl ${
                      starred
                        ? 'text-amber-500'
                        : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
                    }`}
                    aria-label={
                      starred ? `Unfavourite ${display}` : `Favourite ${display}`
                    }
                  >
                    {starred ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onApply(p)
                      setOpen(false)
                    }}
                    className="flex-1 px-3 py-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {display}
                      {isSelected && (
                        <span className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-400">
                          applied
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      Tare {formatWeight(p.tareKg, unit)} · Safe fill{' '}
                      {formatWeight(
                        p.waterCapacityKg
                          ? safeFillKgFor(p.waterCapacityKg, refrigerantType)
                          : (p.safeFillKg ?? 0),
                        unit,
                      )}
                      {p.waterCapacityKg && (
                        <>
                          {' '}· WC {formatWeight(p.waterCapacityKg, unit)}
                        </>
                      )}
                    </div>
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove "${display}" from your custom cylinders?`,
                          )
                        ) {
                          removeCustomBottlePreset(p.id)
                        }
                      }}
                      className="shrink-0 px-3 text-sm text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                      aria-label={`Delete ${display}`}
                      title="Delete custom preset"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
              })}
            </div>
          </div>
        )}

        <div className="mt-4">
          <Button full variant="secondary" onClick={() => setAdding(true)}>
            + Add custom cylinder
          </Button>
        </div>

        <div className="mt-2">
          <Button full variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <CustomPresetForm
        open={adding}
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addCustomBottlePreset(data)
          setAdding(false)
        }}
      />
    </>
  )
}

function CustomPresetForm({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Omit<BottlePreset, 'id' | 'custom'>) => void
}) {
  const { state } = useStore()
  const unit = state.unit
  const [name, setName] = useState('')
  const [tare, setTare] = useState('')
  const [waterCap, setWaterCap] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setName('')
    setTare('')
    setWaterCap('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const wcKg = displayToKg(parseFloat(waterCap) || 0, unit)
    onSave({
      label: name.trim(),
      tareKg: displayToKg(parseFloat(tare) || 0, unit),
      waterCapacityKg: wcKg,
      // Conservative fallback for the rare case the cylinder is used
      // without a refrigerant set — refrigerant-aware fill takes over
      // as soon as one is selected on the bottle.
      safeFillKg: safeFillKgFor(wcKg),
    })
  }

  // Live preview of the safe fill the picker will apply once this
  // cylinder is selected on a bottle. Uses the conservative fallback
  // here since we don't yet know which refrigerant will be in it.
  const wcKgPreview = displayToKg(parseFloat(waterCap) || 0, unit)
  const safePreview = wcKgPreview > 0 ? safeFillKgFor(wcKgPreview) : 0

  return (
    <Modal open={open} title="Custom cylinder" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="Name"
          hint="A label you'll recognise — supplier, size, anything"
        >
          <TextInput
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BOC 25 kg disposable"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={`Tare (${unit})`}
            hint="Empty cylinder weight stamped TW"
          >
            <TextInput
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tare}
              onChange={(e) => setTare(e.target.value)}
              placeholder={unit === 'kg' ? 'e.g. 7.60' : 'e.g. 16.75'}
            />
          </Field>
          <Field
            label={`Water capacity (${unit})`}
            hint="Stamped WC. Safe fill is calculated from this × the refrigerant's filling ratio."
          >
            <TextInput
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              value={waterCap}
              onChange={(e) => setWaterCap(e.target.value)}
              placeholder={unit === 'kg' ? 'e.g. 11.90' : 'e.g. 26.20'}
            />
          </Field>
        </div>
        {wcKgPreview > 0 && (
          <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            Safe fill at fallback FR (0.80, no refrigerant assumed):{' '}
            <strong>{(kgToDisplay(safePreview, unit)).toFixed(2)} {unit}</strong>
            <div className="mt-1">
              When you apply this preset to a bottle, the safe fill recalculates
              for that bottle's refrigerant (e.g. R-410A → ×0.94, R-32 → ×0.78).
            </div>
          </div>
        )}
        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}
