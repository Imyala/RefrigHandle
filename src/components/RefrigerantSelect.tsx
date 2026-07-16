import { useMemo, useState } from 'react'
import { Button, Modal, TextInput } from './ui'
import { useStore } from '../lib/store'
import { REFRIGERANT_TYPES, safetyClassFor, sortRefrigerants } from '../lib/types'

const inputStyle =
  'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

// Safety class badge colours per ASHRAE 34 group
const SC_BADGE: Record<string, string> = {
  A2L: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  A3: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  B2L: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
}

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
  const [query, setQuery] = useState('')

  const allTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...state.customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [state.customRefrigerants, state.favoriteRefrigerants],
  )
  // Type-to-filter the (long) refrigerant list.
  const q = query.trim().toLowerCase()
  const visibleTypes = q
    ? allTypes.filter((t) => t.toLowerCase().includes(q))
    : allTypes

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

      <Modal
        open={open}
        title="Refrigerant"
        onClose={() => {
          setQuery('')
          setOpen(false)
        }}
      >
        <p className="mb-2 text-xs text-slate-500">
          Tap a row to select. Tap the star to keep it at the top of the list.
        </p>
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search refrigerant (e.g. R32, 410)"
          aria-label="Search refrigerant"
        />
        <div className="mt-3 -mx-1 max-h-[60svh] overflow-y-auto">
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {allowEmpty && !q && (
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
            {visibleTypes.length === 0 && (
              <div className="px-3 py-4 text-sm text-slate-500">
                No refrigerant matches “{query.trim()}”.
              </div>
            )}
            {visibleTypes.map((t) => {
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
                      setQuery('')
                      setOpen(false)
                    }}
                    className="flex-1 px-3 py-3 text-left text-base font-medium text-slate-900 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    {t}
                    {(() => {
                      const sc = safetyClassFor(t)
                      return sc && SC_BADGE[sc] ? (
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SC_BADGE[sc]}`}
                          title={`ASHRAE 34 safety class ${sc}`}
                        >
                          {sc}
                        </span>
                      ) : null
                    })()}
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

        <div className="mt-4">
          <Button full variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  )
}
