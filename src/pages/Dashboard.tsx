import { Link } from 'react-router-dom'
import { Button, Card, Pill } from '../components/ui'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { useStore } from '../lib/store'
import {
  hydroStatusFor,
  netWeight,
  pluralize,
  transactionLabel,
} from '../lib/types'
import { formatWeight, kgToDisplay } from '../lib/units'

export default function Dashboard() {
  const { state } = useStore()
  const { bottles, sites, transactions, unit } = state

  const totalsByType = new Map<string, { count: number; net: number }>()
  for (const b of bottles) {
    const cur = totalsByType.get(b.refrigerantType) ?? { count: 0, net: 0 }
    cur.count += 1
    cur.net += netWeight(b)
    totalsByType.set(b.refrigerantType, cur)
  }
  const sortedTypes = [...totalsByType.entries()].sort(
    (a, b) => b[1].net - a[1].net,
  )

  const totalNet = bottles.reduce((sum, b) => sum + netWeight(b), 0)
  const inStock = bottles.filter((b) => b.status === 'in_stock').length
  const onSite = bottles.filter((b) => b.status === 'on_site').length
  const stationed = bottles.filter((b) => b.status === 'stationed').length
  const returned = bottles.filter((b) => b.status === 'returned').length
  const empty = bottles.filter((b) => b.status === 'empty').length

  const liveTransactions = transactions.filter((t) => !t.deletedAt)
  const recent = liveTransactions.slice(0, 5)

  const hydroAlerts = bottles
    .map((b) => ({ b, h: hydroStatusFor(b) }))
    .filter((x) => x.h.status === 'overdue' || x.h.status === 'due_soon')
    .sort((a, b) => (a.h.daysUntilDue ?? 0) - (b.h.daysUntilDue ?? 0))

  return (
    <div className="space-y-4">
      <Card className="!bg-gradient-to-br !from-brand-600 !to-brand-900 !border-transparent !text-white">
        <div className="text-xs font-medium uppercase tracking-wider text-brand-100/90">
          Total refrigerant in stock
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <div className="text-5xl font-bold tabular-nums">
            {kgToDisplay(totalNet, unit).toFixed(2)}
          </div>
          <div className="text-xl font-medium text-brand-100">{unit}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur">
            {pluralize(bottles.length, 'bottle')}
          </span>
          {inStock > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-400/25 px-2.5 py-0.5 text-xs font-medium text-emerald-50">
              {inStock} in stock
            </span>
          )}
          {onSite > 0 && (
            <span className="inline-flex items-center rounded-full bg-amber-400/25 px-2.5 py-0.5 text-xs font-medium text-amber-50">
              {onSite} on site
            </span>
          )}
          {stationed > 0 && (
            <span className="inline-flex items-center rounded-full bg-sky-400/25 px-2.5 py-0.5 text-xs font-medium text-sky-50">
              {stationed} at facility
            </span>
          )}
          {returned > 0 && (
            <span className="inline-flex items-center rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-medium text-white">
              {returned} returned
            </span>
          )}
          {empty > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-400/25 px-2.5 py-0.5 text-xs font-medium text-red-50">
              {empty} empty
            </span>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/bottles" className="block">
          <Card className="!p-4 transition active:scale-[0.98]">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Bottles
            </div>
            <div className="text-xs text-slate-500">
              {pluralize(bottles.length, 'bottle')}
            </div>
          </Card>
        </Link>
        <Link to="/sites" className="block">
          <Card className="!p-4 transition active:scale-[0.98]">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              Sites
            </div>
            <div className="text-xs text-slate-500">
              {pluralize(sites.length, 'site')}
            </div>
          </Card>
        </Link>
      </div>

      <CollapsibleSection
        title="By refrigerant type"
        storageKey="dashboard.byType"
      >
        {sortedTypes.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">
              No bottles yet.{' '}
              <Link
                to="/bottles"
                className="font-medium text-brand-600 hover:underline"
              >
                Add your first bottle
              </Link>
              .
            </p>
            <div className="mt-3">
              <Link to="/bottles">
                <Button>+ Add bottle</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sortedTypes.map(([type, t]) => (
              <Card key={type} className="!p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-500">
                  {type}
                </div>
                <div className="mt-0.5 flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {kgToDisplay(t.net, unit).toFixed(2)}
                  </span>
                  <span className="text-sm font-medium text-slate-500">{unit}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {pluralize(t.count, 'bottle')}
                </div>
              </Card>
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Recent activity"
        storageKey="dashboard.recent"
        trailing={
          liveTransactions.length > 5 ? (
            <Link
              to="/transactions"
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              View all
            </Link>
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No transactions yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => {
              const bottle = bottles.find((b) => b.id === t.bottleId)
              const site = sites.find((j) => j.id === t.siteId)
              return (
                <Card key={t.id} className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {transactionLabel(t.kind)}
                        {t.amount > 0 && ` · ${formatWeight(t.amount, unit)}`}
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {bottle?.bottleNumber ?? '?'} ·{' '}
                        {bottle?.refrigerantType ?? '?'}
                        {site ? ` · ${site.name}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-slate-500">
                      {new Date(t.date).toLocaleDateString()}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </CollapsibleSection>

      {hydroAlerts.length > 0 && (
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
                  <Pill tone="red">Overdue {Math.abs(h.daysUntilDue ?? 0)}d</Pill>
                ) : (
                  <Pill tone="amber">In {h.daysUntilDue}d</Pill>
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
      )}

      {bottles.length > 0 && sites.length === 0 && (
        <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Tip
          </div>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
            Add the sites (homes, businesses, facilities) where bottles get
            used so you can track charges per site and add the units installed
            there.
          </p>
          <div className="mt-3">
            <Link to="/sites">
              <Button variant="secondary">+ Add site</Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  )
}
