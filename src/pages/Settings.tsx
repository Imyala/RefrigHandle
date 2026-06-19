import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Button,
  Card,
  Field,
  Modal,
  Pill,
  TextInput,
} from '../components/ui'
import { Picker } from '../components/Picker'
import { DateInput } from '../components/DateInput'
import { LocationFields } from '../components/LocationFields'
import { InstallAppButton } from '../components/InstallAppButton'
import { QuarterlyReportCard } from '../components/QuarterlyReport'
import { useStore } from '../lib/store'
import {
  expiryStatus,
  REFRIGERANT_TYPES,
  type ClockFormat,
  type LocationSettings,
  type Technician,
  type TechnicianRole,
  type Theme,
  type WeightUnit,
  TECHNICIAN_ROLES,
  DEFAULT_TECHNICIAN_ROLE,
  TECHNICIAN_PURGE_DAYS,
  roleInfo,
  roleAtLeast,
  canAssignRole,
  canManageTech,
  daysUntilPurge,
  isTechnicianActive,
  canEditCompanyIdentity,
  composeName,
  splitName,
  APP_VERSION,
  APP_COMMIT,
} from '../lib/types'
import { profileFor } from '../lib/compliance'
import { formatDateTime, formatPlainDate } from '../lib/datetime'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { hashPassword, MIN_PASSWORD_LENGTH } from '../lib/auth'
import { screenNewPassword } from '../lib/passwordStrength'
import { PasswordPromptModal } from '../components/PasswordPromptModal'
import { isSyncConfigured } from '../lib/sync'
import { verifyAuditChains, type ChainReport } from '../lib/auditChain'
import { downloadBackup, downloadLogCsv, downloadRecordsZip, getLastBackupAt } from '../lib/backup'
import { importAttachments } from '../lib/attachments'
import type { PickerOption } from '../components/Picker'

const WEIGHT_UNIT_OPTIONS: readonly PickerOption[] = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'lb', label: 'Pounds (lb)' },
]

// Editable local state that re-syncs whenever the backing store value
// changes from outside (sync merge, JSON import, another card
// committing). Uses the documented render-phase adjustment instead of
// a setState-in-effect mirror, so the corrected value paints in the
// same frame rather than one frame late.
function useStoreSyncedState<T>(
  source: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState(source)
  const [prev, setPrev] = useState(source)
  if (!Object.is(prev, source)) {
    setPrev(source)
    setValue(source)
  }
  return [value, setValue]
}

