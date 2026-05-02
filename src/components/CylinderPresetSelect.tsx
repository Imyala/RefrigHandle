import { useMemo, useState } from 'react'
import { Button, Field, Modal, TextInput } from './ui'
import { useStore } from '../lib/store'
import { BOTTLE_PRESETS, type BottlePreset } from '../lib/types'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'

const triggerStyle =
  'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function CylinderPresetSelect({
  onApply,
  placeholder = 'Pick a cylinder type',
}: {
  onApply: (preset: BottlePreset) => void
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerStyle}
        aria-haspopup="dialog"
      >
        <span className="text-slate-500">{placeholder}</span>
        <span aria-hidden className="text-slate-400">
          ▾
        </span>
      </button>

      <Modal open={open} title="Cylinder type" onClose={() => setOpen(false)}>
        <p className="mb-3 text-xs text-slate-500">
          Tap a row to apply tare and safe-fill capacity to the form. Tap the
          star to keep one at the top of the list.
        </p>
        <div className="-mx-1 max-h-[60svh] overflow-y-auto">
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {sortedPresets.map((p) => {
              const starred = favorites.includes(p.id)
              const isCustom = p.custom === true
              return (
                <div key={p.id} className="flex items-stretch">
                  <button
                    type="button"
                    onClick={() => toggleFavoriteBottlePreset(p.id)}
                    className={`shrink-0 px-4 text-xl ${
                      starred
                        ? 'text-amber-500'
                        : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
                    }`}
                    aria-label={
                      starred ? `Unfavourite ${p.label}` : `Favourite ${p.label}`
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
                      {p.label}
                    </div>
                    <div className="text-xs text-slate-500">
                      Tare {formatWeight(p.tareKg, unit)} · Safe fill{' '}
                      {formatWeight(p.safeFillKg, unit)}
                    </div>
                  </button>
                  {isCustom && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Remove "${p.label}" from your custom cylinders?`,
                          )
                        ) {
                          removeCustomBottlePreset(p.id)
                        }
                      }}
                      className="shrink-0 px-3 text-sm text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                      aria-label={`Delete ${p.label}`}
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
  const [safeFill, setSafeFill] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setName('')
    setTare('')
    setSafeFill('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      label: name.trim(),
      tareKg: displayToKg(parseFloat(tare) || 0, unit),
      safeFillKg: displayToKg(parseFloat(safeFill) || 0, unit),
    })
  }

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
          <Field label={`Tare (${unit})`}>
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
            label={`Safe fill (${unit})`}
            hint="Max refrigerant load — typically 80 % of water capacity"
          >
            <TextInput
              required
              type="number"
              inputMode="decimal"
              step="0.01"
              value={safeFill}
              onChange={(e) => setSafeFill(e.target.value)}
              placeholder={unit === 'kg' ? 'e.g. 9.52' : 'e.g. 21.00'}
            />
          </Field>
        </div>
        {tare !== '' && safeFill !== '' && (
          <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            Implied gross when full:{' '}
            {(
              kgToDisplay(
                displayToKg(parseFloat(tare) || 0, unit) +
                  displayToKg(parseFloat(safeFill) || 0, unit),
                unit,
              )
            ).toFixed(2)}{' '}
            {unit}
          </div>
        )}
        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}
