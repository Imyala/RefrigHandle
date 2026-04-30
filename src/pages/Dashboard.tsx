import { Link } from 'react-router-dom'
import { Card, Pill } from '../components/ui'
import { useStore } from '../lib/store'
import { netWeight } from '../lib/types'

export default function Dashboard() {
  const { state } = useStore()
  const { bottles, locations, transactions } = state

  const totalsByType = new Map<string, { count: number; net: number }>()
  for (const b of bottles) {
    const key = b.refrigerantType
    const cur = totalsByType.get(key) ?? { count: 0, net: 0 }
    cur.count += 1
    cur.net += netWeight(b)
    totalsByType.set(key, cur)
  }
  const sortedTypes = [...totalsByType.entries()].sort((a, b) => b[1].net - a[1].net)

  const totalNet = bottles.reduce((sum, b) => sum + netWeight(b), 0)
  const inStock = bottles.filter((b) => b.status === 'in_stock').length
  const onSite = bottles.filter((b) => b.status === 'on_site').length
  const returned = bottles.filter((b) => b.status === 'returned').length
  const empty = bottles.filter((b) => b.status === 'empty').length

  const recent = transactions.slice(0, 5)

  return (
    <div className="space-y-4">
      <Card>
        <div className="text-sm text-slate-500 dark:text-slate-400">
          Total refrigerant in stock
        </div>
        <div className="mt-1 text-4xl font-bold text-slate-900 dark:text-slate-100">
          {totalNet.toFixed(2)} <span className="text-xl font-medium">kg</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <Pill tone="blue">{bottles.length} bottles</Pill>
          <Pill tone="green">{inStock} in stock</Pill>
          <Pill tone="amber">{onSite} on site</Pill>
          {returned > 0 && <Pill tone="slate">{returned} returned</Pill>}
          {empty > 0 && <Pill tone="red">{empty} empty</Pill>}
        </div>
      </Card>

      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          By refrigerant type
        </h2>
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
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {sortedTypes.map(([type, t]) => (
              <Card key={type} className="!p-3">
                <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {type}
                </div>
                <div className="mt-0.5 text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {t.net.toFixed(2)}{' '}
                  <span className="text-sm font-medium text-slate-500">kg</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {t.count} bottle{t.count === 1 ? '' : 's'}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Recent activity
          </h2>
          {transactions.length > 5 && (
            <Link to="/transactions" className="text-sm text-brand-600 hover:underline">
              View all
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-500">No transactions yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((t) => {
              const bottle = bottles.find((b) => b.id === t.bottleId)
              const loc = locations.find((l) => l.id === t.locationId)
              return (
                <Card key={t.id} className="!p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium capitalize text-slate-900 dark:text-slate-100">
                        {t.kind} · {t.amount.toFixed(2)} kg
                      </div>
                      <div className="truncate text-sm text-slate-500">
                        {bottle?.bottleNumber ?? '?'} · {bottle?.refrigerantType ?? '?'}
                        {loc ? ` · ${loc.name}` : ''}
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
      </section>
    </div>
  )
}
