import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  type AccountClosure,
  type AppState,
  type AuditEntry,
  type Bottle,
  type BottlePreset,
  type ClockFormat,
  type Jurisdiction,
  type LocationSettings,
  type RecyclableEntity,
  type RecycleBinEntry,
  type Site,
  type SyncSettings,
  type Technician,
  type TechnicianRole,
  type Theme,
  type Transaction,
  type Unit,
  type Job,
  type WeightUnit,
  EMPTY_STATE,
  SYNCED_SETTINGS_FIELDS,
  transactionLabel,
  composeName,
  roleAtLeast,
  roleInfo,
  canAssignRole,
  canManageTech,
  isOutOfFleet,
  isTechnicianActive,
  expiryStatus,
  DEFAULT_TECHNICIAN_ROLE,
  TECHNICIAN_PURGE_DAYS,
  TERMS_VERSION,
  daysUntilPurge,
  type RiskPlan,
  type RiskPlanItemState,
} from './types'
import {
  BOTTLE_FIELDS,
  JOB_FIELDS,
  SITE_FIELDS,
  TECH_FIELDS,
  UNIT_FIELDS,
  diffFields,
  rawChanges,
} from './audit'
import {
  deleteAttachment,
  type AttachmentEntity,
  type AttachmentKind,
} from './attachments'
import {
  loadState,
  normalizeState,
  secureCorruptedBlob,
  requestPersistentStorage,
  saveState,
  uid,
} from './storage'
import {
  isSyncConfigured,
  pullState,
  pushState,
  subscribeToState,
} from './sync'
import { mergeStates } from './merge'
import { deviceChainId, rebaseChainHead, sealAuditLog } from './auditChain'
import { buildDemoState } from './demo'
import { profileFor, RISK_PLAN_ITEMS } from './compliance'
import { deviceTimeZone } from './datetime'
import { useToast } from './toast'

// Build the next auditLog array with a fresh entry prepended (newest
// first). Stamps "who" from the active tech profile, falling back to
// the legacy single-tech identity — same resolution the transaction
// log uses, so the two records agree on attribution. Pure w.r.t. `s`
// so it's safe to call inside a setState updater (StrictMode double
// invocation just discards the first result).
function withAudit(
  s: AppState,
  e: Omit<AuditEntry, 'id' | 'at' | 'by' | 'byLicence'>,
): AuditEntry[] {
  const tech = s.technicians.find((x) => x.id === s.activeTechnicianId)
  const entry: AuditEntry = {
    ...e,
    id: uid(),
    at: new Date().toISOString(),
    by: tech?.name || s.technician || undefined,
    byLicence: tech?.arcLicenceNumber || s.arcLicenceNumber || undefined,
    // Local zone of the device that made the change, for unambiguous
    // display on the change log. Not part of the sealed hash.
    tz: deviceTimeZone() || s.location.timezone || undefined,
    // Which device wrote this — only that device may seal it (see
    // AuditEntry.origin / auditChain.sealAuditLog).
    origin: deviceChainId(),
  }
  return [entry, ...s.auditLog]
}

// Capture a record being deleted so the deletion is recoverable (see
// RecycleBinEntry). Stamps who/when from the active profile, mirroring
// withAudit's attribution. The full record is kept verbatim for a
// lossless restore. Pure w.r.t. `s` (safe inside a setState updater).
function makeBinEntry(
  s: AppState,
  entity: RecyclableEntity,
  recordId: string,
  label: string,
  record: unknown,
  reason?: string,
): RecycleBinEntry {
  const tech = s.technicians.find((x) => x.id === s.activeTechnicianId)
  return {
    id: uid(),
    entity,
    recordId,
    label,
    deletedAt: new Date().toISOString(),
    deletedBy: tech?.name || s.technician || undefined,
    deletedByLicence: tech?.arcLicenceNumber || s.arcLicenceNumber || undefined,
    deletedReason: reason,
    record,
  }
}

interface StoreApi {
  state: AppState
  // bottles
  addBottle: (b: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>) => Bottle
  updateBottle: (id: string, patch: Partial<Bottle>) => void
  deleteBottle: (id: string) => void
  // sites
  addSite: (s: Omit<Site, 'id' | 'createdAt'>) => Site
  updateSite: (id: string, patch: Partial<Site>) => void
  deleteSite: (id: string) => void
  // units
  addUnit: (u: Omit<Unit, 'id' | 'createdAt' | 'status'>) => Unit
  updateUnit: (id: string, patch: Partial<Unit>) => void
  deleteUnit: (id: string) => void
  decommissionUnit: (id: string, reason?: string) => void
  reactivateUnit: (id: string) => void
  // jobs (work-orders) — an optional grouping of a visit's movements.
  addJob: (j: Omit<Job, 'id' | 'createdAt' | 'status'>) => Job
  updateJob: (id: string, patch: Partial<Job>) => void
  // Close / reopen a job (open while on site, closed when the visit is done).
  setJobStatus: (id: string, status: 'open' | 'closed') => void
  // Remove a job → recycle bin (supervisor+). The job's logged movements
  // are untouched; they keep their jobId so restoring re-groups them.
  deleteJob: (id: string) => void
  // transactions
  addTransaction: (
    t: Omit<Transaction, 'id' | 'weightBefore' | 'weightAfter'>,
  ) => Transaction | null
  // Soft-delete: hides the row from normal views but keeps it in
  // storage so an admin / business owner can audit what was removed
  // and restore it if the deletion was a mistake. Bottle weight is
  // NOT reverted (matches the previous hard-delete behaviour).
  deleteTransaction: (id: string, reason?: string) => void
  // Undo a soft-delete: clears the deletion marker so the row returns to
  // the activity log and cumulative calcs, and records a 'restore' entry
  // on the change log. No-op if the row isn't currently deleted.
  restoreTransaction: (id: string) => void
  // Recover a deleted bottle / site / unit / technician / preset / custom
  // refrigerant from the recycle bin. Re-inserts the record, clears its
  // tombstone, and logs a 'restore'. No-op if the bin entry is gone or the
  // record is somehow already present. (Supervisor and above.)
  restoreFromRecycleBin: (binId: string) => void
  // attachments (photos / signatures)
  // Record on the change log that a photo or signature was removed. The
  // blob itself is deleted from IndexedDB by the caller (see Photos /
  // Signatures); this writes the audit entry — who removed what, from
  // which record, and when — so attachment removal is no longer a silent,
  // off-the-record delete. Resolves the affected record's label from
  // current state so the entry reads in plain English.
  logAttachmentRemoved: (
    entityType: AttachmentEntity,
    entityId: string,
    kind: AttachmentKind,
    descriptor?: string,
  ) => void
  // Delete a photo / signature blob AND write the change-log entry, behind
  // the supervisor gate (canDeleteRecords). Attachments are the one record
  // class that can't go through the recycle bin (the blob is gone), so the
  // gate + the logged removal are the whole protection — a signature is
  // customer-facing legal evidence and must not be an apprentice's tap
  // away from destruction. Resolves false when the gate denies.
  removeAttachment: (
    attachmentId: string,
    entityType: AttachmentEntity,
    entityId: string,
    kind: AttachmentKind,
    descriptor?: string,
  ) => Promise<boolean>
  // technician profiles
  addTechnician: (t: Omit<Technician, 'id' | 'createdAt'>) => Technician
  // Returns false when the role gate refuses (its own toast shows).
  updateTechnician: (id: string, patch: Partial<Technician>) => boolean
  // Soft-disable a profile (a tech who left). Kept for the retention
  // window, then purged. Reassigns the active seat if needed.
  deactivateTechnician: (id: string) => void
  reactivateTechnician: (id: string) => void
  // Manager lock / unlock — suspends a profile so it can't be used until
  // lifted. Separate from deactivate (a leaver, with a purge countdown).
  suspendTechnician: (id: string) => void
  unsuspendTechnician: (id: string) => void
  deleteTechnician: (id: string) => void
  setActiveTechnicianId: (id: string | undefined) => void
  // first-run onboarding — writes business identity, ARC RTA, the first
  // technician and location together, then stamps setupCompletedAt so
  // the onboarding gate stands down.
  completeSetup: (data: {
    businessName: string
    businessAbn: string
    arcAuthorisationNumber: string
    arcAuthorisationExpiry: string
    technician: {
      firstName: string
      middleName?: string
      lastName: string
      // Sign-in username for the account (see Technician.username).
      username?: string
      arcLicenceNumber: string
      licenceExpiry: string
      // owner or supervisor — chosen at setup (SETUP_ROLE_CHOICES).
      role: TechnicianRole
      passwordHash?: string
    }
    location: LocationSettings
    jurisdiction: Jurisdiction
  }) => void
  // settings
  setTechnician: (name: string) => void
  setArcLicenceNumber: (n: string) => void
  setArcAuthorisationNumber: (n: string) => void
  setArcAuthorisationExpiry: (d: string) => void
  setBusinessName: (n: string) => void
  setBusinessAbn: (n: string) => void
  // Owner requests account closure: snapshots the business identity, locks
  // the app, and logs out. Reversible only by re-importing a pre-closure
  // backup or clearing app data.
  requestAccountClosure: (req: {
    reason: string
    details?: string
    contactName: string
    contactEmail?: string
    contactPhone?: string
  }) => void
  // Wipe the device back to a pristine install (the account-creation
  // screen). Fired automatically a few minutes after closure so a closed
  // account doesn't linger on screen — the business has already been
  // handed its records ZIP at closure time.
  resetToFreshInstall: () => void
  // Enter "explore with sample data" mode: seed fictional bottles/sites/
  // units/transactions and open the app without full setup. Leaving demo
  // (exitDemo) wipes that sample data and returns to the setup screen.
  startDemo: () => void
  exitDemo: () => void
  // Re-accept the Terms after a version bump (see TermsGate).
  acceptTerms: () => void
  // Save the risk management plan checklist (ARC RTA condition). Pass
  // markReviewed to stamp who/when — printed on the audit pack.
  saveRiskPlan: (
    items: Record<string, RiskPlanItemState>,
    markReviewed: boolean,
  ) => void
  setLocation: (l: LocationSettings) => void
  setUnit: (u: WeightUnit) => void
  setTheme: (t: Theme) => void
  setClock: (c: ClockFormat) => void
  setSyncSettings: (s: SyncSettings) => void
  addCustomRefrigerant: (name: string) => void
  removeCustomRefrigerant: (name: string) => void
  toggleFavoriteRefrigerant: (name: string) => void
  addCustomBottlePreset: (
    p: Omit<BottlePreset, 'id' | 'custom'>,
  ) => BottlePreset
  removeCustomBottlePreset: (id: string) => void
  toggleFavoriteBottlePreset: (id: string) => void
  // bulk. Returns false when the role gate refuses (its own toast shows).
  importState: (s: AppState) => boolean
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  // Run loadState exactly once per provider mount. The lazy useState
  // initializer is the React-blessed place to do this work; we capture
  // the corruption flag on the side via useState rather than a ref so
  // we never read a ref during render.
  const [
    {
      state: initialState,
      status: initialStatus,
      corruptedUnsecured: initialUnsecured,
    },
  ] = useState(loadState)
  const [state, setState] = useState<AppState>(initialState)
  // True while a damaged blob is still sitting at the live storage key
  // (couldn't be moved aside at load — storage full). Saving over it
  // would destroy the only copy, so the save effect retries the move
  // first and holds off persisting until it succeeds.
  const corruptedAtKeyRef = useRef(!!initialUnsecured)

