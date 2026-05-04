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
import { Picker } from '../components/Picker'
import { useStore } from '../lib/store'
import {
  NON_REFRIGERANT_UNIT_KINDS,
  UNIT_KIND_LABELS,
  gwpFor,
  leakStatusFor,
  netWeight,
  tonnesCO2eFor,
  transactionLabel,
  transactionLoss,
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
import { displayToKg, formatWeight, kgToDisplay } from '../lib/units'

export default function Sites() {
  const { state, addSite } = useStore()
  const { sites } = state

  const [openSite, setOpenSite] = useState<Site | null>(null)
  const [adding, setAdding] = useState(false)

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
      ) : (
        <div className="space-y-2">
          {sites
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((s) => (
              <SiteCard key={s.id} site={s} onOpen={() => setOpenSite(s)} />
            ))}
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
  } = useStore()
  const toast = useToast()

  const [editing, setEditing] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)
  const [editUnit, setEditUnit] = useState<Unit | null>(null)
  const [decommissionTarget, setDecommissionTarget] = useState<Unit | null>(null)
  const [showDecommissioned, setShowDecommissioned] = useState(true)
  const [logbookUnit, setLogbookUnit] = useState<Unit | null>(null)

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
              <DetailRow label="Notes" value={site.notes} italic />
              {!site.client && !site.address && !site.notes && (
                <div className="text-sm text-slate-500">
                  No details added — tap Edit site to fill in client and address.
                </div>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit site
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (
                    confirm(
                      'Delete this site, all its units, and unassign related bottles? This cannot be undone.',
                    )
                  ) {
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

          {bottlesOnSite.length > 0 && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm dark:bg-amber-900/20">
              <div className="font-semibold text-amber-900 dark:text-amber-100">
                Bottles currently on site
              </div>
              <ul className="mt-1 text-amber-900 dark:text-amber-100">
                {bottlesOnSite.map((b) => (
                  <li key={b.id}>
                    {b.bottleNumber} · {b.refrigerantType} ·{' '}
                    {formatWeight(netWeight(b), state.unit)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Units installed ({activeUnits.length})
              </h3>
              <Button onClick={() => setAddingUnit(true)}>+ Add unit</Button>
            </div>
            {activeUnits.length === 0 ? (
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
                      onReactivate={() => {
                        if (
                          confirm(
                            `Move "${u.name}" back to the active list?`,
                          )
                        ) {
                          reactivateUnit(u.id)
                          toast.show('Unit reactivated')
                        }
                      }}
                      onDelete={() => {
                        if (
                          confirm(
                            `Permanently delete "${u.name}" from the record? This cannot be undone.`,
                          )
                        ) {
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
    </>
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
  const [notes, setNotes] = useState(site?.notes ?? '')

  const key = site?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
    setName(site?.name ?? '')
    setClient(site?.client ?? '')
    setAddress(site?.address ?? '')
    setNotes(site?.notes ?? '')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name: name.trim(),
      client: client.trim() || undefined,
      address: address.trim() || undefined,
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

  const key = unit?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
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
      <td className="py-1">{t.notes ?? ''}</td>
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
