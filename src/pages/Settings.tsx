import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Card,
  Field,
  Modal,
  Pill,
  TextInput,
} from '../components/ui'
import { Picker } from '../components/Picker'
import { InstallAppButton } from '../components/InstallAppButton'
import { useStore } from '../lib/store'
import {
  AU_REGIONS,
  REFRIGERANT_TYPES,
  TIMEZONE_OPTIONS,
  transactionLabel,
  transactionLoss,
  type ClockFormat,
  type LocationSettings,
  type Technician,
  type Theme,
  type WeightUnit,
} from '../lib/types'
import { formatDateTime } from '../lib/datetime'
import { formatWeight } from '../lib/units'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { isSyncConfigured } from '../lib/sync'
import {
  deleteCorruptedBackup,
  getStorageEstimate,
  isStoragePersisted,
  listCorruptedBackups,
  readCorruptedBackup,
  requestPersistentStorage,
  type CorruptedBackup,
  type StorageEstimate,
} from '../lib/storage'
import type { PickerOption } from '../components/Picker'

const COUNTRY_OPTIONS: readonly PickerOption[] = [
  { value: 'Australia', label: 'Australia' },
  { value: 'New Zealand', label: 'New Zealand' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'United States', label: 'United States' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Other', label: 'Other' },
]

const AU_REGION_OPTIONS: readonly PickerOption[] = AU_REGIONS.map((r) => ({
  value: r,
  label: r,
}))

const WEIGHT_UNIT_OPTIONS: readonly PickerOption[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
]

export default function Settings() {
  const {
    state,
    addTechnician,
    updateTechnician,
    deleteTechnician,
    setActiveTechnicianId,
    restoreTransaction,
    setArcAuthorisationNumber,
    setBusinessName,
    setLocation,
    setUnit,
    setTheme,
    setClock,
    setSyncSettings,
    addCustomRefrigerant,
    removeCustomRefrigerant,
    toggleFavoriteRefrigerant,
    resetAll,
    importState,
  } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const [arcAuth, setArcAuth] = useState(state.arcAuthorisationNumber)
  const [bizName, setBizName] = useState(state.businessName)
  const [loc, setLoc] = useState<LocationSettings>(state.location)
  const [newType, setNewType] = useState('')
  const [teamIdInput, setTeamIdInput] = useState(state.sync.teamId)
  const [techModalOpen, setTechModalOpen] = useState(false)
  const [editingTech, setEditingTech] = useState<Technician | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const favorites = state.favoriteRefrigerants

  const timezoneOptions = useMemo<PickerOption[]>(
    () =>
      TIMEZONE_OPTIONS.map((tz) => ({
        value: tz.iana,
        label: tz.label,
        group: tz.group,
      })),
    [],
  )

  useEffect(
    () => setArcAuth(state.arcAuthorisationNumber),
    [state.arcAuthorisationNumber],
  )
  useEffect(() => setBizName(state.businessName), [state.businessName])
  useEffect(() => setLoc(state.location), [state.location])
  useEffect(() => setTeamIdInput(state.sync.teamId), [state.sync.teamId])

  function openAddTech() {
    setEditingTech(null)
    setTechModalOpen(true)
  }
  function openEditTech(t: Technician) {
    setEditingTech(t)
    setTechModalOpen(true)
  }

  // --- Storage health state ---------------------------------------------
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [estimate, setEstimate] = useState<StorageEstimate>({})
  const [corrupted, setCorrupted] = useState<CorruptedBackup[]>([])

  const refreshStorageHealth = useCallback(() => {
    void Promise.all([isStoragePersisted(), getStorageEstimate()]).then(
      ([p, e]) => {
        setPersisted(p)
        setEstimate(e)
        setCorrupted(listCorruptedBackups())
      },
    )
  }, [])

  useEffect(() => {
    refreshStorageHealth()
  }, [refreshStorageHealth])

  async function onRequestPersist() {
    const granted = await requestPersistentStorage()
    setPersisted(granted)
    toast.show(
      granted
        ? 'Persistent storage granted — this device will not auto-evict your data.'
        : 'Browser declined persistent storage. Install the app to home screen to improve your odds.',
      granted ? 'success' : 'info',
      6000,
    )
  }

  function downloadCorruptedBackup(b: CorruptedBackup) {
    const raw = readCorruptedBackup(b.key)
    if (raw == null) {
      toast.show('Backup is no longer available.', 'error')
      return
    }
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = b.savedAt.replace(/[:.]/g, '-')
    a.download = `refrighandle-corrupted-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function discardCorruptedBackup(b: CorruptedBackup) {
    const ok = await confirm({
      title: 'Delete damaged backup?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    deleteCorruptedBackup(b.key)
    setCorrupted(listCorruptedBackups())
  }
  // ----------------------------------------------------------------------

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refrighandle-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    // Two sections in one file: live transactions first, then a
    // separator row + a "Deleted transactions (audit trail)" header,
    // then every soft-deleted transaction. Auditors comparing the
    // live ledger against the deleted-row list don't have to filter
    // by a deletedAt column. Deleted-only columns (deletedAt etc.)
    // appear only in the second section's header.
    const liveHeader = [
      'date',
      'kind',
      'bottleNumber',
      'sourceBottleNumber',
      'refrigerantType',
      'amount_into_equipment_kg',
      'amount_from_bottle_kg',
      'loss_kg',
      'weightBefore_kg',
      'weightAfter_kg',
      'sourceWeightBefore_kg',
      'sourceWeightAfter_kg',
      'site',
      'client',
      'unit',
      'equipment',
      'reason',
      'returnDestination',
      'technician',
      'technicianLicence',
      'businessName',
      'arcAuthorisationNumber',
      'notes',
    ]
    const deletedHeader = [
      ...liveHeader,
      'deletedAt',
      'deletedBy',
      'deletedByLicence',
      'deletedReason',
    ]
    function rowFor(t: (typeof state.transactions)[number]): string[] {
      const b = state.bottles.find((x) => x.id === t.bottleId)
      const sb = t.sourceBottleId
        ? state.bottles.find((x) => x.id === t.sourceBottleId)
        : null
      const s = state.sites.find((x) => x.id === t.siteId)
      const u = state.units.find((x) => x.id === t.unitId)
      const loss = transactionLoss(t)
      return [
        t.date,
        t.kind,
        b?.bottleNumber ?? '',
        sb?.bottleNumber ?? '',
        b?.refrigerantType ?? '',
        t.amount.toFixed(3),
        (t.bottleAmount ?? t.amount).toFixed(3),
        loss.toFixed(3),
        t.weightBefore.toFixed(3),
        t.weightAfter.toFixed(3),
        t.sourceWeightBefore?.toFixed(3) ?? '',
        t.sourceWeightAfter?.toFixed(3) ?? '',
        s?.name ?? '',
        s?.client ?? '',
        u?.name ?? '',
        t.equipment ?? '',
        t.reason ?? '',
        t.returnDestination ?? '',
        t.technician ?? '',
        t.technicianLicence ?? '',
        t.businessName ?? '',
        t.arcAuthorisationNumber ?? '',
        (t.notes ?? '').replace(/[\r\n]+/g, ' '),
      ]
    }
    const liveTxs = state.transactions.filter((t) => !t.deletedAt)
    const deletedTxs = state.transactions
      .filter((t) => !!t.deletedAt)
      .slice()
      .sort((a, b) =>
        (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''),
      )
    const rows: (string[] | string)[] = [
      ['ACTIVE TRANSACTIONS'],
      liveHeader,
      ...liveTxs.map((t) => rowFor(t)),
    ]
    if (deletedTxs.length > 0) {
      rows.push([])
      rows.push([`DELETED TRANSACTIONS (audit trail · ${deletedTxs.length})`])
      rows.push(deletedHeader)
      for (const t of deletedTxs) {
        rows.push([
          ...rowFor(t),
          t.deletedAt ?? '',
          t.deletedBy ?? '',
          t.deletedByLicence ?? '',
          (t.deletedReason ?? '').replace(/[\r\n]+/g, ' '),
        ])
      }
    }
    const csv = rows
      .map((r) =>
        (Array.isArray(r) ? r : [r])
          .map((cell) => {
            const s = String(cell ?? '')
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refrighandle-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importJson(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.bottles)) {
        toast.show(
          'That file does not look like a Refrigerant Handling export.',
          'error',
        )
        return
      }
      const ok = await confirm({
        title: 'Replace all current data?',
        message:
          'This will overwrite every bottle, site, unit, and transaction on this device with the contents of the imported file.',
        confirmLabel: 'Replace',
        danger: true,
      })
      if (ok) {
        importState(data)
      }
    } catch {
      toast.show('Could not read that file.', 'error')
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Settings
      </h2>

      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Technicians
          </div>
          <Button onClick={openAddTech}>+ Add tech</Button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Each profile carries a name and an ARC Refrigerant Handling Licence
          (RHL). Pick the active tech here — every transaction logged is
          stamped with that profile's name and RHL, frozen so the historical
          record is preserved if a tech later changes their licence.
        </p>
        {state.technicians.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tech profiles yet. Add one so transactions can be attributed for
            audits.
          </p>
        ) : (
          <div className="space-y-2">
            {state.technicians.map((t) => {
              const isActive = state.activeTechnicianId === t.id
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-900/20'
                      : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                        {t.name || '(unnamed)'}
                      </span>
                      {isActive && <Pill tone="green">Active</Pill>}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.arcLicenceNumber
                        ? `RHL ${t.arcLicenceNumber}`
                        : 'No RHL recorded'}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {!isActive && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setActiveTechnicianId(t.id)
                          toast.show(`Active tech: ${t.name}`)
                        }}
                      >
                        Use
                      </Button>
                    )}
                    <Button variant="ghost" onClick={() => openEditTech(t)}>
                      Edit
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Compliance details (Australia)
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Used on logbook printouts and stamped onto every transaction at the
          time of work, as required by the AREMA / AIRAH Code of Practice 2018
          and AS/NZS 5149.4. Look up your numbers at{' '}
          <a
            href="https://www.arctick.org/"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-brand-600 hover:underline"
          >
            arctick.org
          </a>
          .
        </p>
        <div className="space-y-3">
          <Field label="Trading / business name">
            <div className="flex gap-2">
              <TextInput
                value={bizName}
                onChange={(e) => setBizName(e.target.value)}
                placeholder="e.g. Acme Refrigeration Pty Ltd"
              />
              <Button
                onClick={() => {
                  setBusinessName(bizName)
                  toast.show('Saved')
                }}
              >
                Save
              </Button>
            </div>
          </Field>
          <Field
            label="ARC Refrigerant Trading Authorisation (RTA)"
            hint="Issued by the Australian Refrigeration Council to your business — required to handle/buy/sell refrigerant."
          >
            <div className="flex gap-2">
              <TextInput
                value={arcAuth}
                onChange={(e) => setArcAuth(e.target.value)}
                placeholder="e.g. AU00000"
              />
              <Button
                onClick={() => {
                  setArcAuthorisationNumber(arcAuth)
                  toast.show('Saved')
                }}
              >
                Save
              </Button>
            </div>
          </Field>
          <p className="text-xs text-slate-500">
            Each tech's RHL lives on their profile in the Technicians card
            above — that's how a multi-tech crew gets their own licence
            stamped on each transaction.
          </p>
        </div>
      </Card>

      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Location
          </div>
          <Button
            onClick={() => {
              setLocation(loc)
              toast.show('Saved')
            }}
          >
            Save
          </Button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Drives the timezone used for "now" defaults on transactions and the
          generated-at line on logbook PDFs. Leave blank to follow this
          device's settings.
        </p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Country">
              <Picker
                title="Country"
                value={loc.country}
                onChange={(v) =>
                  setLoc((l) => ({
                    ...l,
                    country: v,
                    // Clear region when leaving Australia — the curated AU
                    // state list doesn't apply to other countries.
                    region: v === 'Australia' ? l.region : '',
                  }))
                }
                emptyLabel="—"
                options={COUNTRY_OPTIONS}
              />
            </Field>
            <Field label={loc.country === 'Australia' ? 'State / territory' : 'Region'}>
              {loc.country === 'Australia' ? (
                <Picker
                  title="State / territory"
                  value={loc.region}
                  onChange={(v) =>
                    setLoc((l) => ({ ...l, region: v }))
                  }
                  emptyLabel="—"
                  options={AU_REGION_OPTIONS}
                />
              ) : (
                <TextInput
                  value={loc.region}
                  onChange={(e) =>
                    setLoc((l) => ({ ...l, region: e.target.value }))
                  }
                  placeholder="e.g. region / state"
                />
              )}
            </Field>
          </div>
          <Field label="City">
            <TextInput
              value={loc.city}
              onChange={(e) => setLoc((l) => ({ ...l, city: e.target.value }))}
              placeholder="e.g. Sydney"
            />
          </Field>
          <Field
            label="Timezone"
            hint='Used for "now" defaults and timestamp display. Pick the one your work day actually runs in.'
          >
            <Picker
              title="Timezone"
              value={loc.timezone}
              onChange={(v) =>
                setLoc((l) => ({ ...l, timezone: v }))
              }
              emptyLabel="— follow this device —"
              options={timezoneOptions}
            />
          </Field>
        </div>
      </Card>

      <Card>
        <Field
          label="Theme"
          hint="Dark mode is easier on the eyes in plant rooms and basements"
        >
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTheme(t)
                  toast.show(
                    t === 'system' ? 'Following system theme' : `${t[0].toUpperCase()}${t.slice(1)} mode`,
                  )
                }}
                className={`rounded-xl px-3 py-3 text-sm font-medium capitalize transition ${
                  state.theme === t
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card>
        <Field label="Weight units" hint="Display only — data is always stored in kg internally">
          <Picker
            title="Weight units"
            value={state.unit}
            onChange={(v) => {
              setUnit(v as WeightUnit)
              toast.show(`Switched to ${v}`)
            }}
            options={WEIGHT_UNIT_OPTIONS}
          />
        </Field>
      </Card>

      <Card>
        <Field
          label="Time format"
          hint="Applies wherever a time of day is shown — transaction list, logbook PDFs, the time field on the transaction form."
        >
          <div className="grid grid-cols-2 gap-2">
            {(['24h', '12h'] as ClockFormat[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setClock(c)
                  toast.show(
                    c === '24h' ? '24-hour clock' : '12-hour clock (am/pm)',
                  )
                }}
                className={`rounded-xl px-3 py-3 text-sm font-medium transition ${
                  state.clock === c
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {c === '24h' ? '24-hour (13:30)' : '12-hour (1:30 PM)'}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card>
        <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Refrigerants
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Tap the star to favourite the ones you use most — they'll appear at the
          top of every refrigerant dropdown.
        </p>

        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Built-in
        </div>
        <div className="flex flex-wrap gap-2">
          {REFRIGERANT_TYPES.map((t) => (
            <RefrigerantChip
              key={t}
              name={t}
              starred={favorites.includes(t)}
              onToggleStar={() => toggleFavoriteRefrigerant(t)}
            />
          ))}
        </div>

        <div className="my-3 h-px bg-slate-200 dark:bg-slate-800" />

        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Custom
        </div>
        {state.customRefrigerants.length === 0 ? (
          <div className="text-sm text-slate-500">None added.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.customRefrigerants.map((t) => (
              <RefrigerantChip
                key={t}
                name={t}
                starred={favorites.includes(t)}
                onToggleStar={() => toggleFavoriteRefrigerant(t)}
                onRemove={async () => {
                  const ok = await confirm({
                    title: `Remove ${t}?`,
                    message:
                      'It will disappear from the refrigerant pickers. Bottles and transactions already using it stay untouched.',
                    confirmLabel: 'Remove',
                    danger: true,
                  })
                  if (ok) removeCustomRefrigerant(t)
                }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <TextInput
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="e.g. R12B1"
          />
          <Button
            onClick={() => {
              addCustomRefrigerant(newType)
              setNewType('')
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Cloud sync
          </div>
          {isSyncConfigured() ? (
            <Pill tone={state.sync.enabled ? 'green' : 'slate'}>
              {state.sync.enabled ? 'On' : 'Off'}
            </Pill>
          ) : (
            <Pill tone="amber">Not configured</Pill>
          )}
        </div>
        {!isSyncConfigured() ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Cloud sync is built in but inactive — see{' '}
            <a
              className="font-medium text-brand-600 hover:underline"
              href="https://github.com/Imyala/RefrigHandle/blob/main/SYNC.md"
              target="_blank"
              rel="noreferrer"
            >
              SYNC.md
            </a>{' '}
            for the one-time Supabase setup. Without it the app stays fully
            offline (data only on this device).
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Devices using the same <strong>Team ID</strong> share the same
              data in real time. Last write wins.
            </p>
            <Field label="Team ID" hint="Pick anything — must match across all devices">
              <div className="flex gap-2">
                <TextInput
                  value={teamIdInput}
                  onChange={(e) => setTeamIdInput(e.target.value)}
                  placeholder="e.g. acme-hvac"
                />
                <Button
                  onClick={() => {
                    setSyncSettings({
                      enabled: !!teamIdInput.trim(),
                      teamId: teamIdInput.trim(),
                    })
                    toast.show(
                      teamIdInput.trim() ? 'Cloud sync enabled' : 'Cloud sync paused',
                    )
                  }}
                >
                  {state.sync.enabled ? 'Update' : 'Connect'}
                </Button>
              </div>
            </Field>
            {state.sync.enabled && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSyncSettings({ enabled: false, teamId: state.sync.teamId })
                  toast.show('Cloud sync paused')
                }}
              >
                Pause sync
              </Button>
            )}
          </div>
        )}
      </Card>

      <DeletedTransactionsCard onRestore={restoreTransaction} />

      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Install on this device
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Add Refrigerant Handling to your home screen so it opens like
          a normal app and keeps working without internet — every page,
          every bottle, every transaction is stored locally on the
          device.
        </p>
        <InstallAppButton variant="full" />
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Backup &amp; export
        </div>
        <p className="mb-3 text-xs text-slate-500">
          CSV is the F-Gas-friendly log. JSON is a full backup of all data
          on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportJson}>
            Export JSON
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            Export log CSV
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Storage health
          </div>
          {persisted === true ? (
            <Pill tone="green">Persistent</Pill>
          ) : persisted === false ? (
            <Pill tone="amber">Eviction risk</Pill>
          ) : (
            <Pill tone="slate">Checking…</Pill>
          )}
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Browsers can clear app data on devices that are low on space — or, on
          iOS Safari, after a week without use. "Persistent" storage protects
          your bottles, sites, and transactions from that.
        </p>
        {persisted === false && (
          <div className="mb-3">
            <Button variant="secondary" onClick={onRequestPersist}>
              Request persistent storage
            </Button>
            <p className="mt-2 text-xs text-slate-500">
              On iPhone/iPad, "Add to Home Screen" first — Safari only grants
              persistent storage to installed PWAs.
            </p>
          </div>
        )}
        {(estimate.usageBytes != null || estimate.quotaBytes != null) && (
          <div className="mb-3">
            <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
              <span>Used on this device</span>
              <span className="tabular-nums">
                {formatBytes(estimate.usageBytes)}
                {estimate.quotaBytes != null && (
                  <> / {formatBytes(estimate.quotaBytes)}</>
                )}
              </span>
            </div>
            {estimate.usageBytes != null && estimate.quotaBytes != null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full bg-brand-600"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        2,
                        (estimate.usageBytes / estimate.quotaBytes) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            )}
          </div>
        )}
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Recovered backups
          </div>
          {corrupted.length === 0 ? (
            <p className="text-xs text-slate-500">
              None. Saved data was readable on the last load.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 dark:text-amber-300">
                The app could not parse a previous save. The damaged blob is
                preserved here so you can download it for inspection or
                recovery.
              </p>
              {corrupted.map((b) => (
                <div
                  key={b.key}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {new Date(b.savedAt).toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {formatBytes(b.sizeBytes)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="secondary"
                      onClick={() => downloadCorruptedBackup(b)}
                    >
                      Download
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => discardCorruptedBackup(b)}
                    >
                      Discard
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">
          Danger zone
        </div>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Erase every bottle, site, unit, and transaction stored on this device. Export first if you want a backup.
        </p>
        <Button
          variant="danger"
          onClick={async () => {
            const ok = await confirm({
              title: 'Erase all data?',
              message:
                'This deletes every bottle, site, unit, and transaction on this device. Tech profiles, ARC numbers, and app preferences are kept. This cannot be undone.',
              confirmLabel: 'Erase everything',
              danger: true,
            })
            if (ok) {
              resetAll()
              toast.show('Data erased', 'info')
            }
          }}
        >
          Erase all data
        </Button>
      </Card>

      <p className="px-1 text-center text-xs text-slate-400">
        Refrigerant Handling · data stored locally on this device
      </p>

      <TechnicianModal
        open={techModalOpen}
        editing={editingTech}
        onClose={() => setTechModalOpen(false)}
        onSave={(data) => {
          if (editingTech) {
            updateTechnician(editingTech.id, data)
            toast.show('Tech updated')
          } else {
            const created = addTechnician(data)
            setActiveTechnicianId(created.id)
            toast.show(`${created.name} added`)
          }
          setTechModalOpen(false)
        }}
        onDelete={
          editingTech
            ? async () => {
                const ok = await confirm({
                  title: `Remove ${editingTech.name}?`,
                  message:
                    'They will be removed from the active tech list. Past transactions stamped with their name + RHL stay frozen on the record.',
                  confirmLabel: 'Remove',
                  danger: true,
                })
                if (ok) {
                  deleteTechnician(editingTech.id)
                  toast.show('Tech removed', 'info')
                  setTechModalOpen(false)
                }
              }
            : undefined
        }
      />
    </div>
  )
}

function TechnicianModal({
  open,
  editing,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  editing: Technician | null
  onClose: () => void
  onSave: (data: { name: string; arcLicenceNumber: string }) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState('')
  const [rhl, setRhl] = useState('')
  const key = editing?.id ?? 'new'
  const [seenKey, setSeenKey] = useState('')
  if (open && seenKey !== key) {
    setSeenKey(key)
    setName(editing?.name ?? '')
    setRhl(editing?.arcLicenceNumber ?? '')
  }
  if (!open && seenKey !== '') {
    setSeenKey('')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), arcLicenceNumber: rhl.trim() })
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit tech' : 'Add tech'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <TextInput
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Smith"
          />
        </Field>
        <Field
          label="ARC Refrigerant Handling Licence (RHL)"
          hint="Personal licence — stamped onto every transaction this tech logs."
        >
          <TextInput
            value={rhl}
            onChange={(e) => setRhl(e.target.value)}
            placeholder="e.g. L000000"
          />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" full>
            {editing ? 'Save changes' : 'Add tech'}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Remove
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}

// Deleted transactions stay in storage for the audit trail. This card
// is the only place an admin can review what was removed (with who /
// when / why) and put it back if the deletion was a mistake. Live
// transactions never appear here — only soft-deleted ones.
//
// To stop the Settings page filling with old soft-deleted rows, the
// card is collapsed by default and only renders the 5 most recent
// when expanded. Older deletions stay in storage (and in the CSV /
// JSON export) so the audit trail is preserved.
const VISIBLE_DELETED_LIMIT = 5

function DeletedTransactionsCard({
  onRestore,
}: {
  onRestore: (id: string) => void
}) {
  const { state } = useStore()
  const toast = useToast()
  const tz = state.location.timezone
  const clock = state.clock
  const [expanded, setExpanded] = useState(false)

  const deleted = state.transactions
    .filter((t) => t.deletedAt)
    .slice()
    .sort((a, b) =>
      (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''),
    )
  const visible = deleted.slice(0, VISIBLE_DELETED_LIMIT)
  const hidden = Math.max(0, deleted.length - visible.length)

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="-m-1 flex w-full items-center justify-between gap-2 rounded-lg p-1 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Deleted transactions
          </div>
          <Pill tone={deleted.length > 0 ? 'amber' : 'slate'}>
            {deleted.length}
          </Pill>
        </div>
        <span
          aria-hidden
          className={`text-slate-400 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {expanded && (
        <>
          <p className="mb-3 mt-2 text-xs text-slate-500">
            Transactions removed from the activity log are kept here so
            business owners can audit what was deleted, by whom, and why.
            Use Restore to put a row back into the live log if the
            deletion was a mistake. Showing the {VISIBLE_DELETED_LIMIT}{' '}
            most recent — every deletion (including hidden ones) is in
            the JSON / CSV export.
          </p>
          {deleted.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing deleted. Deleted transactions appear here with the
              tech who removed them and an optional reason.
            </p>
          ) : (
            <div className="space-y-2">
              {visible.map((t) => {
                const bottle = state.bottles.find((b) => b.id === t.bottleId)
                const site = state.sites.find((j) => j.id === t.siteId)
                const txUnit = state.units.find((u) => u.id === t.unitId)
                return (
                  <div
                    key={t.id}
                    className="rounded-lg bg-slate-100 px-3 py-2 dark:bg-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                          <span>{transactionLabel(t.kind)}</span>
                          {t.amount > 0 && (
                            <span className="tabular-nums">
                              {formatWeight(t.amount, state.unit)}
                            </span>
                          )}
                          <span className="text-xs font-normal text-slate-500">
                            {bottle?.refrigerantType ?? '?'}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                          {bottle?.bottleNumber ?? '(deleted bottle)'}
                          {site ? ` · ${site.name}` : ''}
                          {txUnit ? ` · ${txUnit.name}` : ''}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          Logged{' '}
                          {formatDateTime(t.date, tz, clock)}
                          {t.technician && ` by ${t.technician}`}
                        </div>
                        <div className="mt-1 text-xs text-red-700 dark:text-red-300">
                          Deleted{' '}
                          {t.deletedAt
                            ? formatDateTime(t.deletedAt, tz, clock)
                            : ''}
                          {t.deletedBy && ` by ${t.deletedBy}`}
                          {t.deletedByLicence && ` · RHL ${t.deletedByLicence}`}
                        </div>
                        {t.deletedReason && (
                          <div className="mt-0.5 text-xs italic text-slate-500">
                            Reason: “{t.deletedReason}”
                          </div>
                        )}
                      </div>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          onRestore(t.id)
                          toast.show('Transaction restored')
                        }}
                      >
                        Restore
                      </Button>
                    </div>
                  </div>
                )
              })}
              {hidden > 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 dark:border-slate-700">
                  +{hidden} older deletion{hidden === 1 ? '' : 's'} hidden
                  here. They're still on file for the audit trail — export
                  CSV or JSON to see every record.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function formatBytes(n?: number): string {
  if (n == null) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function RefrigerantChip({
  name,
  starred,
  onToggleStar,
  onRemove,
}: {
  name: string
  starred: boolean
  onToggleStar: () => void
  onRemove?: () => void
}) {
  const baseChip = onRemove
    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${baseChip}`}
    >
      <button
        type="button"
        onClick={onToggleStar}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none ${
          starred
            ? 'text-amber-500'
            : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
        }`}
        aria-label={starred ? `Unfavourite ${name}` : `Favourite ${name}`}
        title={starred ? 'Unfavourite' : 'Favourite'}
      >
        {starred ? '★' : '☆'}
      </button>
      <span>{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full px-1 text-slate-500 hover:bg-red-100 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-900/40"
          aria-label={`Remove ${name}`}
        >
          ✕
        </button>
      )}
    </div>
  )
}
