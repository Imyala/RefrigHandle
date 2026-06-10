import { Link } from 'react-router-dom'
import { Card, Pill } from './ui'
import { useStore } from '../lib/store'
import { hydroStatusFor } from '../lib/types'

// Shared alert panel surfaced on both the Home and Log pages so a tech
// sees compliance warnings no matter which screen they land on. Today it
// covers AS 2030 cylinder hydrostatic test dates (overdue / due soon).
// Renders nothing when there's nothing to warn about.
export function Alerts() {
  const { state } = useStore()
  const { bottles } = state

  const hydroAlerts = bottles
    .map((b) => ({ b, h: hydroStatusFor(b) }))
    .filter((x) => x.h.status === 'overdue' || x.h.status === 'due_soon')
    .sort((a, b) => (a.h.monthsUntilDue ?? 0) - (b.h.monthsUntilDue ?? 0))

  if (hydroAlerts.length === 0) return null

  return (
    <Card className="!border-red-300 !bg-red-50 dark:!border-red-900/50 dark:!bg-red-900/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-red-900 dark:text-red-200">
          Cylinder hydrostatic test (AS 2030)
        </div>
        <Link
          to="/bottles"
          className="text-xs font-medium text-red-900 hover:underline dark:text-red-200"
        >
          View bottles
        </Link>
      </div>
      <p className="mt-1 text-xs text-red-900/80 dark:text-red-100/80">
        Don't take a non-compliant cylinder to a job — periodic test is
        mandatory under AS 2030.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {hydroAlerts.slice(0, 6).map(({ b, h }) => (
          <li
            key={b.id}
            className="flex items-center justify-between gap-2 text-red-900 dark:text-red-100"
          >
            <span>
              <strong>{b.bottleNumber}</strong> · {b.refrigerantType}
            </span>
            {h.status === 'overdue' ? (
              <Pill tone="red">
                Overdue {pluralMonths(Math.abs(h.monthsUntilDue ?? 0))}
              </Pill>
            ) : h.monthsUntilDue === 0 ? (
              <Pill tone="amber">Due this month</Pill>
            ) : (
              <Pill tone="amber">Due next month</Pill>
            )}
          </li>
        ))}
        {hydroAlerts.length > 6 && (
          <li className="text-xs text-red-900/70 dark:text-red-100/70">
            +{hydroAlerts.length - 6} more
          </li>
        )}
      </ul>
    </Card>
  )
}

function pluralMonths(n: number): string {
  return `${n} ${n === 1 ? 'month' : 'months'}`
}
