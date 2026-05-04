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
  'flex w-full items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

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
        <span aria-hidden className="shrink-0 text-slate-400">
          ▾
        </span>
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
        <div className="-mx-1 max-h-[60svh] overflow-y-auto">
          <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
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
              <div key={groupName || `g-${gi}`}>
                {groupName && (
                  <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
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
      className={`flex w-full items-center justify-between gap-3 px-3 py-3 text-left transition ${
        selected
          ? 'bg-brand-50 dark:bg-brand-900/30'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`text-base ${
            muted
              ? 'text-slate-500 dark:text-slate-400'
              : selected
                ? 'font-medium text-slate-900 dark:text-slate-100'
                : 'text-slate-900 dark:text-slate-100'
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
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
          selected
            ? 'border-brand-500 bg-brand-500 text-white'
            : 'border-slate-300 dark:border-slate-600'
        }`}
      >
        {selected && (
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5l3.5 3.5L13 5" />
          </svg>
        )}
      </span>
    </button>
  )
}
