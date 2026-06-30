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
import { Picker, type PickerOption } from '../components/Picker'
import { useStore } from '../lib/store'
import {
  AU_CITIES_BY_REGION,
  AU_REGIONS,
  CITY_OTHER_VALUE,
  NON_REFRIGERANT_UNIT_KINDS,
  REASON_LABELS,
  UNIT_KIND_LABELS,
  gwpFor,
  isRestatement,
  leakStatusFor,
  netWeight,
  regionForCity,
  siteLabel,
  statusLabel,
  supersededIds,
  tonnesCO2eFor,
  totalSafeWeight,
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
import { IntegrityStamp } from '../components/IntegrityStamp'
import { DateInput } from '../components/DateInput'
import { formatDate, formatDateTime, formatPlainDate } from '../lib/datetime'
import { profileFor } from '../lib/compliance'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'
import { PhotoSection } from '../components/Photos'

export default function Sites() {
  const { state, addSite } = useStore()
  const { sites } = state

  // Track the open site by id (not a snapshot) so the detail view always
  // reflects the latest data from the store. Holding the Site object
  // meant that editing + saving left the detail panel showing the old
  // values — the store updated, but this view kept rendering the stale
  // object captured when the card was tapped.
  const [openSiteId, setOpenSiteId] = useState<string | null>(null)
  const openSite = useMemo(
    () => (openSiteId ? sites.find((s) => s.id === openSiteId) ?? null : null),
    [sites, openSiteId],
  )
  const [adding, setAdding] = useState(false)
  // Region groups: a returning tech gets the layout they left; a first-time
  // visitor with no saved layout and a small list shouldn't land on a wall
  // of collapsed headings hiding every site (see the auto-open default
  // below). Only persist after a real interaction so the default isn't
  // frozen in. Mirrors the Bottles list.
  const hadSavedLayout = useMemo(() => {
    try {
      return localStorage.getItem('sites.expandedGroups') != null
    } catch {
      return false
    }
  }, [])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('sites.expandedGroups')
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch {
      /* localStorage unavailable — start collapsed */
    }
    return new Set()
  })
  const [groupsTouched, setGroupsTouched] = useState(false)
  useEffect(() => {
    if (!groupsTouched) return
    try {
      localStorage.setItem(
        'sites.expandedGroups',
        JSON.stringify([...expandedGroups]),
      )
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [expandedGroups, groupsTouched])

  const [query, setQuery] = useState('')
  // Active state filter ('all' or a state code). Persisted like the
  // Bottles filter so it survives navigation.
  const [stateFilter, setStateFilter] = useState<string>(() => {
    try {
      return localStorage.getItem('sites.stateFilter') ?? 'all'
    } catch {
      return 'all'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('sites.stateFilter', stateFilter)
    } catch {
      /* ignore */
    }
  }, [stateFilter])

  // Search matches the site's functional location (name) and address
  // only — deliberately not client/notes, so a search for a location
  // code or street returns just the matching sites.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sites
    return sites.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.address ?? '').toLowerCase().includes(q),
    )
  }, [sites, query])

  // State chips: every state present among the searched sites, ordered
  // with the business's home state (Settings → location) first, then the
  // rest in the standard AU order, then anything non-standard.
  const homeState = state.location.region.trim().toUpperCase()
  const stateChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of searched) {
      const st = s.state?.trim()
      if (st) counts.set(st, (counts.get(st) ?? 0) + 1)
    }
    const present = Array.from(counts.keys())
    present.sort((a, b) => {
      if (a.toUpperCase() === homeState) return -1
      if (b.toUpperCase() === homeState) return 1
      const ia = AU_REGIONS.indexOf(a as (typeof AU_REGIONS)[number])
      const ib = AU_REGIONS.indexOf(b as (typeof AU_REGIONS)[number])
      if (ia !== -1 && ib !== -1) return ia - ib
      if (ia !== -1) return -1
      if (ib !== -1) return 1
      return a.localeCompare(b)
    })
    return present.map((st) => ({ state: st, count: counts.get(st) ?? 0 }))
  }, [searched, homeState])

  // Apply the state filter on top of the search.
  const filteredSites = useMemo(
    () =>
      stateFilter === 'all'
        ? searched
        : searched.filter((s) => s.state === stateFilter),
    [searched, stateFilter],
  )

  // Bundle the filtered sites under a Town/City heading. Sites in the same
  // city are sorted by name; cities are sorted alphabetically with the
  // "No town/city" bucket last.
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; sites: Site[] }>()
    for (const s of filteredSites) {
      const raw = s.city?.trim() ?? ''
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
  }, [filteredSites])

  const hasGroups = groups.some((g) => g.key !== '')

  // First-visit default: with no saved layout, a small list shows every
  // region open so sites are visible immediately rather than hidden behind
  // collapsed headings. A large list stays collapsed (tidier). Once the
  // tech touches a heading their own layout takes over.
  const autoOpenAll =
    !hadSavedLayout && !groupsTouched && filteredSites.length <= 25
  const isGroupOpen = (key: string) => autoOpenAll || expandedGroups.has(key)
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const base =
        autoOpenAll ? new Set(groups.map((g) => g.key)) : new Set(prev)
      if (base.has(key)) base.delete(key)
      else base.add(key)
      return base
    })
    setGroupsTouched(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Sites
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add site</Button>
      </div>

      {sites.length > 0 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by address or functional location"
        />
      )}

      {stateChips.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            onClick={() => setStateFilter('all')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
              stateFilter === 'all'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
            }`}
          >
            All · {searched.length}
          </button>
          {stateChips.map(({ state: st, count }) => (
            <button
              key={st}
              onClick={() => setStateFilter(st)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                stateFilter === st
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              {st} · {count}
            </button>
          ))}
        </div>
      )}

      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          body="A site is anywhere with HVAC/R equipment — a home, business, factory, or shop. Each site can hold multiple units."
          action={<Button onClick={() => setAdding(true)}>+ Add site</Button>}
        />
      ) : searched.length === 0 ? (
        <EmptyState
          title="No matches"
          body="No site matches that address or functional location. Try a different search."
        />
      ) : filteredSites.length === 0 ? (
        <EmptyState
          title={`No sites in ${stateFilter}`}
          body="No site matches that state and search. Pick another state or tap All."
        />
      ) : !hasGroups ? (
        <div className="space-y-2">
          {groups[0].sites.map((s) => (
            <SiteCard key={s.id} site={s} onOpen={() => setOpenSiteId(s.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const open = isGroupOpen(g.key)
            return (
              <div key={g.key || '__ungrouped__'}>
                <SectionHeader
                  title={`${g.label || 'No town/city'} (${g.sites.length})`}
                  open={open}
                  onToggle={() => toggleGroup(g.key)}
                />
                {open && (
                  <div className="space-y-2">
                    {g.sites.map((s) => (
                      <SiteCard
                        key={s.id}
                        site={s}
                        onOpen={() => setOpenSiteId(s.id)}
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
        onClose={() => setOpenSiteId(null)}
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
  // Exclude soft-deleted rows and re-stated originals — the printable
  // Site Audit does, and the card stat must agree with it.
  const superseded = supersededIds(transactions)
  const charged = transactions
    .filter(
      (t) =>
        !t.deletedAt &&
        !superseded.has(t.id) &&
        t.siteId === site.id &&
        t.kind === 'charge',
    )
    .reduce((s, t) => s + t.amount, 0)

  return (
    <Card className="!p-3">
      <button className="w-full text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900 dark:text-slate-100">
              {siteLabel(site)}
            </div>
            {site.client && (
              <div className="mt-0.5 text-sm text-slate-500">{site.client}</div>
            )}
            {site.address && (
              <div className="truncate text-xs text-slate-500">{site.address}</div>
            )}
            {(site.city || site.state) && (
              <div className="truncate text-xs text-slate-500">
                {[site.city, site.state].filter(Boolean).join(', ')}
              </div>
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
  const [showDecommissioned, setShowDecommissioned] = useState(false)
  const [logbookUnit, setLogbookUnit] = useState<Unit | null>(null)
  // Default these open: once a site is expanded, the tech almost always
  // wants its equipment/bottles right there (to open a unit's logbook or
  // log against it). Starting collapsed buried the most common action two
  // taps deep. Either can still be collapsed on a long site.
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
        title={siteLabel(site)}
        onClose={onClose}
        size="lg"
      >
        <div className="space-y-4">
          <Card className="!p-3">
            <dl className="space-y-2">
              <DetailRow label="Client / owner" value={site.client} />
              <DetailRow label="Address" value={site.address} />
              <DetailRow label="Town / city" value={site.city} />
              <DetailRow label="State" value={site.state} />
              <DetailRow label="Notes" value={site.notes} italic />
              {!site.client &&
                !site.address &&
                !site.city &&
                !site.state &&
                !site.notes && (
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
                    title: 'Remove this site?',
                    message:
                      'The site and its units move to Recently deleted (Change log → Recently deleted), where a supervisor can restore them. Any bottles currently assigned to this site are unassigned.',
                    confirmLabel: 'Remove site',
                    danger: true,
                  })
                  if (ok) {
                    deleteSite(site.id)
                    toast.show('Site removed — restore it from Recently deleted', 'info')
                    onClose()
                  }
                }}
              >
                Remove
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
                          title: `Remove "${u.name}"?`,
                          message:
                            'The unit moves to Recently deleted (Change log → Recently deleted), where a supervisor can restore it. Past transactions referencing it stay in the log.',
                          confirmLabel: 'Remove',
                          danger: true,
                        })
                        if (ok) {
                          deleteUnit(u.id)
                          toast.show('Unit removed — restore it from Recently deleted', 'info')
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
  const confirm = useConfirm()

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

  const siteName = (id?: string) => {
    const s = state.sites.find((s) => s.id === id)
    return s ? siteLabel(s) : null
  }

  // A bottle lives at exactly one site (currentSiteId). When the chosen
  // cylinder is already at another site, adding it here is really a
  // transfer — confirm it so the tech knows it's being pulled off the
  // other site (rather than silently appearing in two places).
  async function pick(b: Bottle) {
    const fromSite = siteName(b.currentSiteId)
    if (b.currentSiteId && b.currentSiteId !== site.id && fromSite) {
      const ok = await confirm({
        title: `Transfer ${b.bottleNumber}?`,
        message: (
          <>
            This cylinder is currently on site at{' '}
            <strong>{fromSite}</strong>. Adding it here will move it from{' '}
            <strong>{fromSite}</strong> to <strong>{siteLabel(site)}</strong> — it
            can only be on one site at a time. A transfer is recorded in the
            log.
          </>
        ),
        confirmLabel: `Transfer to ${siteLabel(site)}`,
      })
      if (!ok) return
    }
    onAssign(b)
  }

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
            Pick a cylinder to place at {siteLabel(site)}. It will be marked “On
            site” and a move is recorded in the log.
          </p>
          <div className="-mx-1 max-h-[60svh] space-y-2 overflow-y-auto px-1">
            {candidates.map((b) => {
              const loc = siteName(b.currentSiteId)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => pick(b)}
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
                    {loc ? 'Transfer' : 'Add'}
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
        {/* Primary tap opens the read-only logbook (a view), not the edit
            form — so a mis-tap can't silently change compliance data.
            Editing is the explicit button below. Mirrors the
            tap-to-view-then-edit pattern on bottles and sites. */}
        <button
          className="min-w-0 flex-1 text-left"
          onClick={onLogbook}
          aria-label={`Open the logbook for ${u.name}`}
        >
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
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="mt-1 h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
      {/* Leak detail INLINE (not a hover tooltip) so the actionable
          insight is visible on a phone. */}
      {(leak.level === 'watch' || leak.level === 'suspected') && (
        <div
          className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs ${
            leak.level === 'suspected'
              ? 'bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-100'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-100'
          }`}
        >
          Top-ups in the last 12 months:{' '}
          <strong>{formatWeight(leak.topUpKg, state.unit)}</strong> (
          {Math.round(leak.fraction * 100)}% of charge).{' '}
          {leak.level === 'suspected'
            ? 'Repeated top-ups — investigate and rectify per AIRAH DA19 / CoP 2025.'
            : 'Investigate per AIRAH DA19.'}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onLogbook}>
          Logbook
        </Button>
        <Button variant="secondary" onClick={onEdit}>
          Edit
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
      title={`Top-ups in last 12 months: ${leak.topUpKg.toFixed(2)} kg (${pct}% of charge). Repeated top-ups — investigate and rectify per AIRAH DA19 / Refrigerant Handling Code of Practice 2025.`}
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
              {formatDate(u.decommissionedAt, state.location.timezone)}
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
          Remove
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
  const { state } = useStore()
  const confirm = useConfirm()

  // Company names available from Settings to auto-fill Client / owner
  // when the site is the user's own facility. Only the business name is a
  // name (the ARC authorisation is a number, not a name); if more get
  // added later this picks them up automatically.
  const companyOptions = useMemo(() => {
    const names = [state.businessName]
      .map((s) => (s ?? '').trim())
      .filter(Boolean)
    return Array.from(new Set(names))
  }, [state.businessName])

  const [name, setName] = useState(site?.name ?? '')
  const [client, setClient] = useState(site?.client ?? '')
  const [address, setAddress] = useState(site?.address ?? '')
  const [stateVal, setStateVal] = useState(site?.state ?? '')
  const [city, setCity] = useState(site?.city ?? '')
  const [notes, setNotes] = useState(site?.notes ?? '')
  const [ownerIsUs, setOwnerIsUs] = useState(
    !!site?.client && companyOptions.includes(site.client),
  )
  const [ownerName, setOwnerName] = useState(
    site?.client && companyOptions.includes(site.client)
      ? site.client
      : companyOptions[0] ?? '',
  )

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
    setStateVal(site?.state ?? '')
    setCity(site?.city ?? '')
    setNotes(site?.notes ?? '')
    setOwnerIsUs(!!site?.client && companyOptions.includes(site.client))
    setOwnerName(
      site?.client && companyOptions.includes(site.client)
        ? site.client
        : companyOptions[0] ?? '',
    )
  } else if (!open && lastResetKey !== resetKey) {
    // Track the closed state too so the next open transition is detected.
    setLastResetKey(resetKey)
  }

  const resolvedClient = ownerIsUs
    ? companyOptions.length > 1
      ? ownerName
      : companyOptions[0]
    : client.trim() || undefined

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    // Address and town are both optional, but missing either weakens the
    // record (techs can't find the site; audits look thin). Confirm once
    // before saving so it's a deliberate choice, not an oversight.
    const missing: string[] = []
    if (!address.trim()) missing.push('address')
    if (!city.trim()) missing.push('town / city')
    if (missing.length > 0) {
      const ok = await confirm({
        title: `Save without ${missing.join(' and ')}?`,
        message: `This site has no ${missing.join(
          ' or ',
        )}. You can still save it, but ${
          missing.length > 1 ? 'these help' : 'it helps'
        } techs find the site and ${
          missing.length > 1 ? 'show' : 'shows'
        } on audits.`,
        confirmLabel: 'Save anyway',
      })
      if (!ok) return
    }
    onSave({
      name: name.trim(),
      client: resolvedClient || undefined,
      address: address.trim() || undefined,
      state: stateVal.trim() || undefined,
      city: city.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field
          label="State"
          hint="Used by the state filter at the top of the Sites page."
        >
          <StateField
            value={stateVal}
            onChange={(v) => {
              setStateVal(v)
              setCity('')
            }}
          />
        </Field>
        <Field label="Town / city">
          <CityField
            key={resetKey}
            stateCode={stateVal}
            value={city}
            onChange={(c) => {
              setCity(c)
              // If no state is set yet, infer it from the chosen town so
              // the tech doesn't have to pick both. Only fills when the
              // town belongs to exactly one state (unambiguous).
              if (!stateVal.trim()) {
                const r = regionForCity(c)
                if (r) setStateVal(r)
              }
            }}
          />
        </Field>
        <Field
          label="Functional location"
          hint="Optional — a FLOC / asset code, if your business uses one."
        >
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. BN-ASAC-ATSC"
          />
        </Field>
        <Field label="Address">
          <TextInput
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 197 Airport Drive"
          />
        </Field>
        <Field label="Client / owner">
          {companyOptions.length > 0 && (
            <label className="mb-1.5 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-600"
                checked={ownerIsUs}
                onChange={(e) => setOwnerIsUs(e.target.checked)}
              />
              Our own facility — use our company name
            </label>
          )}
          {ownerIsUs ? (
            companyOptions.length > 1 ? (
              <Picker
                title="Our company"
                value={ownerName}
                onChange={setOwnerName}
                options={companyOptions.map((n) => ({ value: n, label: n }))}
              />
            ) : (
              <TextInput value={companyOptions[0]} disabled />
            )
          ) : (
            <TextInput
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="e.g. Mr & Mrs Smith / Acme Foods Ltd"
            />
          )}
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

// State / territory picker for sites.
function StateField({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Picker
      title="State"
      value={value}
      onChange={onChange}
      emptyLabel="No state"
      placeholder="— pick a state —"
      options={AU_REGIONS.map((r) => ({ value: r, label: r }))}
    />
  )
}

// Town / city picker. Offers the curated list for the chosen state,
// plus an "Other — type my own" option that reveals a free-text box.
// Mounted with key={resetKey} by the form so the manual-entry mode
// resets cleanly between sites.
function CityField({
  stateCode,
  value,
  onChange,
}: {
  stateCode: string
  value: string
  onChange: (v: string) => void
}) {
  const [manual, setManual] = useState(false)

  const cityOptions = useMemo<PickerOption[]>(() => {
    // Cities for the picked state; if none picked yet, offer all.
    if (stateCode && AU_CITIES_BY_REGION[stateCode]) {
      return AU_CITIES_BY_REGION[stateCode].map((c) => ({
        value: c,
        label: c,
      }))
    }
    const opts: PickerOption[] = []
    for (const region of AU_REGIONS) {
      for (const city of AU_CITIES_BY_REGION[region] ?? []) {
        opts.push({ value: city, label: city, group: region })
      }
    }
    return opts
  }, [stateCode])

  const options = useMemo<PickerOption[]>(
    () => [
      { value: CITY_OTHER_VALUE, label: 'Other — type my own' },
      ...cityOptions,
    ],
    [cityOptions],
  )

  const known = useMemo(
    () =>
      new Set(
        options.filter((o) => o.value !== CITY_OTHER_VALUE).map((o) => o.value),
      ),
    [options],
  )

  const trimmed = value.trim()
  const isCustom = trimmed !== '' && !known.has(trimmed)
  const showManual = manual || isCustom
  const pickerValue = showManual ? CITY_OTHER_VALUE : trimmed

  return (
    <div className="space-y-2">
      <Picker
        title="Town / city"
        value={pickerValue}
        onChange={(v) => {
          if (v === CITY_OTHER_VALUE) {
            setManual(true)
            if (known.has(trimmed)) onChange('')
            return
          }
          setManual(false)
          onChange(v)
        }}
        emptyLabel="No town/city"
        placeholder="— pick a town / city —"
        options={options}
      />
      {showManual && (
        <TextInput
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a town / city name"
          aria-label="Custom town / city name"
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

// --- Equipment logbook (AS/NZS 5149.4 + ANZ Refrigerant Handling CoP 2025) ---
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

  const profile = profileFor(state.jurisdiction)
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
  // Originals superseded by a re-statement correction stay in the
  // service-history table (marked) but are excluded from every total —
  // the linked correction carries the true figures.
  const superseded = supersededIds(state.transactions)
  const counted = txs.filter((t) => !superseded.has(t.id))
  const totalCharged = counted
    .filter((t) => t.kind === 'charge')
    .reduce((s, t) => s + t.amount, 0)
  const totalRecovered = counted
    .filter((t) => t.kind === 'recover')
    .reduce((s, t) => s + t.amount, 0)
  const totalLoss = counted.reduce((s, t) => s + transactionLoss(t), 0)
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
            {[
              state.businessAbn
                ? `${profile.businessNumberShort} ${state.businessAbn}`
                : `${profile.businessNumberShort} not set in Settings`,
              ...(profile.hasBusinessAuthorisation
                ? [
                    state.arcAuthorisationNumber
                      ? `${profile.businessAuthShort} ${state.arcAuthorisationNumber}`
                      : `${profile.businessAuthShort} not set in Settings`,
                  ]
                : []),
            ].join(' · ')}
          </div>
        </header>

        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Equipment
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Kv label="Site" v={siteLabel(site)} />
            {site.client && <Kv label="Client" v={site.client} />}
            {site.address && <Kv label="Address" v={site.address} />}
            <Kv label="Unit" v={unit.name} />
            {unit.kind && <Kv label="Type" v={UNIT_KIND_LABELS[unit.kind]} />}
            {unit.manufacturer && <Kv label="Manufacturer" v={unit.manufacturer} />}
            {unit.model && <Kv label="Model" v={unit.model} />}
            {unit.serial && <Kv label="Serial" v={unit.serial} />}
            {unit.installDate && (
              <Kv label="Installed" v={formatPlainDate(unit.installDate)} />
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
                  ? formatWeight(unit.refrigerantCharge, state.unit, 3)
                  : '—'
              }
            />
            <Kv
              label="GWP (100-yr, IPCC AR4/AR5)"
              v={gwp != null ? String(gwp) : '—'}
            />
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
              v={`${formatWeight(leak.topUpKg, state.unit, 3)}${
                unit.refrigerantCharge
                  ? ` (${(leak.fraction * 100).toFixed(1)}% of charge)`
                  : ''
              }`}
            />
            <Kv label="Leak status" v={leakLevelLabel(leak.level)} />
            <Kv
              label="Total charged (lifetime)"
              v={formatWeight(totalCharged, state.unit, 3)}
            />
            <Kv
              label="Total recovered (lifetime)"
              v={formatWeight(totalRecovered, state.unit, 3)}
            />
            {totalLoss > 0 && (
              <Kv
                label="Total loss (lifetime)"
                v={formatWeight(totalLoss, state.unit, 3)}
              />
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
                    <th className="py-1 pr-2 text-right">Equip {state.unit}</th>
                    <th className="py-1 pr-2 text-right">Bottle {state.unit}</th>
                    <th className="py-1 pr-2 text-right">Loss {state.unit}</th>
                    <th className="py-1 pr-2">Reason</th>
                    <th className="py-1 pr-2">Leak test</th>
                    <th className="py-1 pr-2">Operator</th>
                    <th className="py-1">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <LogbookRow
                      key={t.id}
                      t={t}
                      superseded={superseded.has(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* On-screen only — nameplate/condition photos for this unit.
            Excluded from the printed logbook to keep it a clean record. */}
        <section className="no-print">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Photos
          </div>
          <PhotoSection
            entityType="unit"
            entityId={unit.id}
            hint="Nameplate, condition, install — stored on this device and included in the JSON backup."
          />
        </section>

        <footer className="border-t border-slate-300 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          <p>{profile.citation}</p>
          <p className="mt-2">Generated {generatedAt}.</p>
          <IntegrityStamp />
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

function LogbookRow({
  t,
  superseded = false,
}: {
  t: Transaction
  superseded?: boolean
}) {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)
  const bottle = state.bottles.find((b) => b.id === t.bottleId)
  const equipKg = t.kind === 'charge' || t.kind === 'recover' ? t.amount : 0
  const bottleKg = t.bottleAmount ?? equipKg
  const loss = transactionLoss(t)
  return (
    <tr
      className={`border-b border-slate-200 align-top dark:border-slate-800 ${
        superseded ? 'text-slate-400 dark:text-slate-500' : ''
      }`}
    >
      <td className="py-1 pr-2 whitespace-nowrap">
        {/* Business timezone, not browser — printed audit dates must
            match the on-screen log. */}
        {formatDate(t.date, t.tz || state.location.timezone)}
      </td>
      <td className="py-1 pr-2">
        {transactionLabel(t.kind)}
        {bottle ? (
          <div className="text-[10px] text-slate-500">via {bottle.bottleNumber}</div>
        ) : null}
        {superseded && (
          <div className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Superseded by correction — not counted
          </div>
        )}
        {isRestatement(t) && (
          <div className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
            Correction — re-states earlier entry
          </div>
        )}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {equipKg ? kgToDisplay(equipKg, state.unit).toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {bottleKg ? kgToDisplay(bottleKg, state.unit).toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {loss > 0 ? kgToDisplay(loss, state.unit).toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2">{t.reason ?? ''}</td>
      <td className="py-1 pr-2">
        {t.leakTestPerformed === undefined
          ? ''
          : t.leakTestPerformed
            ? 'Yes'
            : 'No'}
      </td>
      <td className="py-1 pr-2 whitespace-nowrap">
        {t.technician && <div>{t.technician}</div>}
        {t.technicianLicence && (
          <div className="text-[10px] text-slate-500">
            {profile.techLicenceShort} {t.technicianLicence}
          </div>
        )}
        {t.businessName && <div>{t.businessName}</div>}
        {t.businessAbn && (
          <div className="text-[10px] text-slate-500">
            {profile.businessNumberShort} {t.businessAbn}
          </div>
        )}
        {t.arcAuthorisationNumber && (
          <div className="text-[10px] text-slate-500">
            {profile.businessAuthShort || 'Auth'} {t.arcAuthorisationNumber}
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
        {t.correctionReason && (
          <div className="text-[11px] italic">
            Correction reason: “{t.correctionReason}”
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
  const profile = profileFor(state.jurisdiction)
  // Printed audit honours the business's weight-unit setting (kg/lb), like
  // the rest of the app — `wu` is the unit label, `d3` converts a stored
  // kg value to the display unit at 3-dp.
  const wu = state.unit
  const d3 = (kg: number) => kgToDisplay(kg, wu).toFixed(3)

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
  // Re-stated originals are excluded — the linked correction row (same
  // site/kind) carries the true amount and is summed instead.
  const supersededTotals = supersededIds(state.transactions)
  const totalCharged = state.transactions
    .filter(
      (t) =>
        !t.deletedAt &&
        !supersededTotals.has(t.id) &&
        t.siteId === site.id &&
        t.kind === 'charge',
    )
    .reduce((s, t) => s + t.amount, 0)
  const totalRecovered = state.transactions
    .filter(
      (t) =>
        !t.deletedAt &&
        !supersededTotals.has(t.id) &&
        t.siteId === site.id &&
        t.kind === 'recover',
    )
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
            {[
              state.businessAbn
                ? `${profile.businessNumberShort} ${state.businessAbn}`
                : `${profile.businessNumberShort} not set in Settings`,
              ...(profile.hasBusinessAuthorisation
                ? [
                    state.arcAuthorisationNumber
                      ? `${profile.businessAuthShort} ${state.arcAuthorisationNumber}`
                      : `${profile.businessAuthShort} not set in Settings`,
                  ]
                : []),
            ].join(' · ')}
          </div>
        </header>

        <section>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Site
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <Kv label="Site" v={siteLabel(site)} />
            {site.group && <Kv label="Region" v={site.group} />}
            {site.client && <Kv label="Client" v={site.client} />}
            {site.address && <Kv label="Address" v={site.address} />}
            {!isBottles && (
              <Kv label="Units installed" v={String(units.length)} />
            )}
            <Kv label="Bottles on site" v={String(bottles.length)} />
            <Kv
              label="Refrigerant on site"
              v={formatWeight(totalOnSiteNet, wu, 3)}
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
                    <th className="py-1 pr-2 text-right">Tare {wu}</th>
                    <th className="py-1 pr-2 text-right">Gross {wu}</th>
                    <th className="py-1 pr-2 text-right">Net {wu}</th>
                    <th className="py-1 pr-2 text-right">Safe fill {wu}</th>
                    <th className="py-1 pr-2 text-right">Full {wu}</th>
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
                        {d3(b.tareWeight)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {d3(b.grossWeight)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {d3(netWeight(b))}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {b.initialNetWeight > 0 ? d3(b.initialNetWeight) : '—'}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {(() => {
                          const sw = totalSafeWeight(b)
                          return sw != null ? d3(sw) : '—'
                        })()}
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
                      <th className="py-1 pr-2 text-right">Charge {wu}</th>
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
                              ? d3(u.refrigerantCharge)
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
                    <th className="py-1 pr-2 text-right">Refrig {wu}</th>
                    <th className="py-1 pr-2 text-right">Loss {wu}</th>
                    <th className="py-1 pr-2">Reason</th>
                    <th className="py-1 pr-2">Leak test</th>
                    <th className="py-1">Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => (
                    <AuditTxRow
                      key={t.id}
                      t={t}
                      superseded={supersededTotals.has(t.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <footer className="border-t border-slate-300 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          <p>
            {profile.citation} Cylinder periodic test dates per AS 2030.
          </p>
          {(totalCharged > 0 || totalRecovered > 0) && (
            <p className="mt-2">
              Lifetime at this site — charged {formatWeight(totalCharged, wu, 3)},
              recovered {formatWeight(totalRecovered, wu, 3)}.
            </p>
          )}
          <p className="mt-2">Generated {generatedAt}.</p>
          <IntegrityStamp />
          <div className="mt-4 grid grid-cols-2 gap-6 print:mt-8">
            <SignatureLine label="Technician signature" />
            <SignatureLine label="Customer signature" />
          </div>
        </footer>
      </div>
    </Modal>
  )
}

function AuditTxRow({
  t,
  superseded = false,
}: {
  t: Transaction
  superseded?: boolean
}) {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)
  const bottle = state.bottles.find((b) => b.id === t.bottleId)
  const unit = t.unitId ? state.units.find((u) => u.id === t.unitId) : undefined
  const refrigKg = t.kind === 'charge' || t.kind === 'recover' ? t.amount : 0
  const loss = transactionLoss(t)
  return (
    <tr
      className={`border-b border-slate-200 align-top dark:border-slate-800 ${
        superseded ? 'text-slate-400 dark:text-slate-500' : ''
      }`}
    >
      <td className="py-1 pr-2 whitespace-nowrap">
        {formatDate(t.date, t.tz || state.location.timezone)}
      </td>
      <td className="py-1 pr-2">
        {transactionLabel(t.kind)}
        {superseded && (
          <div className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Superseded by correction — not counted
          </div>
        )}
        {isRestatement(t) && (
          <div className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
            Correction — re-states earlier entry
          </div>
        )}
      </td>
      <td className="py-1 pr-2">{bottle ? bottle.bottleNumber : '—'}</td>
      <td className="py-1 pr-2">{unit?.name ?? t.unitName ?? t.equipment ?? '—'}</td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {refrigKg ? kgToDisplay(refrigKg, state.unit).toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2 text-right tabular-nums">
        {loss > 0 ? kgToDisplay(loss, state.unit).toFixed(3) : ''}
      </td>
      <td className="py-1 pr-2">{t.reason ? REASON_LABELS[t.reason] : ''}</td>
      <td className="py-1 pr-2">
        {t.leakTestPerformed === undefined
          ? ''
          : t.leakTestPerformed
            ? 'Yes'
            : 'No'}
      </td>
      <td className="py-1 whitespace-nowrap">
        {t.technician && <div>{t.technician}</div>}
        {t.technicianLicence && (
          <div className="text-[10px] text-slate-500">
            {profile.techLicenceShort} {t.technicianLicence}
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
