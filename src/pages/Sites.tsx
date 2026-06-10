import { useMemo, useState } from 'react'
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
import { Picker, type PickerOption } from '../components/Picker'
import { useStore } from '../lib/store'
import {
  AU_CITIES_BY_REGION,
  AU_REGIONS,
  CITIES_BY_COUNTRY,
  CITY_OTHER_VALUE,
  NON_REFRIGERANT_UNIT_KINDS,
  REASON_LABELS,
  UNIT_KIND_LABELS,
  gwpFor,
  leakStatusFor,
  netWeight,
  statusLabel,
  tonnesCO2eFor,
  transactionLabel,
  transactionLoss,
  type Bottle,
  type LeakStatus,
  type Site,
  type Transaction,
  type Unit,
  type UnitKind,
} from '../lib/types'
import { RefrigerantSelect } from '../components/RefrigerantSelect'
import { DateInput } from '../components/DateInput'
import { formatDateTime } from '../lib/datetime'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'

export default function Sites() {
  const { state, addSite } = useStore()
  const { sites } = state

  const [openSite, setOpenSite] = useState<Site | null>(null)
  const [adding, setAdding] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Bundle sites under a heading by their `group` label (case-insensitive),
  // sites in the same group sorted by name, groups sorted alphabetically
  // with the "Ungrouped" bucket last.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; sites: Site[] }>()
    for (const s of sites) {
      const raw = s.group?.trim() ?? ''
      const key = raw.toLowerCase()
      if (!map.has(key)) map.set(key, { label: raw, sites: [] })
      map.get(key)!.sites.push(s)
    }
    const entries = Array.from(map.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      sites: v.sites.slice().sort((a, b) => a.name.localeCompare(b.name)),
    }))
    entries.sort((a, b) => {
      if (a.key === '') return 1
      if (b.key === '') return -1
      return a.label.localeCompare(b.label)
    })
    return entries
  }, [sites])

  const hasGroups = groups.some((g) => g.key !== '')

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Sites
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add site</Button>
      </div>

      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          body="A site is anywhere with HVAC/R equipment — a home, business, factory, or shop. Each site can hold multiple units."
          action={<Button onClick={() => setAdding(true)}>+ Add site</Button>}
        />
      ) : !hasGroups ? (
        <div className="space-y-2">
          {groups[0].sites.map((s) => (
            <SiteCard key={s.id} site={s} onOpen={() => setOpenSite(s)} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const collapsed = collapsedGroups.has(g.key)
            return (
              <div key={g.key || '__ungrouped__'}>
                <SectionHeader
                  title={`${g.label || 'Ungrouped'} (${g.sites.length})`}
                  open={!collapsed}
                  onToggle={() => toggleGroup(g.key)}
                />
                {!collapsed && (
                  <div className="space-y-2">
                    {g.sites.map((s) => (
                      <SiteCard
                        key={s.id}
                        site={s}
                        onOpen={() => setOpenSite(s)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <SiteForm
        open={adding}
        title="New site"
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addSite(data)
          setAdding(false)
        }}
      />

      <SiteDetail
        site={openSite}
        onClose={() => setOpenSite(null)}
      />
    </div>
  )
}

function SiteCard({ site, onOpen }: { site: Site; onOpen: () => void }) {
  const { state } = useStore()
  const { units, bottles, transactions, unit } = state

  const activeUnits = units.filter(
    (u) => u.siteId === site.id && u.status === 'active',
  )
  const decommissioned = units.filter(
    (u) => u.siteId === site.id && u.status === 'decommissioned',
  )
  const onSite = bottles.filter((b) => b.currentSiteId === site.id)
  const charged = transactions
    .filter((t) => t.siteId === site.id && t.kind === 'charge')
    .reduce((s, t) => s + t.amount, 0)

  return (
    <Card className="!p-3">
      <button className="w-full text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {site.name}
            </div>
            {site.client && (
              <div className="mt-0.5 text-sm text-slate-500">{site.client}</div>
            )}
            {site.address && (
              <div className="truncate text-xs text-slate-500">{site.address}</div>
            )}
          </div>
          <span className="shrink-0 text-slate-400" aria-hidden>
            ›
          </span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
          <Stat value={activeUnits.length} label="active units" />
          <Stat value={onSite.length} label="bottles on site" />
          <Stat value={formatWeight(charged, unit)} label="charged" />
        </div>

        {decommissioned.length > 0 && (
          <div className="mt-2 text-xs text-slate-500">
            {decommissioned.length} decommissioned on record
          </div>
        )}
      </button>
    </Card>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
      <div className="font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </div>
      <div className="text-slate-500">{label}</div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  italic,
}: {
  label: string
  value?: string
  italic?: boolean
}) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd
        className={`text-sm text-slate-900 dark:text-slate-100 ${italic ? 'italic text-slate-600 dark:text-slate-300' : ''}`}
      >
        {value}
      </dd>
    </div>
  )
}

function SiteDetail({
  site,
  onClose,
}: {
  site: Site | null
  onClose: () => void
}) {
  const {
    state,
    updateSite,
    deleteSite,
    addUnit,
    updateUnit,
    deleteUnit,
    decommissionUnit,
    reactivateUnit,
    updateBottle,
    addTransaction,
  } = useStore()
  const toast = useToast()
  const confirm = useConfirm()

  const [editing, setEditing] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)
  const [addingBottle, setAddingBottle] = useState(false)
  const [editUnit, setEditUnit] = useState<Unit | null>(null)
  const [decommissionTarget, setDecommissionTarget] = useState<Unit | null>(null)
  const [showDecommissioned, setShowDecommissioned] = useState(true)
  const [logbookUnit, setLogbookUnit] = useState<Unit | null>(null)
  const [bottlesOpen, setBottlesOpen] = useState(true)
  const [unitsOpen, setUnitsOpen] = useState(true)
  const [auditScope, setAuditScope] = useState<'site' | 'bottles' | null>(null)

  const siteId = site?.id ?? ''
  const activeUnits = useMemo(
    () =>
      state.units
        .filter((u) => u.siteId === siteId && u.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.units, siteId],
  )
  const decommissioned = useMemo(
    () =>
      state.units
        .filter((u) => u.siteId === siteId && u.status === 'decommissioned')
        .sort(
          (a, b) =>
            (b.decommissionedAt ?? '').localeCompare(a.decommissionedAt ?? ''),
        ),
    [state.units, siteId],
  )
  const bottlesOnSite = useMemo(
    () => state.bottles.filter((b) => b.currentSiteId === siteId),
    [state.bottles, siteId],
  )

  if (!site) return null

  return (
    <>
      <Modal
        open={!!site && !editing}
        title={site.name}
        onClose={onClose}
        size="lg"
      >
        <div className="space-y-4">
          <Card className="!p-3">
            <dl className="space-y-2">
              <DetailRow label="Client" value={site.client} />
              <DetailRow label="Address" value={site.address} />
              <DetailRow label="Group / area" value={site.group} />
              <DetailRow label="Notes" value={site.notes} italic />
              {!site.client && !site.address && !site.group && !site.notes && (
                <div className="text-sm text-slate-500">
                  No details added — tap Edit site to fill in client and address.
                </div>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit site
              </Button>
              <Button variant="secondary" onClick={() => setAuditScope('site')}>
                Audit
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete this site?',
                    message:
                      'All units at this site will be deleted, and any bottles currently assigned to it will be unassigned. This cannot be undone.',
                    confirmLabel: 'Delete site',
                    danger: true,
                  })
                  if (ok) {
                    deleteSite(site.id)
                    toast.show('Site deleted', 'info')
                    onClose()
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </Card>

          <div>
            <SectionHeader
              title={`Bottles on site (${bottlesOnSite.length})`}
              open={bottlesOpen}
              onToggle={() => setBottlesOpen((v) => !v)}
            >
              {bottlesOnSite.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => setAuditScope('bottles')}
                >
                  Audit
                </Button>
              )}
              <Button onClick={() => setAddingBottle(true)}>+ Add bottle</Button>
            </SectionHeader>
            {!bottlesOpen ? null : bottlesOnSite.length === 0 ? (
              <Card className="!p-3">
                <p className="text-sm text-slate-500">
                  No bottles here yet — add a cylinder so its location and
                  refrigerant on site are tracked.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {bottlesOnSite.map((b) => (
                  <Card key={b.id} className="!p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {b.bottleNumber}
                        </div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                          {b.refrigerantType} ·{' '}
                          {formatWeight(netWeight(b), state.unit)} ·{' '}
                          {statusLabel(b.status)}
                        </div>
                      </div>
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Remove bottle ${b.bottleNumber}?`,
                            message:
                              'It will be unassigned from this site and moved back to In stock. The bottle and its history are kept.',
                            confirmLabel: 'Remove',
                          })
                          if (ok) {
                            updateBottle(b.id, {
                              status: 'in_stock',
                              currentSiteId: undefined,
                            })
                            toast.show('Bottle removed from site', 'info')
                          }
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <SectionHeader
              title={`Units installed (${activeUnits.length})`}
              open={unitsOpen}
              onToggle={() => setUnitsOpen((v) => !v)}
            >
              <Button onClick={() => setAddingUnit(true)}>+ Add unit</Button>
            </SectionHeader>
            {!unitsOpen ? null : activeUnits.length === 0 ? (
              <Card className="!p-3">
                <p className="text-sm text-slate-500">
                  No units yet — add the AC, chiller, fridge or other equipment
                  installed at this site so charges can be logged against it.
                </p>
              </Card>
            ) : (
              <div className="space-y-2">
                {activeUnits.map((u) => (
                  <UnitCard
                    key={u.id}
                    u={u}
                    onEdit={() => setEditUnit(u)}
                    onDecommission={() => setDecommissionTarget(u)}
                    onLogbook={() => setLogbookUnit(u)}
                  />
                ))}
              </div>
            )}
          </div>

          {decommissioned.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Decommissioned ({decommissioned.length})
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDecommissioned((v) => !v)}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  {showDecommissioned ? 'Hide' : 'Show'}
                </button>
              </div>
              {showDecommissioned ? (
                <div className="space-y-2">
                  {decommissioned.map((u) => (
                    <DecommissionedUnitCard
                      key={u.id}
                      u={u}
                      onReactivate={async () => {
                        const ok = await confirm({
                          title: `Reactivate "${u.name}"?`,
                          message:
                            'It will move back to the active equipment list at this site.',
                          confirmLabel: 'Reactivate',
                        })
                        if (ok) {
                          reactivateUnit(u.id)
                          toast.show('Unit reactivated')
                        }
                      }}
                      onDelete={async () => {
                        const ok = await confirm({
                          title: `Permanently delete "${u.name}"?`,
                          message:
                            'The unit will be removed from the record entirely. Past transactions referencing it stay in the log but lose their unit link. This cannot be undone.',
                          confirmLabel: 'Delete',
                          danger: true,
                        })
                        if (ok) {
                          deleteUnit(u.id)
                          toast.show('Unit deleted', 'info')
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <p className="px-1 text-xs text-slate-500">
                  Hidden — past decommissioned units kept on record for compliance.
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>

      <SiteForm
        open={!!site && editing}
        title="Edit site"
        site={site}
        onClose={() => setEditing(false)}
        onSave={(data) => {
          updateSite(site.id, data)
          setEditing(false)
          toast.show('Site updated')
        }}
      />

      <UnitForm
        open={addingUnit}
        siteId={site.id}
        title="New unit"
        onClose={() => setAddingUnit(false)}
        onSave={(data) => {
          addUnit({ ...data, siteId: site.id })
          setAddingUnit(false)
          toast.show('Unit added')
        }}
      />

      <AssignBottleModal
        open={addingBottle}
        site={site}
        onClose={() => setAddingBottle(false)}
        onAssign={(bottle) => {
          updateBottle(bottle.id, {
            status: 'on_site',
            currentSiteId: site.id,
          })
          addTransaction({
            bottleId: bottle.id,
            kind: 'transfer',
            siteId: site.id,
            amount: 0,
            date: new Date().toISOString(),
          })
          setAddingBottle(false)
          toast.show('Bottle added to site')
        }}
      />

      <UnitForm
        open={!!editUnit}
        siteId={site.id}
        title="Edit unit"
        unit={editUnit ?? undefined}
        onClose={() => setEditUnit(null)}
        onSave={(data) => {
          if (editUnit) updateUnit(editUnit.id, data)
          setEditUnit(null)
          toast.show('Unit updated')
        }}
      />

      <DecommissionModal
        unit={decommissionTarget}
        onClose={() => setDecommissionTarget(null)}
        onConfirm={(reason) => {
          if (decommissionTarget) {
            decommissionUnit(decommissionTarget.id, reason)
            toast.show('Unit decommissioned', 'info')
          }
          setDecommissionTarget(null)
        }}
      />

      <UnitLogbook
        unit={logbookUnit}
        site={site}
        onClose={() => setLogbookUnit(null)}
      />

      <SiteAuditModal
        scope={auditScope}
        site={site}
        onClose={() => setAuditScope(null)}
      />
    </>
  )
}

function SectionHeader({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2 px-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-w-0 items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
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
        <span className="truncate">{title}</span>
      </button>
      <div className="flex shrink-0 flex-wrap justify-end gap-2">{children}</div>
    </div>
  )
}

function AssignBottleModal({
  open,
  site,
  onClose,
  onAssign,
}: {
  open: boolean
  site: Site
  onClose: () => void
  onAssign: (bottle: Bottle) => void
}) {
  const { state } = useStore()

  // Candidates: any bottle not already on this site and not retired
  // (empty / returned). A bottle currently on another site can still be
  // moved here — the hint shows where it is now.
  const candidates = useMemo(
    () =>
      state.bottles
        .filter(
          (b) =>
            b.currentSiteId !== site.id &&
            b.status !== 'empty' &&
            b.status !== 'returned',
        )
        .sort((a, b) => a.bottleNumber.localeCompare(b.bottleNumber)),
    [state.bottles, site.id],
  )

  const siteName = (id?: string) =>
    state.sites.find((s) => s.id === id)?.name ?? null

  return (
    <Modal open={open} title="Add bottle to site" onClose={onClose}>
      {candidates.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            No bottles available to add. Create a bottle on the Bottles tab
            first, or free one up from another site.
          </p>
          <Button full variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Pick a cylinder to place at {site.name}. It will be marked “On
            site” and a move is recorded in the log.
          </p>
          <div className="-mx-1 max-h-[60svh] space-y-2 overflow-y-auto px-1">
            {candidates.map((b) => {
              const loc = siteName(b.currentSiteId)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onAssign(b)}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:bg-slate-50 active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/70"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {b.bottleNumber}
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {b.refrigerantType} ·{' '}
                      {formatWeight(netWeight(b), state.unit)} ·{' '}
                      {loc ? `At ${loc}` : statusLabel(b.status)}
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-brand-600 dark:text-brand-300">
                    Add
                  </span>
                </button>
              )
            })}
          </div>
          <Button full variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}
    </Modal>
  )
}

function UnitCard({
  u,
  onEdit,
  onDecommission,
  onLogbook,
}: {
  u: Unit
  onEdit: () => void
  onDecommission: () => void
  onLogbook: () => void
}) {
  const { state } = useStore()
  const leak = leakStatusFor(u, state.transactions)
  return (
    <Card className="!p-3">
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {u.name}
            </span>
            <LeakPill leak={leak} />
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {u.kind ? UNIT_KIND_LABELS[u.kind] : 'Unit'}
            {u.refrigerantType ? ` · ${u.refrigerantType}` : ''}
            {u.refrigerantCharge
              ? ` · ${formatWeight(u.refrigerantCharge, state.unit)} charge`
              : ''}
          </div>
          {(u.manufacturer || u.model || u.serial) && (
            <div className="text-xs text-slate-500">
              {[u.manufacturer, u.model, u.serial].filter(Boolean).join(' · ')}
            </div>
          )}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onLogbook}>
          Logbook
        </Button>
        <Button variant="secondary" onClick={onDecommission}>
          Decommission
        </Button>
      </div>
    </Card>
  )
}

function LeakPill({ leak }: { leak: LeakStatus }) {
  if (leak.level === 'ok') return null
  if (leak.level === 'unknown') {
    return (
      <Pill tone="slate" title="Charge not recorded — set the factory charge to enable leak monitoring.">
        Leak ?
      </Pill>
    )
  }
  const pct = Math.round(leak.fraction * 100)
  if (leak.level === 'watch') {
    return (
      <Pill
        tone="amber"
        title={`Top-ups in last 12 months: ${leak.topUpKg.toFixed(2)} kg (${pct}% of charge). Investigate per AIRAH DA19.`}
      >
        Leak watch · {pct}%
      </Pill>
    )
  }
  return (
    <Pill
      tone="red"
      title={`Top-ups in last 12 months: ${leak.topUpKg.toFixed(2)} kg (${pct}% of charge). Repeated top-ups — investigate and rectify per AIRAH DA19 / AREMA Code of Practice 2018.`}
    >
      Leak suspected · {pct}%
    </Pill>
  )
}

function DecommissionedUnitCard({
  u,
  onReactivate,
  onDelete,
}: {
  u: Unit
  onReactivate: () => void
  onDelete: () => void
}) {
  const { state } = useStore()
  return (
    <Card className="!border-slate-200 !bg-slate-100 !p-3 dark:!bg-slate-800/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700 line-through dark:text-slate-300">
              {u.name}
            </span>
            <Pill tone="slate">Decommissioned</Pill>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-400">
            {u.kind ? UNIT_KIND_LABELS[u.kind] : 'Unit'}
            {u.refrigerantType ? ` · ${u.refrigerantType}` : ''}
            {u.refrigerantCharge
              ? ` · ${formatWeight(u.refrigerantCharge, state.unit)}`
              : ''}
          </div>
          {u.decommissionedAt && (
            <div className="text-xs text-slate-500">
              {new Date(u.decommissionedAt).toLocaleDateString()}
              {u.decommissionedReason && ` · ${u.decommissionedReason}`}
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onReactivate}>
          Reactivate
        </Button>
        <Button variant="danger" onClick={onDelete}>
          Delete record
        </Button>
      </div>
    </Card>
  )
}

export function SiteForm({
  open,
  title,
  site,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  site?: Site
  onClose: () => void
  onSave: (data: Omit<Site, 'id' | 'createdAt'>) => void
}) {
  const [name, setName] = useState(site?.name ?? '')
  const [client, setClient] = useState(site?.client ?? '')
  const [address, setAddress] = useState(site?.address ?? '')
  const [group, setGroup] = useState(site?.group ?? '')
  const [notes, setNotes] = useState(site?.notes ?? '')

  // Reset on every open transition (and when the edited site changes),
  // so adding a second site doesn't inherit the first one's values.
  // Keying on `open` is what fixes that — for new sites the id is always
  // "new", so an id-only key never changes between consecutive adds.
  const resetKey = `${open ? 'open' : 'closed'}:${site?.id ?? 'new'}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (open && resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setName(site?.name ?? '')
    setClient(site?.client ?? '')
    setAddress(site?.address ?? '')
    setGroup(site?.group ?? '')
    setNotes(site?.notes ?? '')
  } else if (!open && lastResetKey !== resetKey) {
    // Track the closed state too so the next open transition is detected.
    setLastResetKey(resetKey)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name: name.trim(),
      client: client.trim() || undefined,
      address: address.trim() || undefined,
      group: group.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Site name">
          <TextInput
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 12 High St, Westfield Mall, Acme Cold Store"
          />
        </Field>
        <Field label="Client / owner">
          <TextInput
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="e.g. Mr & Mrs Smith / Acme Foods Ltd"
          />
        </Field>
        <Field label="Address">
          <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field
          label="Group / area"
          hint="Sites with the same group are bundled under one heading on the Sites page."
        >
          <GroupField value={group} onChange={setGroup} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}

// Group / area picker for sites. Offers the curated city list (grouped
// by state for Australia) plus any groups already used on other sites,
// and an "Other — type my own" option that reveals a free-text input —
// so a tech can pick Brisbane from the list or type anything they like.
function GroupField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const { state } = useStore()
  const country = state.location.country

  const cityOptions = useMemo<PickerOption[]>(() => {
    // AU-first: fall back to Australian cities when no country is set.
    if (country === 'Australia' || country === '') {
      const opts: PickerOption[] = []
      for (const region of AU_REGIONS) {
        for (const city of AU_CITIES_BY_REGION[region] ?? []) {
          opts.push({ value: city, label: city, group: region })
        }
      }
      return opts
    }
    return (CITIES_BY_COUNTRY[country] ?? []).map((c) => ({
      value: c,
      label: c,
      group: country,
    }))
  }, [country])

  // Groups already used on other sites that aren't already curated
  // cities — so custom buckets like "North region" stay pickable.
  const customGroupOptions = useMemo<PickerOption[]>(() => {
    const cityVals = new Set(cityOptions.map((o) => o.value.toLowerCase()))
    const seen = new Map<string, string>()
    for (const s of state.sites) {
      const g = s.group?.trim()
      if (g && !cityVals.has(g.toLowerCase()) && !seen.has(g.toLowerCase())) {
        seen.set(g.toLowerCase(), g)
      }
    }
    return Array.from(seen.values())
      .sort((a, b) => a.localeCompare(b))
      .map((g) => ({ value: g, label: g, group: 'Your groups' }))
  }, [state.sites, cityOptions])

  const options = useMemo<PickerOption[]>(
    () => [
      ...customGroupOptions,
      ...cityOptions,
      { value: CITY_OTHER_VALUE, label: 'Other — type my own' },
    ],
    [customGroupOptions, cityOptions],
  )

  const known = useMemo(
    () =>
      new Set(
        options
          .filter((o) => o.value !== CITY_OTHER_VALUE)
          .map((o) => o.value),
      ),
    [options],
  )

  const trimmed = value.trim()
  const isCustom = trimmed !== '' && !known.has(trimmed)
  const pickerValue = isCustom ? CITY_OTHER_VALUE : trimmed

  // No curated cities and no existing groups — plain text entry.
  if (cityOptions.length === 0 && customGroupOptions.length === 0) {
    return (
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Brisbane, North region, Westfield campus"
      />
    )
  }

  return (
    <div className="space-y-2">
      <Picker
        title="Group / area"
        value={pickerValue}
        onChange={(v) => {
          if (v === CITY_OTHER_VALUE) {
            // Preserve a previously typed custom value; only clear when
            // switching away from a known list entry.
            if (known.has(trimmed)) onChange('')
            return
          }
          onChange(v)
        }}
        emptyLabel="No group"
        options={options}
      />
      {(pickerValue === CITY_OTHER_VALUE || isCustom) && (
        <TextInput
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type group / area name"
          aria-label="Custom group name"
        />
      )}
    </div>
  )
}

export function UnitForm({
  open,
  siteId,
  title,
  unit,
  onClose,
  onSave,
}: {
  open: boolean
  siteId: string
  title: string
  unit?: Unit
  onClose: () => void
  onSave: (data: Omit<Unit, 'id' | 'createdAt' | 'status' | 'siteId'>) => void
}) {
  const { state } = useStore()
  const displayUnit = state.unit

  const [name, setName] = useState(unit?.name ?? '')
  const [kind, setKind] = useState<UnitKind | ''>(unit?.kind ?? '')
  const [refrigerantType, setRefrigerantType] = useState<string>(
    unit?.refrigerantType ?? '',
  )
  const [chargeStr, setChargeStr] = useState(
    unit?.refrigerantCharge
      ? kgToDisplay(unit.refrigerantCharge, displayUnit).toFixed(2)
      : '',
  )
  const [manufacturer, setManufacturer] = useState(unit?.manufacturer ?? '')
  const [model, setModel] = useState(unit?.model ?? '')
  const [serial, setSerial] = useState(unit?.serial ?? '')
  const [installDate, setInstallDate] = useState(unit?.installDate ?? '')
  const [notes, setNotes] = useState(unit?.notes ?? '')

  // Reset on every open transition (and when the edited unit changes) so
  // adding a second unit doesn't inherit the first one's values — keying
  // on `open` is what fixes consecutive adds (the id is always "new").
  const resetKey = `${open ? 'open' : 'closed'}:${unit?.id ?? 'new'}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (open && resetKey !== lastResetKey) {
    setLastResetKey(resetKey)
    setName(unit?.name ?? '')
    setKind(unit?.kind ?? '')
    setRefrigerantType(unit?.refrigerantType ?? '')
    setChargeStr(
      unit?.refrigerantCharge
        ? kgToDisplay(unit.refrigerantCharge, displayUnit).toFixed(2)
        : '',
    )
    setManufacturer(unit?.manufacturer ?? '')
    setModel(unit?.model ?? '')
    setSerial(unit?.serial ?? '')
    setInstallDate(unit?.installDate ?? '')
    setNotes(unit?.notes ?? '')
  } else if (!open && lastResetKey !== resetKey) {
    setLastResetKey(resetKey)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const charge = parseFloat(chargeStr)
    onSave({
      name: name.trim(),
      kind: kind || undefined,
      refrigerantType: refrigerantType || undefined,
      refrigerantCharge: !isNaN(charge) && charge > 0
        ? displayToKg(charge, displayUnit)
        : undefined,
      manufacturer: manufacturer.trim() || undefined,
      model: model.trim() || undefined,
      serial: serial.trim() || undefined,
      installDate: installDate || undefined,
      notes: notes.trim() || undefined,
    })
  }

  // siteId is implied by the parent; keep arg present to avoid TS unused warning
  void siteId

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Unit name / label">
          <TextInput
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Living room split, AHU-2, Walk-in freezer"
          />
        </Field>

        <Field label="Equipment type">
          <Picker
            title="Equipment type"
            value={kind}
            onChange={(v) => setKind(v as UnitKind | '')}
            placeholder="— pick a type —"
            options={(Object.keys(UNIT_KIND_LABELS) as UnitKind[]).map((k) => ({
              value: k,
              label: UNIT_KIND_LABELS[k],
            }))}
          />
        </Field>

        {kind && NON_REFRIGERANT_UNIT_KINDS.has(kind) && (
          <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            This type does not contain refrigerant — you'll be able to record
            it as installed equipment but cannot log charges or recoveries
            against it.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Refrigerant">
            <RefrigerantSelect
              allowEmpty
              value={refrigerantType}
              onChange={setRefrigerantType}
            />
          </Field>
          <Field label={`Factory charge (${displayUnit})`}>
            <TextInput
              type="number"
              inputMode="decimal"
              step="0.01"
              value={chargeStr}
              onChange={(e) => setChargeStr(e.target.value)}
              placeholder="e.g. 1.20"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufacturer">
            <TextInput
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. Daikin"
            />
          </Field>
          <Field label="Model">
            <TextInput
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Serial number">
          <TextInput value={serial} onChange={(e) => setSerial(e.target.value)} />
        </Field>

        <Field label="Install date">
          <DateInput
            value={installDate}
            onChange={setInstallDate}
            ariaLabel="Install date"
          />
        </Field>

        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <Button type="submit" full>
          Save
        </Button>
      </form>
    </Modal>
  )
}

// --- Equipment logbook (AS/NZS 5149.4 + AREMA/AIRAH 2018) -------------
//
// Per-unit service record. Surfaces: business + ARC RTA, technician +
// ARC RHL stamped on each row, refrigerant + GWP + tCO2-e, leak status
// against trailing 12 months, and the full transaction history.
//
// "Print / Save PDF" uses the browser print stylesheet (see index.css)
// — no PDF library, the user gets the same dialog as printing a web
// page and can choose "Save as PDF" or send to a real printer.

function UnitLogbook({
  unit,
  site,
  onClose,
}: {
  unit: Unit | null
  site: Site
  onClose: () => void
}) {
  const { state } = useStore()
  if (!unit) return null

  const txs = state.transactions
    .filter((t) => t.unitId === unit.id)
    // Soft-deleted rows aren't part of the equipment's working
    // history — they're audit-only and surfaced separately under
    // Settings → Deleted transactions.
    .filter((t) => !t.deletedAt)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  const leak = leakStatusFor(unit, state.transactions)
  const gwp = gwpFor(unit.refrigerantType)
  const tCO2e = unit.refrigerantCharge
    ? tonnesCO2eFor(unit.refrigerantCharge, unit.refrigerantType)
    : undefined
  const totalCharged = txs
    .filter((t) => t.kind === 'charge')
    .reduce((s, t) => s + t.amount, 0)
  const totalRecovered = txs
    .filter((t) => t.kind === 'recover')
    .reduce((s, t) => s + t.amount, 0)
  const totalLoss = txs.reduce((s, t) => s + transactionLoss(t), 0)
  const generatedAt = formatDateTime(
    new Date().toISOString(),
    state.location.timezone,
    state.clock,
  )

  return (
    <Modal open onClose={onClose} title="Equipment logbook" size="lg">
      <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div className="print-region space-y-4 text-sm text-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-300 pb-3 dark:border-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Refrigerant Equipment Logbook
          </div>
          <div className="mt-1 text-lg font-semibold">
            {state.businessName || 'Business name not set in Settings'}
          </div>
          <div className="text-xs text-slate-500">
            {state.arcAuthorisationNumber
              ? `ARC RTA ${state.arcAuthorisationNumber}`
              : 'ARC RTA not set in Settings'}
          </div>
        </header>

        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Equipment
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Kv label="Site" v={site.name} />
            {site.client && <Kv label="Client" v={site.client} />}
            {site.address && <Kv label="Address" v={site.address} />}
            <Kv label="Unit" v={unit.name} />
            {unit.kind && <Kv label="Type" v={UNIT_KIND_LABELS[unit.kind]} />}
            {unit.manufacturer && <Kv label="Manufacturer" v={unit.manufacturer} />}
            {unit.model && <Kv label="Model" v={unit.model} />}
            {unit.serial && <Kv label="Serial" v={unit.serial} />}
            {unit.installDate && (
              <Kv
                label="Installed"
                v={new Date(unit.installDate).toLocaleDateString('en-AU')}
              />
            )}
          </div>
        </section>

        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Refrigerant
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Kv label="Type" v={unit.refrigerantType ?? '—'} />
            <Kv
              label="Factory charge"
              v={
                unit.refrigerantCharge
                  ? `${unit.refrigerantCharge.toFixed(3)} kg`
                  : '—'
              }
            />
            <Kv label="GWP (AR4, 100yr)" v={gwp != null ? String(gwp) : '—'} />
            <Kv
              label="Charge CO₂-e"
              v={tCO2e != null ? `${tCO2e.toFixed(3)} t` : '—'}
            />
          </div>
        </section>

        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Trailing 12 months
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Kv
              label="Top-ups (excl. install)"
              v={`${leak.topUpKg.toFixed(3)} kg${
                unit.refrigerantCharge
                  ? ` (${(leak.fraction * 100).toFixed(1)}% of charge)`
                  : ''
              }`}
            />
            <Kv label="Leak status" v={leakLevelLabel(leak.level)} />
            <Kv label="Total charged (lifetime)" v={`${totalCharged.toFixed(3)} kg`} />
            <Kv
              label="Total recovered (lifetime)"
              v={`${totalRecovered.toFixed(3)} kg`}
            />
            {totalLoss > 0 && (
              <Kv label="Total loss (lifetime)" v={`${totalLoss.toFixed(3)} kg`} />
            )}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Service history ({txs.length})
          </div>
          {txs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No transactions recorded against this unit yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-300 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <tr>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Type</th>
                    <th className="py-1 pr-2 text-right">Equip kg</th>
                    <th className="py-1 pr-2 text-right">Bottle kg</th>
                    <th className="py-1 pr-2 text-right">Loss kg</th>
                    <th className="py-1 pr-2">Reason</th>
                    <th className="py-1 pr-2">Operator</th>
                    <th className="py-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <LogbookRow key={t.id} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="border-t border-slate-300 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          <p>
            Recorded against AS/NZS 5149.4 §6 (service records), the AREMA /
            AIRAH "Code of Practice for the reduction of emissions of
            fluorocarbon refrigerants" 2018, and AIRAH DA19 (refrigerant
            selection &amp; handling). GWP values per IPCC AR4 (100-year) as
            adopted by the Ozone Protection and Synthetic Greenhouse Gas
            Management Regulations 1995.
          </p>
          <p className="mt-2">Generated {generatedAt}.</p>
          <div className="mt-4 grid grid-cols-2 gap-6 print:mt-8">
            <SignatureLine label="Technician signature" />
            <SignatureLine label="Customer signature" />
          </div>
        </footer>
      </div>
    </Modal>
  )
}

function Kv({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div>{v}</div>
    </div>
  )
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="border-b border-slate-400 dark:border-slate-600">
        &nbsp;
      </div>
      <div className="mt-1 text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

function leakLevelLabel(l: LeakStatus['level']): string {
  switch (l) {
    case 'ok':
      return 'OK'
    case 'watch':
      return 'Watch — investigate (≥5% top-up)'
    case 'suspected':
      return 'Suspected leak — investigate & rectify (≥10% top-up)'
    case 'unknown':
      return 'Unknown — set factory charge to enable monitoring'
  }
}

function LogbookRow({ t }: { t: Transaction }) {
  const { state } = useStore()
  const bottle = state.bottles.find((b) => b.id === t.bottleId)
  const equipKg = t.kind === 'charge' || t.kind === 'recover' ? t.amount : 0
  const bottleKg = t.bottleAmount ?? equipKg
  const loss = transactionLoss(t)
  return (
    <tr className="border-b border-slate-200 align-top dark:border-slate-800">
      <td className="py-1 pr-2 whitespace-nowrap">
        {new Date(t.date).toLocaleDateString('en-AU')}
      </td>
      <td className="py-1 pr-2">
        {transactionLabel(t.kind)}
        {bottle ? (
          <div className="text-[10px] text-slate-500">via {bottle.bottleNumber}</div>
        ) : null}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {equipKg ? equipKg.toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {bottleKg ? bottleKg.toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {loss > 0 ? loss.toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2">{t.reason ?? ''}</td>
      <td className="py-1 pr-2 whitespace-nowrap">
        {t.technician && <div>{t.technician}</div>}
        {t.technicianLicence && (
          <div className="text-[10px] text-slate-500">RHL {t.technicianLicence}</div>
        )}
        {t.businessName && <div>{t.businessName}</div>}
        {t.arcAuthorisationNumber && (
          <div className="text-[10px] text-slate-500">
            RTA {t.arcAuthorisationNumber}
          </div>
        )}
      </td>
      <td className="py-1">
        {t.refrigerantMismatch && (
          <div className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
            ⚠ Refrigerant mismatch: bottle{' '}
            {t.refrigerantMismatch.bottleType} into unit set up for{' '}
            {t.refrigerantMismatch.unitType}
          </div>
        )}
        {t.notes ?? ''}
      </td>
    </tr>
  )
}

// Format a stored cylinder test date (YYYY-MM or legacy YYYY-MM-DD) as
// "Mon YYYY" for audit display. Cylinder periodic test is tracked to the
// month per AS 2030.
function formatTestDate(s?: string): string {
  if (!s) return '—'
  const m = s.match(/^(\d{4})-(\d{2})/)
  if (!m) return '—'
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

function SiteAuditModal({
  scope,
  site,
  onClose,
}: {
  scope: 'site' | 'bottles' | null
  site: Site
  onClose: () => void
}) {
  const { state } = useStore()

  const bottles = useMemo(
    () =>
      state.bottles
        .filter((b) => b.currentSiteId === site.id)
        .sort((a, b) => a.bottleNumber.localeCompare(b.bottleNumber)),
    [state.bottles, site.id],
  )
  const units = useMemo(
    () =>
      state.units
        .filter((u) => u.siteId === site.id && u.status === 'active')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.units, site.id],
  )
  const txs = useMemo(() => {
    const live = state.transactions.filter((t) => !t.deletedAt)
    if (scope === 'bottles') {
      const ids = new Set(bottles.map((b) => b.id))
      return live
        .filter(
          (t) =>
            ids.has(t.bottleId) ||
            (t.sourceBottleId != null && ids.has(t.sourceBottleId)),
        )
        .sort((a, b) => (a.date < b.date ? 1 : -1))
    }
    return live
      .filter((t) => t.siteId === site.id)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [state.transactions, bottles, site.id, scope])

  if (!scope) return null

  const isBottles = scope === 'bottles'
  const generatedAt = formatDateTime(
    new Date().toISOString(),
    state.location.timezone,
    state.clock,
  )
  const totalOnSiteNet = bottles.reduce((s, b) => s + netWeight(b), 0)
  const totalCharged = state.transactions
    .filter((t) => !t.deletedAt && t.siteId === site.id && t.kind === 'charge')
    .reduce((s, t) => s + t.amount, 0)
  const totalRecovered = state.transactions
    .filter((t) => !t.deletedAt && t.siteId === site.id && t.kind === 'recover')
    .reduce((s, t) => s + t.amount, 0)

  return (
    <Modal
      open
      onClose={onClose}
      title={isBottles ? 'Bottle audit' : 'Site audit'}
      size="lg"
    >
      <div className="no-print mb-3 flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div className="print-region space-y-4 text-sm text-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-300 pb-3 dark:border-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isBottles ? 'Cylinder / Bottle Audit' : 'Site Audit Report'}
          </div>
          <div className="mt-1 text-lg font-semibold">
            {state.businessName || 'Business name not set in Settings'}
          </div>
          <div className="text-xs text-slate-500">
            {state.arcAuthorisationNumber
              ? `ARC RTA ${state.arcAuthorisationNumber}`
              : 'ARC RTA not set in Settings'}
          </div>
        </header>

        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Site
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Kv label="Site" v={site.name} />
            {site.group && <Kv label="Group / area" v={site.group} />}
            {site.client && <Kv label="Client" v={site.client} />}
            {site.address && <Kv label="Address" v={site.address} />}
            {!isBottles && (
              <Kv label="Units installed" v={String(units.length)} />
            )}
            <Kv label="Bottles on site" v={String(bottles.length)} />
            <Kv
              label="Refrigerant on site"
              v={`${totalOnSiteNet.toFixed(3)} kg`}
            />
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Bottles on site ({bottles.length})
          </div>
          {bottles.length === 0 ? (
            <p className="text-sm text-slate-500">
              No bottles currently on site.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-300 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <tr>
                    <th className="py-1 pr-2">Bottle</th>
                    <th className="py-1 pr-2">Refrigerant</th>
                    <th className="py-1 pr-2 text-right">Tare kg</th>
                    <th className="py-1 pr-2 text-right">Gross kg</th>
                    <th className="py-1 pr-2 text-right">Net kg</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1">Next test</th>
                  </tr>
                </thead>
                <tbody>
                  {bottles.map((b) => (
                    <tr
                      key={b.id}
                      className="border-b border-slate-200 align-top dark:border-slate-800"
                    >
                      <td className="py-1 pr-2">{b.bottleNumber}</td>
                      <td className="py-1 pr-2">{b.refrigerantType}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {b.tareWeight.toFixed(3)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {b.grossWeight.toFixed(3)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {netWeight(b).toFixed(3)}
                      </td>
                      <td className="py-1 pr-2">{statusLabel(b.status)}</td>
                      <td className="py-1 whitespace-nowrap">
                        {formatTestDate(b.nextHydroTestDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {!isBottles && (
          <section>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Units installed ({units.length})
            </div>
            {units.length === 0 ? (
              <p className="text-sm text-slate-500">
                No active units at this site.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-slate-300 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
                    <tr>
                      <th className="py-1 pr-2">Unit</th>
                      <th className="py-1 pr-2">Type</th>
                      <th className="py-1 pr-2">Refrigerant</th>
                      <th className="py-1 pr-2 text-right">Charge kg</th>
                      <th className="py-1">Leak status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => {
                      const leak = leakStatusFor(u, state.transactions)
                      const meta = [u.manufacturer, u.model, u.serial].filter(
                        Boolean,
                      )
                      return (
                        <tr
                          key={u.id}
                          className="border-b border-slate-200 align-top dark:border-slate-800"
                        >
                          <td className="py-1 pr-2">
                            {u.name}
                            {meta.length > 0 && (
                              <div className="text-[10px] text-slate-500">
                                {meta.join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="py-1 pr-2">
                            {u.kind ? UNIT_KIND_LABELS[u.kind] : '—'}
                          </td>
                          <td className="py-1 pr-2">
                            {u.refrigerantType ?? '—'}
                          </td>
                          <td className="py-1 pr-2 text-right tabular-nums">
                            {u.refrigerantCharge
                              ? u.refrigerantCharge.toFixed(3)
                              : '—'}
                          </td>
                          <td className="py-1">{leakLevelLabel(leak.level)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {isBottles ? 'Bottle movement & charge history' : 'Site activity'} (
            {txs.length})
          </div>
          {txs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No transactions recorded{' '}
              {isBottles ? 'for these bottles' : 'at this site'} yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-300 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <tr>
                    <th className="py-1 pr-2">Date</th>
                    <th className="py-1 pr-2">Type</th>
                    <th className="py-1 pr-2">Bottle</th>
                    <th className="py-1 pr-2">Equipment</th>
                    <th className="py-1 pr-2 text-right">Refrig kg</th>
                    <th className="py-1 pr-2 text-right">Loss kg</th>
                    <th className="py-1 pr-2">Reason</th>
                    <th className="py-1">Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <AuditTxRow key={t.id} t={t} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="border-t border-slate-300 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          <p>
            Refrigerant handling records per AS/NZS 5149.4 §6, the AREMA /
            AIRAH "Code of Practice for the reduction of emissions of
            fluorocarbon refrigerants" 2018, and AIRAH DA19. Cylinder periodic
            test dates per AS 2030.
          </p>
          {(totalCharged > 0 || totalRecovered > 0) && (
            <p className="mt-2">
              Lifetime at this site — charged {totalCharged.toFixed(3)} kg,
              recovered {totalRecovered.toFixed(3)} kg.
            </p>
          )}
          <p className="mt-2">Generated {generatedAt}.</p>
          <div className="mt-4 grid grid-cols-2 gap-6 print:mt-8">
            <SignatureLine label="Technician signature" />
            <SignatureLine label="Customer signature" />
          </div>
        </footer>
      </div>
    </Modal>
  )
}

function AuditTxRow({ t }: { t: Transaction }) {
  const { state } = useStore()
  const bottle = state.bottles.find((b) => b.id === t.bottleId)
  const unit = t.unitId ? state.units.find((u) => u.id === t.unitId) : undefined
  const refrigKg = t.kind === 'charge' || t.kind === 'recover' ? t.amount : 0
  const loss = transactionLoss(t)
  return (
    <tr className="border-b border-slate-200 align-top dark:border-slate-800">
      <td className="py-1 pr-2 whitespace-nowrap">
        {new Date(t.date).toLocaleDateString('en-AU')}
      </td>
      <td className="py-1 pr-2">{transactionLabel(t.kind)}</td>
      <td className="py-1 pr-2">{bottle ? bottle.bottleNumber : '—'}</td>
      <td className="py-1 pr-2">{unit?.name ?? t.equipment ?? '—'}</td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {refrigKg ? refrigKg.toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {loss > 0 ? loss.toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2">{t.reason ? REASON_LABELS[t.reason] : ''}</td>
      <td className="py-1 whitespace-nowrap">
        {t.technician && <div>{t.technician}</div>}
        {t.technicianLicence && (
          <div className="text-[10px] text-slate-500">
            RHL {t.technicianLicence}
          </div>
        )}
      </td>
    </tr>
  )
}

function DecommissionModal({
  unit,
  onClose,
  onConfirm,
}: {
  unit: Unit | null
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const key = unit?.id ?? 'none'
  const [lastKey, setLastKey] = useState(key)
  if (unit && lastKey !== key) {
    setLastKey(key)
    setReason('')
  }

  if (!unit) return null

  return (
    <Modal open={!!unit} title={`Decommission "${unit.name}"`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          The unit will be removed from this site's active list but kept on
          record under "Decommissioned" for compliance. Any past transactions
          stay linked to it.
        </p>
        <Field
          label="Reason / disposition"
          hint="e.g. 'Refrigerant recovered to bottle B-103, equipment scrapped'"
        >
          <TextArea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </Field>
        <div className="flex gap-2">
          <Button
            type="button"
            full
            variant="danger"
            onClick={() => onConfirm(reason)}
          >
            Decommission unit
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  )
}
