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
  disabled?: boolean
  className?: string
  trailing?: ReactNode
}

const triggerStyle =
  'flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function Picker({
  value,
  onChange,
  options,
  title,
  placeholder = 'Select…',
  emptyLabel,
  emptyValue = '',
  required = false,
  disabled = false,
  className = '',
  trailing,
}: PickerProps) {
  const [open, setOpen] = useState(false)

  const allowEmpty = emptyLabel !== undefined

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  )

  const groups = useMemo(() => {
    const map = new Map<string, PickerOption[]>()
    for (const o of options) {
      const key = o.group ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return Array.from(map.entries())
  }, [options])

  const display =
    selected?.label ??
    (value === '' && allowEmpty ? emptyLabel : null) ??
    placeholder

  const isPlaceholder = !selected && !(value === '' && allowEmpty)

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        className={`${triggerStyle} ${className}`}
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

      <Modal open={open} title={title} onClose={() => setOpen(false)}>
        <div className="-mx-1 max-h-[65svh] overflow-y-auto">
          <div className="flex flex-col gap-1">
            {allowEmpty && (
              <PickerRow
                selected={value === emptyValue}
                onClick={() => {
                  onChange(emptyValue)
                  setOpen(false)
                }}
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
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    label={o.label}
                    hint={o.hint}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {trailing && <div className="mt-3">{trailing}</div>}

        <div className="mt-4">
          <Button full variant="secondary" onClick={() => setOpen(false)}>
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
