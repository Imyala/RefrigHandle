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
  type AppState,
  type AuditEntry,
  type Bottle,
  type BottlePreset,
  type ClockFormat,
  type LocationSettings,
  type Site,
  type SyncSettings,
  type Technician,
  type Theme,
  type Transaction,
  type Unit,
  type WeightUnit,
  movementSummary,
  transactionLabel,
} from './types'
import {
  BOTTLE_FIELDS,
  SITE_FIELDS,
  TECH_FIELDS,
  UNIT_FIELDS,
  diffFields,
} from './audit'
import { loadState, requestPersistentStorage, saveState, uid } from './storage'
import { formatWeight } from './units'
import {
  isSyncConfigured,
  pullState,
  pushState,
  subscribeToState,
} from './sync'
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
  restoreTransaction: (id: string) => void
  // technician profiles
  addTechnician: (t: Omit<Technician, 'id' | 'createdAt'>) => Technician
  updateTechnician: (id: string, patch: Partial<Technician>) => void
  deleteTechnician: (id: string) => void
  setActiveTechnicianId: (id: string | undefined) => void
  // settings
  setTechnician: (name: string) => void
  setArcLicenceNumber: (n: string) => void
  setArcAuthorisationNumber: (n: string) => void
  setBusinessName: (n: string) => void
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
  resetAll: () => void
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

  const lastPushedRef = useRef<string>('')
  const remoteApplyRef = useRef(false)

  useEffect(() => {
    if (!isSyncConfigured()) return
    if (!state.sync.enabled || !state.sync.teamId) return
    let cancelled = false
    pullState(state.sync.teamId).then((remote) => {
      if (!cancelled && remote) {
        remoteApplyRef.current = true
        setState(remote)
      }
    })
    const unsub = subscribeToState(state.sync.teamId, (remote) => {
      remoteApplyRef.current = true
      setState(remote)
    })
    return () => {
      cancelled = true
      unsub()
    }
  }, [state.sync.enabled, state.sync.teamId])

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
      return {
        ...s,
        bottles: [...s.bottles, bottle],
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
      return {
        ...s,
        bottles: s.bottles.filter((b) => b.id !== id),
        transactions: s.transactions.filter((t) => t.bottleId !== id),
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'bottle',
              entityId: id,
              target: before.bottleNumber,
              summary: `Removed bottle ${before.bottleNumber} and its log entries`,
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
      const sites = s.sites.map((x) => (x.id === id ? { ...x, ...patch } : x))
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
      return {
        ...s,
        sites: s.sites.filter((x) => x.id !== id),
        units: s.units.filter((u) => u.siteId !== id),
        bottles: s.bottles.map((b) =>
          b.currentSiteId === id ? { ...b, currentSiteId: undefined } : b,
        ),
        transactions: s.transactions.map((t) =>
          t.siteId === id ? { ...t, siteId: undefined } : t,
        ),
        auditLog: before
          ? withAudit(s, {
              action: 'delete',
              entity: 'site',
              entityId: id,
              target: before.name,
              summary: `Removed site ${before.name} — its units were deleted and bottle/log links cleared`,
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
      const units = s.units.map((u) => (u.id === id ? { ...u, ...patch } : u))
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
        transactions: s.transactions.map((t) =>
          t.unitId === id ? { ...t, unitId: undefined } : t,
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
      const bottleDelta =
        t.kind === 'adjust' ? t.amount : (t.bottleAmount ?? t.amount)
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
        weightBefore: before,
        weightAfter: after,
        sourceWeightBefore: sourceBefore,
        sourceWeightAfter: sourceAfter,
        technician: t.technician ?? activeTech?.name ?? (s.technician || undefined),
        technicianLicence:
          t.technicianLicence ??
          (activeTech?.arcLicenceNumber || undefined) ??
          (s.arcLicenceNumber || undefined),
        businessName: t.businessName ?? (s.businessName || undefined),
        arcAuthorisationNumber:
          t.arcAuthorisationNumber ?? (s.arcAuthorisationNumber || undefined),
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

      const nextTransactions = [tx, ...s.transactions]
      const bottleNo = bottle.bottleNumber
      const isMove = tx.kind === 'transfer' || tx.kind === 'return'
      const move = isMove
        ? movementSummary(
            tx,
            nextTransactions,
            (id) => s.sites.find((j) => j.id === id)?.name,
          )
        : null
      const summary = move
        ? `${transactionLabel(tx.kind)} bottle ${bottleNo}: ${move.from} → ${move.to}`
        : `${transactionLabel(tx.kind)}${
            tx.amount > 0 ? ` ${formatWeight(tx.amount, s.unit)}` : ''
          } · bottle ${bottleNo}`

      return {
        ...s,
        bottles: nextBottles,
        transactions: nextTransactions,
        auditLog: withAudit(s, {
          // Bottle relocations (transfer / return) read as 'relocate' in
          // the history; charge / recover / adjust read as 'create' (a
          // new log entry was recorded).
          action: isMove ? 'relocate' : 'create',
          entity: 'transaction',
          entityId: tx.id,
          target: bottleNo,
          summary,
        }),
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

  const restoreTransaction: StoreApi['restoreTransaction'] = useCallback(
    (id) => {
      setState((s) => {
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
                  deletedAt: undefined,
                  deletedBy: undefined,
                  deletedByLicence: undefined,
                  deletedReason: undefined,
                }
              : t,
          ),
          auditLog: target
            ? withAudit(s, {
                action: 'restore',
                entity: 'transaction',
                entityId: id,
                target: bottleNo,
                summary: `Restored ${transactionLabel(target.kind)} log entry for bottle ${bottleNo}`,
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
      name: t.name.trim(),
      arcLicenceNumber: t.arcLicenceNumber.trim(),
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
          tech.arcLicenceNumber ? ` · RHL ${tech.arcLicenceNumber}` : ''
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

  const setActiveTechnicianId: StoreApi['setActiveTechnicianId'] = useCallback(
    (id) => setState((s) => ({ ...s, activeTechnicianId: id })),
    [],
  )

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

  const setBusinessName = useCallback(
    (n: string) =>
      setState((s) =>
        s.businessName === n.trim()
          ? s
          : {
              ...s,
              businessName: n.trim(),
              auditLog: settingsChange(s, 'Business name', s.businessName, n.trim()),
            },
      ),
    [],
  )

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
          : { ...s, unit, auditLog: settingsChange(s, 'Weight unit', s.unit, unit) },
      ),
    [],
  )

  const setTheme = useCallback(
    (theme: Theme) =>
      setState((s) =>
        s.theme === theme
          ? s
          : { ...s, theme, auditLog: settingsChange(s, 'Theme', s.theme, theme) },
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

  const resetAll = useCallback(() => {
    // Confirmation lives at the call site (Settings page) so the
    // dialog matches the rest of the app's themed Modal flow.
    setState((s) => ({
      bottles: [],
      sites: [],
      units: [],
      transactions: [],
      // The audit trail deliberately SURVIVES a reset — the record that
      // a wipe happened (and everything before it) is exactly what an
      // owner would want to keep. Prepend the reset itself.
      auditLog: withAudit(s, {
        action: 'reset',
        entity: 'data',
        target: 'All data',
        summary:
          'Wiped all bottles, sites, units and transactions (settings and tech roster kept)',
      }),
      customRefrigerants: [],
      favoriteRefrigerants: [],
      customBottlePresets: [],
      favoriteBottlePresets: [],
      technician: '',
      // Compliance identity is per-tech / per-business, not per
      // dataset — keep it across a "wipe data" so the user doesn't
      // have to re-enter their ARC numbers (or rebuild their tech
      // roster) after a factory reset.
      technicians: s.technicians,
      activeTechnicianId: s.activeTechnicianId,
      arcLicenceNumber: s.arcLicenceNumber,
      arcAuthorisationNumber: s.arcAuthorisationNumber,
      businessName: s.businessName,
      location: s.location,
      unit: s.unit,
      theme: s.theme,
      clock: s.clock,
      sync: s.sync,
    }))
  }, [])

  const importState = useCallback((next: AppState) => {
    // Importing replaces the whole dataset (a restore-from-backup). We
    // keep the imported file's own history and prepend an 'import' entry
    // so the join point is visible in the trail.
    setState(() => ({
      ...next,
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
      restoreTransaction,
      addTechnician,
      updateTechnician,
      deleteTechnician,
      setActiveTechnicianId,
      setTechnician,
      setArcLicenceNumber,
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
      addCustomBottlePreset,
      removeCustomBottlePreset,
      toggleFavoriteBottlePreset,
      resetAll,
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
      restoreTransaction,
      addTechnician,
      updateTechnician,
      deleteTechnician,
      setActiveTechnicianId,
      setTechnician,
      setArcLicenceNumber,
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
      addCustomBottlePreset,
      removeCustomBottlePreset,
      toggleFavoriteBottlePreset,
      resetAll,
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
