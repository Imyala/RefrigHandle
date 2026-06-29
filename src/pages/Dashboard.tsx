import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from '../components/ui'
import { CollapsibleSection } from '../components/CollapsibleSection'
import { ShareTxButton } from '../components/ShareSheet'
import { ComplianceHealth } from '../components/ComplianceHealth'
import { FleetLeakWatch } from '../components/FleetLeakWatch'
import { useStore } from '../lib/store'
import {
  REASON_LABELS,
  movementSummary,
  netWeight,
  pluralize,
  transactionLabel,
  transactionLoss,
  type Transaction,
} from '../lib/types'
import { formatDate, formatStampedTime } from '../lib/datetime'
import { profileFor } from '../lib/compliance'
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
  const returned = bottles.filter((b) => b.status === 'returned').length
  const empty = bottles.filter((b) => b.status === 'empty').length

  const liveTransactions = transactions.filter((t) => !t.deletedAt)
  const recent = liveTransactions.slice(0, 5)

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

      <ComplianceHealth />

      <FleetLeakWatch />

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
        storageKey="dashboard.byType.v2"
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
        storageKey="dashboard.recent.v2"
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
            {recent.map((t) => (
              <RecentActivityItem key={t.id} t={t} />
            ))}
          </div>
        )}
      </CollapsibleSection>

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

// A recent-activity row that expands on tap to show the full detail of a
// transaction — most importantly the from → to of a transfer, which the
// one-line summary can't fully convey.
function RecentActivityItem({ t }: { t: Transaction }) {
  const { state } = useStore()
  const { bottles, sites, units, transactions, unit } = state
  const [open, setOpen] = useState(false)

  const bottle = bottles.find((b) => b.id === t.bottleId)
  const sourceBottle = t.sourceBottleId
    ? bottles.find((b) => b.id === t.sourceBottleId)
    : null
  const site = sites.find((j) => j.id === t.siteId)
  const txUnit = units.find((u) => u.id === t.unitId)
  const move = movementSummary(
    t,
    transactions,
    (id) => sites.find((j) => j.id === id)?.name,
  )
  const loss = transactionLoss(t)

  return (
    <Card className="!p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-medium text-slate-900 dark:text-slate-100">
            {transactionLabel(t.kind)}
            {t.amount > 0 && ` · ${formatWeight(t.amount, unit)}`}
          </div>
          <div className="truncate text-sm text-slate-500">
            {bottle?.bottleNumber ?? '?'} · {bottle?.refrigerantType ?? '?'}
            {move
              ? ` · ${move.from} → ${move.to}`
              : (site?.name ?? t.siteName)
                ? ` · ${site?.name ?? t.siteName}`
                : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-slate-500">
            {formatDate(t.date, t.tz || state.location.timezone)}
          </span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {open && (
        <dl className="space-y-1.5 border-t border-slate-200 px-3 py-3 text-sm dark:border-slate-800">
          {move && (
            <DetailLine label="Movement" value={`${move.from} → ${move.to}`} />
          )}
          {sourceBottle && (
            <DetailLine
              label="From bottle"
              value={sourceBottle.bottleNumber}
            />
          )}
          {!move && (site?.name ?? t.siteName) && (
            <DetailLine label="Site" value={site?.name ?? t.siteName ?? ''} />
          )}
          {(txUnit || t.unitName || t.equipment) && (
            <DetailLine
              label="Equipment"
              value={txUnit?.name ?? t.unitName ?? t.equipment ?? ''}
            />
          )}
          {t.reason && (
            <DetailLine label="Reason" value={REASON_LABELS[t.reason]} />
          )}
          {t.kind === 'return' && t.returnDestination && (
            <DetailLine label="Returned to" value={t.returnDestination} />
          )}
          {t.amount > 0 && (
            <DetailLine
              label="Bottle gross"
              value={`${kgToDisplay(t.weightBefore, unit).toFixed(2)} → ${formatWeight(t.weightAfter, unit)}`}
            />
          )}
          {loss > 0 && (
            <DetailLine label="Loss" value={formatWeight(loss, unit)} />
          )}
          <DetailLine
            label="When"
            value={formatStampedTime(t.date, t.tz, state.location.timezone, state.clock)}
          />
          {(t.technician || t.technicianLicence) && (
            <DetailLine
              label="Technician"
              value={[
                t.technician,
                t.technicianLicence && `${profileFor(state.jurisdiction).techLicenceShort} ${t.technicianLicence}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          )}
          {t.notes && <DetailLine label="Notes" value={t.notes} italic />}
          <div className="pt-1">
            <ShareTxButton
              t={t}
              label="Share / copy / email"
              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-900/20"
            />
          </div>
        </dl>
      )}
    </Card>
  )
}

function DetailLine({
  label,
  value,
  italic,
}: {
  label: string
  value: string
  italic?: boolean
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd
        className={`min-w-0 flex-1 text-slate-700 dark:text-slate-300 ${italic ? 'italic text-slate-500' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}
