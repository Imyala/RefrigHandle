import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from './ui'
import { useStore } from '../lib/store'
import { quarterCloseStatus } from '../lib/reports'
import { localDateTimeInput } from '../lib/datetime'
import { QuarterlyReportModal } from './QuarterlyReport'

// The quarter-close ritual: in the last fortnight of each quarter this
// card walks the owner from "what's still loose" to "record ready —
// print or share it". Four guaranteed, satisfying sessions a year
// instead of a scramble when the permit-condition check letter lands.

export function QuarterCloseCard() {
  const { state } = useStore()
  const [reportOpen, setReportOpen] = useState(false)
  const today = localDateTimeInput(new Date(), state.location.timezone).slice(0, 10)
  const status = useMemo(() => quarterCloseStatus(state, today), [state, today])
  if (!status) return null

  const ready = status.items.length === 0
  const closes =
    status.daysLeft === 0
      ? 'closes today'
      : status.daysLeft === 1
        ? 'closes tomorrow'
        : `closes in ${status.daysLeft} days`

  return (
    <Card
      className={
        ready
          ? '!border-emerald-300 !bg-emerald-50 dark:!border-emerald-900/50 dark:!bg-emerald-900/20'
          : '!border-amber-300 !bg-amber-50 dark:!border-amber-800 dark:!bg-amber-900/20'
      }
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {status.quarterLabelText} {closes}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {status.movements === 1
            ? '1 movement logged'
            : `${status.movements} movements logged`}
        </span>
      </div>

      {ready ? (
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
          Nothing outstanding — the quarterly record is ready to print or
          share{status.movements === 0 ? ' (a nil return is still a record)' : ''}.
        </p>
      ) : (
        <ul className="mb-3 space-y-1">
          {status.items.map((i) => (
            <li key={i.id}>
              <Link
                to={i.to}
                className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-amber-900 hover:underline dark:text-amber-200"
              >
                <span aria-hidden>⚠</span> {i.label} →
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant={ready ? 'primary' : 'secondary'}
        onClick={() => setReportOpen(true)}
      >
        Open quarterly record
      </Button>
      {reportOpen && (
        <QuarterlyReportModal onClose={() => setReportOpen(false)} />
      )}
    </Card>
  )
}
