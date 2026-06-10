import { useEffect, useMemo, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Pill,
  TextArea,
  TextInput,
} from '../components/ui'
import { Picker } from '../components/Picker'
import { useStore } from '../lib/store'
import {
  type Bottle,
  type BottleKind,
  type BottleStatus,
  type TransactionKind,
  type TransactionReason,
  type Unit,
  BOTTLE_KIND_LABELS,
  REFRIGERANT_TYPES,
  REASON_LABELS,
  fillingRatio,
  hydroStatusFor,
  netWeight,
  overfillKg,
  safeFillKgFor,
  sortRefrigerants,
  statusLabel,
  transactionLabel,
} from '../lib/types'
import { RefrigerantSelect } from '../components/RefrigerantSelect'
import { BottleSelect } from '../components/BottleSelect'
import { MonthInput } from '../components/MonthInput'
import { SiteForm } from './Sites'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { formatDateTime } from '../lib/datetime'

const statusTone: Record<
  BottleStatus,
  'green' | 'amber' | 'slate' | 'red' | 'blue'
> = {
  in_stock: 'green',
  on_site: 'amber',
  returned: 'slate',
  empty: 'red',
}

export default function Bottles() {
  const { state, addBottle, updateBottle, deleteBottle, addTransaction } =
    useStore()
  const { bottles, sites, customRefrigerants, unit } = state
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Bottle | null>(null)
  const [adding, setAdding] = useState(false)
  // Persist the active status filter across tab navigation. The page
  // unmounts when the tech jumps to Sites/Log/Settings, so plain
  // useState would reset the filter every time they came back.
  // sessionStorage scopes it to the current browser tab — survives
  // navigation, clears on tab close.
  const [filter, setFilter] = useState<'all' | BottleStatus>(() => {
    const saved = sessionStorage.getItem('bottles.filter')
    if (
      saved === 'all' ||
      saved === 'in_stock' ||
      saved === 'on_site' ||
      saved === 'returned' ||
      saved === 'empty'
    ) {
      return saved
    }
    return 'all'
  })
  useEffect(() => {
    sessionStorage.setItem('bottles.filter', filter)
  }, [filter])
  const [query, setQuery] = useState('')

  // How the list is bundled. Persisted per browser tab like the filter
  // Defaults to grouping by location so a long list collapses into one
  // heading per site. Persisted in localStorage (not sessionStorage) so a
  // tech's choice sticks across app restarts, not just tab navigation —
  // and so a fresh install starts on Location as intended. A stale
  // sessionStorage value from older builds is ignored.
  const [grouping, setGrouping] = useState<'none' | 'location' | 'refrigerant'>(
    () => {
      try {
        const saved = localStorage.getItem('bottles.grouping')
        if (saved === 'none' || saved === 'location' || saved === 'refrigerant') {
          return saved
        }
      } catch {
        /* localStorage unavailable — fall back to default */
      }
      return 'location'
    },
  )
  useEffect(() => {
    try {
      localStorage.setItem('bottles.grouping', grouping)
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [grouping])
  // Track which groups are EXPANDED (default: none) so the list opens
  // fully collapsed and a long inventory doesn't overwhelm the screen —
  // the tech taps a heading to reveal that group. Persisted in
  // localStorage so the collapsed/expanded layout the tech leaves behind
  // is exactly what they come back to — across page navigation and app
  // restarts, not just the current tab.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bottles.expandedGroups')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      /* localStorage unavailable — start collapsed */
    }
    return new Set()
  })
  useEffect(() => {
    try {
      localStorage.setItem(
        'bottles.expandedGroups',
        JSON.stringify([...expandedGroups]),
      )
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [expandedGroups])
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Action sheet — primary tap target
  // Track by id so the action sheet always reflects the latest bottle state
  // from the store (no stale snapshot after a charge updates the bottle).
  const [sheetBottleId, setSheetBottleId] = useState<string | null>(null)
  const sheetBottle = useMemo(
    () =>
      sheetBottleId ? bottles.find((b) => b.id === sheetBottleId) ?? null : null,
    [bottles, sheetBottleId],
  )
  const [logKind, setLogKind] = useState<TransactionKind | null>(null)

  const allTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [customRefrigerants, state.favoriteRefrigerants],
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return bottles
      .filter((b) => filter === 'all' || b.status === filter)
      .filter((b) => {
        if (!q) return true
        // Bottle search is intentionally bottle-number-only — a tech
        // looking for a cylinder knows its number, and matching against
        // refrigerant/notes just produced noisy hits.
        return b.bottleNumber.toLowerCase().includes(q)
      })
      .sort((a, b) => a.bottleNumber.localeCompare(b.bottleNumber))
  }, [bottles, filter, query])

  // Bundle the visible bottles into collapsible groups. `visible` is
  // already sorted by bottle number, so order within each group is kept.
  const groups = useMemo(() => {
    if (grouping === 'none') return null
    const map = new Map<string, { key: string; label: string; rows: Bottle[] }>()
    for (const b of visible) {
      let key: string
      let label: string
      if (grouping === 'location') {
        const site = sites.find((s) => s.id === b.currentSiteId)
        if (site) {
          key = `s:${site.id}`
          label = site.name
        } else {
          key = 'none'
          label = 'Not on site'
        }
      } else {
        const t = b.refrigerantType || 'Unknown'
        key = `r:${t.toUpperCase()}`
        label = t
      }
      if (!map.has(key)) map.set(key, { key, label, rows: [] })
      map.get(key)!.rows.push(b)
    }
    const arr = Array.from(map.values())
    arr.sort((a, b) => {
      // Keep the "Not on site" bucket last when grouping by location.
      if (grouping === 'location') {
        if (a.key === 'none') return 1
        if (b.key === 'none') return -1
      }
      return a.label.localeCompare(b.label)
    })
    return arr
  }, [grouping, visible, sites])

  const renderBottle = (b: Bottle) => {
    const site = sites.find((j) => j.id === b.currentSiteId)
    const net = netWeight(b)
    const initialNet = b.initialNetWeight || 0
    const pct =
      initialNet > 0 ? Math.min(100, Math.max(0, (net / initialNet) * 100)) : 0
    const over = overfillKg(net, initialNet)
    return (
      <Card key={b.id} className="!p-3">
        <button
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => setSheetBottleId(b.id)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {b.bottleNumber}
              </span>
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                {b.refrigerantType}
              </span>
              <Pill tone={statusTone[b.status]}>{statusLabel(b.status)}</Pill>
              {b.bottleKind === 'pump_down' && (
                <Pill tone="blue">Pump-down</Pill>
              )}
              {over > 0 && (
                <Pill tone="amber">Overfill +{formatWeight(over, unit)}</Pill>
              )}
              {(() => {
                const h = hydroStatusFor(b)
                if (h.status === 'overdue')
                  return <Pill tone="red">Hydro overdue</Pill>
                if (h.status === 'due_soon')
                  return (
                    <Pill tone="amber">
                      {h.monthsUntilDue === 0
                        ? 'Hydro due this month'
                        : 'Hydro due next month'}
                    </Pill>
                  )
                return null
              })()}
            </div>
            {site && (
              <div className="mt-1 text-sm text-slate-500">{site.name}</div>
            )}
            <div className="mt-1 text-xs text-slate-500">
              Added{' '}
              {new Date(b.createdAt).toLocaleDateString(undefined, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              {b.createdBy && (
                <>
                  {' · by '}
                  <span className="text-slate-600 dark:text-slate-400">
                    {b.createdBy}
                  </span>
                  {b.createdByLicence && (
                    <span className="text-slate-500">
                      {' '}· RHL {b.createdByLicence}
                    </span>
                  )}
                </>
              )}
            </div>
            {initialNet > 0 && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${over > 0 ? 'bg-amber-500' : 'bg-brand-500'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {kgToDisplay(net, unit).toFixed(2)}
              <span className="ml-1 text-xs font-medium text-slate-500">
                {unit}
              </span>
            </div>
            {initialNet > 0 && (
              <div className="text-xs text-slate-500">
                of {formatWeight(initialNet, unit, 1)}
              </div>
            )}
          </div>
        </button>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Bottles
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      {bottles.length > 0 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by Bottle Number"
        />
      )}

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(['all', 'in_stock', 'on_site', 'returned', 'empty'] as const).map(
          (f) => {
            const count =
              f === 'all'
                ? bottles.length
                : bottles.filter((b) => b.status === f).length
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {f === 'all' ? 'All' : statusLabel(f)} · {count}
              </button>
            )
          },
        )}
      </div>

      {bottles.length > 1 && (
        <div className="flex items-center gap-2 px-1">
          <span className="shrink-0 text-xs font-medium text-slate-500">
            Group by
          </span>
          <div className="flex gap-1.5">
            {(
              [
                ['none', 'None'],
                ['location', 'Location'],
                ['refrigerant', 'Refrigerant'],
              ] as const
            ).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setGrouping(val)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  grouping === val
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={bottles.length === 0 ? 'No bottles yet' : 'No matches'}
          body={
            bottles.length === 0
              ? 'Add your first bottle to start tracking refrigerant.'
              : 'Try a different filter or search.'
          }
          action={
            bottles.length === 0 ? (
              <Button onClick={() => setAdding(true)}>+ Add bottle</Button>
            ) : undefined
          }
        />
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = expandedGroups.has(g.key)
            return (
              <div key={g.key}>
                <BottleGroupHeader
                  label={g.label}
                  count={g.rows.length}
                  open={isOpen}
                  onToggle={() => toggleGroup(g.key)}
                />
                {isOpen && (
                  <div className="space-y-2">{g.rows.map(renderBottle)}</div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">{visible.map(renderBottle)}</div>
      )}

      <BottleActionSheet
        bottle={sheetBottle}
        onClose={() => setSheetBottleId(null)}
        onLog={(kind) => setLogKind(kind)}
        onEdit={() => {
          if (sheetBottle) {
            setEditing(sheetBottle)
            setSheetBottleId(null)
          }
        }}
      />

      <QuickLogModal
        open={!!sheetBottle && !!logKind}
        bottle={sheetBottle}
        kind={logKind}
        onClose={() => setLogKind(null)}
        onSave={(data) => {
          const result = addTransaction(data)
          if (result) {
            toast.show(
              `${transactionLabel(data.kind)} logged: ${data.amount > 0 ? `${data.amount.toFixed(2)} kg` : 'OK'}`,
            )
            setLogKind(null)
            setSheetBottleId(null)
          }
        }}
      />

      <BottleForm
        open={adding}
        title="New bottle"
        types={allTypes}
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addBottle(data)
          setAdding(false)
          toast.show('Bottle added')
        }}
      />

      <BottleForm
        open={!!editing}
        title="Edit bottle"
        types={allTypes}
        bottle={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing) {
            // Detect a meaningful site/status change so the activity
            // log gets a transaction record (otherwise a tech editing
            // a bottle to "On site — Site 1" leaves no audit trail of
            // the move).
            const prevStatus = editing.status
            const prevSite = editing.currentSiteId ?? ''
            const newStatus = data.status
            const newSite = data.currentSiteId ?? ''
            const siteOrStatusChanged =
              prevStatus !== newStatus || prevSite !== newSite
            if (siteOrStatusChanged) {
              if (newStatus === 'on_site' && newSite) {
                addTransaction({
                  bottleId: editing.id,
                  kind: 'transfer',
                  siteId: newSite,
                  amount: 0,
                  date: new Date().toISOString(),
                })
              } else if (
                newStatus === 'returned' &&
                prevStatus !== 'returned'
              ) {
                addTransaction({
                  bottleId: editing.id,
                  kind: 'return',
                  amount: 0,
                  date: new Date().toISOString(),
                })
              }
            }
            updateBottle(editing.id, data)
          }
          setEditing(null)
          toast.show('Bottle updated')
        }}
        onDelete={
          editing
            ? async () => {
                const ok = await confirm({
                  title: 'Delete this bottle?',
                  message:
                    'The bottle and all of its transactions will be removed from the record. This cannot be undone.',
                  confirmLabel: 'Delete bottle',
                  danger: true,
                })
                if (ok) {
                  deleteBottle(editing.id)
                  setEditing(null)
                  toast.show('Bottle deleted', 'info')
                }
              }
            : undefined
        }
      />
    </div>
  )
}

function BottleGroupHeader({
  label,
  count,
  open,
  onToggle,
}: {
  label: string
  count: number
  open: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mb-2 flex w-full items-center gap-1.5 px-1 text-left text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className={`h-4 w-4 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold uppercase tracking-wider">
        {label}
      </span>
      <span className="shrink-0 text-xs font-medium">({count})</span>
    </button>
  )
}

function BottleActionSheet({
  bottle,
  onClose,
  onLog,
  onEdit,
}: {
  bottle: Bottle | null
  onClose: () => void
  onLog: (kind: TransactionKind) => void
  onEdit: () => void
}) {
  const { state } = useStore()
  if (!bottle) return null
  const unit = state.unit
  const site = state.sites.find((j) => j.id === bottle.currentSiteId)
  const net = netWeight(bottle)
  const history = state.transactions
    .filter((t) => t.bottleId === bottle.id || t.sourceBottleId === bottle.id)
    .slice(0, 5)

  return (
    <Modal open={!!bottle} title={bottle.bottleNumber} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-900 p-4 text-white">
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold tabular-nums">
              {kgToDisplay(net, unit).toFixed(2)}
            </div>
            <div className="text-base font-medium text-brand-100">{unit}</div>
            <div className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">
              {bottle.refrigerantType}
            </div>
          </div>
          <div className="mt-1 text-sm text-brand-100">
            Gross {formatWeight(bottle.grossWeight, unit)} · Tare{' '}
            {formatWeight(bottle.tareWeight, unit)} ·{' '}
            {statusLabel(bottle.status)}
          </div>
          {site && (
            <div className="mt-1 text-sm text-brand-100">{site.name}</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onLog('charge')} variant="primary">
            Charge
          </Button>
          <Button onClick={() => onLog('recover')} variant="primary">
            Recover
          </Button>
        </div>

        <Button
          onClick={() => onLog('return')}
          variant="secondary"
          full
          disabled={bottle.status === 'returned'}
        >
          {bottle.status === 'returned' ? 'Already returned' : 'Return bottle'}
        </Button>

        <Button onClick={onEdit} variant="ghost" full>
          Edit details
        </Button>

        <div>
          <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Recent activity
          </div>
          {history.length === 0 ? (
            <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-800">
              No transactions for this bottle yet.
            </div>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {history.map((t) => {
                const j = state.sites.find((x) => x.id === t.siteId)
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-slate-100 px-3 py-2 dark:bg-slate-800"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {transactionLabel(t.kind)}
                        {t.amount > 0 && ` · ${formatWeight(t.amount, unit)}`}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {formatDateTime(t.date, state.location.timezone, state.clock)}
                        {j ? ` · ${j.name}` : ''}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}

function QuickLogModal({
  open,
  bottle,
  kind,
  onClose,
  onSave,
}: {
  open: boolean
  bottle: Bottle | null
  kind: TransactionKind | null
  onClose: () => void
  onSave: (data: {
    bottleId: string
    sourceBottleId?: string
    siteId?: string
    unitId?: string
    kind: TransactionKind
    amount: number
    bottleAmount?: number
    date: string
    technician?: string
    equipment?: string
    reason?: TransactionReason
    notes?: string
    returnDestination?: string
    refrigerantMismatch?: { bottleType: string; unitType: string }
  }) => void
}) {
  const { state, addBottle, addSite, addUnit, addCustomRefrigerant } =
    useStore()
  const unit = state.unit
  const allRefrigerantTypes = useMemo(
    () =>
      sortRefrigerants(
        [...REFRIGERANT_TYPES, ...state.customRefrigerants],
        state.favoriteRefrigerants,
      ),
    [state.customRefrigerants, state.favoriteRefrigerants],
  )

  type RecoverSource = 'equipment' | 'bottle'

  const [amount, setAmount] = useState('')
  const [bottleAmount, setBottleAmount] = useState('')
  const [showLoss, setShowLoss] = useState(false)
  const [siteId, setSiteId] = useState(bottle?.currentSiteId ?? '')
  const [unitId, setUnitId] = useState('')
  const [equipment, setEquipment] = useState('')
  const [reason, setReason] = useState<TransactionReason | ''>('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [recoverSource, setRecoverSource] = useState<RecoverSource>('equipment')
  const [sourceBottleId, setSourceBottleId] = useState('')
  const [returnDestination, setReturnDestination] = useState('')

  // Quick-add modals
  const [quickAddBottleOpen, setQuickAddBottleOpen] = useState(false)
  const [quickAddSiteOpen, setQuickAddSiteOpen] = useState(false)
  const [quickAddUnitOpen, setQuickAddUnitOpen] = useState(false)

  const lastKey = `${bottle?.id}-${kind}-${open}`
  const [seenKey, setSeenKey] = useState('')
  if (open && seenKey !== lastKey) {
    setSeenKey(lastKey)
    setAmount('')
    setBottleAmount('')
    setShowLoss(false)
    setSiteId(bottle?.currentSiteId ?? '')
    setUnitId('')
    setEquipment('')
    setReason('')
    setNotes('')
    setDate(new Date().toISOString().slice(0, 16))
    setRecoverSource('equipment')
    setSourceBottleId('')
    setReturnDestination('')
  }

  if (!open || !bottle || !kind) return null

  const showAmount = kind === 'charge' || kind === 'recover'
  const isBottleToBottleRecover =
    kind === 'recover' && recoverSource === 'bottle'
  const showSite = kind !== 'return' && !isBottleToBottleRecover
  const showCompliance =
    (kind === 'charge' || kind === 'recover') && !isBottleToBottleRecover

  const siteUnits = state.units.filter(
    (u) => u.siteId === siteId && u.status === 'active',
  )
  const sourceBottle =
    isBottleToBottleRecover && sourceBottleId
      ? state.bottles.find((b) => b.id === sourceBottleId)
      : null

  const enteredAmountDisplay = parseFloat(amount) || 0
  const amountKg = displayToKg(enteredAmountDisplay, unit)
  const enteredBottleDisplay = parseFloat(bottleAmount) || 0
  const bottleAmountKg =
    showLoss && enteredBottleDisplay > 0
      ? displayToKg(enteredBottleDisplay, unit)
      : amountKg
  const lossKg = showLoss
    ? kind === 'charge'
      ? Math.max(0, bottleAmountKg - amountKg)
      : kind === 'recover'
        ? Math.max(0, amountKg - bottleAmountKg)
        : 0
    : 0
  const projectedAfter =
    kind === 'charge'
      ? bottle.grossWeight - bottleAmountKg
      : kind === 'recover'
        ? bottle.grossWeight + bottleAmountKg
        : bottle.grossWeight
  const projectedNet = Math.max(0, projectedAfter - bottle.tareWeight)
  const projectedSourceAfter = sourceBottle
    ? Math.max(0, sourceBottle.grossWeight - amountKg)
    : 0
  const projectedSourceNet = sourceBottle
    ? Math.max(0, projectedSourceAfter - sourceBottle.tareWeight)
    : 0

  // Physical-impossibility blocks. You can't take out what isn't there.
  // Charges of equipment, and bottle-to-bottle recovers from a source,
  // can't exceed the source bottle's current net refrigerant. Adjust is
  // a manual correction — left unblocked. Over-fill on a destination
  // recover is still allowed (just warned), per AS 2030.5 verification
  // workflows where techs over-fill in practice.
  const currentNet = netWeight(bottle)
  const blockOverdraw =
    kind === 'charge' && bottleAmountKg > currentNet + 0.01
  const blockSourceOverdraw =
    isBottleToBottleRecover &&
    !!sourceBottle &&
    amountKg > netWeight(sourceBottle) + 0.01
  // Source-bottle refrigerant must match the destination — mixing is a
  // contamination event that ruins both bottles for reclamation. Warn
  // strongly but don't auto-block; some techs may be intentionally
  // consolidating into a "mixed waste" cylinder.
  const refrigerantMismatch =
    isBottleToBottleRecover &&
    !!sourceBottle &&
    sourceBottle.refrigerantType.toUpperCase() !==
      bottle.refrigerantType.toUpperCase()
  // Bottle-vs-unit refrigerant mismatch — charging R410A into a unit
  // labelled R32 (or vice-versa) is almost always a wrong-bottle mistake
  // and the resulting blend can damage the equipment. Warn loudly but
  // don't auto-block; the tech may be intentionally retrofitting.
  const selectedUnit = unitId
    ? siteUnits.find((u) => u.id === unitId)
    : undefined
  const unitRefrigerantMismatch =
    (kind === 'charge' || kind === 'recover') &&
    !!selectedUnit?.refrigerantType &&
    selectedUnit.refrigerantType.toUpperCase() !==
      bottle.refrigerantType.toUpperCase()
  // A bottle that's already been returned can't be returned again. To
  // log another return the tech needs to first put the bottle back into
  // service (edit → status: in stock).
  const blockAlreadyReturned =
    kind === 'return' && bottle.status === 'returned'
  const submitBlocked =
    blockOverdraw || blockSourceOverdraw || blockAlreadyReturned

  function handleUnitChange(value: string) {
    if (value === '__new__') {
      setQuickAddUnitOpen(true)
      return
    }
    setUnitId(value)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!kind || !bottle) return
    if (submitBlocked) return
    onSave({
      bottleId: bottle.id,
      sourceBottleId: isBottleToBottleRecover && sourceBottleId ? sourceBottleId : undefined,
      siteId: showSite && siteId ? siteId : undefined,
      unitId: showSite && unitId ? unitId : undefined,
      kind,
      amount: showAmount ? Math.abs(amountKg) : 0,
      bottleAmount:
        showAmount && showLoss && enteredBottleDisplay > 0
          ? Math.abs(bottleAmountKg)
          : undefined,
      date: new Date(date).toISOString(),
      // Tech name + RHL come from the active profile via the store's
      // stamping fallback. The bottle quick-log form doesn't expose a
      // tech picker — for crews that need to switch techs per job, log
      // from the Activity tab where the picker lives.
      equipment: equipment.trim() || undefined,
      reason: reason || undefined,
      notes: notes.trim() || undefined,
      returnDestination:
        kind === 'return' && returnDestination.trim()
          ? returnDestination.trim()
          : undefined,
      refrigerantMismatch:
        unitRefrigerantMismatch && selectedUnit?.refrigerantType
          ? {
              bottleType: bottle.refrigerantType,
              unitType: selectedUnit.refrigerantType,
            }
          : undefined,
    })
  }

  const titleMap: Record<TransactionKind, string> = {
    charge: 'Charge into equipment',
    recover: 'Recover refrigerant',
    transfer: 'Transfer bottle to a site',
    return: 'Return bottle to store',
    adjust: 'Manual adjustment',
  }

  return (
    <>
      <Modal open={open} title={titleMap[kind]} onClose={onClose}>
        <form onSubmit={submit} className="space-y-3">
          <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {bottle.bottleNumber} · {bottle.refrigerantType}
            </div>
            <div className="text-slate-600 dark:text-slate-300">
              Currently {formatWeight(netWeight(bottle), unit)} net (
              {formatWeight(bottle.grossWeight, unit)} gross)
            </div>
          </div>

          {kind === 'recover' && (
            <Field label="Recover from">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRecoverSource('equipment')}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                    recoverSource === 'equipment'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  Equipment
                </button>
                <button
                  type="button"
                  onClick={() => setRecoverSource('bottle')}
                  className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                    recoverSource === 'bottle'
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  Another bottle
                </button>
              </div>
            </Field>
          )}

          {isBottleToBottleRecover && (
            <Field
              label="Source bottle"
              hint="Refrigerant will be removed from this bottle and added to the one above"
            >
              <BottleSelect
                required
                value={sourceBottleId}
                onChange={setSourceBottleId}
                excludeId={bottle.id}
                allowAddNew
                onAddNew={() => setQuickAddBottleOpen(true)}
                placeholder="Tap to pick a source bottle"
                modalTitle="Pick source bottle"
              />
            </Field>
          )}

          {refrigerantMismatch && sourceBottle && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-100">
              <div className="font-semibold">
                ⚠ Refrigerant mismatch — this would contaminate both bottles
              </div>
              <div className="mt-1 text-xs">
                Source is{' '}
                <strong>{sourceBottle.refrigerantType}</strong>, destination is{' '}
                <strong>{bottle.refrigerantType}</strong>. Mixed refrigerants
                can't be reused or reclaimed without expensive separation —
                check both bottles before continuing.
              </div>
            </div>
          )}

          {showAmount && (
            <Field
              label={
                kind === 'charge'
                  ? `How much went into unit? (${unit})`
                  : isBottleToBottleRecover
                    ? `How much to transfer? (${unit})`
                    : `How much came out of equipment? (${unit})`
              }
              hint={
                kind === 'charge'
                  ? 'The amount that ended up in the equipment'
                  : isBottleToBottleRecover
                    ? 'How much refrigerant moves from the source bottle to this one'
                    : kind === 'recover'
                      ? 'The amount pulled out of the equipment'
                      : undefined
              }
            >
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 3.00"
              />
            </Field>
          )}

          {showAmount && !isBottleToBottleRecover && (
            <button
              type="button"
              onClick={() => setShowLoss((v) => !v)}
              className="text-left text-xs font-medium text-brand-600 hover:underline"
            >
              {showLoss
                ? 'Hide hose / decant loss field'
                : kind === 'charge'
                  ? 'Bottle dropped by more than that? (decant / hose loss)'
                  : 'Bottle gained less than that? (hose residual)'}
            </button>
          )}

          {showAmount && showLoss && !isBottleToBottleRecover && (
            <Field
              label={
                kind === 'charge'
                  ? `Actually removed from bottle (${unit})`
                  : `Actually added to bottle (${unit})`
              }
              hint={`Defaults to ${enteredAmountDisplay.toFixed(2)} ${unit}. Difference is recorded as a loss.`}
            >
              <TextInput
                type="number"
                inputMode="decimal"
                step="0.01"
                value={bottleAmount}
                onChange={(e) => setBottleAmount(e.target.value)}
                placeholder={enteredAmountDisplay > 0 ? enteredAmountDisplay.toFixed(2) : 'e.g. 3.50'}
              />
            </Field>
          )}

          {showAmount && enteredAmountDisplay > 0 && (() => {
            const overDest = overfillKg(projectedNet, bottle.initialNetWeight)
            return (
              <div
                className={`rounded-xl p-3 text-sm ${
                  overDest > 0
                    ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
                    : 'bg-brand-50 text-brand-900 dark:bg-brand-900/20 dark:text-brand-100'
                }`}
              >
                New bottle net: <strong>{formatWeight(projectedNet, unit)}</strong>
                {blockOverdraw && (
                  <div className="mt-1 font-semibold text-red-600 dark:text-red-300">
                    ⛔ More than this bottle has ({formatWeight(currentNet, unit)} available) — can't save
                  </div>
                )}
                {!blockOverdraw && projectedAfter < bottle.tareWeight && (
                  <span className="ml-2 text-red-600 dark:text-red-300">
                    goes below tare
                  </span>
                )}
                {overDest > 0 && (
                  <div className="mt-1 font-semibold">
                    ⚠ Over safe-fill limit by {formatWeight(overDest, unit)} (cap.{' '}
                    {formatWeight(bottle.initialNetWeight, unit)})
                  </div>
                )}
                {lossKg > 0 && (
                  <div>
                    Loss: <strong>{formatWeight(lossKg, unit)}</strong>{' '}
                    <span className="text-xs">(in hoses / vented)</span>
                  </div>
                )}
                {sourceBottle && (
                  <div>
                    Source bottle net after:{' '}
                    <strong>{formatWeight(projectedSourceNet, unit)}</strong>
                    {blockSourceOverdraw && (
                      <div className="mt-1 font-semibold text-red-600 dark:text-red-300">
                        ⛔ More than the source bottle has (
                        {formatWeight(netWeight(sourceBottle), unit)} available) — can't save
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {showSite && (
            <>
              <Field label="Site">
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <Picker
                      title="Site"
                      value={siteId}
                      onChange={(v) => {
                        setSiteId(v)
                        setUnitId('')
                      }}
                      required={kind === 'transfer'}
                      emptyLabel="— none —"
                      placeholder="— none —"
                      options={state.sites.map((j) => ({
                        value: j.id,
                        label: j.name,
                      }))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setQuickAddSiteOpen(true)}
                  >
                    + New
                  </Button>
                </div>
              </Field>
              {(kind === 'charge' || kind === 'recover') && siteId && (
                <Field
                  label="Unit (optional)"
                  hint="Pick the equipment this charge applies to"
                >
                  <Picker
                    title="Unit"
                    value={unitId}
                    onChange={handleUnitChange}
                    emptyLabel="— none —"
                    placeholder="— none —"
                    options={[
                      ...siteUnits.map((u) => ({
                        value: u.id,
                        label: u.name,
                        hint: u.refrigerantType || undefined,
                      })),
                      { value: '__new__', label: '+ Add new unit at this site…' },
                    ]}
                  />
                </Field>
              )}
              {unitRefrigerantMismatch && selectedUnit && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
                  <div className="font-semibold">
                    ⚠ Refrigerant mismatch — bottle and unit don't match
                  </div>
                  <div className="mt-1 text-xs">
                    Bottle is{' '}
                    <strong>{bottle.refrigerantType}</strong>, unit{' '}
                    <strong>{selectedUnit.name}</strong> is set up for{' '}
                    <strong>{selectedUnit.refrigerantType}</strong>. Double-check
                    you've grabbed the right bottle — mixing types can damage
                    the equipment and invalidates the charge record.
                  </div>
                </div>
              )}
            </>
          )}

          {showCompliance && (
            <>
              {!unitId && (
                <Field
                  label="Equipment (free text)"
                  hint="Use only if the equipment isn't tracked as a Unit at the site above"
                >
                  <TextInput
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    placeholder="e.g. Chiller AHU-2"
                  />
                </Field>
              )}
              <Field label="Reason">
                <Picker
                  title="Reason"
                  value={reason}
                  onChange={(v) => setReason(v as TransactionReason | '')}
                  placeholder="— pick reason —"
                  options={(Object.keys(REASON_LABELS) as TransactionReason[]).map(
                    (r) => ({ value: r, label: REASON_LABELS[r] }),
                  )}
                />
              </Field>
            </>
          )}

          {kind === 'return' && blockAlreadyReturned && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
              ⛔ This bottle is already marked as returned. To log another
              return, edit the bottle first and set its status back to In
              stock.
            </div>
          )}

          {kind === 'return' && !blockAlreadyReturned && (
            <Field
              label="Store / supplier"
              hint="Where is the bottle being returned? Optional."
            >
              <TextInput
                value={returnDestination}
                onChange={(e) => setReturnDestination(e.target.value)}
                placeholder="e.g. BOC, Refco depot, Beijer Ref"
              />
            </Field>
          )}

          <Field label="Date / time">
            <TextInput
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>

          <Field label="Notes">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <Button type="submit" full disabled={submitBlocked}>
            {blockAlreadyReturned
              ? 'Already returned'
              : submitBlocked
                ? 'Amount exceeds bottle contents'
                : 'Save'}
          </Button>
        </form>
      </Modal>

      <BottleQuickAdd
        open={quickAddBottleOpen}
        types={allRefrigerantTypes}
        onClose={() => setQuickAddBottleOpen(false)}
        onCreate={(data, customType) => {
          if (customType) addCustomRefrigerant(customType)
          const created = addBottle(data)
          setSourceBottleId(created.id)
          setQuickAddBottleOpen(false)
        }}
      />

      <UnitQuickAdd
        open={quickAddUnitOpen}
        siteId={siteId}
        onClose={() => setQuickAddUnitOpen(false)}
        onCreate={(data) => {
          const created = addUnit({ ...data, siteId })
          setUnitId(created.id)
          setQuickAddUnitOpen(false)
        }}
      />

      <SiteForm
        open={quickAddSiteOpen}
        title="New site"
        onClose={() => setQuickAddSiteOpen(false)}
        onSave={(data) => {
          const created = addSite(data)
          setSiteId(created.id)
          setUnitId('')
          setQuickAddSiteOpen(false)
        }}
      />
    </>
  )
}

function BottleQuickAdd({
  open,
  types,
  onClose,
  onCreate,
}: {
  open: boolean
  types: string[]
  onClose: () => void
  onCreate: (
    data: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>,
    customType?: string,
  ) => void
}) {
  const { state } = useStore()
  const displayUnit = state.unit
  const [bottleNumber, setBottleNumber] = useState('')
  const [refrigerantType, setRefrigerantType] = useState(types[0] ?? 'R410A')
  const [tare, setTare] = useState('')
  const [gross, setGross] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setBottleNumber('')
    setRefrigerantType(types[0] ?? 'R410A')
    setTare('')
    setGross('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  const tareKgPreview = displayToKg(parseFloat(tare) || 0, displayUnit)
  const grossKgPreview = displayToKg(parseFloat(gross) || 0, displayUnit)
  const tareExceedsGross =
    tareKgPreview > 0 &&
    grossKgPreview > 0 &&
    tareKgPreview > grossKgPreview + 0.01

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (tareExceedsGross) return
    const tareKg = displayToKg(parseFloat(tare) || 0, displayUnit)
    const grossKg = displayToKg(parseFloat(gross) || 0, displayUnit)
    onCreate({
      bottleNumber: bottleNumber.trim(),
      refrigerantType,
      tareWeight: tareKg,
      grossWeight: grossKg,
      initialNetWeight: Math.max(0, grossKg - tareKg),
      status: 'in_stock',
    })
  }

  return (
    <Modal open={open} title="Quick add bottle" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Bottle ID / number">
          <TextInput
            required
            autoFocus
            value={bottleNumber}
            onChange={(e) => setBottleNumber(e.target.value)}
            placeholder="e.g. B-205"
          />
        </Field>
        <Field label="Refrigerant type">
          <RefrigerantSelect
            required
            value={refrigerantType}
            onChange={setRefrigerantType}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Tare ${displayUnit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tare}
              onChange={(e) => setTare(e.target.value)}
            />
          </Field>
          <Field label={`Gross ${displayUnit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={gross}
              onChange={(e) => setGross(e.target.value)}
            />
          </Field>
        </div>
        {tareExceedsGross && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ Tare can't be more than gross — gross is the total bottle
            weight (tare + refrigerant).
          </div>
        )}
        <p className="text-xs text-slate-500">
          For full details (notes, status, current site) edit the bottle from the Bottles tab after saving.
        </p>
        <Button type="submit" full disabled={tareExceedsGross}>
          {tareExceedsGross ? 'Tare exceeds gross' : 'Add bottle'}
        </Button>
      </form>
    </Modal>
  )
}

function UnitQuickAdd({
  open,
  siteId,
  onClose,
  onCreate,
}: {
  open: boolean
  siteId: string
  onClose: () => void
  onCreate: (
    data: Omit<Unit, 'id' | 'createdAt' | 'status' | 'siteId'>,
  ) => void
}) {
  const [name, setName] = useState('')
  const [refrigerantType, setRefrigerantType] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setName('')
    setRefrigerantType('')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onCreate({
      name: name.trim(),
      refrigerantType: refrigerantType || undefined,
    })
  }

  if (!siteId) return null

  return (
    <Modal open={open} title="Quick add unit" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Unit name / label">
          <TextInput
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Living room split, AHU-2"
          />
        </Field>
        <Field label="Refrigerant (optional)">
          <RefrigerantSelect
            allowEmpty
            value={refrigerantType}
            onChange={setRefrigerantType}
          />
        </Field>
        <p className="text-xs text-slate-500">
          For equipment type, model, serial etc. edit the unit from the Sites tab after saving.
        </p>
        <Button type="submit" full>
          Add unit
        </Button>
      </form>
    </Modal>
  )
}

function BottleForm({
  open,
  title,
  types,
  bottle,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  title: string
  types: string[]
  bottle?: Bottle
  onClose: () => void
  onSave: (data: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>) => void
  onDelete?: () => void
}) {
  const { state, addSite } = useStore()
  const unit = state.unit
  const initialDisplay = (kg: number) =>
    kg ? kgToDisplay(kg, unit).toFixed(2) : ''

  const [bottleNumber, setBottleNumber] = useState(bottle?.bottleNumber ?? '')
  const [bottleKind, setBottleKind] = useState<BottleKind>(
    bottle?.bottleKind ?? 'standard',
  )
  const [refrigerantType, setRefrigerantType] = useState(
    bottle?.refrigerantType ?? types[0] ?? 'R410A',
  )
  const [tareWeight, setTareWeight] = useState(initialDisplay(bottle?.tareWeight ?? 0))
  const [grossWeight, setGrossWeight] = useState(
    initialDisplay(bottle?.grossWeight ?? 0),
  )
  // Sanitize a saved status against the current weights — a bottle
  // whose stored status is 'empty' but whose math now says net > 0
  // (e.g. someone corrected the gross weight after marking it empty)
  // should not display 'Empty'. Snap to 'in_stock' so the form never
  // shows a self-contradictory state.
  const sanitizeStatus = (
    s: BottleStatus | undefined,
    grossKg: number,
    tareKg: number,
  ): BottleStatus => {
    if (s === 'empty' && Math.max(0, grossKg - tareKg) > 0.01) return 'in_stock'
    return s ?? 'in_stock'
  }
  const [status, setStatus] = useState<BottleStatus>(
    sanitizeStatus(
      bottle?.status,
      bottle?.grossWeight ?? 0,
      bottle?.tareWeight ?? 0,
    ),
  )
  const [currentSiteId, setCurrentSiteId] = useState(bottle?.currentSiteId ?? '')
  const [notes, setNotes] = useState(bottle?.notes ?? '')
  const [lastHydro, setLastHydro] = useState(
    toYearMonth(bottle?.lastHydroTestDate ?? ''),
  )
  const [nextHydro, setNextHydro] = useState(
    toYearMonth(bottle?.nextHydroTestDate ?? ''),
  )
  const [addingSite, setAddingSite] = useState(false)

  // "Manual capacity" only matters for bottles received partially used.
  // For the common case (fresh full bottle from supplier) capacity == net.
  const liveNetKgRaw =
    displayToKg(parseFloat(grossWeight) || 0, unit) -
    displayToKg(parseFloat(tareWeight) || 0, unit)
  const liveNet = Math.max(0, liveNetKgRaw)
  const tareKgEntered = displayToKg(parseFloat(tareWeight) || 0, unit)
  const grossKgEntered = displayToKg(parseFloat(grossWeight) || 0, unit)
  // Gross is the total bottle weight (tare + refrigerant) — it can never
  // be less than tare. Show an inline error and block save.
  const tareExceedsGross =
    tareKgEntered > 0 && grossKgEntered > 0 && tareKgEntered > grossKgEntered + 0.01

  // capacityWeight holds the stamped water capacity (W.C) in display units.
  // Safe fill = W.C × FR(refrigerant) is computed downstream (live check
  // and on save), so this value stays the same when refrigerant changes.
  // Legacy bottles stored initialNetWeight as the FR-adjusted safe fill;
  // reverse-derive WC from that for editing.
  const [capacityWeight, setCapacityWeight] = useState(
    initialDisplay(
      wcFromSafeFill(bottle?.initialNetWeight ?? 0, bottle?.refrigerantType),
    ),
  )

  // "Empty" status only makes sense when the bottle actually contains
  // no refrigerant. Reverse of the addTransaction auto-empty behaviour:
  // there we flip status to 'empty' when a transaction drains net to
  // ~0; here we block the user from manually marking a bottle empty
  // while the math says it has contents.
  const statusEmptyButHasContent = status === 'empty' && liveNet > 0.01
  const submitBlocked = tareExceedsGross || statusEmptyButHasContent

  // W.C is refrigerant-independent, so changing refrigerant doesn't touch
  // the field — the safe fill (W.C × FR) is recomputed live for the
  // overfill check and on submit.

  // Reset the form whenever the modal opens, OR when switching between
  // two different bottles within a single open lifecycle. The previous
  // logic keyed only on bottle.id, so adding two new bottles in a row
  // ('new' → 'new') skipped the reset and the second form still had the
  // first bottle's values in it.
  const resetKey = `${open ? 'open' : 'closed'}:${bottle?.id ?? 'new'}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (open && resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setBottleNumber(bottle?.bottleNumber ?? '')
    setBottleKind(bottle?.bottleKind ?? 'standard')
    setRefrigerantType(bottle?.refrigerantType ?? types[0] ?? 'R410A')
    setTareWeight(initialDisplay(bottle?.tareWeight ?? 0))
    setGrossWeight(initialDisplay(bottle?.grossWeight ?? 0))
    setStatus(
      sanitizeStatus(
        bottle?.status,
        bottle?.grossWeight ?? 0,
        bottle?.tareWeight ?? 0,
      ),
    )
    setCurrentSiteId(bottle?.currentSiteId ?? '')
    setNotes(bottle?.notes ?? '')
    setCapacityWeight(
      initialDisplay(
        wcFromSafeFill(bottle?.initialNetWeight ?? 0, bottle?.refrigerantType),
      ),
    )
    setLastHydro(toYearMonth(bottle?.lastHydroTestDate ?? ''))
    setNextHydro(toYearMonth(bottle?.nextHydroTestDate ?? ''))
  } else if (!open && lastResetKey !== resetKey) {
    // Track the closed state too so the next open transition is detected.
    setLastResetKey(resetKey)
  }

  // Reactive snap: if the user is editing weights and the bottle's
  // net rises above ~zero while the status field is still Empty,
  // flip the status. This stops a user from holding the form in a
  // contradictory state while they correct the gross weight.
  useEffect(() => {
    if (status === 'empty' && liveNet > 0.01) setStatus('in_stock')
  }, [status, liveNet])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitBlocked) return
    const tare = displayToKg(parseFloat(tareWeight) || 0, unit)
    const gross = displayToKg(parseFloat(grossWeight) || 0, unit)
    const currentNet = Math.max(0, gross - tare)
    const enteredWcKg = displayToKg(parseFloat(capacityWeight) || 0, unit)
    // Safe fill (stored as initialNetWeight) = W.C × FR for the refrigerant.
    // Falls back to currentNet for legacy "fresh full bottle" entries with
    // no W.C — keeps old behaviour for partially-filled receipts.
    const initialNet =
      enteredWcKg > 0
        ? safeFillKgFor(enteredWcKg, refrigerantType)
        : currentNet
    onSave({
      bottleNumber: bottleNumber.trim(),
      bottleKind: bottleKind === 'standard' ? undefined : bottleKind,
      refrigerantType,
      tareWeight: tare,
      grossWeight: gross,
      initialNetWeight: initialNet,
      status,
      currentSiteId: currentSiteId || undefined,
      notes: notes.trim() || undefined,
      lastHydroTestDate: lastHydro || undefined,
      nextHydroTestDate: nextHydro || undefined,
    })
  }


  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Bottle ID / number" hint="Label or serial of the bottle">
          <TextInput
            required
            value={bottleNumber}
            onChange={(e) => setBottleNumber(e.target.value)}
            placeholder="e.g. B-102"
          />
        </Field>
        <Field label="Bottle type">
          <Picker
            title="Bottle type"
            value={bottleKind}
            onChange={(v) => setBottleKind(v as BottleKind)}
            options={[
              {
                value: 'standard',
                label: BOTTLE_KIND_LABELS.standard,
                hint: 'Single-refrigerant cylinder',
              },
              {
                value: 'pump_down',
                label: BOTTLE_KIND_LABELS.pump_down,
                hint: 'Holds refrigerant pumped down / recovered from a system',
              },
            ]}
          />
        </Field>
        <Field
          label="Refrigerant type"
          hint={
            bottleKind === 'pump_down'
              ? 'Pick "Unknown" if the recovered gas isn’t identified.'
              : undefined
          }
        >
          <RefrigerantSelect
            required
            value={refrigerantType}
            onChange={setRefrigerantType}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Tare (empty) ${unit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={tareWeight}
              onChange={(e) => setTareWeight(e.target.value)}
              placeholder="e.g. 5.20"
            />
          </Field>
          <Field label={`Gross (current) ${unit}`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              required
              value={grossWeight}
              onChange={(e) => setGrossWeight(e.target.value)}
              placeholder="e.g. 16.30"
            />
          </Field>
        </div>

        {tareExceedsGross && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ Tare ({formatWeight(tareKgEntered, unit)}) is greater than gross
            ({formatWeight(grossKgEntered, unit)}). Gross is the total bottle
            weight (tare + refrigerant), so it can't be less than tare. Check
            both readings.
          </div>
        )}

        {!tareExceedsGross && liveNet > 0 && (() => {
          const wcKg = displayToKg(parseFloat(capacityWeight) || 0, unit)
          const safeFillKg = wcKg > 0 ? safeFillKgFor(wcKg, refrigerantType) : 0
          const over = safeFillKg > 0 ? overfillKg(liveNet, safeFillKg) : 0
          return (
            <div
              className={`rounded-xl p-3 text-sm ${
                over > 0
                  ? 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
                  : 'bg-brand-50 text-brand-900 dark:bg-brand-900/20 dark:text-brand-100'
              }`}
            >
              Net refrigerant in bottle:{' '}
              <strong>{formatWeight(liveNet, unit)}</strong>
              <div className="mt-0.5 text-xs">
                (gross − tare, calculated automatically)
              </div>
              {safeFillKg > 0 && (
                <div className="mt-0.5 text-xs">
                  Safe fill for {refrigerantType}:{' '}
                  <strong>{formatWeight(safeFillKg, unit)}</strong>
                  {' '}(W.C × FR {fillingRatio(refrigerantType).toFixed(2)})
                </div>
              )}
              {over > 0 && (
                <div className="mt-1 font-semibold">
                  ⚠ Over safe-fill limit by {formatWeight(over, unit)}
                </div>
              )}
            </div>
          )
        })()}

        <Field
          label={`W.C (${unit})`}
          hint="Stamped water capacity. Safe fill is calculated automatically from W.C × the selected refrigerant's filling ratio."
        >
          <TextInput
            type="number"
            inputMode="decimal"
            step="0.01"
            value={capacityWeight}
            onChange={(e) => setCapacityWeight(e.target.value)}
            placeholder={`e.g. ${unit === 'kg' ? '11.10' : '24.47'}`}
          />
        </Field>

        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Cylinder test (AS 2030)
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Optional — copy the month and year stamped on the cylinder
            collar. We'll warn you the month before the next test is due
            (and once it's overdue), so you don't take a non-compliant
            cylinder to a job.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Last test">
              <MonthInput
                value={lastHydro}
                onChange={(v) => {
                  setLastHydro(v)
                  // Auto-fill the 10-year next-test due month when the
                  // last test is set. AS 2030.5 requires periodic
                  // inspection every 10 years for steel refrigerant
                  // recovery cylinders. Don't overwrite a value the tech
                  // has already typed unless it was the previously
                  // auto-derived one.
                  if (!v) return
                  const auto = plusYearsYm(v, 10)
                  const prevAuto =
                    lastHydro && plusYearsYm(lastHydro, 10) === nextHydro
                  if (!nextHydro || prevAuto) setNextHydro(auto)
                }}
                ariaLabel="Last hydro test (month and year)"
              />
            </Field>
            <Field label="Next test due">
              <MonthInput
                value={nextHydro}
                onChange={setNextHydro}
                ariaLabel="Next hydro test due (month and year)"
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Next test auto-fills to 10 years after the last test (AS
            2030.5). Edit it if your cylinder has a different stamp.
          </p>
        </div>

        <Field label="Status">
          <Picker
            title="Status"
            value={status}
            onChange={(v) => {
              if (v === 'empty' && liveNet > 0.01) return
              setStatus(v as BottleStatus)
            }}
            options={[
              { value: 'in_stock', label: 'In stock' },
              {
                value: 'on_site',
                label: 'On site',
                hint: 'Currently at a site / job',
              },
              { value: 'returned', label: 'Returned' },
              {
                value: 'empty',
                label: 'Empty',
                hint:
                  liveNet > 0.01
                    ? 'Bottle still has refrigerant — clear gross weight first'
                    : undefined,
              },
            ]}
          />
        </Field>

        {statusEmptyButHasContent && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ Status is "Empty" but the bottle still has{' '}
            {formatWeight(liveNet, unit)} of refrigerant. Pick "In stock",
            "On site", or "Returned" — or correct the gross weight if the
            bottle really is empty.
          </div>
        )}

        {status === 'on_site' && (
          <Field label="Current site">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Picker
                  title="Current site"
                  value={currentSiteId}
                  onChange={setCurrentSiteId}
                  placeholder="— pick a site —"
                  options={state.sites.map((j) => ({
                    value: j.id,
                    label: j.name,
                  }))}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAddingSite(true)}
              >
                + New
              </Button>
            </div>
          </Field>
        )}

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button type="submit" full disabled={submitBlocked}>
            {tareExceedsGross
              ? 'Tare exceeds gross'
              : statusEmptyButHasContent
                ? 'Bottle isn’t empty'
                : 'Save'}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </form>

      <SiteForm
        open={addingSite}
        title="New site"
        onClose={() => setAddingSite(false)}
        onSave={(data) => {
          const created = addSite(data)
          setCurrentSiteId(created.id)
          setAddingSite(false)
        }}
      />
    </Modal>
  )
}

// Reverse of safeFillKgFor — derive stamped W.C from a stored safe-fill
// value using the refrigerant's filling ratio. Used to seed the W.C
// field when editing a bottle whose initialNetWeight was stored as the
// FR-adjusted safe fill. Rounds in the display layer only — rounding
// here would drift on lb round-trips (kg → lb display → kg storage).
function wcFromSafeFill(safeFillKg: number, refrigerant?: string): number {
  if (!safeFillKg) return 0
  return safeFillKg / fillingRatio(refrigerant)
}

// Truncate a stored cylinder test date to YYYY-MM. Accepts both legacy
// YYYY-MM-DD values and the current YYYY-MM. Returns '' for anything
// unrecognised so callers can no-op safely.
function toYearMonth(s: string): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  return ''
}

// Add `years` to a YYYY-MM string. Returns '' on bad input so the
// caller can no-op safely.
function plusYearsYm(ym: string, years: number): string {
  if (!ym) return ''
  const m = ym.match(/^(\d{4})-(\d{2})$/)
  if (!m) return ''
  const y = Number(m[1]) + years
  const mo = Number(m[2])
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`
}
