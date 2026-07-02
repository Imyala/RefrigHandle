import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
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
import { BottleLabels } from '../components/BottleLabels'
import {
  type Bottle,
  type BottleKind,
  type BottleStatus,
  type Transaction,
  type TransactionKind,
  BOTTLE_KIND_LABELS,
  REFRIGERANT_TYPES,
  fillingRatio,
  hydroStatusFor,
  isDuplicateActiveBottleNumber,
  isDuplicateBottleNumber,
  netWeight,
  overfillKg,
  SAFE_FILL_NOTE,
  safeFillKgFor,
  siteLabel,
  sortRefrigerants,
  statusLabel,
  totalSafeWeight,
  transactionLabel,
} from '../lib/types'
import { RefrigerantSelect } from '../components/RefrigerantSelect'
import { MonthInput } from '../components/MonthInput'
import { ScanButton } from '../components/ScanButton'
import { profileFor } from '../lib/compliance'
import { SiteForm } from './Sites'
import { BottleQuickAdd } from '../components/QuickAdd'
import { LogForm } from '../components/LogForm'
import { ShareTxModal } from '../components/ShareSheet'
import { addPhoto } from '../lib/attachments'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { formatDateTime, formatStampedTime } from '../lib/datetime'

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
  const {
    state,
    addBottle,
    updateBottle,
    deleteBottle,
    addTransaction,
    addCustomRefrigerant,
  } = useStore()
  const { bottles, sites, customRefrigerants, unit } = state
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState<Bottle | null>(null)
  const [adding, setAdding] = useState(false)
  // The "+ Add" button opens the lean quick-add first (number / refrigerant
  // / tare / gross); full details (W.C, supplier, test dates…) are one tap
  // away via "More fields" or by editing the bottle afterwards.
  const [quickAdding, setQuickAdding] = useState(false)
  // Cylinders to print QR labels for (one bottle, or the visible set).
  const [labelsFor, setLabelsFor] = useState<Bottle[] | null>(null)
  // Set after a "Save & share" so the share sheet pops for the new record.
  const [shareTx, setShareTx] = useState<Transaction | null>(null)
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
  // Track which groups are EXPANDED. A returning tech gets exactly the
  // collapsed/expanded layout they left; a first-time visitor with no saved
  // layout shouldn't land on a wall of collapsed headings hiding every
  // cylinder, so a small inventory opens all groups by default until they
  // touch a heading. `hadSavedLayout` (read once) tells the two apart; we
  // only persist after a real interaction so the default isn't frozen in.
  const hadSavedLayout = useMemo(() => {
    try {
      return localStorage.getItem('bottles.expandedGroups') != null
    } catch {
      return false
    }
  }, [])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('bottles.expandedGroups')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      /* localStorage unavailable — start collapsed */
    }
    return new Set()
  })
  // Flips true the first time the tech expands/collapses a group. Until
  // then a fresh install shows the auto-open default; after, their exact
  // layout is what's saved and restored.
  const [groupsTouched, setGroupsTouched] = useState(false)
  useEffect(() => {
    if (!groupsTouched) return
    try {
      localStorage.setItem(
        'bottles.expandedGroups',
        JSON.stringify([...expandedGroups]),
      )
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [expandedGroups, groupsTouched])

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

  // Deep-link target: the compliance alert panel (Home / Log) navigates
  // here with `{ focusBottle: id }` in history state to open a specific
  // cylinder. We key off location.key — which is unique per navigation —
  // so tapping the same alert twice reopens the sheet, and an unrelated
  // state change on this page doesn't retrigger it. Adjusting state
  // during render (the React-blessed pattern) avoids a setState-in-effect.
  const location = useLocation()
  const focusBottleId = (location.state as { focusBottle?: string } | null)
    ?.focusBottle
  const [handledFocusKey, setHandledFocusKey] = useState<string | null>(null)
  if (focusBottleId && location.key !== handledFocusKey) {
    setHandledFocusKey(location.key)
    if (bottles.some((b) => b.id === focusBottleId)) {
      setSheetBottleId(focusBottleId)
    }
  }

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
      // A returned bottle has gone back to the supplier — it's out of the
      // tech's hands, so it's hidden from the working list (All / In stock /
      // On site / Empty) and only shows under the "Returned" filter, where
      // a mistaken return can be corrected. Its log entries stay untouched.
      .filter((b) =>
        filter === 'all' ? b.status !== 'returned' : b.status === filter,
      )
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
          label = siteLabel(site)
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

  // First-visit default: with no saved layout, a small inventory shows
  // every group open so cylinders are visible immediately rather than
  // hidden behind collapsed headings. A large inventory stays collapsed
  // (tidier — the original intent). Once the tech touches a heading their
  // own layout takes over.
  const autoOpenAll =
    !hadSavedLayout && !groupsTouched && visible.length <= 25
  const isGroupOpen = (key: string) =>
    autoOpenAll || expandedGroups.has(key)
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      // On the first toggle while everything was open-by-default,
      // materialise that full set so collapsing one keeps the rest open.
      const base =
        autoOpenAll && groups ? new Set(groups.map((g) => g.key)) : new Set(prev)
      if (base.has(key)) base.delete(key)
      else base.add(key)
      return base
    })
    setGroupsTouched(true)
  }

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
              <div className="mt-1 text-sm text-slate-500">{siteLabel(site)}</div>
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
                      {' '}· {profileFor(state.jurisdiction).techLicenceShort}{' '}
                      {b.createdByLicence}
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
        <Button onClick={() => setQuickAdding(true)}>+ Add</Button>
      </div>

      {bottles.length > 0 && (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <TextInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by Bottle Number"
            />
          </div>
          <ScanButton
            title="Scan a cylinder barcode"
            onScan={(text) => {
              // Exact (case-insensitive) match jumps straight to that
              // cylinder's action sheet; otherwise drop the scanned text
              // into the search box so a partial label still helps.
              const hit = bottles.find(
                (b) =>
                  b.bottleNumber.trim().toLowerCase() ===
                  text.trim().toLowerCase(),
              )
              if (hit) {
                setQuery('')
                setSheetBottleId(hit.id)
              } else {
                setQuery(text)
                toast.show(`No bottle matched “${text}”`, 'info')
              }
            }}
          />
        </div>
      )}

      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {(['all', 'in_stock', 'on_site', 'returned', 'empty'] as const).map(
          (f) => {
            const count =
              f === 'all'
                ? bottles.filter((b) => b.status !== 'returned').length
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

      {/* When a filter/search is narrowing the list, say so explicitly so a
          tech doesn't think cylinders went missing — and offer one tap back
          to the full list. */}
      {bottles.length > 0 && (filter !== 'all' || query.trim() !== '') && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing {visible.length} of {bottles.length}{' '}
            {bottles.length === 1 ? 'bottle' : 'bottles'}
          </span>
          <button
            type="button"
            onClick={() => {
              setFilter('all')
              setQuery('')
            }}
            className="shrink-0 font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Clear filter
          </button>
        </div>
      )}

      {visible.length > 0 && (
        <div className="flex justify-end px-1">
          <button
            type="button"
            onClick={() => setLabelsFor(visible)}
            className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            🏷 Print scannable labels ({visible.length})
          </button>
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
              <Button onClick={() => setQuickAdding(true)}>+ Add bottle</Button>
            ) : undefined
          }
        />
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = isGroupOpen(g.key)
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
        onLabel={() => {
          if (sheetBottle) {
            setLabelsFor([sheetBottle])
            setSheetBottleId(null)
          }
        }}
      />

      {labelsFor && (
        <BottleLabels
          bottles={labelsFor}
          unit={unit}
          onClose={() => setLabelsFor(null)}
        />
      )}

      <LogForm
        open={!!sheetBottle && !!logKind}
        initialBottleId={sheetBottle?.id}
        initialKind={logKind ?? undefined}
        onClose={() => setLogKind(null)}
        onSave={(data, share) => {
          // Staged photos are bound to the new row's id in the attachment
          // store, not stored on the transaction itself.
          const { photos, ...txData } = data
          const result = addTransaction(txData)
          if (result) {
            if (photos && photos.length > 0) {
              const txId = result.id
              void Promise.all(
                photos.map((f) => addPhoto('transaction', txId, f)),
              ).catch(() =>
                toast.show('Logged, but a photo could not be saved', 'error'),
              )
            }
            toast.show(
              data.amount > 0
                ? `${transactionLabel(data.kind)} logged: ${formatWeight(data.amount, state.unit)}`
                : `${transactionLabel(data.kind)} logged`,
            )
            setLogKind(null)
            setSheetBottleId(null)
            if (share) setShareTx(result)
          } else {
            // The store refused the row (bottle deleted on another device
            // between open and save) — say so instead of a silent no-op.
            toast.show(
              'Could not log — that bottle no longer exists. Re-pick the bottle and try again.',
              'error',
            )
          }
        }}
      />

      {shareTx && (
        <ShareTxModal t={shareTx} onClose={() => setShareTx(null)} />
      )}

      {/* Quick-add is the default for "+ Add" — the lean path. "More fields"
          switches to the full form for supplier / W.C / test dates. */}
      <BottleQuickAdd
        open={quickAdding}
        types={allTypes}
        onClose={() => setQuickAdding(false)}
        onCreate={(data, customType) => {
          if (customType) addCustomRefrigerant(customType)
          addBottle(data)
          setQuickAdding(false)
          toast.show('Bottle added')
        }}
        onMoreDetails={() => {
          setQuickAdding(false)
          setAdding(true)
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
            // A manual change to the gross weight changes the bottle's
            // contents with no charge/recover to explain it. Record a
            // signed 'adjust' so the refrigerant ledger (and the audit
            // trail) reflects the change instead of it happening silently.
            // updateBottle below sets gross to the same value absolutely,
            // so the delta is applied once, not twice. Tare-only edits
            // (an empty-mass correction) aren't refrigerant and don't log.
            const grossDelta =
              Math.round(((data.grossWeight ?? editing.grossWeight) - editing.grossWeight) * 1000) / 1000
            if (Math.abs(grossDelta) > 0.0005) {
              addTransaction({
                bottleId: editing.id,
                kind: 'adjust',
                amount: grossDelta,
                date: new Date().toISOString(),
                notes: 'Manual weight correction (bottle edit)',
              })
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
                  title: 'Remove this bottle?',
                  message:
                    'The bottle moves to Recently deleted (Change log → Recently deleted), where a supervisor can restore it. Its refrigerant log entries stay on the record and keep counting in reports — retiring a cylinder never changes past quarterly figures.',
                  confirmLabel: 'Remove bottle',
                  danger: true,
                })
                if (ok) {
                  deleteBottle(editing.id)
                  setEditing(null)
                  toast.show('Bottle removed — restore it from Recently deleted', 'info')
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
  onLabel,
}: {
  bottle: Bottle | null
  onClose: () => void
  onLog: (kind: TransactionKind) => void
  onEdit: () => void
  onLabel: () => void
}) {
  const { state, updateBottle } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  // Inline cylinder-test-date editor, revealed by "Update test dates".
  // Seeded from the bottle and reset whenever the sheet opens or switches
  // bottles (render-adjustment pattern, no effect needed).
  const [showTestEdit, setShowTestEdit] = useState(false)
  const [lastYm, setLastYm] = useState('')
  const [nextYm, setNextYm] = useState('')
  const openKey = bottle ? `open:${bottle.id}` : 'closed'
  const [seenKey, setSeenKey] = useState('')
  if (openKey !== seenKey) {
    setSeenKey(openKey)
    if (bottle) {
      setShowTestEdit(false)
      setLastYm(toYearMonth(bottle.lastHydroTestDate ?? ''))
      setNextYm(toYearMonth(bottle.nextHydroTestDate ?? ''))
    }
  }
  if (!bottle) return null
  const unit = state.unit
  const site = state.sites.find((j) => j.id === bottle.currentSiteId)
  const net = netWeight(bottle)
  const hydro = hydroStatusFor(bottle)
  const lastTested = formatYearMonth(toYearMonth(bottle.lastHydroTestDate ?? ''))
  const nextDue = formatYearMonth(toYearMonth(bottle.nextHydroTestDate ?? ''))
  const sentForRetest = bottle.sentForRetestAt
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
          {bottle.initialNetWeight > 0 && (
            <div className="mt-0.5 text-sm text-brand-100">
              Safe fill {formatWeight(bottle.initialNetWeight, unit)}
              {totalSafeWeight(bottle) != null && (
                <> · Full {formatWeight(totalSafeWeight(bottle)!, unit)}</>
              )}
            </div>
          )}
          {site && (
            <div className="mt-1 text-sm text-brand-100">{siteLabel(site)}</div>
          )}
        </div>

        {/* Primary actions first — opening a bottle, a tech almost always
            wants to log against it. The test/compliance panel sits below. */}
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => onLog('charge')} variant="primary">
            Charge
          </Button>
          <Button onClick={() => onLog('recover')} variant="primary">
            Recover
          </Button>
        </div>

        {bottle.status === 'returned' ? (
          // Correction for a return logged by mistake — brings the bottle
          // back into stock. The original return stays in the log.
          <Button
            variant="secondary"
            full
            onClick={async () => {
              const ok = await confirm({
                title: 'Return this bottle to stock?',
                message:
                  'Use this to correct a return logged by mistake — it brings the bottle back into your stock. The original return stays on the log.',
                confirmLabel: 'Return to stock',
              })
              if (!ok) return
              updateBottle(bottle.id, {
                status: net > 0.01 ? 'in_stock' : 'empty',
              })
              toast.show('Bottle returned to stock')
              onClose()
            }}
          >
            Return to stock
          </Button>
        ) : (
          <Button onClick={() => onLog('return')} variant="secondary" full>
            Return bottle
          </Button>
        )}

        {/* Cylinder hydrostatic test (AS 2030): dates, overdue alarm,
            sent-for-retest flag, and inline date updating. */}
        <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cylinder test (AS 2030)
            </div>
            {sentForRetest ? (
              <Pill tone="blue">Awaiting retest</Pill>
            ) : hydro.status === 'overdue' ? (
              <Pill tone="red">Overdue</Pill>
            ) : hydro.status === 'due_soon' ? (
              <Pill tone="amber">
                {hydro.monthsUntilDue === 0 ? 'Due this month' : 'Due next month'}
              </Pill>
            ) : hydro.status === 'ok' ? (
              <Pill tone="green">In date</Pill>
            ) : (
              <Pill tone="slate">No date</Pill>
            )}
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-xs text-slate-500">Last tested</div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {lastTested || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Next due</div>
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {nextDue || '—'}
              </div>
            </div>
          </div>

          {sentForRetest ? (
            <div className="mt-2 rounded-xl bg-blue-50 p-2.5 text-xs font-medium text-blue-900 dark:bg-blue-900/20 dark:text-blue-100">
              Sent for retest on{' '}
              {formatDateTime(sentForRetest, state.location.timezone, state.clock)}
              . Enter the new test dates below when it's back.
            </div>
          ) : hydro.status === 'overdue' ? (
            <div className="mt-2 rounded-xl bg-red-50 p-2.5 text-xs font-medium text-red-900 dark:bg-red-900/20 dark:text-red-100">
              ⛔ Hydrostatic test overdue
              {hydro.monthsUntilDue != null
                ? ` by ${Math.abs(hydro.monthsUntilDue)} ${
                    Math.abs(hydro.monthsUntilDue) === 1 ? 'month' : 'months'
                  }`
                : ''}{' '}
              — don't take this cylinder to a job until it's retested.
            </div>
          ) : hydro.status === 'due_soon' ? (
            <div className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs font-medium text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
              ⚠ Hydrostatic test due{' '}
              {hydro.monthsUntilDue === 0 ? 'this month' : 'next month'} — plan a
              retest soon.
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (sentForRetest) {
                  updateBottle(bottle.id, { sentForRetestAt: undefined })
                  toast.show('Retest flag cleared', 'info')
                } else {
                  updateBottle(bottle.id, {
                    sentForRetestAt: new Date().toISOString(),
                  })
                  toast.show('Marked as sent for retest')
                }
              }}
            >
              {sentForRetest ? 'Cancel retest' : 'Sent for retest'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowTestEdit((v) => !v)}
            >
              {showTestEdit ? 'Cancel' : 'Update test dates'}
            </Button>
          </div>

          {showTestEdit && (
            <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Last test">
                  <MonthInput
                    value={lastYm}
                    onChange={(v) => {
                      setLastYm(v)
                      // Auto-fill next due 10 years on (AS 2030.5), unless
                      // the tech already set a custom next date.
                      if (!v) return
                      const auto = plusYearsYm(v, 10)
                      const prevAuto =
                        lastYm && plusYearsYm(lastYm, 10) === nextYm
                      if (!nextYm || prevAuto) setNextYm(auto)
                    }}
                    ariaLabel="Last hydro test (month and year)"
                  />
                </Field>
                <Field label="Next due">
                  <MonthInput
                    value={nextYm}
                    onChange={setNextYm}
                    ariaLabel="Next hydro test due (month and year)"
                  />
                </Field>
              </div>
              <Button
                type="button"
                full
                onClick={() => {
                  updateBottle(bottle.id, {
                    lastHydroTestDate: lastYm || undefined,
                    nextHydroTestDate: nextYm || undefined,
                    // New dates entered → the retest is done, clear the flag.
                    sentForRetestAt: undefined,
                  })
                  setShowTestEdit(false)
                  toast.show('Test dates updated')
                }}
              >
                Save test dates
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={onEdit} variant="ghost" full>
            Edit details
          </Button>
          <Button onClick={onLabel} variant="ghost" full>
            🏷 New scannable label
          </Button>
        </div>

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
                        {formatStampedTime(t.date, t.tz, state.location.timezone, state.clock)}
                        {(j ? siteLabel(j) : t.siteName) ? ` · ${j ? siteLabel(j) : t.siteName}` : ''}
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
  const [supplier, setSupplier] = useState(bottle?.supplier ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState(bottle?.invoiceNumber ?? '')
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
  // Duplicate guards (see BottleQuickAdd) — exclude the bottle being
  // edited so saving it under its own number doesn't flag. A clash with an
  // ACTIVE bottle is blocked; one only with a returned cylinder is warned.
  const duplicateActive = isDuplicateActiveBottleNumber(
    state.bottles,
    bottleNumber,
    bottle?.id,
  )
  const duplicateNumber =
    !duplicateActive &&
    isDuplicateBottleNumber(state.bottles, bottleNumber, bottle?.id)

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
  const submitBlocked =
    tareExceedsGross || statusEmptyButHasContent || duplicateActive

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
    setSupplier(bottle?.supplier ?? '')
    setInvoiceNumber(bottle?.invoiceNumber ?? '')
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
  // contradictory state while they correct the gross weight. Adjusted
  // during render (self-limiting: the set makes the condition false)
  // so the corrected status paints immediately.
  if (status === 'empty' && liveNet > 0.01) {
    setStatus('in_stock')
  }

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
      supplier: supplier.trim() || undefined,
      invoiceNumber: invoiceNumber.trim() || undefined,
      lastHydroTestDate: lastHydro || undefined,
      nextHydroTestDate: nextHydro || undefined,
    })
  }


  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Bottle ID / number" hint="Label or serial of the bottle">
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <TextInput
                required
                value={bottleNumber}
                onChange={(e) => setBottleNumber(e.target.value)}
                placeholder="e.g. B-102"
              />
            </div>
            <ScanButton
              title="Scan the cylinder barcode"
              onScan={setBottleNumber}
            />
          </div>
        </Field>
        {duplicateActive && (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-900/20 dark:text-red-100">
            ⛔ Another in-service bottle is numbered{' '}
            <strong>{bottleNumber.trim()}</strong>. Two active cylinders can't
            share a number — it makes every scan and search ambiguous. Use a
            different number, or return the existing one first.
          </div>
        )}
        {duplicateNumber && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            ⚠ This number matches a cylinder that's been returned. Re-using it
            is allowed, but double-check it's the right number.
          </div>
        )}
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

        <Field
          label={`Water capacity (${unit})`}
          hint="The W.C figure stamped on the cylinder. Safe fill is worked out automatically from it and the refrigerant's filling ratio."
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
              {safeFillKg > 0 && (
                <div className="mt-1 text-xs opacity-80">{SAFE_FILL_NOTE}</div>
              )}
              {safeFillKg > 0 && tareKgEntered > 0 && (
                <div className="mt-0.5 text-xs">
                  Total safe weight (full):{' '}
                  <strong>{formatWeight(tareKgEntered + safeFillKg, unit)}</strong>
                  {' '}— the scale reading at maximum safe fill (tare + safe fill).
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

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Supplier"
            hint="Who the cylinder came from — for the ARC purchase record."
          >
            <TextInput
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. BOC, Coregas"
            />
          </Field>
          <Field label="Invoice / docket #">
            <TextInput
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="e.g. INV-48213"
            />
          </Field>
        </div>

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
                    label: siteLabel(j),
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
                : duplicateActive
                  ? 'Number already in use'
                  : 'Save'}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Remove
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

// Render a stored YYYY-MM (or legacy YYYY-MM-DD) cylinder test date as
// "Jul 2035" for display. Returns '' for anything unrecognised.
const MONTH_LABELS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]
function formatYearMonth(s: string): string {
  const ym = toYearMonth(s)
  const m = ym.match(/^(\d{4})-(\d{2})$/)
  if (!m) return ''
  return `${MONTH_LABELS_SHORT[Number(m[2]) - 1] ?? ''} ${m[1]}`
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
