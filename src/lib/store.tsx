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
  type Site,
  type SyncSettings,
  type Technician,
  type TechnicianRole,
  type Theme,
  type Transaction,
  type Unit,
  type WeightUnit,
  EMPTY_STATE,
  transactionLabel,
  composeName,
  DEFAULT_TECHNICIAN_ROLE,
  TECHNICIAN_PURGE_DAYS,
  TERMS_VERSION,
  daysUntilPurge,
} from './types'
import {
  BOTTLE_FIELDS,
  SITE_FIELDS,
  TECH_FIELDS,
  UNIT_FIELDS,
  diffFields,
} from './audit'
import {
  loadState,
  normalizeState,
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
import { sealAuditLog } from './auditChain'
import { profileFor } from './compliance'
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
  }
  return [entry, ...s.auditLog]
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
  // transactions
  addTransaction: (
    t: Omit<Transaction, 'id' | 'weightBefore' | 'weightAfter'>,
  ) => Transaction | null
  // Soft-delete: hides the row from normal views but keeps it in
  // storage so an admin / business owner can audit what was removed
  // and restore it if the deletion was a mistake. Bottle weight is
  // NOT reverted (matches the previous hard-delete behaviour).
  deleteTransaction: (id: string, reason?: string) => void
  // technician profiles
  addTechnician: (t: Omit<Technician, 'id' | 'createdAt'>) => Technician
  updateTechnician: (id: string, patch: Partial<Technician>) => void
  // Soft-disable a profile (a tech who left). Kept for the retention
  // window, then purged. Reassigns the active seat if needed.
  deactivateTechnician: (id: string) => void
  reactivateTechnician: (id: string) => void
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
  // Re-accept the Terms after a version bump (see TermsGate).
  acceptTerms: () => void
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
  // bulk
  importState: (s: AppState) => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  // Run loadState exactly once per provider mount. The lazy useState
  // initializer is the React-blessed place to do this work; we capture
  // the corruption flag on the side via useState rather than a ref so
  // we never read a ref during render.
  const [{ state: initialState, status: initialStatus }] = useState(loadState)
  const [state, setState] = useState<AppState>(initialState)

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
              summary: `Auto-deleted technician ${t.name} after ${TECHNICIAN_PURGE_DAYS}-day retention; their logged work is retained`,
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
          auditLog,
        }
      })
    })
    return () => {
      cancelled = true
    }
  }, [state.technicians])

  const lastPushedRef = useRef<string>('')
  const remoteApplyRef = useRef(false)
  // Latest state, readable from sync callbacks without re-subscribing
  // the realtime channel on every keystroke.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

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
    pullState(state.sync.teamId).then((remote) => {
      if (!cancelled && remote) applyRemote(remote)
    })
    const unsub = subscribeToState(state.sync.teamId, (remote) => {
      applyRemote(remote)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [state.sync.enabled, state.sync.teamId, applyRemote])

  useEffect(() => {
    if (!isSyncConfigured()) return
    if (!state.sync.enabled || !state.sync.teamId) return
    if (remoteApplyRef.current) {
      remoteApplyRef.current = false
      return
    }
    const serialized = JSON.stringify(state)
    if (serialized === lastPushedRef.current) return
    lastPushedRef.current = serialized
    const handle = setTimeout(() => {
      void pushState(state.sync.teamId, state)
    }, 800)
    return () => clearTimeout(handle)
  }, [state])

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
      const changes = diffFields(before, patch, BOTTLE_FIELDS, {
        currentSiteId: siteName,
        // Audit the retest flag as a readable state, not a raw timestamp.
        sentForRetestAt: (v) => (v ? 'Sent for retest' : 'Not sent'),
      })
      // No tracked field changed (e.g. form saved untouched) — don't
      // clutter the history with an empty edit.
      if (changes.length === 0) return { ...s, bottles }
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
    setState((s) => {
      const before = s.bottles.find((b) => b.id === id)
      const activeTech = s.technicians.find(
        (x) => x.id === s.activeTechnicianId,
      )
      const now = new Date().toISOString()
      // The bottle row is removed, but its refrigerant log entries are
      // PRESERVED for the audit trail — soft-deleted rather than purged,
      // so the trail isn't broken when a cylinder is retired. We stamp
      // the bottle number into deletedReason so the rows still identify
      // their cylinder in the export once the bottle record is gone.
      // Rows already soft-deleted keep their original reason untouched.
      const transactions = s.transactions.map((t) =>
        t.bottleId === id && !t.deletedAt
          ? {
              ...t,
              deletedAt: now,
              deletedBy: activeTech?.name || s.technician || undefined,
              deletedByLicence:
                activeTech?.arcLicenceNumber || s.arcLicenceNumber || undefined,
              deletedReason: before
                ? `Bottle ${before.bottleNumber} deleted`
                : 'Bottle deleted',
            }
          : t,
      )
      return {
        ...s,
        bottles: s.bottles.filter((b) => b.id !== id),
        transactions,
        // Tombstone so a sync with a device that still holds this
        // bottle doesn't resurrect it (see lib/merge.ts).
        tombstones: [...s.tombstones, { entity: 'bottle' as const, id, at: now }],
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'bottle',
              entityId: id,
              target: before.bottleNumber,
              summary: `Removed bottle ${before.bottleNumber} — its log entries are kept (soft-deleted) for the audit trail`,
            })
          : s.auditLog,
      }
    })
  }, [])

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
      const changes = diffFields(before, patch, SITE_FIELDS)
      if (changes.length === 0) return { ...s, sites }
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
    setState((s) => {
      const before = s.sites.find((x) => x.id === id)
      // Deleting a site (and its units) must not rewrite history: every
      // transaction that referenced it gets the site/unit NAME frozen on
      // the row before the link is cleared, so logbooks and exports keep
      // saying where the work happened.
      const deletedUnitNames = new Map(
        s.units.filter((u) => u.siteId === id).map((u) => [u.id, u.name]),
      )
      const now = new Date().toISOString()
      return {
        ...s,
        sites: s.sites.filter((x) => x.id !== id),
        units: s.units.filter((u) => u.siteId !== id),
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
          b.currentSiteId === id ? { ...b, currentSiteId: undefined } : b,
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
              summary: `Removed site ${before.name} — its units were deleted; past log entries keep the site/unit names frozen on the record`,
            })
          : s.auditLog,
      }
    })
  }, [])

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
      const changes = diffFields(before, patch, UNIT_FIELDS)
      if (changes.length === 0) return { ...s, units }
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
    setState((s) => {
      const before = s.units.find((u) => u.id === id)
      return {
        ...s,
        units: s.units.filter((u) => u.id !== id),
        tombstones: [
          ...s.tombstones,
          { entity: 'unit' as const, id, at: new Date().toISOString() },
        ],
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
              summary: `Removed unit ${before.name}`,
            })
          : s.auditLog,
      }
    })
  }, [])

  const decommissionUnit: StoreApi['decommissionUnit'] = useCallback(
    (id, reason) => {
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
    [],
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

  const addTransaction: StoreApi['addTransaction'] = useCallback((t) => {
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
      // transfer / return don't change weight
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
      } else if (t.kind === 'return') {
        updatedBottle.currentSiteId = undefined
        updatedBottle.status = 'returned'
      }
      const net = Math.max(0, updatedBottle.grossWeight - updatedBottle.tareWeight)
      if (net <= 0.01 && updatedBottle.status !== 'returned') {
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
        if (srcNet <= 0.01 && sourceUpdated.status !== 'returned') {
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
  }, [])

  const deleteTransaction: StoreApi['deleteTransaction'] = useCallback(
    (id, reason) => {
      setState((s) => {
        const activeTech = s.technicians.find(
          (x) => x.id === s.activeTechnicianId,
        )
        const now = new Date().toISOString()
        const target = s.transactions.find((t) => t.id === id)
        const bottleNo =
          s.bottles.find((b) => b.id === target?.bottleId)?.bottleNumber ??
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
    [],
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
        // Diff name/RHL; also note a password being set/cleared without
        // ever putting the hash itself in the trail.
        const changes = diffFields(before, patch, TECH_FIELDS)
        if ('passwordHash' in patch && patch.passwordHash !== before.passwordHash) {
          changes.push({
            field: 'Password lock',
            from: before.passwordHash ? 'Set' : 'None',
            to: patch.passwordHash ? 'Set' : 'None',
          })
        }
        if (changes.length === 0) return { ...s, technicians }
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
    },
    [],
  )

  const deleteTechnician: StoreApi['deleteTechnician'] = useCallback((id) => {
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
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'technician',
              entityId: id,
              target: before.name,
              summary: `Removed technician ${before.name}`,
            })
          : s.auditLog,
      }
    })
  }, [])

  const deactivateTechnician: StoreApi['deactivateTechnician'] = useCallback(
    (id) => {
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
            summary: `Deactivated technician ${target.name} — kept ${TECHNICIAN_PURGE_DAYS} days, then deleted; their logged work is retained`,
          }),
        }
      })
    },
    [],
  )

  const reactivateTechnician: StoreApi['reactivateTechnician'] = useCallback(
    (id) => {
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
    [],
  )

  const setActiveTechnicianId: StoreApi['setActiveTechnicianId'] = useCallback(
    (id) => setState((s) => ({ ...s, activeTechnicianId: id })),
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
          summary: `Accepted the Terms of Use, Privacy Policy, Acceptable Use Policy, Billing & Refund Policy and all other RefrigHandle policies (version ${TERMS_VERSION})`,
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
        auditLog: [...entries, ...s.auditLog],
      }
    })
  }, [])

  // Settings setters share one shape: update a single field, and record
  // a 'settings' audit entry with a before/after — but only when the
  // value actually changed, so opening and closing a form doesn't spam
  // the history.
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
              settingsUpdatedAt: new Date().toISOString(),
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
              settingsUpdatedAt: new Date().toISOString(),
              auditLog: settingsChange(s, 'RHL licence', s.arcLicenceNumber, n.trim()),
            },
      ),
    [],
  )

  const setArcAuthorisationNumber = useCallback(
    (n: string) =>
      setState((s) =>
        s.arcAuthorisationNumber === n.trim()
          ? s
          : {
              ...s,
              arcAuthorisationNumber: n.trim(),
              settingsUpdatedAt: new Date().toISOString(),
              auditLog: settingsChange(
                s,
                'ARC authorisation (RTA)',
                s.arcAuthorisationNumber,
                n.trim(),
              ),
            },
      ),
    [],
  )

  const setArcAuthorisationExpiry = useCallback(
    (d: string) =>
      setState((s) =>
        s.arcAuthorisationExpiry === d.trim()
          ? s
          : {
              ...s,
              arcAuthorisationExpiry: d.trim(),
              settingsUpdatedAt: new Date().toISOString(),
              auditLog: settingsChange(
                s,
                'RTA expiry',
                s.arcAuthorisationExpiry,
                d.trim(),
              ),
            },
      ),
    [],
  )

  const setBusinessName = useCallback(
    (n: string) =>
      setState((s) =>
        s.businessName === n.trim()
          ? s
          : {
              ...s,
              businessName: n.trim(),
              settingsUpdatedAt: new Date().toISOString(),
              auditLog: settingsChange(s, 'Business name', s.businessName, n.trim()),
            },
      ),
    [],
  )

  const setBusinessAbn = useCallback(
    (n: string) =>
      setState((s) =>
        s.businessAbn === n.trim()
          ? s
          : {
              ...s,
              businessAbn: n.trim(),
              settingsUpdatedAt: new Date().toISOString(),
              auditLog: settingsChange(s, 'Business ABN', s.businessAbn, n.trim()),
            },
      ),
    [],
  )

  const acceptTerms = useCallback(() => {
    const now = new Date().toISOString()
    setState((s) => ({
      ...s,
      termsAcceptedAt: now,
      termsAcceptedVersion: TERMS_VERSION,
      settingsUpdatedAt: now,
    }))
  }, [])

  const requestAccountClosure: StoreApi['requestAccountClosure'] = useCallback(
    (req) => {
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
    [],
  )

  const resetToFreshInstall: StoreApi['resetToFreshInstall'] = useCallback(() => {
    // Replace the whole dataset with a clean slate. With setupCompletedAt
    // cleared (and accountClosure gone) the gates fall back to the
    // first-run account-creation screen on the next render.
    setState(() => ({ ...EMPTY_STATE }))
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
          settingsUpdatedAt: new Date().toISOString(),
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
          : { ...s, unit, settingsUpdatedAt: new Date().toISOString(),
              auditLog: settingsChange(s, 'Weight unit', s.unit, unit) },
      ),
    [],
  )

  const setTheme = useCallback(
    (theme: Theme) =>
      setState((s) =>
        s.theme === theme
          ? s
          : { ...s, theme, settingsUpdatedAt: new Date().toISOString(),
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
              settingsUpdatedAt: new Date().toISOString(),
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
    // Importing replaces the whole dataset (a restore-from-backup). We
    // keep the imported file's own history and prepend an 'import' entry
    // so the join point is visible in the trail. The file runs through
    // the same normalization as a local load so an old backup can't
    // land with missing arrays.
    const next = normalizeState(nextRaw)
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
  }, [])

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
      addTransaction,
      deleteTransaction,
      addTechnician,
      updateTechnician,
      deactivateTechnician,
      reactivateTechnician,
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
      acceptTerms,
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
      addTransaction,
      deleteTransaction,
      addTechnician,
      updateTechnician,
      deactivateTechnician,
      reactivateTechnician,
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
      acceptTerms,
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
