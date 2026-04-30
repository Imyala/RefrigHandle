import { useMemo, useState } from 'react'
import { Modal } from './ui'
import { useStore } from '../lib/store'
import { REFRIGERANT_TYPES, sortRefrigerants } from '../lib/types'

const inputStyle =
  'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function RefrigerantSelect({
  value,
  onChange,
  required = false,
  allowEmpty = false,
  emptyLabel = '— none —',
  placeholder = 'Pick refrigerant',
}: {
  value: string
  onChange: (value: string) => void
  required?: boolean
  allowEmpty?: boolean
  emptyLabel?: string
  placeholder?: string
}) {
  const { state, toggleFavoriteRefrigerant } = useStore()
  const favorites = state.favoriteRefrigerants
  const [open, setOpen] = useState(false)

  const allTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...state.customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [state.customRefrigerants, state.favoriteRefrigerants],
  )

  const display = value
    ? favorites.includes(value)
      ? `★ ${value}`
      : value
    : placeholder

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={inputStyle}
        aria-haspopup="dialog"
      >
        <span className={value ? '' : 'text-slate-500'}>{display}</span>
        <span aria-hidden className="text-slate-400">
          ▾
        </span>
      </button>

      {/* Hidden input to support native required validation */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => undefined}
          className="sr-only h-0 w-0 opacity-0"
        />
      )}

      <Modal open={open} title="Refrigerant" onClose={() => setOpen(false)}>
        <p className="mb-3 text-xs text-slate-500">
          Tap a row to select. Tap the star to keep it at the top of the list.
        </p>
        <div className="-mx-1 max-h-[60svh] overflow-y-auto">
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                className="block w-full px-3 py-3 text-left text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {emptyLabel}
              </button>
            )}
            {allTypes.map((t) => {
              const starred = favorites.includes(t)
              const selected = value === t
              return (
                <div
                  key={t}
                  className={`flex items-stretch ${
                    selected ? 'bg-brand-50 dark:bg-brand-900/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFavoriteRefrigerant(t)}
                    className={`shrink-0 px-4 text-xl ${
                      starred
                        ? 'text-amber-500'
                        : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
                    }`}
                    aria-label={starred ? `Unfavourite ${t}` : `Favourite ${t}`}
                    title={starred ? 'Unfavourite' : 'Favourite'}
                  >
                    {starred ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t)
                      setOpen(false)
                    }}
                    className="flex-1 px-3 py-3 text-left text-base font-medium text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    {t}
                    {selected && (
                      <span className="ml-2 text-xs font-normal text-brand-600 dark:text-brand-400">
                        selected
                      </span>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </Modal>
    </>
  )
}
