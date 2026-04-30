import { useMemo, useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  Pill,
  Select,
  TextArea,
  TextInput,
} from '../components/ui'
import { useStore } from '../lib/store'
import {
  REFRIGERANT_TYPES,
  UNIT_KIND_LABELS,
  netWeight,
  type Site,
  type Unit,
  type UnitKind,
} from '../lib/types'
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
  const [showDecommissioned, setShowDecommissioned] = useState(false)

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
      <Modal open={!!site && !editing} title={site.name} onClose={onClose}>
        <div className="space-y-4">
          <Card className="!p-3">
            <div>
              {site.client && (
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  {site.client}
                </div>
              )}
              {site.address && (
                <div className="text-sm text-slate-500">{site.address}</div>
              )}
              {site.notes && (
                <div className="mt-1 text-xs italic text-slate-500">
                  {site.notes}
                </div>
              )}
              {!site.client && !site.address && !site.notes && (
                <div className="text-sm text-slate-500">No details added.</div>
              )}
            </div>
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
                  />
                ))}
              </div>
            )}
          </div>

          {decommissioned.length > 0 && (
            <div>
              <button
                className="flex w-full items-center justify-between px-1 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                onClick={() => setShowDecommissioned((v) => !v)}
              >
                <span>Decommissioned ({decommissioned.length})</span>
                <span aria-hidden>{showDecommissioned ? '▾' : '▸'}</span>
              </button>
              {showDecommissioned && (
                <div className="mt-2 space-y-2">
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
    </>
  )
}

function UnitCard({
  u,
  onEdit,
  onDecommission,
}: {
  u: Unit
  onEdit: () => void
  onDecommission: () => void
}) {
  const { state } = useStore()
  return (
    <Card className="!p-3">
      <div className="flex items-start justify-between gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={onEdit}>
          <div className="font-semibold text-slate-900 dark:text-slate-100">
            {u.name}
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
        <button
          type="button"
          onClick={onDecommission}
          className="shrink-0 rounded-xl bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          title="Mark as decommissioned"
        >
          Decommission
        </button>
      </div>
    </Card>
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

function SiteForm({
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

function UnitForm({
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
  const allTypes = useMemo(
    () => [...REFRIGERANT_TYPES, ...state.customRefrigerants],
    [state.customRefrigerants],
  )

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
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as UnitKind | '')}
          >
            <option value="">— pick a type —</option>
            {(Object.keys(UNIT_KIND_LABELS) as UnitKind[]).map((k) => (
              <option key={k} value={k}>
                {UNIT_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Refrigerant">
            <Select
              value={refrigerantType}
              onChange={(e) => setRefrigerantType(e.target.value)}
            >
              <option value="">—</option>
              {allTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
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
          <TextInput
            type="date"
            value={installDate}
            onChange={(e) => setInstallDate(e.target.value)}
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
