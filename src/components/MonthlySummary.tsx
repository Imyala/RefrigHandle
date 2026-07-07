import { useMemo } from 'react'
import { Card } from './ui'
import { CollapsibleSection } from './CollapsibleSection'
import { useStore } from '../lib/store'
import { monthlySummary } from '../lib/reports'
import { localDateTimeInput } from '../lib/datetime'
import { kgToDisplay } from '../lib/units'

// "Last month at a glance" — the four numbers an owner quotes to a
// partner, plus the one flag worth acting on. Hidden entirely for a
// month with no movements (a fresh install shouldn't see zeros).

export function MonthlySummaryCard() {
  const { state } = useStore()
  const today = localDateTimeInput(new Date(), state.location.timezone).slice(0, 10)
  const m = useMemo(() => monthlySummary(state, today), [state, today])
  if (!m) return null
  const unit = state.unit

  const stats: { label: string; value: string }[] = [
    { label: 'Charged', value: `${kgToDisplay(m.chargedKg, unit).toFixed(2)} ${unit}` },
    { label: 'Recovered', value: `${kgToDisplay(m.recoveredKg, unit).toFixed(2)} ${unit}` },
    { label: 'Purchased', value: `${kgToDisplay(m.purchasedKg, unit).toFixed(2)} ${unit}` },
    ...(m.soldKg > 0
      ? [{ label: 'Sold', value: `${kgToDisplay(m.soldKg, unit).toFixed(2)} ${unit}` }]
      : []),
  ]

  return (
    <CollapsibleSection
      title={`${m.monthLabel} at a glance`}
      storageKey="dashboard.month"
    >
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {s.label}
              </div>
              <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {s.value}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {m.movements === 1 ? '1 movement' : `${m.movements} movements`}
          {m.topSite
            ? ` · busiest site: ${m.topSite.name} (${m.topSite.movements})`
            : ''}
          {m.leakWatchUnits > 0
            ? ` · ${m.leakWatchUnits} unit${m.leakWatchUnits === 1 ? '' : 's'} on leak watch`
            : ''}
        </p>
      </Card>
    </CollapsibleSection>
  )
}
