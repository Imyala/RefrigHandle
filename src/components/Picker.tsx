import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Modal } from './ui'

export interface PickerOption {
  value: string
  label: string
  hint?: string
  group?: string
}

interface PickerProps {
  value: string
  onChange: (value: string) => void
  options: readonly PickerOption[]
  title: string
  placeholder?: string
  emptyLabel?: string
  emptyValue?: string
  required?: boolean
  // When true the trigger shows a red border — used for required-field
  // validation (e.g. first-run setup) the same way TextInput does.
  invalid?: boolean
  disabled?: boolean
  // Show a type-to-filter search box at the top of the list. Defaults to
  // automatic: shown once the list is long enough to be worth filtering
  // (see SEARCH_THRESHOLD), hidden on short pickers. Pass an explicit
  // boolean to force it on or off.
  searchable?: boolean
  className?: string
  trailing?: ReactNode
}

// Lists at or above this many options get a search box by default.
const SEARCH_THRESHOLD = 8

// Border/focus colours are split from the structural classes so the
// invalid (red) variant cleanly replaces the normal one — see the same
// note in ui.tsx.
const triggerBase =
  'flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-3 py-3 text-base text-left text-slate-900 outline-none transition disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100'
const triggerNormal =
  'border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700'
const triggerInvalid =
  'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70'

export function Picker({
  value,
  onChange,
  options,
  title,
  placeholder = 'Select…',
  emptyLabel,
  emptyValue = '',
  required = false,
  invalid = false,
  disabled = false,
  searchable,
  className = '',
  trailing,
}: PickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const allowEmpty = emptyLabel !== undefined
  const showSearch = searchable ?? options.length >= SEARCH_THRESHOLD

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  )

  // Type-to-filter: case-insensitive substring match on the label (and
  // hint, so e.g. a refrigerant's note is searchable too).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.hint ? o.hint.toLowerCase().includes(q) : false),
    )
  }, [options, query])

  const groups = useMemo(() => {
    const map = new Map<string, PickerOption[]>()
    for (const o of filtered) {
      const key = o.group ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return Array.from(map.entries())
  }, [filtered])

  const display =
    selected?.label ??
    (value === '' && allowEmpty ? emptyLabel : null) ??
    placeholder

  const isPlaceholder = !selected && !(value === '' && allowEmpty)

  function openPicker() {
    if (disabled) return
    setQuery('')
    setOpen(true)
  }
  function close() {
    setOpen(false)
    setQuery('')
  }
  function pick(v: string) {
    onChange(v)
    close()
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={`${triggerBase} ${invalid ? triggerInvalid : triggerNormal} ${className}`}
        disabled={disabled}
        aria-haspopup="dialog"
      >
        <span
          className={`min-w-0 truncate ${isPlaceholder ? 'text-slate-500' : ''}`}
        >
          {display}
        </span>
        <ChevronDown />
      </button>

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

      <Modal open={open} title={title} onClose={close}>
        {showSearch && (
          <div className="mb-2">
            <div className="relative">
              <SearchIcon />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    // Enter picks the first match — fast keyboard entry,
                    // and stops the keystroke submitting an outer form.
                    e.preventDefault()
                    if (filtered.length > 0) pick(filtered[0].value)
                  }
                }}
                placeholder={`Search ${title.toLowerCase()}`}
                aria-label={`Search ${title.toLowerCase()}`}
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        <div className="-mx-1 max-h-[60svh] overflow-y-auto">
          <div className="flex flex-col gap-1">
            {/* The "none" row only makes sense when not actively searching. */}
            {allowEmpty && query.trim() === '' && (
              <PickerRow
                selected={value === emptyValue}
                onClick={() => pick(emptyValue)}
                label={emptyLabel!}
                muted
              />
            )}

            {groups.map(([groupName, items], gi) => (
              <div key={groupName || `g-${gi}`} className="flex flex-col gap-1">
                {groupName && (
                  <div className="mt-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    {groupName}
                  </div>
                )}
                {items.map((o) => (
                  <PickerRow
                    key={o.value}
                    selected={value === o.value}
                    onClick={() => pick(o.value)}
                    label={o.label}
                    hint={o.hint}
                  />
                ))}
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                No matches for “{query.trim()}”.
              </div>
            )}
          </div>
        </div>

        {trailing && <div className="mt-3">{trailing}</div>}

        <div className="mt-4">
          <Button full variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  )
}

function PickerRow({
  selected,
  onClick,
  label,
  hint,
  muted,
}: {
  selected: boolean
  onClick: () => void
  label: string
  hint?: string
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-xl px-3.5 py-3 text-left transition active:scale-[0.99] ${
        selected
          ? 'bg-brand-50 ring-1 ring-brand-500/40 dark:bg-brand-500/15 dark:ring-brand-400/40'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/70'
      }`}
    >
      {selected && (
        <span
          aria-hidden
          className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-500 dark:bg-brand-400"
        />
      )}
      <div className="min-w-0 flex-1">
        <div
          className={`text-[15px] leading-tight ${
            muted
              ? 'text-slate-500 dark:text-slate-400'
              : selected
                ? 'font-semibold text-brand-700 dark:text-brand-200'
                : 'font-medium text-slate-900 dark:text-slate-100'
          }`}
        >
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {hint}
          </div>
        )}
      </div>
      {selected ? (
        <Checkmark />
      ) : (
        <span aria-hidden className="h-5 w-5 shrink-0" />
      )}
    </button>
  )
}

function Checkmark() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}

function ChevronDown() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}