  // One-time: surface a corrupted-load to the user, request persistent
  // storage. Both happen exactly once per app load.
  useEffect(() => {
    if (initialStatus === 'corrupted') {
      toast.show(
        'Saved data could not be read. The damaged copy is preserved — see Settings → Storage health to recover.',
        'error',
        12000,
      )
    }
    void requestPersistentStorage()
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quota-error toasts get throttled — one per minute is enough for a
  // tech who's mid-form. We don't want to spam them on every keystroke.
  const lastQuotaToastRef = useRef(0)
  useEffect(() => {
    if (corruptedAtKeyRef.current) {
      // The damaged (unparseable) blob is still at the live key. Try to
      // move it aside again — space may have been freed since load — and
      // never write over it: it's the only copy of the old records.
      if (secureCorruptedBlob()) {
        corruptedAtKeyRef.current = false
      } else {
        const now = Date.now()
        if (now - lastQuotaToastRef.current >= 60_000) {
          lastQuotaToastRef.current = now
          toast.show(
            'Changes are only in memory — storage is full and the damaged saved data is being protected. Free up space, then see Settings → Storage health.',
            'error',
            12000,
          )
        }
        return
      }
    }
    const result = saveState(state)
    if (result.ok) return
    const now = Date.now()
    if (now - lastQuotaToastRef.current < 60_000) return
    lastQuotaToastRef.current = now
    if (result.reason === 'quota') {
      toast.show(
        'Device storage is full — recent changes are not saved. Export a backup from Settings and free up space.',
        'error',
        12000,
      )
    } else {
      toast.show(
        'Could not save changes to this device — they are only in memory.',
        'error',
        12000,
      )
    }
  }, [state, toast])

  // Seal new audit entries into this device's tamper-evident hash
  // chain (lib/auditChain.ts). Runs after every state change; no-ops
  // when everything is already sealed. Sealing is async (crypto.subtle)
  // so it can't happen inside the synchronous reducers — entries are
  // written unsealed and sealed within a tick.
  useEffect(() => {
    if (!state.auditLog.some((e) => !e.hash)) return
    let cancelled = false
    void sealAuditLog(state.auditLog).then((patch) => {
      if (cancelled || patch.size === 0) return
      setState((s) => ({
        ...s,
        auditLog: s.auditLog.map((e) => {
          const seal = patch.get(e.id)
          // Only apply to entries still unsealed — a concurrent seal
          // (StrictMode double-run) must not overwrite an existing one.
          return seal && !e.hash ? { ...e, ...seal } : e
        }),
      }))
    })
    return () => {
      cancelled = true
    }
  }, [state.auditLog])

  // Purge profiles deactivated beyond the retention window
  // (TECHNICIAN_PURGE_DAYS). Best-effort and client-side: it fires
  // whenever the app is open once a deactivation passes 90 days. The
  // tech's logged work is preserved — transactions freeze the
  // name/licence/role at the time of work — so only the now-empty
  // profile reference is removed. Authoritative scheduling moves to the
  // server once team accounts exist.
  useEffect(() => {
    const now = new Date()
    const due = state.technicians.filter((t) => {
      const d = daysUntilPurge(t, now)
      return d !== null && d <= 0
    })
    if (due.length === 0) return
    const dueIds = new Set(due.map((t) => t.id))
    // Defer the write off the effect body (same pattern as the audit
    // sealer above) so it isn't a synchronous setState-in-effect.
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setState((s) => {
        let auditLog = s.auditLog
        for (const t of due) {
          auditLog = withAudit(
            { ...s, auditLog },
            {
              action: 'delete',
              entity: 'technician',
              entityId: t.id,
              target: t.name,
              summary: `Account deleted — technician ${t.name} removed automatically after the ${TECHNICIAN_PURGE_DAYS}-day retention period following deactivation. Their logged work is retained`,
            },
          )
        }
        const remaining = s.technicians.filter((t) => !dueIds.has(t.id))
        const at = new Date().toISOString()
        return {
          ...s,
          technicians: remaining,
          activeTechnicianId: dueIds.has(s.activeTechnicianId ?? '')
            ? remaining.find((t) => !t.deactivatedAt)?.id
            : s.activeTechnicianId,
          tombstones: [
            ...s.tombstones,
            ...due.map((t) => ({
              entity: 'technician' as const,
              id: t.id,
              at,
            })),
          ],
          // Even an automatic purge stays recoverable from the recycle bin.
          recycleBin: [
            ...due.map((t) =>
              makeBinEntry(
                s,
                'technician',
                t.id,
                `Technician ${t.name}`,
                t,
                `Auto-removed after the ${TECHNICIAN_PURGE_DAYS}-day retention period`,
              ),
            ),
            ...s.recycleBin,
          ],
          auditLog,
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [state.technicians])

  // Record a licence (RHL) or authorisation (RTA) crossing its expiry date
  // onto the change log — a time-driven change nobody "edits", logged once
  // per lapse so an auditor sees that a credential lapsed and when it was
  // noticed. Deduped via loggedExpiryKeys (keyed by record + expiry date,
  // so renewing then lapsing again logs afresh). Best-effort and client-
  // side, like the purge above: it fires whenever the app is open after a
  // date passes. Renewal is itself logged by the licence-edit path.
  useEffect(() => {
    const nowISO = new Date().toISOString()
    const logged = new Set(state.loggedExpiryKeys)
    const prof = profileFor(state.jurisdiction)
    const pending: {
      key: string
      entity: 'technician' | 'settings' | 'bottle'
      entityId?: string
      target: string
      summary: string
    }[] = []
    for (const t of state.technicians) {
      if (t.deactivatedAt || !t.licenceExpiry) continue
      if (expiryStatus(t.licenceExpiry, nowISO).level !== 'expired') continue
      const key = `rhl:${t.id}:${t.licenceExpiry}`
      if (logged.has(key)) continue
      pending.push({
        key,
        entity: 'technician',
        entityId: t.id,
        target: t.name,
        summary: `${prof.techLicenceShort} for ${t.name} expired on ${t.licenceExpiry}${
          t.arcLicenceNumber ? ` · ${prof.techLicenceShort} ${t.arcLicenceNumber}` : ''
        } — logging work against a lapsed licence is itself a breach`,
      })
    }
    for (const b of state.bottles) {
      if (!b.nextHydroTestDate) continue
      if (expiryStatus(b.nextHydroTestDate, nowISO).level !== 'expired') continue
      const key = `hydro:${b.id}:${b.nextHydroTestDate}`
      if (logged.has(key)) continue
      pending.push({
        key,
        entity: 'bottle',
        entityId: b.id,
        target: b.bottleNumber,
        summary: `Cylinder ${b.bottleNumber} hydrostatic test (AS 2030) became overdue on ${b.nextHydroTestDate}`,
      })
    }
    if (
      state.arcAuthorisationExpiry &&
      expiryStatus(state.arcAuthorisationExpiry, nowISO).level === 'expired'
    ) {
      const key = `rta:${state.arcAuthorisationExpiry}`
      if (!logged.has(key)) {
        pending.push({
          key,
          entity: 'settings',
          target: prof.businessAuthShort,
          summary: `${prof.businessAuthShort} (business authorisation) expired on ${state.arcAuthorisationExpiry}`,
        })
      }
    }
    if (pending.length === 0) return
    let cancelled = false
    void Promise.resolve().then(() => {
      if (cancelled) return
      setState((s) => {
        const have = new Set(s.loggedExpiryKeys)
        const fresh = pending.filter((p) => !have.has(p.key))
        if (fresh.length === 0) return s
        let auditLog = s.auditLog
        for (const p of fresh) {
          auditLog = withAudit(
            { ...s, auditLog },
            {
              action: 'expire',
              entity: p.entity,
              entityId: p.entityId,
              target: p.target,
              summary: p.summary,
            },
          )
        }
        return {
          ...s,
          auditLog,
          loggedExpiryKeys: [...s.loggedExpiryKeys, ...fresh.map((p) => p.key)],
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [
    state.technicians,
    state.bottles,
    state.arcAuthorisationExpiry,
    state.loggedExpiryKeys,
    state.jurisdiction,
  ])

  const lastPushedRef = useRef<string>('')
  const remoteApplyRef = useRef(false)
  // Latest state, readable from sync callbacks without re-subscribing
  // the realtime channel on every keystroke.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  // Role enforcement at the mutation layer — defence in depth behind the
  // UI's button-hiding. Returns true (allowed) when the active profile
  // sits at or above `min`. When the device has NO technician profiles at
  // all (a solo / first-run device before a crew is set up) there is no
  // role boundary to enforce, so the action is allowed. Once profiles
  // exist, being signed OUT is the LEAST privileged state, not the most —
  // otherwise "sign out" would be a one-tap escape from every gate on a
  // shared device. A denied action is a no-op and tells the user which
  // tier it needs. Real, unspoofable enforcement still needs server-side
  // per-tech sign-in; this stops accidental misuse and honours the
  // permissions the UI advertises.
  const ensureRole = useCallback(
    (min: TechnicianRole, action: string): boolean => {
      const s = stateRef.current
      if (s.technicians.length === 0) return true
      const tech = s.technicians.find((t) => t.id === s.activeTechnicianId)
      if (!tech) {
        toast.show(
          `${action} needs ${roleInfo(min).label} access or higher — pick your profile first (no one is signed in).`,
          'error',
          6000,
        )
        return false
      }
      if (roleAtLeast(tech.role, min)) return true
      toast.show(
        `${action} needs ${roleInfo(min).label} access or higher — you're signed in as ${roleInfo(tech.role).label}.`,
        'error',
        6000,
      )
      return false
    },
    [toast],
  )

  // Merge-based remote apply. The old code REPLACED local state with
  // the remote blob (last write wins) — two techs logging at once lost
  // one tech's entries. Now every incoming snapshot is merged record-
  // by-record (see lib/merge.ts): if the merge adds nothing we adopt it
  // silently; if local rows survive that the remote lacks, the push
  // effect uploads the merged superset so both devices converge.
  const applyRemote = useCallback((remoteRaw: AppState) => {
    const remote = normalizeState(remoteRaw)
    const local = stateRef.current
    const merged = mergeStates(local, remote)
    const mergedStr = JSON.stringify(merged)
    if (mergedStr === JSON.stringify(local)) return // nothing new
    // Pure adoption (remote is a superset) → suppress the echo push.
    remoteApplyRef.current = mergedStr === JSON.stringify(remote)
    setState(merged)
  }, [])

  useEffect(() => {
    if (!isSyncConfigured()) return
    if (!state.sync.enabled || !state.sync.teamId) return
    let cancelled = false
    pullState(state.sync.teamId).then((r) => {
      if (!cancelled && r.ok && r.state) applyRemote(r.state)
    })
    const unsub = subscribeToState(state.sync.teamId, (remote) => {
      applyRemote(remote)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [state.sync.enabled, state.sync.teamId, applyRemote])

  // Bumped after a failed push to re-arm this effect for a retry.
  const [pushRetryTick, setPushRetryTick] = useState(0)
  const pushRetryHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncToastRef = useRef(0)
  useEffect(() => {
    if (!isSyncConfigured()) return
    if (!state.sync.enabled || !state.sync.teamId) return
    if (remoteApplyRef.current) {
      remoteApplyRef.current = false
      return
    }
    const serialized = JSON.stringify(state)
    if (serialized === lastPushedRef.current) return
    const teamId = state.sync.teamId
    const handle = setTimeout(() => {
      void (async () => {
        // PULL-MERGE-PUSH. A device that was offline (realtime events are
        // not replayed) must never blind-upsert its stale state over the
        // server row — that destroys every record the rest of the team
        // wrote in the meantime, with recovery depending on some other
        // device still holding them. Merge the server row in first; if
        // that changes local state, adopt it and let the re-run of this
        // effect push the merged superset.
        const pulled = await pullState(teamId)
        if (!pulled.ok) {
          // Can't see the server row — pushing anyway would blind-upsert
          // stale state over work this device hasn't merged. Treat it
          // like a failed push: surface, keep unpushed, retry.
          const now = Date.now()
          if (now - lastSyncToastRef.current >= 60_000) {
            lastSyncToastRef.current = now
            toast.show(
              'Cloud sync could not reach the server — changes are saved on this device and will retry.',
              'error',
              8000,
            )
          }
          if (pushRetryHandleRef.current) {
            clearTimeout(pushRetryHandleRef.current)
          }
          pushRetryHandleRef.current = setTimeout(() => {
            setPushRetryTick((t) => t + 1)
          }, 30_000)
          return
        }
        if (pulled.state) {
          const merged = mergeStates(
            stateRef.current,
            normalizeState(pulled.state),
          )
          if (JSON.stringify(merged) !== JSON.stringify(stateRef.current)) {
            remoteApplyRef.current = false
            setState(merged)
            return
          }
        }
        const snapshot = stateRef.current
        const ok = await pushState(teamId, snapshot)
        if (ok) {
          // Only a confirmed write counts as pushed — a failure must
          // leave the door open for a retry, not read as replicated.
          lastPushedRef.current = JSON.stringify(snapshot)
        } else {
          const now = Date.now()
          if (now - lastSyncToastRef.current >= 60_000) {
            lastSyncToastRef.current = now
            toast.show(
              'Cloud sync could not reach the server — changes are saved on this device and will retry.',
              'error',
              8000,
            )
          }
          if (pushRetryHandleRef.current) {
            clearTimeout(pushRetryHandleRef.current)
          }
          pushRetryHandleRef.current = setTimeout(() => {
            setPushRetryTick((t) => t + 1)
          }, 30_000)
        }
      })()
    }, 800)
    return () => {
      clearTimeout(handle)
      // A pending failure-retry must not fire into an unmounted provider
      // (or across a team change / sync toggle).
      if (pushRetryHandleRef.current) {
        clearTimeout(pushRetryHandleRef.current)
        pushRetryHandleRef.current = null
      }
    }
  }, [state, pushRetryTick, toast])

  const addBottle: StoreApi['addBottle'] = useCallback((b) => {
    const now = new Date().toISOString()
    let bottle: Bottle = { ...b, id: uid(), createdAt: now, updatedAt: now }
    setState((s) => {
      // Stamp the active technician onto the bottle at creation time
      // so the Bottles list can show "who added this". Frozen — even
      // if the tech profile is later renamed or deleted, the bottle
      // keeps the name + RHL that were in force when it was entered.
      const activeTech = s.technicians.find(
        (x) => x.id === s.activeTechnicianId,
      )
      bottle = {
        ...bottle,
        createdBy: bottle.createdBy ?? activeTech?.name,
        createdByLicence:
          bottle.createdByLicence ?? activeTech?.arcLicenceNumber,
      }
      // A new bottle brings its net charge into the system, so it also
      // gets a refrigerant-log entry ('intake') alongside the change-log
      // entry below — adding a bottle shows up in BOTH logs. weightBefore
      // is 0: the bottle didn't exist before this moment.
      const net = Math.max(
        0,
        Math.round((bottle.grossWeight - bottle.tareWeight) * 1000) / 1000,
      )
      const intake: Transaction = {
        id: uid(),
        bottleId: bottle.id,
        kind: 'intake',
        amount: net,
        weightBefore: 0,
        weightAfter: bottle.grossWeight,
        date: bottle.createdAt,
        // Paper trail for the quarterly "bought" record — frozen here so
        // the log row survives later edits/deletion of the bottle.
        supplier: bottle.supplier || undefined,
        invoiceNumber: bottle.invoiceNumber || undefined,
        costAud: bottle.costAud || undefined,
        technician: activeTech?.name ?? (s.technician || undefined),
        technicianLicence:
          (activeTech?.arcLicenceNumber || undefined) ??
          (s.arcLicenceNumber || undefined),
        technicianRole: activeTech?.role,
        businessName: s.businessName || undefined,
        businessAbn: s.businessAbn || undefined,
        arcAuthorisationNumber: s.arcAuthorisationNumber || undefined,
        // Local zone of the device that entered the bottle (see Transaction.tz).
        tz: deviceTimeZone() || s.location.timezone || undefined,
      }
      return {
        ...s,
        bottles: [...s.bottles, bottle],
        transactions: [intake, ...s.transactions],
        auditLog: withAudit(s, {
          action: 'create',
          entity: 'bottle',
          entityId: bottle.id,
          target: bottle.bottleNumber,
          summary: `Added bottle ${bottle.bottleNumber} · ${bottle.refrigerantType}`,
        }),
      }
    })
    return bottle
  }, [])

  const updateBottle: StoreApi['updateBottle'] = useCallback((id, patch) => {
    setState((s) => {
      const before = s.bottles.find((b) => b.id === id)
      const bottles = s.bottles.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b,
      )
      if (!before) return { ...s, bottles }
      const siteName = (v: unknown) =>
        v ? (s.sites.find((x) => x.id === v)?.name ?? String(v)) : '—'
      const labelled = diffFields(before, patch, BOTTLE_FIELDS, {
        currentSiteId: siteName,
        // Audit the retest flag as a readable state, not a raw timestamp.
        sentForRetestAt: (v) => (v ? 'Sent for retest' : 'Not sent'),
      })
      // Catch-all so no field change is ever silently unlogged.
      const all = rawChanges(before, patch)
      // Nothing actually changed (e.g. form saved untouched) — don't
      // clutter the history with an empty edit.
      if (all.length === 0) return { ...s, bottles }
      const changes = labelled.length ? labelled : all
      const relocated =
        'currentSiteId' in patch && patch.currentSiteId !== before.currentSiteId
      return {
        ...s,
        bottles,
        auditLog: withAudit(s, {
          action: relocated ? 'relocate' : 'update',
          entity: 'bottle',
          entityId: id,
          target: before.bottleNumber,
          summary: relocated
            ? `Relocated bottle ${before.bottleNumber} to ${siteName(patch.currentSiteId)}`
            : `Edited bottle ${before.bottleNumber}`,
          changes,
        }),
      }
    })
  }, [])

  const deleteBottle: StoreApi['deleteBottle'] = useCallback((id) => {
    if (!ensureRole('supervisor', 'Deleting a cylinder')) return
    setState((s) => {
      const before = s.bottles.find((b) => b.id === id)
      const now = new Date().toISOString()
      // The bottle row is removed, but its refrigerant log entries stay
      // LIVE — they are historical facts an ARC audit must be able to
      // reproduce, so quarterly figures, leak stats and logbooks keep
      // counting them exactly as when the cylinder was in service.
      // (Rows carry the cylinder's number/tare/refrigerant frozen at the
      // time of work, so they read standalone without the bottle record.
      // Cascading a soft-delete here used to silently rewrite already-
      // reported quarterly figures — never again.)
      // Backfill the frozen number onto pre-freeze rows while the bottle
      // record is still here to read it from — both where this cylinder
      // is the row's bottle and where it was the SOURCE of a decant.
      const transactions = before
        ? s.transactions.map((t) => {
            let next = t
            if (t.bottleId === id && !t.deletedAt && !t.bottleNumber) {
              next = { ...next, bottleNumber: before.bottleNumber }
            }
            if (
              t.sourceBottleId === id &&
              !t.deletedAt &&
              !t.sourceBottleNumber
            ) {
              next = { ...next, sourceBottleNumber: before.bottleNumber }
            }
            return next
          })
        : s.transactions
      return {
        ...s,
        bottles: s.bottles.filter((b) => b.id !== id),
        transactions,
        // Tombstone so a sync with a device that still holds this
        // bottle doesn't resurrect it (see lib/merge.ts).
        tombstones: [...s.tombstones, { entity: 'bottle' as const, id, at: now }],
        // The bottle record itself is recoverable from the recycle bin —
        // nothing is permanently deleted.
        recycleBin: before
          ? [
              makeBinEntry(
                s,
                'bottle',
                id,
                `Bottle ${before.bottleNumber} · ${before.refrigerantType}`,
                before,
              ),
              ...s.recycleBin,
            ]
          : s.recycleBin,
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'bottle',
              entityId: id,
              target: before.bottleNumber,
              summary: `Removed bottle ${before.bottleNumber} — recoverable from the recycle bin; its log entries stay on the record and keep counting in reports`,
            })
          : s.auditLog,
      }
    })
  }, [ensureRole])

  const addSite: StoreApi['addSite'] = useCallback((s) => {
    const site: Site = {
      ...s,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    setState((cur) => ({
      ...cur,
      sites: [...cur.sites, site],
      auditLog: withAudit(cur, {
        action: 'create',
        entity: 'site',
        entityId: site.id,
        target: site.name,
        summary: `Added site ${site.name}`,
      }),
    }))
    return site
  }, [])

  const updateSite: StoreApi['updateSite'] = useCallback((id, patch) => {
    setState((s) => {
      const before = s.sites.find((x) => x.id === id)
      const sites = s.sites.map((x) =>
        x.id === id
          ? { ...x, ...patch, updatedAt: new Date().toISOString() }
          : x,
      )
      if (!before) return { ...s, sites }
      const labelled = diffFields(before, patch, SITE_FIELDS)
      const all = rawChanges(before, patch)
      if (all.length === 0) return { ...s, sites }
      const changes = labelled.length ? labelled : all
      return {
        ...s,
        sites,
        auditLog: withAudit(s, {
          action: 'update',
          entity: 'site',
          entityId: id,
          target: before.name,
          summary: `Edited site ${before.name}`,
          changes,
        }),
      }
    })
  }, [])

  const deleteSite: StoreApi['deleteSite'] = useCallback((id) => {
    if (!ensureRole('supervisor', 'Deleting a site')) return
    setState((s) => {
      const before = s.sites.find((x) => x.id === id)
      // Deleting a site (and its units) must not rewrite history: every
      // transaction that referenced it gets the site/unit NAME frozen on
      // the row before the link is cleared, so logbooks and exports keep
      // saying where the work happened.
      const deletedUnits = s.units.filter((u) => u.siteId === id)
      const deletedUnitNames = new Map(deletedUnits.map((u) => [u.id, u.name]))
      const now = new Date().toISOString()
      // Recycle-bin the site and each cascaded unit individually, so any
      // of them can be recovered later — nothing is permanently deleted.
      const binned: RecycleBinEntry[] = []
      if (before) {
        binned.push(makeBinEntry(s, 'site', id, `Site ${before.name}`, before))
      }
      for (const u of deletedUnits) {
        binned.push(
          makeBinEntry(
            s,
            'unit',
            u.id,
            `Unit ${u.name}`,
            u,
            before ? `Site ${before.name} removed` : undefined,
          ),
        )
      }
      return {
        ...s,
        sites: s.sites.filter((x) => x.id !== id),
        units: s.units.filter((u) => u.siteId !== id),
        recycleBin: binned.length ? [...binned, ...s.recycleBin] : s.recycleBin,
        // Tombstone the site AND its cascaded units so a sync can't
        // resurrect any of them (see lib/merge.ts).
        tombstones: [
          ...s.tombstones,
          { entity: 'site' as const, id, at: now },
          ...[...deletedUnitNames.keys()].map((unitId) => ({
            entity: 'unit' as const,
            id: unitId,
            at: now,
          })),
        ],
        bottles: s.bottles.map((b) =>
          b.currentSiteId === id
            ? {
                ...b,
                currentSiteId: undefined,
                // A bottle can't stay "on site" at a site that no longer
                // exists — it's back in the tech's hands.
                status: b.status === 'on_site' ? 'in_stock' : b.status,
                updatedAt: new Date().toISOString(),
              }
            : b,
        ),
        transactions: s.transactions.map((t) => {
          const siteHit = t.siteId === id
          const unitHit = t.unitId != null && deletedUnitNames.has(t.unitId)
          if (!siteHit && !unitHit) return t
          return {
            ...t,
            siteId: siteHit ? undefined : t.siteId,
            siteName: siteHit ? (before?.name ?? t.siteName) : t.siteName,
            unitId: unitHit ? undefined : t.unitId,
            unitName: unitHit
              ? deletedUnitNames.get(t.unitId!) ?? t.unitName
              : t.unitName,
          }
        }),
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'site',
              entityId: id,
              target: before.name,
              summary: `Removed site ${before.name} — its units were removed too; all recoverable from the recycle bin, and past log entries keep the site/unit names frozen on the record`,
            })
          : s.auditLog,
      }
    })
  }, [ensureRole])

  const addUnit: StoreApi['addUnit'] = useCallback((u) => {
    const unit: Unit = {
      ...u,
      id: uid(),
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    setState((cur) => {
      const site = cur.sites.find((x) => x.id === unit.siteId)
      return {
        ...cur,
        units: [...cur.units, unit],
        auditLog: withAudit(cur, {
          action: 'create',
          entity: 'unit',
          entityId: unit.id,
          target: unit.name,
          summary: `Added unit ${unit.name}${site ? ` at ${site.name}` : ''}`,
        }),
      }
    })
    return unit
  }, [])

  const updateUnit: StoreApi['updateUnit'] = useCallback((id, patch) => {
    setState((s) => {
      const before = s.units.find((u) => u.id === id)
      const units = s.units.map((u) =>
        u.id === id
          ? { ...u, ...patch, updatedAt: new Date().toISOString() }
          : u,
      )
      if (!before) return { ...s, units }
      const labelled = diffFields(before, patch, UNIT_FIELDS)
      const all = rawChanges(before, patch)
      if (all.length === 0) return { ...s, units }
      const changes = labelled.length ? labelled : all
      return {
        ...s,
        units,
        auditLog: withAudit(s, {
          action: 'update',
          entity: 'unit',
          entityId: id,
          target: before.name,
          summary: `Edited unit ${before.name}`,
          changes,
        }),
      }
    })
  }, [])

  const deleteUnit: StoreApi['deleteUnit'] = useCallback((id) => {
    if (!ensureRole('supervisor', 'Deleting equipment')) return
    setState((s) => {
      const before = s.units.find((u) => u.id === id)
      return {
        ...s,
        units: s.units.filter((u) => u.id !== id),
        tombstones: [
          ...s.tombstones,
          { entity: 'unit' as const, id, at: new Date().toISOString() },
        ],
        recycleBin: before
          ? [makeBinEntry(s, 'unit', id, `Unit ${before.name}`, before), ...s.recycleBin]
          : s.recycleBin,
        // Freeze the unit's name onto its log rows before clearing the
        // link — deleting equipment must not erase where past work
        // happened from the historical record.
        transactions: s.transactions.map((t) =>
          t.unitId === id
            ? { ...t, unitId: undefined, unitName: before?.name ?? t.unitName }
            : t,
        ),
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'unit',
              entityId: id,
              target: before.name,
              summary: `Removed unit ${before.name} — recoverable from the recycle bin`,
            })
          : s.auditLog,
      }
    })
  }, [ensureRole])

  const decommissionUnit: StoreApi['decommissionUnit'] = useCallback(
    (id, reason) => {
      // Taking equipment off the leak-tracking radar is a senior call.
      if (!ensureRole('lead_tech', 'Decommissioning a unit')) return
      setState((s) => {
        const before = s.units.find((u) => u.id === id)
        const units = s.units.map((u) =>
          u.id === id
            ? {
                ...u,
                status: 'decommissioned' as const,
                decommissionedAt: new Date().toISOString(),
                decommissionedReason: reason?.trim() || u.decommissionedReason,
                updatedAt: new Date().toISOString(),
              }
            : u,
        )
        if (!before) return { ...s, units }
        return {
          ...s,
          units,
          auditLog: withAudit(s, {
            action: 'decommission',
            entity: 'unit',
            entityId: id,
            target: before.name,
            summary: `Decommissioned unit ${before.name}${
              reason?.trim() ? ` — ${reason.trim()}` : ''
            }`,
          }),
        }
      })
    },
    [ensureRole],
  )

  const reactivateUnit: StoreApi['reactivateUnit'] = useCallback((id) => {
    setState((s) => {
      const before = s.units.find((u) => u.id === id)
      const units = s.units.map((u) =>
        u.id === id
          ? {
              ...u,
              status: 'active' as const,
              decommissionedAt: undefined,
              decommissionedReason: undefined,
              updatedAt: new Date().toISOString(),
            }
          : u,
      )
      if (!before) return { ...s, units }
      return {
        ...s,
        units,
        auditLog: withAudit(s, {
          action: 'reactivate',
          entity: 'unit',
          entityId: id,
          target: before.name,
          summary: `Reactivated unit ${before.name}`,
        }),
      }
    })
  }, [])

  const addJob: StoreApi['addJob'] = useCallback((j) => {
    const job: Job = {
      ...j,
      id: uid(),
      status: 'open',
      createdAt: new Date().toISOString(),
    }
    setState((cur) => {
      const tech = cur.technicians.find((x) => x.id === cur.activeTechnicianId)
      const site = job.siteId
        ? cur.sites.find((x) => x.id === job.siteId)
        : undefined
      // Snapshot site/client/technician so the job reads standalone even if
      // the site is later renamed/removed (same freezing the log rows use).
      const enriched: Job = {
        ...job,
        siteName: job.siteName ?? site?.name,
        clientName: job.clientName ?? site?.client,
        technician: job.technician ?? tech?.name ?? (cur.technician || undefined),
        technicianLicence:
          job.technicianLicence ??
          tech?.arcLicenceNumber ??
          (cur.arcLicenceNumber || undefined),
      }
      return {
        ...cur,
        jobs: [...cur.jobs, enriched],
        auditLog: withAudit(cur, {
          action: 'create',
          entity: 'job',
          entityId: enriched.id,
          target: enriched.reference,
          summary: `Opened job ${enriched.reference}${site ? ` at ${site.name}` : ''}`,
        }),
      }
    })
    return job
  }, [])

  const updateJob: StoreApi['updateJob'] = useCallback((id, patch) => {
    setState((s) => {
      const before = s.jobs.find((j) => j.id === id)
      if (!before) return s
      // Re-freeze the site/client snapshot when the site link changes, so
      // the job (and its printed service report) reads standalone against
      // the site it now belongs to — same freezing addJob does.
      let effective = patch
      if ('siteId' in patch && patch.siteId !== before.siteId) {
        const site = patch.siteId
          ? s.sites.find((x) => x.id === patch.siteId)
          : undefined
        effective = { ...patch, siteName: site?.name, clientName: site?.client }
      }
      const siteName = (v: unknown) =>
        v ? (s.sites.find((x) => x.id === v)?.name ?? String(v)) : '—'
      const labelled = diffFields(before, effective, JOB_FIELDS, {
        siteId: siteName,
      })
      // Catch-all so no field change is ever silently unlogged; skip the
      // frozen snapshot fields the site re-link derives.
      const all = rawChanges(before, effective, ['siteName', 'clientName'])
      // Nothing actually changed (form saved untouched) — no empty edit.
      if (all.length === 0 && labelled.length === 0) return s
      const jobs = s.jobs.map((j) =>
        j.id === id
          ? { ...j, ...effective, updatedAt: new Date().toISOString() }
          : j,
      )
      return {
        ...s,
        jobs,
        auditLog: withAudit(s, {
          action: 'update',
          entity: 'job',
          entityId: id,
          target: effective.reference ?? before.reference,
          summary: `Edited job ${before.reference}`,
          changes: labelled.length ? labelled : all,
        }),
      }
    })
  }, [])

  const setJobStatus: StoreApi['setJobStatus'] = useCallback((id, status) => {
    setState((s) => {
      const before = s.jobs.find((j) => j.id === id)
      if (!before || before.status === status) return s
      const now = new Date().toISOString()
      const jobs = s.jobs.map((j) =>
        j.id === id
          ? {
              ...j,
              status,
              closedAt: status === 'closed' ? now : undefined,
              updatedAt: now,
            }
          : j,
      )
      return {
        ...s,
        jobs,
        auditLog: withAudit(s, {
          action: 'update',
          entity: 'job',
          entityId: id,
          target: before.reference,
          summary: `${status === 'closed' ? 'Closed' : 'Reopened'} job ${before.reference}`,
        }),
      }
    })
  }, [])

  const deleteJob: StoreApi['deleteJob'] = useCallback((id) => {
    if (!ensureRole('supervisor', 'Deleting a job')) return
    setState((s) => {
      const before = s.jobs.find((j) => j.id === id)
      return {
        ...s,
        jobs: s.jobs.filter((j) => j.id !== id),
        tombstones: [
          ...s.tombstones,
          { entity: 'job' as const, id, at: new Date().toISOString() },
        ],
        recycleBin: before
          ? [
              makeBinEntry(s, 'job', id, `Job ${before.reference}`, before),
              ...s.recycleBin,
            ]
          : s.recycleBin,
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'job',
              entityId: id,
              target: before.reference,
              summary: `Removed job ${before.reference} — recoverable from the recycle bin`,
            })
          : s.auditLog,
      }
    })
  }, [ensureRole])

  const addTransaction: StoreApi['addTransaction'] = useCallback((t) => {
    // Fresh movements are open to every tier — logging work is the job.
    // A correction re-states the record, so it carries the same gate the
    // UI advertises (canCorrectRecords: lead tech and above).
    if (t.correctsId && !ensureRole('lead_tech', 'Correcting a log entry')) {
      return null
    }
    let result: Transaction | null = null
    setState((s) => {
      const bottle = s.bottles.find((b) => b.id === t.bottleId)
      if (!bottle) return s
      const before = bottle.grossWeight
      // Bottle side may differ from equipment side (hose/decant losses).
      // For 'adjust', bottleAmount is ignored — adjust is the bottle delta directly.
      let bottleDelta =
        t.kind === 'adjust' ? t.amount : (t.bottleAmount ?? t.amount)
      // Re-statement correction (charge/recover correcting an entry of
      // the same kind): the original already moved refrigerant, so the
      // bottle only changes by the DIFFERENCE between the corrected and
      // the original bottle-side amounts. The row itself still records
      // the full corrected amount — aggregates count it in place of the
      // superseded original.
      const original = t.correctsId
        ? s.transactions.find((x) => x.id === t.correctsId)
        : undefined
      if (
        original &&
        original.kind === t.kind &&
        (t.kind === 'charge' || t.kind === 'recover')
      ) {
        bottleDelta =
          (t.bottleAmount ?? t.amount) -
          (original.bottleAmount ?? original.amount)
      }
      let after = before
      if (t.kind === 'charge') after = before - bottleDelta
      else if (t.kind === 'recover') after = before + bottleDelta
      else if (t.kind === 'adjust') after = before + bottleDelta // signed
      // transfer / return / sell don't change weight
      after = Math.max(0, Math.round(after * 1000) / 1000)

      // Bottle-to-bottle recover: also decrement the source bottle
      const sourceBottle =
        t.kind === 'recover' && t.sourceBottleId
          ? s.bottles.find((b) => b.id === t.sourceBottleId)
          : null
      const sourceBefore = sourceBottle?.grossWeight
      const sourceAfter =
        sourceBottle != null
          ? Math.max(0, Math.round((sourceBottle.grossWeight - t.amount) * 1000) / 1000)
          : undefined

      // Resolve identity stamps from (in order): explicit values on
      // the incoming transaction → the active tech profile → legacy
      // single-tech state → undefined. This keeps existing call sites
      // working while letting the form pass profile-derived values
      // explicitly when a profile is picked.
      const activeTech = s.technicians.find(
        (x) => x.id === s.activeTechnicianId,
      )
      const tx: Transaction = {
        ...t,
        id: uid(),
        loggedAt: new Date().toISOString(),
        weightBefore: before,
        weightAfter: after,
        sourceWeightBefore: sourceBefore,
        sourceWeightAfter: sourceAfter,
        // Freeze the cylinder's number, tare + refrigerant so quarterly /
        // CSV figures and row display survive the bottle later being
        // deleted (see Transaction).
        bottleNumber: t.bottleNumber ?? bottle.bottleNumber,
        sourceBottleNumber: t.sourceBottleNumber ?? sourceBottle?.bottleNumber,
        bottleTareWeight: t.bottleTareWeight ?? bottle.tareWeight,
        bottleRefrigerantType:
          t.bottleRefrigerantType ?? bottle.refrigerantType,
        technician: t.technician ?? activeTech?.name ?? (s.technician || undefined),
        technicianLicence:
          t.technicianLicence ??
          (activeTech?.arcLicenceNumber || undefined) ??
          (s.arcLicenceNumber || undefined),
        technicianRole: t.technicianRole ?? activeTech?.role,
        businessName: t.businessName ?? (s.businessName || undefined),
        businessAbn: t.businessAbn ?? (s.businessAbn || undefined),
        arcAuthorisationNumber:
          t.arcAuthorisationNumber ?? (s.arcAuthorisationNumber || undefined),
        // Local zone the work was logged in — the form passes the device
        // zone it interpreted the entered time in; fall back to the
        // device zone here, then the business zone (see Transaction.tz).
        tz: t.tz ?? (deviceTimeZone() || s.location.timezone || undefined),
      }
      result = tx

      const updatedBottle: Bottle = {
        ...bottle,
        grossWeight: after,
        updatedAt: new Date().toISOString(),
      }
      // status side-effects
      if (t.kind === 'transfer' && t.siteId) {
        updatedBottle.currentSiteId = t.siteId
        updatedBottle.status = 'on_site'
      } else if (t.kind === 'return' || t.kind === 'sell') {
        // Both take the cylinder out of the fleet, under their own label.
        updatedBottle.currentSiteId = undefined
        updatedBottle.status = t.kind === 'sell' ? 'sold' : 'returned'
      }
      const net = Math.max(0, updatedBottle.grossWeight - updatedBottle.tareWeight)
      if (net <= 0.01 && !isOutOfFleet(updatedBottle.status)) {
        updatedBottle.status = 'empty'
      }

      let nextBottles = s.bottles.map((b) =>
        b.id === bottle.id ? updatedBottle : b,
      )

      if (sourceBottle && sourceAfter !== undefined) {
        const sourceUpdated: Bottle = {
          ...sourceBottle,
          grossWeight: sourceAfter,
          updatedAt: new Date().toISOString(),
        }
        const srcNet = Math.max(0, sourceUpdated.grossWeight - sourceUpdated.tareWeight)
        if (srcNet <= 0.01 && !isOutOfFleet(sourceUpdated.status)) {
          sourceUpdated.status = 'empty'
        }
        nextBottles = nextBottles.map((b) =>
          b.id === sourceBottle.id ? sourceUpdated : b,
        )
      }

      // Refrigerant movements live in the transactions array and surface
      // on the Refrigerant log — they're deliberately NOT mirrored into
      // the change log, which is reserved for every *other* app action.
      return {
        ...s,
        bottles: nextBottles,
        transactions: [tx, ...s.transactions],
      }
    })
    return result
  }, [ensureRole])

  const deleteTransaction: StoreApi['deleteTransaction'] = useCallback(
    (id, reason) => {
      if (!ensureRole('supervisor', 'Deleting a log entry')) return
      setState((s) => {
        const activeTech = s.technicians.find(
          (x) => x.id === s.activeTechnicianId,
        )
        const now = new Date().toISOString()
        const target = s.transactions.find((t) => t.id === id)
        const bottleNo =
          s.bottles.find((b) => b.id === target?.bottleId)?.bottleNumber ??
          target?.bottleNumber ??
          '(deleted bottle)'
        return {
          ...s,
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  deletedAt: now,
                  deletedBy:
                    activeTech?.name || s.technician || undefined,
                  deletedByLicence:
                    activeTech?.arcLicenceNumber ||
                    s.arcLicenceNumber ||
                    undefined,
                  deletedReason: reason?.trim() || undefined,
                }
              : t,
          ),
          auditLog: target
            ? withAudit(s, {
                action: 'delete',
                entity: 'transaction',
                entityId: id,
                target: bottleNo,
                summary: `Deleted ${transactionLabel(target.kind)} log entry for bottle ${bottleNo}${
                  reason?.trim() ? ` — ${reason.trim()}` : ''
                }`,
              })
            : s.auditLog,
        }
      })
    },
    [ensureRole],
  )

  const restoreTransaction: StoreApi['restoreTransaction'] = useCallback(
    (id) => {
      if (!ensureRole('supervisor', 'Restoring a log entry')) return
      const now = new Date().toISOString()
      setState((s) => {
        const target = s.transactions.find((t) => t.id === id)
        // Only act on a row that's actually soft-deleted, so a stale tap
        // (or a row already restored on another device) is a clean no-op.
        if (!target || !target.deletedAt) return s
        const bottleNo =
          s.bottles.find((b) => b.id === target.bottleId)?.bottleNumber ??
          target.bottleNumber ??
          '(deleted bottle)'
        return {
          ...s,
          transactions: s.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  deletedAt: undefined,
                  deletedBy: undefined,
                  deletedByLicence: undefined,
                  deletedReason: undefined,
                  // Stamp the restore so a sync merge keeps it (the later
                  // of deletedAt / restoredAt is the live fact).
                  restoredAt: now,
                }
              : t,
          ),
          auditLog: withAudit(s, {
            action: 'restore',
            entity: 'transaction',
            entityId: id,
            target: bottleNo,
            summary: `Restored ${transactionLabel(
              target.kind,
            )} log entry for bottle ${bottleNo}`,
          }),
        }
      })
    },
    [ensureRole],
  )

  const restoreFromRecycleBin: StoreApi['restoreFromRecycleBin'] = useCallback(
    (binId) => {
      if (!ensureRole('supervisor', 'Restoring a deleted record')) return
      setState((s) => {
        const entry = s.recycleBin.find((e) => e.id === binId)
        if (!entry) return s
        const now = new Date().toISOString()
        // Drop the bin entry and neutralise the record's tombstone.
        // Stamped records (bottle/site/unit/job/technician) get the
        // tombstone removed AND updatedAt bumped — the bump out-dates any
        // copy of the tombstone still on another device. Custom
        // refrigerants and presets carry no timestamps, so their
        // tombstone is REVOKED in place instead (revokedAt): the
        // revocation merges to every device and stops the restored item
        // being re-deleted forever, while a later re-delete writes a
        // fresh tombstone that beats it.
        const recycleBin = s.recycleBin.filter((e) => e.id !== binId)
        const timestampless =
          entry.entity === 'refrigerant' || entry.entity === 'preset'
        const hadStone = s.tombstones.some(
          (t) => t.entity === entry.entity && t.id === entry.recordId,
        )
        const tombstones = timestampless
          ? hadStone
            ? s.tombstones.map((t) =>
                t.entity === entry.entity && t.id === entry.recordId
                  ? { ...t, revokedAt: now }
                  : t,
              )
            : [
                // No local copy (it arrived elsewhere) — write a revoked
                // one so the merge revocation still propagates.
                ...s.tombstones,
                {
                  entity: entry.entity,
                  id: entry.recordId,
                  at: now,
                  revokedAt: now,
                },
              ]
          : s.tombstones.filter(
              (t) => !(t.entity === entry.entity && t.id === entry.recordId),
            )
        const base = { ...s, recycleBin, tombstones }
        const log = (target: string): AuditEntry[] =>
          withAudit(s, {
            action: 'restore',
            entity: entry.entity,
            entityId: entry.recordId,
            target,
            summary: `Restored ${entry.label} from the recycle bin`,
          })
        switch (entry.entity) {
          case 'bottle': {
            const rec = { ...(entry.record as Bottle), updatedAt: now }
            if (s.bottles.some((b) => b.id === rec.id)) return s
            return { ...base, bottles: [...s.bottles, rec], auditLog: log(rec.bottleNumber) }
          }
          case 'site': {
            const rec = { ...(entry.record as Site), updatedAt: now }
            if (s.sites.some((x) => x.id === rec.id)) return s
            return { ...base, sites: [...s.sites, rec], auditLog: log(rec.name) }
          }
          case 'unit': {
            const rec = { ...(entry.record as Unit), updatedAt: now }
            if (s.units.some((u) => u.id === rec.id)) return s
            return { ...base, units: [...s.units, rec], auditLog: log(rec.name) }
          }
          case 'job': {
            const rec = { ...(entry.record as Job), updatedAt: now }
            if (s.jobs.some((j) => j.id === rec.id)) return s
            return { ...base, jobs: [...s.jobs, rec], auditLog: log(rec.reference) }
          }
          case 'technician': {
            // Restore as an active profile (any purge countdown is cleared).
            const rec = {
              ...(entry.record as Technician),
              deactivatedAt: undefined,
              updatedAt: now,
            }
            if (s.technicians.some((t) => t.id === rec.id)) return s
            return {
              ...base,
              technicians: [...s.technicians, rec],
              auditLog: log(rec.name),
            }
          }
          case 'preset': {
            const rec = entry.record as BottlePreset
            if (s.customBottlePresets.some((p) => p.id === rec.id)) return s
            return {
              ...base,
              customBottlePresets: [...s.customBottlePresets, rec],
              auditLog: log(rec.label),
            }
          }
          case 'refrigerant': {
            const name = entry.recordId
            if (s.customRefrigerants.includes(name)) return s
            return {
              ...base,
              customRefrigerants: [...s.customRefrigerants, name],
              auditLog: log(name),
            }
          }
          default:
            return s
        }
      })
    },
    [ensureRole],
  )

  const logAttachmentRemoved: StoreApi['logAttachmentRemoved'] = useCallback(
    (entityType, entityId, kind, descriptor) => {
      setState((s) => {
        // Resolve a human label for the parent record so the change log
        // reads "Photo removed from cylinder ABC-123", not a bare id.
        let target = entityId
        if (entityType === 'bottle') {
          target = s.bottles.find((b) => b.id === entityId)?.bottleNumber ?? target
        } else if (entityType === 'site') {
          target = s.sites.find((x) => x.id === entityId)?.name ?? target
        } else if (entityType === 'unit') {
          target = s.units.find((u) => u.id === entityId)?.name ?? target
        } else if (entityType === 'job') {
          target = s.jobs.find((j) => j.id === entityId)?.reference ?? target
        } else if (entityType === 'transaction') {
          const t = s.transactions.find((x) => x.id === entityId)
          const bottleNo =
            t &&
            (s.bottles.find((b) => b.id === t.bottleId)?.bottleNumber ??
              t.bottleNumber)
          target = t
            ? `${transactionLabel(t.kind)}${bottleNo ? ` · ${bottleNo}` : ''}`
            : target
        }
        const noun = kind === 'signature' ? 'Customer signature' : 'Photo'
        const detail = descriptor?.trim() ? ` “${descriptor.trim()}”` : ''
        return {
          ...s,
          // AttachmentEntity ('bottle' | 'site' | 'unit' | 'transaction')
          // is a subset of AuditEntity, so it maps straight through.
          auditLog: withAudit(s, {
            action: 'delete',
            entity: entityType,
            entityId,
            target,
            summary: `${noun}${detail} removed`,
          }),
        }
      })
    },
    [],
  )

  const removeAttachment: StoreApi['removeAttachment'] = useCallback(
    async (attachmentId, entityType, entityId, kind, descriptor) => {
      const noun = kind === 'signature' ? 'a customer signature' : 'a photo'
      if (!ensureRole('supervisor', `Deleting ${noun}`)) return false
      await deleteAttachment(attachmentId)
      // Record the removal only after the blob is actually gone.
      logAttachmentRemoved(entityType, entityId, kind, descriptor)
      return true
    },
    [ensureRole, logAttachmentRemoved],
  )

  const addTechnician: StoreApi['addTechnician'] = useCallback((t) => {
    const tech: Technician = {
      ...t,
      firstName: t.firstName?.trim() || undefined,
      middleName: t.middleName?.trim() || undefined,
      lastName: t.lastName?.trim() || undefined,
      // Prefer the composed parts; fall back to a passed-in display name.
      name: composeName(t) || t.name.trim(),
      arcLicenceNumber: t.arcLicenceNumber.trim(),
      role: t.role ?? DEFAULT_TECHNICIAN_ROLE,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    setState((s) => ({
      ...s,
      technicians: [...s.technicians, tech],
      // First profile added becomes active automatically — saves a tap
      // for single-tech businesses, which is the common case today.
      activeTechnicianId: s.activeTechnicianId ?? tech.id,
      auditLog: withAudit(s, {
        action: 'create',
        entity: 'technician',
        entityId: tech.id,
        target: tech.name,
        summary: `Added technician ${tech.name}${
          tech.arcLicenceNumber
            ? ` · ${profileFor(s.jurisdiction).techLicenceShort} ${tech.arcLicenceNumber}`
            : ''
        }`,
      }),
    }))
    return tech
  }, [])

  const updateTechnician: StoreApi['updateTechnician'] = useCallback(
    (id, patch) => {
      // Data-layer gate mirroring the UI's rules (canManageTech /
      // canAssignRole): you may edit yourself, but a role change — yours
      // or anyone's — needs the right to assign that role, and editing
      // someone else needs manage rights over their tier. Without this,
      // one updateTechnician(myId, { role: 'owner' }) from any caller
      // would hand out full access.
      {
        const s = stateRef.current
        const target = s.technicians.find((t) => t.id === id)
        if (target && s.technicians.length > 0) {
          const actor = s.technicians.find(
            (t) => t.id === s.activeTechnicianId,
          )
          const self = !!actor && actor.id === id
          const roleChanging =
            patch.role !== undefined && patch.role !== target.role
          const ownerExists = s.technicians.some(
            (t) => t.role === 'owner' && isTechnicianActive(t),
          )
          const roleOk =
            !roleChanging || canAssignRole(actor?.role, patch.role!, ownerExists)
          const allowed = self
            ? roleOk
            : canManageTech(actor?.role, target.role) && roleOk
          if (!allowed) {
            toast.show(
              actor
                ? `Editing ${self ? 'your role' : `${target.name}'s account`} needs a higher access tier than ${roleInfo(actor.role).label}.`
                : `Editing ${target.name}'s account needs a signed-in profile with manager access.`,
              'error',
              6000,
            )
            return false
          }
        }
      }
      setState((s) => {
        const before = s.technicians.find((t) => t.id === id)
        const technicians = s.technicians.map((t) =>
          t.id === id
            ? {
                ...t,
                ...patch,
                name: (patch.name ?? t.name).trim(),
                arcLicenceNumber: (
                  patch.arcLicenceNumber ?? t.arcLicenceNumber
                ).trim(),
                updatedAt: new Date().toISOString(),
              }
            : t,
        )
        if (!before) return { ...s, technicians }
        // Diff name / RHL / role / name-parts, showing the role as its
        // readable label rather than the raw enum value.
        const labelled = diffFields(before, patch, TECH_FIELDS, {
          role: (v) => roleInfo(v as TechnicianRole | undefined).label,
        })
        // Note a password being set / changed / cleared — never the hash
        // itself. "Changed" distinguishes a new password over an existing
        // one (both hashes present but different) from first setting one.
        if ('passwordHash' in patch && patch.passwordHash !== before.passwordHash) {
          labelled.push({
            field: 'Password lock',
            from: before.passwordHash ? 'Set' : 'None',
            to: patch.passwordHash
              ? before.passwordHash
                ? 'Changed'
                : 'Set'
              : 'None',
          })
        }
        // Catch-all for any other changed field, but NEVER the raw
        // passwordHash (audited above as a state, not a value).
        const all = rawChanges(before, patch, ['passwordHash'])
        if (labelled.length === 0 && all.length === 0) return { ...s, technicians }
        const changes = labelled.length ? labelled : all
        return {
          ...s,
          technicians,
          auditLog: withAudit(s, {
            action: 'update',
            entity: 'technician',
            entityId: id,
            target: before.name,
            summary: `Edited technician ${before.name}`,
            changes,
          }),
        }
      })
      return true
    },
    [toast],
  )

  // True when removing/disabling `id` would leave the device with NO
  // usable supervisor-or-above profile. With ensureRole denying gated
  // actions to lower tiers and to the signed-out state, that device
  // would be permanently locked out of reactivating anyone, restoring
  // backups and every other manager action — an unrecoverable state a
  // single mis-tap must not be able to reach.
  const wouldOrphanDevice = useCallback((id: string): boolean => {
    const s = stateRef.current
    const target = s.technicians.find((t) => t.id === id)
    if (!target || !roleAtLeast(target.role, 'supervisor')) return false
    if (target.deactivatedAt || target.suspendedAt) return false
    return !s.technicians.some(
      (t) =>
        t.id !== id &&
        !t.deactivatedAt &&
        !t.suspendedAt &&
        roleAtLeast(t.role, 'supervisor'),
    )
  }, [])

  const deleteTechnician: StoreApi['deleteTechnician'] = useCallback((id) => {
    if (!ensureRole('supervisor', 'Removing a technician')) return
    if (wouldOrphanDevice(id)) {
      toast.show(
        'This is the last active supervisor/owner profile — appoint another manager before removing it, or the device locks itself out.',
        'error',
        8000,
      )
      return
    }
    setState((s) => {
      const before = s.technicians.find((t) => t.id === id)
      const remaining = s.technicians.filter((t) => t.id !== id)
      const nextActive =
        s.activeTechnicianId === id ? remaining[0]?.id : s.activeTechnicianId
      return {
        ...s,
        technicians: remaining,
        activeTechnicianId: nextActive,
        tombstones: [
          ...s.tombstones,
          { entity: 'technician' as const, id, at: new Date().toISOString() },
        ],
        recycleBin: before
          ? [
              makeBinEntry(s, 'technician', id, `Technician ${before.name}`, before),
              ...s.recycleBin,
            ]
          : s.recycleBin,
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'technician',
              entityId: id,
              target: before.name,
              summary: `Removed technician ${before.name} — their profile is recoverable from the recycle bin; logged work is retained`,
            })
          : s.auditLog,
      }
    })
  }, [ensureRole, wouldOrphanDevice, toast])

  const deactivateTechnician: StoreApi['deactivateTechnician'] = useCallback(
    (id) => {
      if (!ensureRole('supervisor', 'Deactivating a technician')) return
      if (wouldOrphanDevice(id)) {
        toast.show(
          'This is the last active supervisor/owner profile — appoint another manager before deactivating it, or the device locks itself out.',
          'error',
          8000,
        )
        return
      }
      setState((s) => {
        const target = s.technicians.find((t) => t.id === id)
        if (!target || target.deactivatedAt) return s
        const now = new Date().toISOString()
        const technicians = s.technicians.map((t) =>
          t.id === id ? { ...t, deactivatedAt: now, updatedAt: now } : t,
        )
        // Don't leave the deactivated profile in the seat — hand it to
        // the first profile that's still active, if any.
        const nextActive =
          s.activeTechnicianId === id
            ? technicians.find((t) => !t.deactivatedAt)?.id
            : s.activeTechnicianId
        return {
          ...s,
          technicians,
          activeTechnicianId: nextActive,
          auditLog: withAudit(s, {
            action: 'update',
            entity: 'technician',
            entityId: id,
            target: target.name,
            summary: `Deactivated technician ${target.name} — account disabled; if not reactivated within ${TECHNICIAN_PURGE_DAYS} days it will be deleted automatically. Their logged work is retained`,
          }),
        }
      })
    },
    [ensureRole, wouldOrphanDevice, toast],
  )

  const reactivateTechnician: StoreApi['reactivateTechnician'] = useCallback(
    (id) => {
      if (!ensureRole('supervisor', 'Reactivating a technician')) return
      setState((s) => {
        const target = s.technicians.find((t) => t.id === id)
        if (!target || !target.deactivatedAt) return s
        const now = new Date().toISOString()
        return {
          ...s,
          technicians: s.technicians.map((t) =>
            t.id === id ? { ...t, deactivatedAt: undefined, updatedAt: now } : t,
          ),
          auditLog: withAudit(s, {
            action: 'update',
            entity: 'technician',
            entityId: id,
            target: target.name,
            summary: `Reactivated technician ${target.name}`,
          }),
        }
      })
    },
    [ensureRole],
  )

  const suspendTechnician: StoreApi['suspendTechnician'] = useCallback((id) => {
    if (!ensureRole('supervisor', 'Suspending a technician')) return
    if (wouldOrphanDevice(id)) {
      toast.show(
        'This is the last active supervisor/owner profile — appoint another manager before suspending it, or the device locks itself out.',
        'error',
        8000,
      )
      return
    }
    setState((s) => {
      const target = s.technicians.find((t) => t.id === id)
      if (!target || target.suspendedAt) return s
      const now = new Date().toISOString()
      // Don't leave a suspended profile in the active seat — hand it to the
      // first profile that's still usable.
      const nextActive =
        s.activeTechnicianId === id
          ? s.technicians.find(
              (t) => t.id !== id && !t.deactivatedAt && !t.suspendedAt,
            )?.id
          : s.activeTechnicianId
      return {
        ...s,
        activeTechnicianId: nextActive,
        technicians: s.technicians.map((t) =>
          t.id === id ? { ...t, suspendedAt: now, updatedAt: now } : t,
        ),
        auditLog: withAudit(s, {
          action: 'update',
          entity: 'technician',
          entityId: id,
          target: target.name,
          summary: `Suspended technician ${target.name} — locked until a manager lifts it`,
        }),
      }
    })
  }, [ensureRole, wouldOrphanDevice, toast])

  const unsuspendTechnician: StoreApi['unsuspendTechnician'] = useCallback(
    (id) => {
      if (!ensureRole('supervisor', 'Lifting a suspension')) return
      setState((s) => {
        const target = s.technicians.find((t) => t.id === id)
        if (!target || !target.suspendedAt) return s
        const now = new Date().toISOString()
        return {
          ...s,
          technicians: s.technicians.map((t) =>
            t.id === id ? { ...t, suspendedAt: undefined, updatedAt: now } : t,
          ),
          auditLog: withAudit(s, {
            action: 'update',
            entity: 'technician',
            entityId: id,
            target: target.name,
            summary: `Lifted suspension on technician ${target.name}`,
          }),
        }
      })
    },
    [ensureRole],
  )

  // Switching the active profile on a shared device is itself an audited
  // event — on a multi-tech crew it's the record of who was in the seat,
  // and so who every later transaction/change is attributed to. The
  // password lock (PasswordPromptModal) guards the switch in the UI; this
  // logs the switch that results.
  const setActiveTechnicianId: StoreApi['setActiveTechnicianId'] = useCallback(
    (id) =>
      setState((s) => {
        if (s.activeTechnicianId === id) return s
        const to = s.technicians.find((t) => t.id === id)
        const from = s.technicians.find((t) => t.id === s.activeTechnicianId)
        return {
          ...s,
          activeTechnicianId: id,
          auditLog: withAudit(s, {
            action: 'settings',
            entity: 'technician',
            entityId: id,
            target: to?.name ?? '(signed out)',
            summary: to
              ? `Switched the active profile to ${to.name}${
                  to.role ? ` (${roleInfo(to.role).label})` : ''
                }`
              : `Signed out${from ? ` of ${from.name}` : ''}`,
          }),
        }
      }),
    [],
  )

  const completeSetup: StoreApi['completeSetup'] = useCallback((data) => {
    setState((s) => {
      const now = new Date().toISOString()
      const tech: Technician = {
        id: uid(),
        firstName: data.technician.firstName.trim(),
        middleName: data.technician.middleName?.trim() || undefined,
        lastName: data.technician.lastName.trim(),
        // Lowercased so sign-in lookups are case-insensitive.
        username: data.technician.username?.trim().toLowerCase() || undefined,
        name: composeName(data.technician),
        arcLicenceNumber: data.technician.arcLicenceNumber.trim(),
        licenceExpiry: data.technician.licenceExpiry || undefined,
        // Setup requires the licence self-declaration before completeSetup
        // is called, so stamp when it was made.
        licenceDeclaredAt: now,
        passwordHash: data.technician.passwordHash,
        // Top authority for the install — owner, or supervisor for an org
        // whose owner won't use the app. Chosen on the setup screen.
        role: data.technician.role,
        createdAt: now,
      }
      // Build the audit entries by hand: withAudit() would attribute
      // them to the *previous* active tech (none, on a fresh install).
      // The tech we're creating right now is the one in the seat, so we
      // stamp the trail with them.
      const by = tech.name || undefined
      const byLicence = tech.arcLicenceNumber || undefined
      const mk = (
        e: Omit<AuditEntry, 'id' | 'at' | 'by' | 'byLicence'>,
      ): AuditEntry => ({
        ...e,
        id: uid(),
        at: now,
        by,
        byLicence,
        tz: deviceTimeZone() || s.location.timezone || undefined,
        // Same origin stamping as withAudit — only this device may seal.
        origin: deviceChainId(),
      })
      const entries: AuditEntry[] = [
        mk({
          action: 'settings',
          entity: 'settings',
          target: 'First-time setup',
          summary: `Completed first-time setup for ${
            data.businessName.trim() || '(unnamed business)'
          }`,
        }),
        // Acceptance record: who (entityId = the User ID), when (at = now),
        // and which policy version. IP is captured server-side once the
        // backend lands — it can't be obtained reliably/privately client-side.
        mk({
          action: 'settings',
          entity: 'settings',
          entityId: tech.id,
          target: 'Policy acceptance',
          summary: `Accepted the Terms of Use, Privacy Policy, Acceptable Use Policy, Billing & Refund Policy and all other Refrigister policies (version ${TERMS_VERSION})`,
        }),
        mk({
          action: 'create',
          entity: 'technician',
          entityId: tech.id,
          target: tech.name,
          summary: `Added technician ${tech.name}${
            tech.arcLicenceNumber
              ? ` · ${profileFor(data.jurisdiction).techLicenceShort} ${tech.arcLicenceNumber}`
              : ''
          }`,
        }),
      ]
      return {
        ...s,
        businessName: data.businessName.trim(),
        businessAbn: data.businessAbn.trim(),
        arcAuthorisationNumber: data.arcAuthorisationNumber.trim(),
        arcAuthorisationExpiry: data.arcAuthorisationExpiry.trim(),
        jurisdiction: data.jurisdiction,
        location: data.location,
        technicians: [...s.technicians, tech],
        activeTechnicianId: s.activeTechnicianId ?? tech.id,
        setupCompletedAt: now,
        termsAcceptedAt: now,
        termsAcceptedVersion: TERMS_VERSION,
        settingsUpdatedAt: now,
        // First-run writes every settings field at once — stamp them all.
        settingsFieldsUpdatedAt: Object.fromEntries(
          SYNCED_SETTINGS_FIELDS.map((f) => [f, now]),
        ),
        auditLog: [...entries, ...s.auditLog],
      }
    })
  }, [])

  // Settings setters share one shape: update a single field, and record
  // a 'settings' audit entry with a before/after — but only when the
  // value actually changed, so opening and closing a form doesn't spam
  // the history.
  // Bump the block-level stamp AND the per-field stamp for `field`, so the
  // sync merge can resolve each settings field independently (see
  // lib/merge.ts). Spread into a settings-setter's new state.
  function settingsStamp(
    s: AppState,
    field: string,
  ): Pick<AppState, 'settingsUpdatedAt' | 'settingsFieldsUpdatedAt'> {
    const now = new Date().toISOString()
    return {
      settingsUpdatedAt: now,
      settingsFieldsUpdatedAt: {
        ...(s.settingsFieldsUpdatedAt ?? {}),
        [field]: now,
      },
    }
  }

  function settingsChange(
    s: AppState,
    label: string,
    from: string,
    to: string,
  ): AuditEntry[] {
    return withAudit(s, {
      action: 'settings',
      entity: 'settings',
      target: label,
      summary: `${label}: ${from || '—'} → ${to || '—'}`,
      changes: [{ field: label, from: from || '—', to: to || '—' }],
    })
  }

  const setTechnician = useCallback(
    (name: string) =>
      setState((s) =>
        s.technician === name
          ? s
          : {
              ...s,
              technician: name,
              ...settingsStamp(s, 'technician'),
              auditLog: settingsChange(s, 'Default technician', s.technician, name),
            },
      ),
    [],
  )

  const setArcLicenceNumber = useCallback(
    (n: string) =>
      setState((s) =>
        s.arcLicenceNumber === n.trim()
          ? s
          : {
              ...s,
              arcLicenceNumber: n.trim(),
              ...settingsStamp(s, 'arcLicenceNumber'),
              auditLog: settingsChange(s, 'RHL licence', s.arcLicenceNumber, n.trim()),
            },
      ),
    [],
  )

  const setArcAuthorisationNumber = useCallback(
    (n: string) => {
      if (!ensureRole('supervisor', 'Editing the RTA')) return
      setState((s) =>
        s.arcAuthorisationNumber === n.trim()
          ? s
          : {
              ...s,
              arcAuthorisationNumber: n.trim(),
              ...settingsStamp(s, 'arcAuthorisationNumber'),
              auditLog: settingsChange(
                s,
                'ARC authorisation (RTA)',
                s.arcAuthorisationNumber,
                n.trim(),
              ),
            },
      )
    },
    [ensureRole],
  )

  const setArcAuthorisationExpiry = useCallback(
    (d: string) => {
      if (!ensureRole('supervisor', 'Editing the RTA expiry')) return
      setState((s) =>
        s.arcAuthorisationExpiry === d.trim()
          ? s
          : {
              ...s,
              arcAuthorisationExpiry: d.trim(),
              ...settingsStamp(s, 'arcAuthorisationExpiry'),
              auditLog: settingsChange(
                s,
                'RTA expiry',
                s.arcAuthorisationExpiry,
                d.trim(),
              ),
            },
      )
    },
    [ensureRole],
  )

  const setBusinessName = useCallback(
    (n: string) => {
      if (!ensureRole('supervisor', 'Editing the business name')) return
      setState((s) =>
        s.businessName === n.trim()
          ? s
          : {
              ...s,
              businessName: n.trim(),
              ...settingsStamp(s, 'businessName'),
              auditLog: settingsChange(s, 'Business name', s.businessName, n.trim()),
            },
      )
    },
    [ensureRole],
  )

  const setBusinessAbn = useCallback(
    (n: string) => {
      if (!ensureRole('supervisor', 'Editing the ABN')) return
      setState((s) =>
        s.businessAbn === n.trim()
          ? s
          : {
              ...s,
              businessAbn: n.trim(),
              ...settingsStamp(s, 'businessAbn'),
              auditLog: settingsChange(s, 'Business ABN', s.businessAbn, n.trim()),
            },
      )
    },
    [ensureRole],
  )

  const acceptTerms = useCallback(() => {
    const now = new Date().toISOString()
    setState((s) => ({
      ...s,
      termsAcceptedAt: now,
      termsAcceptedVersion: TERMS_VERSION,
      settingsUpdatedAt: now,
      // Record the re-acceptance in the change log — who/when/version — so
      // the policy-acceptance trail isn't only captured at first-run setup.
      auditLog: withAudit(s, {
        action: 'settings',
        entity: 'settings',
        target: 'Policy acceptance',
        summary: `Re-accepted the Refrigister policies (version ${TERMS_VERSION})`,
      }),
    }))
  }, [])

  const saveRiskPlan: StoreApi['saveRiskPlan'] = useCallback(
    (items, markReviewed) => {
      setState((s) => {
        const now = new Date().toISOString()
        const activeTech = s.technicians.find(
          (t) => t.id === s.activeTechnicianId,
        )
        const doneCount = Object.values(items).filter((i) => i.done).length
        const plan: RiskPlan = {
          items,
          reviewedAt: markReviewed ? now : s.riskPlan?.reviewedAt,
          reviewedBy: markReviewed
            ? activeTech?.name ?? (s.technician || undefined)
            : s.riskPlan?.reviewedBy,
          updatedAt: now,
        }
        return {
          ...s,
          riskPlan: plan,
          auditLog: withAudit(s, {
            action: 'settings',
            entity: 'settings',
            target: 'Risk management plan',
            summary: `Risk management plan ${markReviewed ? 'reviewed' : 'updated'} — ${doneCount}/${RISK_PLAN_ITEMS.length} items in place`,
          }),
        }
      })
    },
    [],
  )

  const requestAccountClosure: StoreApi['requestAccountClosure'] = useCallback(
    (req) => {
      if (!ensureRole('owner', 'Closing the account')) return
      setState((s) => {
        if (s.accountClosure) return s // already closed
        const now = new Date().toISOString()
        const closure: AccountClosure = {
          requestedAt: now,
          reason: req.reason,
          details: req.details?.trim() || undefined,
          contactName: req.contactName.trim(),
          contactEmail: req.contactEmail?.trim() || undefined,
          contactPhone: req.contactPhone?.trim() || undefined,
          businessName: s.businessName,
          businessAbn: s.businessAbn,
          arcAuthorisationNumber: s.arcAuthorisationNumber,
        }
        return {
          ...s,
          accountClosure: closure,
          // Log out — no active seat while the account is closed.
          activeTechnicianId: undefined,
          settingsUpdatedAt: now,
          auditLog: withAudit(s, {
            action: 'settings',
            entity: 'settings',
            target: 'Account closure',
            summary: `Account closure requested — ${req.reason}`,
          }),
        }
      })
    },
    [ensureRole],
  )

  const resetToFreshInstall: StoreApi['resetToFreshInstall'] = useCallback(() => {
    // Replace the whole dataset with a clean slate. With setupCompletedAt
    // cleared (and accountClosure gone) the gates fall back to the
    // first-run account-creation screen on the next render. This DOES wipe
    // the on-device change log too (EMPTY_STATE.auditLog is empty) — it's
    // only reached at account closure, by which point the business has
    // already been handed its full records ZIP. (The change log is
    // never-edit/never-delete entry-by-entry; closing the account is the
    // one all-or-nothing exception, and it's after export.)
    setState(() => ({ ...EMPTY_STATE }))
    // Clear the audit-chain high-water mark — a fresh install starts a
    // new chain, so the old head must not flag the empty log as truncated.
    rebaseChainHead(EMPTY_STATE.auditLog)
  }, [])

  const startDemo: StoreApi['startDemo'] = useCallback(() => {
    const now = new Date().toISOString()
    setState(() => ({
      ...EMPTY_STATE,
      ...buildDemoState(now),
      demoStartedAt: now,
    }))
  }, [])

  const exitDemo: StoreApi['exitDemo'] = useCallback(() => {
    // Leaving demo discards the sample data and returns to the setup
    // screen (setupCompletedAt stays unset, demoStartedAt cleared).
    setState(() => ({ ...EMPTY_STATE }))
    rebaseChainHead(EMPTY_STATE.auditLog)
  }, [])

  const setLocation = useCallback(
    (location: LocationSettings) =>
      setState((s) => {
        const fmt = (l: LocationSettings) =>
          [l.country, l.region, l.city, l.timezone].filter(Boolean).join(', ')
        const from = fmt(s.location)
        const to = fmt(location)
        if (from === to) return { ...s, location }
        return {
          ...s,
          location,
          ...settingsStamp(s, 'location'),
          auditLog: settingsChange(s, 'Location', from, to),
        }
      }),
    [],
  )

  const setUnit = useCallback(
    (unit: WeightUnit) =>
      setState((s) =>
        s.unit === unit
          ? s
          : { ...s, unit, ...settingsStamp(s, 'unit'),
              auditLog: settingsChange(s, 'Weight unit', s.unit, unit) },
      ),
    [],
  )

  const setTheme = useCallback(
    (theme: Theme) =>
      setState((s) =>
        s.theme === theme
          ? s
          : { ...s, theme, ...settingsStamp(s, 'theme'),
              auditLog: settingsChange(s, 'Theme', s.theme, theme) },
      ),
    [],
  )

  const setClock = useCallback(
    (clock: ClockFormat) =>
      setState((s) =>
        s.clock === clock
          ? s
          : {
              ...s,
              clock,
              ...settingsStamp(s, 'clock'),
              auditLog: settingsChange(s, 'Clock format', s.clock, clock),
            },
      ),
    [],
  )

  const setSyncSettings = useCallback(
    (sync: SyncSettings) =>
      setState((s) => {
        const fmt = (x: SyncSettings) =>
          `${x.enabled ? 'on' : 'off'}${x.teamId ? ` · team ${x.teamId}` : ''}`
        const from = fmt(s.sync)
        const to = fmt(sync)
        if (from === to) return { ...s, sync }
        // Note: no settingsUpdatedAt stamp — the sync switch is a
        // per-device choice and must not claim the shared settings
        // block (business identity, location…) as newer.
        return { ...s, sync, auditLog: settingsChange(s, 'Cloud sync', from, to) }
      }),
    [],
  )

  const addCustomRefrigerant = useCallback((name: string) => {
    const trimmed = name.trim().toUpperCase()
    if (!trimmed) return
    setState((s) =>
      s.customRefrigerants.includes(trimmed)
        ? s
        : {
            ...s,
            customRefrigerants: [...s.customRefrigerants, trimmed],
            auditLog: withAudit(s, {
              action: 'create',
              entity: 'refrigerant',
              target: trimmed,
              summary: `Added custom refrigerant ${trimmed}`,
            }),
          },
    )
  }, [])

  const removeCustomRefrigerant = useCallback((name: string) => {
    setState((s) =>
      s.customRefrigerants.includes(name)
        ? {
            ...s,
            customRefrigerants: s.customRefrigerants.filter((r) => r !== name),
            favoriteRefrigerants: s.favoriteRefrigerants.filter((r) => r !== name),
            tombstones: [
              ...s.tombstones,
              {
                entity: 'refrigerant' as const,
                id: name,
                at: new Date().toISOString(),
              },
            ],
            recycleBin: [
              makeBinEntry(s, 'refrigerant', name, `Refrigerant ${name}`, name),
              ...s.recycleBin,
            ],
            auditLog: withAudit(s, {
              action: 'delete',
              entity: 'refrigerant',
              target: name,
              summary: `Removed custom refrigerant ${name}`,
            }),
          }
        : s,
    )
  }, [])

  const toggleFavoriteRefrigerant = useCallback((name: string) => {
    setState((s) => {
      const on = !s.favoriteRefrigerants.includes(name)
      return {
        ...s,
        favoriteRefrigerants: on
          ? [...s.favoriteRefrigerants, name]
          : s.favoriteRefrigerants.filter((r) => r !== name),
        auditLog: withAudit(s, {
          action: 'settings',
          entity: 'refrigerant',
          target: name,
          summary: `${on ? 'Favourited' : 'Unfavourited'} refrigerant ${name}`,
        }),
      }
    })
  }, [])

  const addCustomBottlePreset: StoreApi['addCustomBottlePreset'] = useCallback(
    (p) => {
      const preset: BottlePreset = { ...p, id: uid(), custom: true }
      setState((s) => ({
        ...s,
        customBottlePresets: [...s.customBottlePresets, preset],
        auditLog: withAudit(s, {
          action: 'create',
          entity: 'preset',
          entityId: preset.id,
          target: preset.label,
          summary: `Added bottle preset ${preset.label}`,
        }),
      }))
      return preset
    },
    [],
  )

  const removeCustomBottlePreset = useCallback((id: string) => {
    setState((s) => {
      const before = s.customBottlePresets.find((p) => p.id === id)
      return {
        ...s,
        customBottlePresets: s.customBottlePresets.filter((p) => p.id !== id),
        favoriteBottlePresets: s.favoriteBottlePresets.filter((x) => x !== id),
        tombstones: [
          ...s.tombstones,
          { entity: 'preset' as const, id, at: new Date().toISOString() },
        ],
        recycleBin: before
          ? [
              makeBinEntry(s, 'preset', id, `Bottle preset ${before.label}`, before),
              ...s.recycleBin,
            ]
          : s.recycleBin,
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'preset',
              entityId: id,
              target: before.label,
              summary: `Removed bottle preset ${before.label}`,
            })
          : s.auditLog,
      }
    })
  }, [])

  const toggleFavoriteBottlePreset = useCallback((id: string) => {
    setState((s) => {
      const on = !s.favoriteBottlePresets.includes(id)
      const label =
        s.customBottlePresets.find((p) => p.id === id)?.label ?? id
      return {
        ...s,
        favoriteBottlePresets: on
          ? [...s.favoriteBottlePresets, id]
          : s.favoriteBottlePresets.filter((x) => x !== id),
        auditLog: withAudit(s, {
          action: 'settings',
          entity: 'preset',
          entityId: id,
          target: label,
          summary: `${on ? 'Favourited' : 'Unfavourited'} bottle preset ${label}`,
        }),
      }
    })
  }, [])

  const importState = useCallback((nextRaw: AppState) => {
    if (!ensureRole('supervisor', 'Importing a backup')) return false
    // Importing replaces the whole dataset (a restore-from-backup). We
    // keep the imported file's own history and prepend an 'import' entry
    // so the join point is visible in the trail. The file runs through
    // the same normalization as a local load so an old backup can't
    // land with missing arrays.
    const next = normalizeState(nextRaw)
    // Re-baseline the chain head to the restored file: we trust an imported
    // backup wholesale, so its (possibly shorter) chain must not read as
    // truncation. The 'import' entry added below is sealed afterwards and
    // raises the head from this new baseline.
    rebaseChainHead(next.auditLog)
    setState(() => ({
      ...next,
      // Import is only reachable from inside the app (past the gate). An
      // older backup may predate setupCompletedAt — stamp it so a restore
      // doesn't bounce the user back into onboarding.
      setupCompletedAt: next.setupCompletedAt ?? new Date().toISOString(),
      // A restore deliberately replaces the dataset — the watermark
      // stops the sync merge re-adding records that the restored
      // snapshot doesn't contain (see lib/merge.ts).
      dataResetAt: new Date().toISOString(),
      auditLog: withAudit(next, {
        action: 'import',
        entity: 'data',
        target: 'All data',
        summary: 'Imported data from a backup file',
      }),
    }))
    return true
  }, [ensureRole])

  const api = useMemo<StoreApi>(
    () => ({
      state,
      addBottle,
      updateBottle,
      deleteBottle,
      addSite,
      updateSite,
      deleteSite,
      addUnit,
      updateUnit,
      deleteUnit,
      decommissionUnit,
      reactivateUnit,
      addJob,
      updateJob,
      setJobStatus,
      deleteJob,
      addTransaction,
      deleteTransaction,
      restoreTransaction,
      restoreFromRecycleBin,
      logAttachmentRemoved,
      removeAttachment,
      addTechnician,
      updateTechnician,
      deactivateTechnician,
      reactivateTechnician,
      suspendTechnician,
      unsuspendTechnician,
      deleteTechnician,
      setActiveTechnicianId,
      completeSetup,
      setTechnician,
      setArcLicenceNumber,
      setArcAuthorisationNumber,
      setArcAuthorisationExpiry,
      setBusinessName,
      setBusinessAbn,
      requestAccountClosure,
      resetToFreshInstall,
      startDemo,
      exitDemo,
      acceptTerms,
      saveRiskPlan,
      setLocation,
      setUnit,
      setTheme,
      setClock,
      setSyncSettings,
      addCustomRefrigerant,
      removeCustomRefrigerant,
      toggleFavoriteRefrigerant,
      addCustomBottlePreset,
      removeCustomBottlePreset,
      toggleFavoriteBottlePreset,
      importState,
    }),
    [
      state,
      addBottle,
      updateBottle,
      deleteBottle,
      addSite,
      updateSite,
      deleteSite,
      addUnit,
      updateUnit,
      deleteUnit,
      decommissionUnit,
      reactivateUnit,
      addJob,
      updateJob,
      setJobStatus,
      deleteJob,
      addTransaction,
      deleteTransaction,
      restoreTransaction,
      restoreFromRecycleBin,
      logAttachmentRemoved,
      removeAttachment,
      addTechnician,
      updateTechnician,
      deactivateTechnician,
      reactivateTechnician,
      suspendTechnician,
      unsuspendTechnician,
      deleteTechnician,
      setActiveTechnicianId,
      completeSetup,
      setTechnician,
      setArcLicenceNumber,
      setArcAuthorisationNumber,
      setArcAuthorisationExpiry,
      setBusinessName,
      setBusinessAbn,
      requestAccountClosure,
      resetToFreshInstall,
      startDemo,
      exitDemo,
      acceptTerms,
      saveRiskPlan,
      setLocation,
      setUnit,
      setTheme,
      setClock,
      setSyncSettings,
      addCustomRefrigerant,
      removeCustomRefrigerant,
      toggleFavoriteRefrigerant,
      addCustomBottlePreset,
      removeCustomBottlePreset,
      toggleFavoriteBottlePreset,
      importState,
    ],
  )

  return <StoreContext.Provider value={api}>{children}</StoreContext.Provider>
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}