export default function Settings() {
  const {
    state,
    addTechnician,
    updateTechnician,
    deactivateTechnician,
    reactivateTechnician,
    suspendTechnician,
    unsuspendTechnician,
    deleteTechnician,
    setActiveTechnicianId,
    setArcAuthorisationNumber,
    setArcAuthorisationExpiry,
    setBusinessName,
    setBusinessAbn,
    setLocation,
    setUnit,
    setTheme,
    setClock,
    setSyncSettings,
    addCustomRefrigerant,
    removeCustomRefrigerant,
    toggleFavoriteRefrigerant,
    importState,
  } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  // Editable mirrors of store values — re-synced when the store changes
  // from outside this card (sync merge, JSON import, onboarding).
  const [arcAuth, setArcAuth] = useStoreSyncedState(state.arcAuthorisationNumber)
  const [bizName, setBizName] = useStoreSyncedState(state.businessName)
  const [abn, setAbn] = useStoreSyncedState(state.businessAbn)
  const [loc, setLoc] = useStoreSyncedState<LocationSettings>(state.location)
  const [newType, setNewType] = useState('')
  const [teamIdInput, setTeamIdInput] = useStoreSyncedState(state.sync.teamId)
  const [techModalOpen, setTechModalOpen] = useState(false)
  const [editingTech, setEditingTech] = useState<Technician | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const favorites = state.favoriteRefrigerants
  // Device-local backup freshness marker (see lib/backup.ts).
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() =>
    getLastBackupAt(),
  )

  // --- Auto-save for the compliance + location cards -------------------
  // These cards used to have explicit Save buttons. Now each field
  // commits to the store on blur (text fields) or on a short debounce
  // (the location pickers), so a tech can't enter compliance details and
  // walk away thinking they're stored when they aren't. Each commit
  // flashes a small "Saved" confirmation in the card header.
  const [compSaved, flashComp] = useSaveFlash()
  const [locSaved, flashLoc] = useSaveFlash()

  // Active jurisdiction profile — drives licence terminology, business
  // number validation, and which compliance fields exist at all.
  const profile = profileFor(state.jurisdiction)

  // Whether the profile currently in the seat may manage accounts
  // (add/deactivate/re-role). Supervisor and above. Soft today — there
  // are no per-tech logins yet, so the active profile can be switched —
  // but it reflects the rule the backend will enforce.
  const activeTech = state.technicians.find(
    (t) => t.id === state.activeTechnicianId,
  )
  // Whether the seated profile can manage people at all (lead tech and
  // above) — per-person scope is decided by canManageTech below. Editing
  // the business's regulatory identity is a higher bar (supervisor+).
  // Managing technicians (add / edit role / deactivate / delete) is for
  // owners and supervisors only — roles below that just switch profiles.
  const canManage = roleAtLeast(activeTech?.role, 'supervisor')
  const canEditCompany = canEditCompanyIdentity(activeTech?.role)

  // Deep-link scroll: alert cards (e.g. the licence-expiry warning) link
  // here with navigation state { scrollTo: 'technicians' | 'compliance' } so
  // tapping them lands on the right card instead of the top of this long
  // page. Runs once on mount after layout.
  const location = useLocation()
  useEffect(() => {
    const target = (location.state as { scrollTo?: string } | null)?.scrollTo
    if (!target) return
    const el = document.getElementById(`settings-${target}`)
    if (!el) return
    // Defer to the next frame so the card is laid out before we scroll.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [location.state])

  // Company identity (business name, ABN, ARC RTA number) is stamped onto
  // every record, so it's locked read-only once entered and only an
  // owner/supervisor can deliberately unlock it. The RTA *expiry* stays
  // freely editable (it changes on renewal). Re-locks when leaving the page.
  const [companyUnlocked, setCompanyUnlocked] = useState(false)
  const companyLocked = !companyUnlocked && state.businessName.trim() !== ''
  async function unlockCompany() {
    const ok = await confirm({
      title: 'Edit company details?',
      message:
        'Business name, ABN and ARC RTA number are stamped onto every record and rarely change. Unlock only to correct a genuine mistake — past transactions keep the details they were logged with.',
      confirmLabel: 'Unlock',
    })
    if (ok) setCompanyUnlocked(true)
  }

  // The business number is held back from the store until it passes the
  // profile's validation (AU: ABN checksum; others: free-form).
  const abnInvalid = !profile.validateBusinessNumber(abn)

  function commitBizName() {
    if (bizName.trim() !== state.businessName) {
      setBusinessName(bizName)
      flashComp()
    }
  }
  function commitAbn() {
    if (abnInvalid) return
    if (abn.trim() !== state.businessAbn) {
      setBusinessAbn(abn)
      flashComp()
    }
  }
  function commitArcAuth() {
    if (arcAuth.trim() !== state.arcAuthorisationNumber) {
      setArcAuthorisationNumber(arcAuth)
      flashComp()
    }
  }

  // Location commits on a debounce so a burst of picker changes
  // (state → city → timezone) coalesces into one save + one audit entry.
  useEffect(() => {
    if (locationEqual(loc, state.location)) return
    const id = setTimeout(() => {
      setLocation(loc)
      flashLoc()
    }, 600)
    return () => clearTimeout(id)
  }, [loc, state.location, setLocation, flashLoc])

  function openAddTech() {
    setEditingTech(null)
    setTechModalOpen(true)
  }
  function openEditTech(t: Technician) {
    setEditingTech(t)
    setTechModalOpen(true)
  }

  // Password prompt for "Use"-switching into a protected tech.
  const [pwPromptTech, setPwPromptTech] = useState<Technician | null>(null)
  function requestActivate(t: Technician) {
    if (t.suspendedAt) {
      toast.show(
        'This account is suspended — a manager must lift the suspension first.',
        'error',
      )
      return
    }
    if (t.passwordHash) {
      setPwPromptTech(t)
    } else {
      setActiveTechnicianId(t.id)
      toast.show(`Active tech: ${t.name}`)
    }
  }

  // Skip the rest of the 90-day retention and purge the profile now.
  // Their logged work is kept regardless (frozen on each transaction).
  async function requestDeleteNow(t: Technician) {
    const ok = await confirm({
      title: `Delete ${t.name} now?`,
      message:
        'Removes this profile immediately instead of waiting out the retention window. Everything they logged stays in the records for audit. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    })
    if (ok) {
      deleteTechnician(t.id)
      toast.show(`${t.name} deleted`)
    }
  }

  async function requestReactivate(t: Technician) {
    const ok = await confirm({
      title: `Reactivate ${t.name}?`,
      message:
        'This re-enables the account so it can be used again and stops the deletion countdown.',
      confirmLabel: 'Reactivate',
    })
    if (ok) {
      reactivateTechnician(t.id)
      toast.show(`${t.name} reactivated`)
    }
  }

  function exportJson() {
    // Shared with the overdue-backup alert — stamps the device-local
    // "last backup" marker that drives the nudge. Bundles photos and
    // signatures from the attachment store.
    void downloadBackup(state).then(() => setLastBackupAt(getLastBackupAt()))
  }

  // Optional date range on the CSV export (inclusive local calendar
  // days in the business timezone). Auditors ask for periods — "the
  // last two quarters" — not the whole history.
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')

  function exportCsv() {
    downloadLogCsv(state, exportFrom || undefined, exportTo || undefined)
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
        // Photos/signatures ride in the backup under __attachments —
        // restore them to the attachment store and keep the key out of
        // the app state.
        const { __attachments, ...stateOnly } = data
        importState(stateOnly)
        if (Array.isArray(__attachments) && __attachments.length > 0) {
          const n = await importAttachments(__attachments)
          if (n > 0) {
            toast.show(`Restored ${n} photo${n === 1 ? '' : 's'}/signatures`, 'success')
          }
        }
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

      <CollapsibleSection
        title="Audit & records"
        storageKey="audit"
        defaultOpen
        resetOnMount
      >
      {/* The quarterly record matches the ARC RTA permit conditions. */}
      <QuarterlyReportCard />

      <Card>
        <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Change log
        </div>
        <p className="mb-3 text-xs text-slate-500">
          A complete, time-stamped record of every change made in the app —
          bottles, sites and equipment added or edited, transactions corrected
          or deleted, and technicians or settings changed — each stamped with
          who did it and when. It's the audit history owners and supervisors
          use to review the team's activity. Anyone on this device can open and
          read it — no one, not even an owner or supervisor, can edit or
          permanently delete an entry.
        </p>
        <Link to="/history" className="inline-block">
          <Button variant="secondary">Open change log</Button>
        </Link>
      </Card>

      <AuditIntegrityCard />

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Backup &amp; export
        </div>
        <p className="mb-3 text-xs text-slate-500">
          CSV is the audit-friendly log. JSON is a full backup of all data
          on this device.{' '}
          {lastBackupAt ? (
            <>
              Last full backup:{' '}
              <strong>
                {formatDateTime(lastBackupAt, state.location.timezone, state.clock)}
              </strong>
              .
            </>
          ) : (
            <strong>No full backup has been saved from this device yet.</strong>
          )}
        </p>
        <div className="mb-3 grid grid-cols-2 gap-2">
          <Field
            label="From"
            hint="Optional — limits the CSV to a period."
          >
            <DateInput
              value={exportFrom}
              onChange={setExportFrom}
              max={exportTo || undefined}
              ariaLabel="Export from date"
            />
          </Field>
          <Field label="To">
            <DateInput
              value={exportTo}
              onChange={setExportTo}
              min={exportFrom || undefined}
              ariaLabel="Export to date"
            />
          </Field>
        </div>
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

      </CollapsibleSection>

      <CollapsibleSection
        title="Business & people"
        storageKey="business"
        defaultOpen
      >
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Technicians
          </div>
          <Button onClick={openAddTech} disabled={!canManage}>
            + Add tech
          </Button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Each profile carries a name, a role and an{' '}
          {profile.techLicenceLabel}. Pick the active tech here — every
          transaction logged is stamped with that profile's name, licence and
          role, frozen so the historical record is preserved if a tech later
          changes their licence or role. Roles (owner, supervisor, lead
          technician, technician, apprentice) set each person's access level —
          a profile can only manage people below its own tier. Access takes
          effect once per-tech sign-in is added.
        </p>
        {!canManage && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            This profile ({roleInfo(activeTech?.role).label}) can't manage
            accounts. Switch to a supervisor or owner profile to add or manage
            technicians.
          </p>
        )}
        {state.technicians.length === 0 ? (
          <p className="text-sm text-slate-500">
            No tech profiles yet. Add one so transactions can be attributed for
            audits.
          </p>
        ) : (
          <div className="space-y-2">
            {state.technicians.map((t) => {
              const isActive = state.activeTechnicianId === t.id
              const active = isTechnicianActive(t)
              const untilPurge = active ? null : daysUntilPurge(t, new Date())
              // Only owners/supervisors get the Manage button. They can
              // manage people strictly below their own tier, plus their own
              // profile (the role picker still blocks self-promotion).
              const canManageThis =
                canManage &&
                (canManageTech(activeTech?.role, t.role) || isActive)
              return (
                <div
                  key={t.id}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                    !active
                      ? 'bg-slate-50 dark:bg-slate-800/40'
                      : isActive
                        ? 'bg-brand-50 dark:bg-brand-900/20'
                        : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`truncate font-medium ${
                          active
                            ? 'text-slate-900 dark:text-slate-100'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {t.name || '(unnamed)'}
                      </span>
                      {isActive && active && <Pill tone="green">Active</Pill>}
                      {!active && <Pill tone="amber">Deactivated</Pill>}
                      {active && t.suspendedAt && (
                        <Pill tone="red">Suspended</Pill>
                      )}
                      <Pill tone={roleInfo(t.role).level >= 3 ? 'blue' : 'slate'}>
                        {roleInfo(t.role).label}
                      </Pill>
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.arcLicenceNumber
                        ? `${profile.techLicenceShort} ${t.arcLicenceNumber}`
                        : `No ${profile.techLicenceShort} recorded`}
                      {t.licenceExpiry && (() => {
                        const ex = expiryStatus(t.licenceExpiry)
                        return (
                          <span
                            className={
                              ex.level === 'expired'
                                ? 'font-semibold text-red-600 dark:text-red-400'
                                : ex.level === 'due_soon'
                                  ? 'font-semibold text-amber-600 dark:text-amber-400'
                                  : ''
                            }
                          >
                            {' · '}
                            {ex.level === 'expired' ? 'expired ' : 'expires '}
                            {formatPlainDate(t.licenceExpiry)}
                          </span>
                        )
                      })()}
                    </div>
                    {!active && untilPurge !== null && (
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {untilPurge > 0
                          ? `Deletes in ${untilPurge} day${untilPurge === 1 ? '' : 's'} · work logged stays for audit`
                          : 'Deletion due — removed on next open · work logged stays for audit'}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {active ? (
                      <>
                        {!isActive && (
                          <Button
                            variant="secondary"
                            disabled={!!t.suspendedAt}
                            onClick={() => requestActivate(t)}
                          >
                            {t.suspendedAt ? 'Suspended' : 'Use'}
                          </Button>
                        )}
                        {canManageThis && (
                          <Button variant="ghost" onClick={() => openEditTech(t)}>
                            Manage
                          </Button>
                        )}
                      </>
                    ) : (
                      canManageThis && (
                        <>
                          <Button
                            variant="secondary"
                            onClick={() => requestReactivate(t)}
                          >
                            Reactivate
                          </Button>
                          <Button
                            variant="danger"
                            onClick={() => requestDeleteNow(t)}
                          >
                            Delete now
                          </Button>
                        </>
                      )
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Compliance details — {profile.name}
          </div>
          <div className="flex items-center gap-2">
            <SavedFlash show={compSaved} />
            {companyLocked &&
              (canEditCompany ? (
                <Button variant="ghost" onClick={unlockCompany}>
                  Edit
                </Button>
              ) : (
                <span className="text-xs text-slate-400">
                  Owner/supervisor only
                </span>
              ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Used on logbook printouts and stamped onto every transaction at the
          time of work. Look up your numbers at{' '}
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
            <TextInput
              value={bizName}
              disabled={companyLocked}
              onChange={(e) => setBizName(e.target.value)}
              onBlur={commitBizName}
              placeholder="e.g. Acme Refrigeration Pty Ltd"
            />
          </Field>
          <Field
            label={profile.businessNumberLabel}
            error={
              abnInvalid
                ? 'Must be a valid 11-digit ABN — not saved until corrected.'
                : undefined
            }
            hint={profile.businessNumberHint}
          >
            <TextInput
              value={abn}
              invalid={abnInvalid}
              disabled={companyLocked}
              onChange={(e) => setAbn(e.target.value)}
              onBlur={commitAbn}
              inputMode="numeric"
              placeholder="e.g. 51 824 753 556"
            />
          </Field>
          {profile.hasBusinessAuthorisation && (
            <>
              <Field
                label={profile.businessAuthLabel}
                hint="Issued by the Australian Refrigeration Council to your business — required to handle/buy/sell refrigerant."
              >
                <TextInput
                  value={arcAuth}
                  disabled={companyLocked}
                  onChange={(e) => setArcAuth(e.target.value)}
                  onBlur={commitArcAuth}
                  placeholder="e.g. AU00000"
                />
              </Field>
              <Field
                label={`${profile.businessAuthShort} expiry`}
                hint="The app warns before the authorisation lapses."
              >
                <DateInput
                  value={state.arcAuthorisationExpiry}
                  disabled={companyLocked}
                  onChange={(v) => {
                    setArcAuthorisationExpiry(v)
                    flashComp()
                  }}
                  ariaLabel="Business authorisation expiry date"
                />
              </Field>
            </>
          )}
          <p className="text-xs text-slate-500">
            Each tech's {profile.techLicenceShort} lives on their profile in
            the Technicians card above — that's how a multi-tech crew gets
            their own licence stamped on each transaction.
          </p>
        </div>
      </Card>

      </CollapsibleSection>

      <CollapsibleSection title="App settings" storageKey="app">
      <Card>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Location
          </div>
          <SavedFlash show={locSaved} />
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Drives the timezone used for "now" defaults on transactions and the
          generated-at line on logbook PDFs. Leave blank to follow this
          device's settings.
        </p>
        <LocationFields loc={loc} setLoc={setLoc} />
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

      {/* Cloud sync is an optional, self-hosted (Supabase) feature. It only
          appears once it's actually configured — until then it's a dormant
          capability, so the card stays hidden to keep Settings uncluttered.
          See SYNC.md for the one-time setup. */}
      {isSyncConfigured() && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Cloud sync
            </div>
            <Pill tone={state.sync.enabled ? 'green' : 'slate'}>
              {state.sync.enabled ? 'On' : 'Off'}
            </Pill>
          </div>
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
        </Card>
      )}

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
      </CollapsibleSection>

      <Card>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Legal &amp; policies
        </div>
        <div className="flex flex-col">
          {(
            [
              ['/terms', 'Terms of Use'],
              ['/privacy', 'Privacy Policy'],
              ['/acceptable-use', 'Acceptable Use Policy'],
              ['/billing', 'Billing & Refund Policy'],
              ['/data-retention', 'Data Retention & Deletion Policy'],
              ['/security', 'Security & Disclosure Policy'],
              ['/disclaimer', 'Disclaimer'],
              ['/copyright', 'Copyright & Trademark Policy'],
            ] as const
          ).map(([to, label]) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-between border-t border-slate-100 py-2 text-sm text-slate-600 first:border-t-0 hover:text-brand-600 dark:border-slate-800 dark:text-slate-300 dark:hover:text-brand-400"
            >
              <span>{label}</span>
              <span aria-hidden className="text-slate-300 dark:text-slate-600">
                ›
              </span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="text-center">
        <Link
          to="/account-deletion"
          onClick={() => {
            // Hand the user their records the moment they start the closure
            // flow — best effort; saving and keeping it is their
            // responsibility (the deletion page says as much).
            void downloadRecordsZip(state).catch(() => {
              toast.show(
                'Could not auto-export your records — use Settings → export a backup before closing.',
                'error',
              )
            })
          }}
          className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:hover:text-slate-300"
        >
          Request deletion of account
        </Link>
      </div>

      {/* App version, injected at build time and bumped on every deploy
          (see APP_VERSION). Kept tiny and last so it's available for
          support without drawing the eye. */}
      <p className="px-1 pt-1 text-center text-[10px] text-slate-300 dark:text-slate-600">
        App version {APP_VERSION}
        {APP_COMMIT ? ` · ${APP_COMMIT}` : ''}
      </p>

      <TechnicianModal
        open={techModalOpen}
        editing={editingTech}
        actorRole={activeTech?.role}
        ownerExists={state.technicians.some(
          (t) => t.role === 'owner' && isTechnicianActive(t),
        )}
        onClose={() => setTechModalOpen(false)}
        onSave={(data) => {
          const passwordHashPatch =
            data.passwordChange?.kind === 'set'
              ? { passwordHash: data.passwordChange.hash }
              : {}
          if (editingTech) {
            updateTechnician(editingTech.id, {
              firstName: data.firstName,
              middleName: data.middleName,
              lastName: data.lastName,
              name: data.name,
              role: data.role,
              arcLicenceNumber: data.arcLicenceNumber,
              licenceExpiry: data.licenceExpiry,
              ...passwordHashPatch,
            })
            toast.show('Tech updated')
          } else {
            const created = addTechnician({
              firstName: data.firstName,
              middleName: data.middleName,
              lastName: data.lastName,
              name: data.name,
              role: data.role,
              arcLicenceNumber: data.arcLicenceNumber,
              licenceExpiry: data.licenceExpiry,
              // The modal requires the licence self-declaration before
              // onSave fires, so stamp when it was made.
              licenceDeclaredAt: new Date().toISOString(),
              passwordHash:
                data.passwordChange?.kind === 'set'
                  ? data.passwordChange.hash
                  : undefined,
            })
            // Stay signed in as the manager who created the account — don't
            // switch into the new profile.
            toast.show(`${created.name} added`)
          }
          setTechModalOpen(false)
        }}
        onDelete={
          editingTech
            ? async () => {
                const ok = await confirm({
                  title: `Deactivate ${editingTech.name}?`,
                  message: `For a tech who has left. The account is disabled now and fully deleted after ${TECHNICIAN_PURGE_DAYS} days; everything they logged stays frozen on the record for audit. You can reactivate them before then.`,
                  confirmLabel: 'Deactivate',
                  danger: true,
                })
                if (ok) {
                  deactivateTechnician(editingTech.id)
                  toast.show('Tech deactivated', 'info')
                  setTechModalOpen(false)
                }
              }
            : undefined
        }
        onDeleteForever={
          // Permanent delete — offered only for someone other than the
          // signed-in profile (you can't delete the account you're using).
          // The tech's logged work stays frozen on the record for audit.
          editingTech && editingTech.id !== state.activeTechnicianId
            ? async () => {
                const ok = await confirm({
                  title: `Delete ${editingTech.name} permanently?`,
                  message:
                    'This removes the account immediately and can’t be undone. Everything they have logged stays frozen on the record for audit. To keep the account recoverable, use Deactivate instead.',
                  confirmLabel: 'Delete permanently',
                  danger: true,
                })
                if (ok) {
                  deleteTechnician(editingTech.id)
                  toast.show('Tech deleted', 'info')
                  setTechModalOpen(false)
                }
              }
            : undefined
        }
        onToggleSuspend={
          // Lock / unlock — offered only for someone other than the
          // signed-in profile (you can't suspend the account you're using).
          editingTech && editingTech.id !== state.activeTechnicianId
            ? async () => {
                if (editingTech.suspendedAt) {
                  const ok = await confirm({
                    title: `Lift suspension on ${editingTech.name}?`,
                    message:
                      'Re-enables the account so it can be used again.',
                    confirmLabel: 'Lift suspension',
                  })
                  if (ok) {
                    unsuspendTechnician(editingTech.id)
                    toast.show(`${editingTech.name} unsuspended`)
                    setTechModalOpen(false)
                  }
                } else {
                  const ok = await confirm({
                    title: `Suspend ${editingTech.name}?`,
                    message:
                      'Locks the account so it can’t be used until a manager lifts the suspension. Nothing is deleted and their logged work is untouched.',
                    confirmLabel: 'Suspend',
                    danger: true,
                  })
                  if (ok) {
                    suspendTechnician(editingTech.id)
                    toast.show(`${editingTech.name} suspended`, 'info')
                    setTechModalOpen(false)
                  }
                }
              }
            : undefined
        }
      />

      <PasswordPromptModal
        tech={pwPromptTech}
        onClose={() => setPwPromptTech(null)}
        onVerified={(t) => {
          setActiveTechnicianId(t.id)
          toast.show(`Active tech: ${t.name}`)
          setPwPromptTech(null)
        }}
      />
    </div>
  )
}


type TechSavePayload = {
  firstName: string
  middleName?: string
  lastName: string
  name: string // composed from the parts above
  role: TechnicianRole
  arcLicenceNumber: string
  licenceExpiry: string // required on every account
  // 'set' = replace the hash; undefined = leave the existing password
  // unchanged. There is deliberately no "remove": a password can never be
  // cleared, so no one can strip protection off another tech's profile and
  // log work (or falsify records) under their name.
  passwordChange?: { kind: 'set'; hash: string }
}

function TechnicianModal({
  open,
  editing,
  actorRole,
  ownerExists,
  onClose,
  onSave,
  onDelete,
  onDeleteForever,
  onToggleSuspend,
}: {
  open: boolean
  editing: Technician | null
  // Role of the profile doing the editing, and whether an owner account
  // already exists — together these decide which roles can be assigned.
  actorRole: TechnicianRole | undefined
  ownerExists: boolean
  onClose: () => void
  onSave: (data: TechSavePayload) => void
  // Suspend (deactivate, reversible) and permanent delete — only wired for
  // a manager editing someone other than their own active profile.
  onDelete?: () => void
  onDeleteForever?: () => void
  // Lock / unlock the account (manager suspension). Label flips on the
  // editing tech's current suspended state.
  onToggleSuspend?: () => void
}) {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)
  const [firstName, setFirstName] = useState('')
  const [middleName, setMiddleName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<TechnicianRole>(DEFAULT_TECHNICIAN_ROLE)
  const [rhl, setRhl] = useState('')
  const [licenceExpiry, setLicenceExpiry] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  // Licence self-declaration — required when creating a new account. Places
  // responsibility for licence accuracy on the user (RefrigHandle does not
  // verify licences). Not shown when editing an existing profile.
  const [licenceDeclared, setLicenceDeclared] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [pwError, setPwError] = useState('')
  const [busy, setBusy] = useState(false)
  const key = editing?.id ?? 'new'
  const [seenKey, setSeenKey] = useState('')
  if (open && seenKey !== key) {
    setSeenKey(key)
    // Seed the parts from the structured fields, falling back to a split
    // of the legacy single name for profiles saved before the split.
    const seed = editing
      ? {
          firstName: editing.firstName ?? splitName(editing.name).firstName,
          middleName: editing.middleName ?? splitName(editing.name).middleName,
          lastName: editing.lastName ?? splitName(editing.name).lastName,
        }
      : { firstName: '', middleName: '', lastName: '' }
    setFirstName(seed.firstName)
    setMiddleName(seed.middleName)
    setLastName(seed.lastName)
    setRole(editing?.role ?? DEFAULT_TECHNICIAN_ROLE)
    setRhl(editing?.arcLicenceNumber ?? '')
    setLicenceExpiry(editing?.licenceExpiry ?? '')
    setPassword('')
    setConfirmPw('')
    setLicenceDeclared(false)
    setAttempted(false)
    setPwError('')
  }
  if (!open && seenKey !== '') {
    setSeenKey('')
  }

  const hasExistingPassword = !!editing?.passwordHash
  // A password is mandatory when creating an account; on edit the
  // existing one is kept unless a new one is typed.
  const passwordRequired = !editing

  // Roles this editor is allowed to assign. The tech's CURRENT role is
  // always kept in the list so editing other fields never forces a role
  // change. Editing an owner from a lower tier locks the field entirely,
  // so a supervisor can't demote an owner (or, with the owner slot freed,
  // slip themselves into it).
  const editingOwnerAsNonOwner =
    !!editing && editing.role === 'owner' && !roleAtLeast(actorRole, 'owner')
  const assignableRoles = TECHNICIAN_ROLES.filter(
    (r) =>
      canAssignRole(actorRole, r.value, ownerExists) || r.value === editing?.role,
  )

  // Field-level validation, surfaced after the first save attempt.
  const firstErr = attempted && !firstName.trim() ? 'First name is required.' : undefined
  const lastErr = attempted && !lastName.trim() ? 'Surname is required.' : undefined
  const expiryErr =
    attempted && !licenceExpiry
      ? `${profile.techLicenceShort} expiry date is required.`
      : undefined

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setAttempted(true)
    setPwError('')

    // Block on the required identity/compliance fields first. New accounts
    // also require the licence self-declaration.
    if (!firstName.trim() || !lastName.trim() || !licenceExpiry) return
    if (!editing && !licenceDeclared) return

    let passwordChange: TechSavePayload['passwordChange']
    if (password) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setPwError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
        return
      }
      if (password !== confirmPw) {
        setPwError('Passwords don’t match.')
        return
      }
      setBusy(true)
      // Reject the most common passwords and any found in a known breach
      // (best-effort — skipped silently when offline).
      const pwReason = await screenNewPassword(password)
      if (pwReason) {
        setBusy(false)
        setPwError(pwReason)
        return
      }
      const hash = await hashPassword(password)
      setBusy(false)
      passwordChange = { kind: 'set', hash }
    } else if (passwordRequired) {
      setPwError('A password is required for a new account.')
      return
    }

    const parts = {
      firstName: firstName.trim(),
      middleName: middleName.trim() || undefined,
      lastName: lastName.trim(),
    }
    // Defensive: never let a disallowed role through even if the picker is
    // bypassed — fall back to the tech's current role (or the default).
    const safeRole =
      canAssignRole(actorRole, role, ownerExists) || role === editing?.role
        ? role
        : editing?.role ?? DEFAULT_TECHNICIAN_ROLE
    onSave({
      ...parts,
      name: composeName(parts),
      role: safeRole,
      arcLicenceNumber: rhl.trim(),
      licenceExpiry,
      passwordChange,
    })
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit tech' : 'Add tech'}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="First name *" error={firstErr}>
          <TextInput
            autoFocus
            value={firstName}
            invalid={!!firstErr}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="e.g. Jane"
          />
        </Field>
        <Field label="Middle name" hint="Optional.">
          <TextInput
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            placeholder="e.g. Quinn"
          />
        </Field>
        <Field label="Surname *" error={lastErr}>
          <TextInput
            value={lastName}
            invalid={!!lastErr}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="e.g. Smith"
          />
        </Field>
        <Field
          label="Role"
          hint={
            editingOwnerAsNonOwner
              ? 'Only an owner can change an owner’s role.'
              : editing
                ? `${roleInfo(role).blurb} Change this when someone's position changes — e.g. promote an apprentice to technician once they qualify.`
                : roleInfo(role).blurb
          }
        >
          <Picker
            title="Role"
            value={role}
            disabled={editingOwnerAsNonOwner}
            onChange={(v) => setRole(v as TechnicianRole)}
            options={assignableRoles.map((r) => ({
              value: r.value,
              label: r.label,
              hint:
                r.value === 'owner' && !ownerExists && !roleAtLeast(actorRole, 'owner')
                  ? `${r.blurb} (only assignable while there's no owner)`
                  : r.blurb,
            }))}
          />
        </Field>
        <Field
          label={profile.techLicenceLabel}
          hint="Personal licence — stamped onto every transaction this tech logs."
        >
          <TextInput
            value={rhl}
            onChange={(e) => setRhl(e.target.value)}
            placeholder="e.g. L000000"
          />
        </Field>
        <Field
          label={`${profile.techLicenceShort} expiry *`}
          error={expiryErr}
          hint="The app warns before this lapses, since logging work on an expired licence is a breach."
        >
          <DateInput
            value={licenceExpiry}
            onChange={setLicenceExpiry}
            invalid={!!expiryErr}
            ariaLabel="Licence expiry date"
          />
        </Field>

        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {hasExistingPassword
              ? 'Password'
              : passwordRequired
                ? 'Set password *'
                : 'Set password (optional)'}
          </div>
          <p className="mb-3 text-xs text-slate-500">
            {passwordRequired
              ? 'Each account needs a password — it secures switching into this profile and becomes their sign-in once team accounts are added. '
              : 'Prompts on a shared device when someone tries to switch into this profile. '}
            {hasExistingPassword
              ? 'Leave blank to keep the current password. '
              : ''}
            A longer passphrase beats a short, complex one; common or
            breached passwords are rejected. Stored hashed in this browser —
            not real account security.
          </p>
          <div className="space-y-2">
            <TextInput
              type="password"
              autoComplete="new-password"
              value={password}
              invalid={!!pwError}
              onChange={(e) => {
                setPassword(e.target.value)
                setPwError('')
              }}
              placeholder={hasExistingPassword ? 'New password' : 'Password'}
            />
            {password && (
              <TextInput
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="Confirm password"
              />
            )}
            {pwError && (
              <div className="text-xs text-red-600 dark:text-red-400">{pwError}</div>
            )}
          </div>
        </div>

        {!editing && (
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand-600"
                checked={licenceDeclared}
                onChange={(e) => setLicenceDeclared(e.target.checked)}
              />
              <span
                className={
                  attempted && !licenceDeclared
                    ? 'text-red-600 dark:text-red-400'
                    : ''
                }
              >
                I confirm that this technician holds a current ARC Refrigerant
                Handling Licence (RHL) appropriate for the work they perform, and
                that the licence details entered are accurate and current. *
              </span>
            </label>
            {attempted && !licenceDeclared && (
              <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">
                Please confirm the licence declaration to add this account.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" full disabled={busy}>
            {busy
              ? 'Checking…'
              : editing
                ? 'Save changes'
                : 'Add tech'}
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Deactivate
            </Button>
          )}
        </div>
        {onToggleSuspend && editing && (
          <Button
            type="button"
            variant="secondary"
            full
            onClick={onToggleSuspend}
          >
            {editing.suspendedAt ? 'Lift suspension' : 'Suspend account'}
          </Button>
        )}
        {onDeleteForever && (
          <Button type="button" variant="ghost" full onClick={onDeleteForever}>
            <span className="text-red-600 dark:text-red-400">
              Delete account permanently
            </span>
          </Button>
        )}
      </form>
    </Modal>
  )
}

// Tamper-evidence check for the change log. Every audit entry is
// sealed into a per-device hash chain as it's written (lib/auditChain);
// this card re-derives every chain on demand and reports any entry
// that was edited, deleted or reordered after sealing.
function AuditIntegrityCard() {
  const { state } = useStore()
  const [report, setReport] = useState<ChainReport | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      setReport(await verifyAuditChains(state.auditLog))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Audit trail integrity
        </div>
        {report &&
          (report.valid ? (
            <Pill tone="green">Intact</Pill>
          ) : (
            <Pill tone="red">Tampering detected</Pill>
          ))}
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Change-log entries are sealed into a cryptographic hash chain as
        they're written. Verifying re-derives every chain — an entry that
        was edited or deleted after sealing breaks its chain and is
        reported here. Detects on-device tampering and storage corruption;
        full non-repudiation (proof against someone rebuilding the whole
        chain) will come with server-anchored team accounts.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => void run()}>
        {busy ? 'Verifying…' : 'Verify integrity'}
      </Button>
      {report && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {report.sealed} of {report.total} entries sealed across{' '}
            {report.chains} device chain{report.chains === 1 ? '' : 's'}
            {report.unsealed > 0 &&
              ` (${report.unsealed} just written, not yet sealed)`}
            .{' '}
            {report.valid
              ? 'Every chain checks out — no tampering detected.'
              : 'Problems found:'}
          </p>
          {!report.valid && (
            <ul className="space-y-1">
              {report.problems.slice(0, 8).map((p, i) => (
                <li
                  key={i}
                  className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-900 dark:bg-red-900/20 dark:text-red-100"
                >
                  Chain {p.chainId.slice(0, 8)}…
                  {p.seq != null && ` · entry #${p.seq}`} — {p.message}
                </li>
              ))}
              {report.problems.length > 8 && (
                <li className="text-xs text-slate-500">
                  +{report.problems.length - 8} more
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

// Tracks a transient "Saved" confirmation. flash() shows it for ~1.8s;
// rapid commits just reset the timer so it stays visible while editing.
function useSaveFlash(): [boolean, () => void] {
  const [shown, setShown] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const flash = useCallback(() => {
    setShown(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(false), 1800)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return [shown, flash]
}

function SavedFlash({ show }: { show: boolean }) {
  return (
    <span
      aria-live="polite"
      className={`text-xs font-medium text-green-600 transition-opacity dark:text-green-400 ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      ✓ Saved
    </span>
  )
}

function locationEqual(a: LocationSettings, b: LocationSettings): boolean {
  return (
    a.country === b.country &&
    a.region === b.region &&
    a.city === b.city &&
    a.timezone === b.timezone
  )
}

// A small grouping label that breaks the long Settings page into scannable
// sections (Audit & records / Business & people / App settings).
// Collapsible group of Settings cards. Open/closed state is remembered
// per-device in localStorage so the page reopens the way the user left it —
// except sections passed resetOnMount (Audit & records), which always
// re-open. A deep-link (navigation state { scrollTo }) force-opens its
// target section so the linked card is visible even if it was collapsed.
function CollapsibleSection({
  title,
  storageKey,
  defaultOpen = false,
  resetOnMount = false,
  children,
}: {
  title: string
  storageKey: string
  defaultOpen?: boolean
  resetOnMount?: boolean
  children: ReactNode
}) {
  const location = useLocation()
  const isScrollTarget =
    (location.state as { scrollTo?: string } | null)?.scrollTo === storageKey
  const lsKey = `refrighandle.settingsOpen.${storageKey}`
  const [open, setOpen] = useState(() => {
    if (isScrollTarget) return true
    if (resetOnMount) return defaultOpen
    try {
      const saved = localStorage.getItem(lsKey)
      return saved === null ? defaultOpen : saved === '1'
    } catch {
      return defaultOpen
    }
  })
  function toggle() {
    setOpen((o) => {
      const next = !o
      if (!resetOnMount) {
        try {
          localStorage.setItem(lsKey, next ? '1' : '0')
        } catch {
          // ignore (private mode / disabled storage)
        }
      }
      return next
    })
  }
  return (
    <section id={`settings-${storageKey}`} className="space-y-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-1 pt-3 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {title}
        </span>
        <span
          aria-hidden
          className={`text-base leading-none text-slate-400 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          ›
        </span>
      </button>
      {open && children}
    </section>
  )
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
