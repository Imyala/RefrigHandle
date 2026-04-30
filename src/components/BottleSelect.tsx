import { useState } from 'react'
import { Modal, Button } from './ui'
import { useStore } from '../lib/store'
import { netWeight, statusLabel } from '../lib/types'
import { formatWeight } from '../lib/units'

const triggerStyle =
  'flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-left text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function BottleSelect({
  value,
  onChange,
  excludeId,
  required = false,
  allowAddNew = false,
  onAddNew,
  placeholder = 'Pick a bottle',
  modalTitle = 'Pick a bottle',
}: {
  value: string
  onChange: (id: string) => void
  excludeId?: string
  required?: boolean
  allowAddNew?: boolean
  onAddNew?: () => void
  placeholder?: string
  modalTitle?: string
}) {
  const { state } = useStore()
  const [open, setOpen] = useState(false)

  const candidates = state.bottles.filter((b) => b.id !== excludeId)
  const selected = state.bottles.find((b) => b.id === value)

  const display = selected
    ? `${selected.bottleNumber} · ${selected.refrigerantType} · ${formatWeight(
        netWeight(selected),
        state.unit,
      )} net`
    : placeholder

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerStyle}
        aria-haspopup="dialog"
      >
        <span className={selected ? '' : 'text-slate-500'}>{display}</span>
        <span aria-hidden className="text-slate-400">
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

      <Modal open={open} title={modalTitle} onClose={() => setOpen(false)}>
        <div className="space-y-2">
          {candidates.length === 0 ? (
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">
              No other bottles available.
              {allowAddNew && ' Add one below.'}
            </div>
          ) : (
            candidates.map((b) => {
              const isSelected = value === b.id
              const net = netWeight(b)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onChange(b.id)
                    setOpen(false)
                  }}
                  className={`block w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? 'border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/30'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {b.bottleNumber}
                      </div>
                      <div className="text-sm text-slate-600 dark:text-slate-400">
                        {b.refrigerantType} · {statusLabel(b.status)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatWeight(net, state.unit)}
                      </div>
                      <div className="text-xs text-slate-500">net</div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {allowAddNew && onAddNew && (
          <div className="mt-4">
            <Button
              type="button"
              full
              variant="secondary"
              onClick={() => {
                setOpen(false)
                onAddNew()
              }}
            >
              + Add new bottle
            </Button>
          </div>
        )}
      </Modal>
    </>
  )
}
