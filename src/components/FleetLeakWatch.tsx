import { Link } from 'react-router-dom'
import { Card, Pill } from './ui'
import { useStore } from '../lib/store'
import { leakStatusFor, siteLabel } from '../lib/types'
import { formatWeight } from '../lib/units'

// Fleet-wide leak insight for the supervisor: every active unit topped up
// above the AIRAH DA19 threshold over the trailing 12 months, ranked worst
// first. The per-unit leak rate is data no spreadsheet produces — surfacing
// it across the whole fleet on the home screen turns compliance data into a
// "which assets are leaking / should be replaced" decision. Renders nothing
// when the fleet is clean.
export function FleetLeakWatch() {
  const { state } = useStore()

  const rows = state.units
    .filter((u) => u.status === 'active')
    .map((u) => ({
      u,
      leak: leakStatusFor(u, state.transactions),
      site: state.sites.find((s) => s.id === u.siteId),
    }))
    .filter((x) => x.leak.level === 'watch' || x.leak.level === 'suspected')
    .sort((a, b) => b.leak.fraction - a.leak.fraction)

  if (rows.length === 0) return null

  const suspected = rows.filter((r) => r.leak.level === 'suspected').length

  return (
    <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Equipment leak watch
        </div>
        <Pill tone={suspected > 0 ? 'red' : 'amber'}>
          {rows.length} flagged
        </Pill>
      </div>
      <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-100/80">
        Units topped up above the AIRAH DA19 leak-rate threshold in the last 12
        months — highest first. Investigate and rectify.
      </p>
      <ul className="mt-2 divide-y divide-amber-200/70 dark:divide-amber-100/10">
        {rows.slice(0, 6).map(({ u, leak, site }) => (
          <li key={u.id}>
            <Link
              to="/sites"
              className="-mx-1 flex items-center justify-between gap-3 rounded-lg px-1 py-2 transition hover:bg-amber-100/60 dark:hover:bg-amber-900/20"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-amber-900 dark:text-amber-100">
                  {u.name}
                </div>
                <div className="truncate text-xs text-amber-900/70 dark:text-amber-100/70">
                  {site ? siteLabel(site) : 'No site'} ·{' '}
                  {formatWeight(leak.topUpKg, state.unit)} topped up
                </div>
              </div>
              <Pill tone={leak.level === 'suspected' ? 'red' : 'amber'}>
                {Math.round(leak.fraction * 100)}%
              </Pill>
            </Link>
          </li>
        ))}
        {rows.length > 6 && (
          <li className="pt-1.5 text-xs text-amber-900/70 dark:text-amber-100/70">
            +{rows.length - 6} more
          </li>
        )}
      </ul>
    </Card>
  )
}
