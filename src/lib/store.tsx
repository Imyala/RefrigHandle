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
  type Bottle,
  type BottlePreset,
  type Site,
  type SyncSettings,
  type Theme,
  type Transaction,
  type Unit,
  type WeightUnit,
} from './types'
import { loadState, requestPersistentStorage, saveState, uid } from './storage'
import {
  isSyncConfigured,
  pullState,
  pushState,
  subscribeToState,
} from './sync'
import { useToast } from './toast'

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
  deleteTransaction: (id: string) => void
  // settings
  setTechnician: (name: string) => void
  setUnit: (u: WeightUnit) => void
  setTheme: (t: Theme) => void
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
    const bottle: Bottle = { ...b, id: uid(), createdAt: now, updatedAt: now }
    setState((s) => ({ ...s, bottles: [...s.bottles, bottle] }))
    return bottle
  }, [])

  const updateBottle: StoreApi['updateBottle'] = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      bottles: s.bottles.map((b) =>
        b.id === id ? { ...b, ...patch, updatedAt: new Date().toISOString() } : b,
      ),
    }))
  }, [])

  const deleteBottle: StoreApi['deleteBottle'] = useCallback((id) => {
    setState((s) => ({
      ...s,
      bottles: s.bottles.filter((b) => b.id !== id),
      transactions: s.transactions.filter((t) => t.bottleId !== id),
    }))
  }, [])

  const addSite: StoreApi['addSite'] = useCallback((s) => {
    const site: Site = {
      ...s,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    setState((cur) => ({ ...cur, sites: [...cur.sites, site] }))
    return site
  }, [])

  const updateSite: StoreApi['updateSite'] = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      sites: s.sites.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }))
  }, [])

  const deleteSite: StoreApi['deleteSite'] = useCallback((id) => {
    setState((s) => ({
      ...s,
      sites: s.sites.filter((x) => x.id !== id),
      units: s.units.filter((u) => u.siteId !== id),
      bottles: s.bottles.map((b) =>
        b.currentSiteId === id ? { ...b, currentSiteId: undefined } : b,
      ),
      transactions: s.transactions.map((t) =>
        t.siteId === id ? { ...t, siteId: undefined } : t,
      ),
    }))
  }, [])

  const addUnit: StoreApi['addUnit'] = useCallback((u) => {
    const unit: Unit = {
      ...u,
      id: uid(),
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    setState((cur) => ({ ...cur, units: [...cur.units, unit] }))
    return unit
  }, [])

  const updateUnit: StoreApi['updateUnit'] = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      units: s.units.map((u) => (u.id === id ? { ...u, ...patch } : u)),
    }))
  }, [])

  const deleteUnit: StoreApi['deleteUnit'] = useCallback((id) => {
    setState((s) => ({
      ...s,
      units: s.units.filter((u) => u.id !== id),
      transactions: s.transactions.map((t) =>
        t.unitId === id ? { ...t, unitId: undefined } : t,
      ),
    }))
  }, [])

  const decommissionUnit: StoreApi['decommissionUnit'] = useCallback(
    (id, reason) => {
      setState((s) => ({
        ...s,
        units: s.units.map((u) =>
          u.id === id
            ? {
                ...u,
                status: 'decommissioned',
                decommissionedAt: new Date().toISOString(),
                decommissionedReason: reason?.trim() || u.decommissionedReason,
              }
            : u,
        ),
      }))
    },
    [],
  )

  const reactivateUnit: StoreApi['reactivateUnit'] = useCallback((id) => {
    setState((s) => ({
      ...s,
      units: s.units.map((u) =>
        u.id === id
          ? {
              ...u,
              status: 'active',
              decommissionedAt: undefined,
              decommissionedReason: undefined,
            }
          : u,
      ),
    }))
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

      const tx: Transaction = {
        ...t,
        id: uid(),
        weightBefore: before,
        weightAfter: after,
        sourceWeightBefore: sourceBefore,
        sourceWeightAfter: sourceAfter,
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

      return {
        ...s,
        bottles: nextBottles,
        transactions: [tx, ...s.transactions],
      }
    })
    return result
  }, [])

  const deleteTransaction: StoreApi['deleteTransaction'] = useCallback((id) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }))
  }, [])

  const setTechnician = useCallback(
    (name: string) => setState((s) => ({ ...s, technician: name })),
    [],
  )

  const setUnit = useCallback(
    (unit: WeightUnit) => setState((s) => ({ ...s, unit })),
    [],
  )

  const setTheme = useCallback(
    (theme: Theme) => setState((s) => ({ ...s, theme })),
    [],
  )

  const setSyncSettings = useCallback(
    (sync: SyncSettings) => setState((s) => ({ ...s, sync })),
    [],
  )

  const addCustomRefrigerant = useCallback((name: string) => {
    const trimmed = name.trim().toUpperCase()
    if (!trimmed) return
    setState((s) =>
      s.customRefrigerants.includes(trimmed)
        ? s
        : { ...s, customRefrigerants: [...s.customRefrigerants, trimmed] },
    )
  }, [])

  const removeCustomRefrigerant = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      customRefrigerants: s.customRefrigerants.filter((r) => r !== name),
      favoriteRefrigerants: s.favoriteRefrigerants.filter((r) => r !== name),
    }))
  }, [])

  const toggleFavoriteRefrigerant = useCallback((name: string) => {
    setState((s) => ({
      ...s,
      favoriteRefrigerants: s.favoriteRefrigerants.includes(name)
        ? s.favoriteRefrigerants.filter((r) => r !== name)
        : [...s.favoriteRefrigerants, name],
    }))
  }, [])

  const addCustomBottlePreset: StoreApi['addCustomBottlePreset'] = useCallback(
    (p) => {
      const preset: BottlePreset = { ...p, id: uid(), custom: true }
      setState((s) => ({
        ...s,
        customBottlePresets: [...s.customBottlePresets, preset],
      }))
      return preset
    },
    [],
  )

  const removeCustomBottlePreset = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      customBottlePresets: s.customBottlePresets.filter((p) => p.id !== id),
      favoriteBottlePresets: s.favoriteBottlePresets.filter((x) => x !== id),
    }))
  }, [])

  const toggleFavoriteBottlePreset = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      favoriteBottlePresets: s.favoriteBottlePresets.includes(id)
        ? s.favoriteBottlePresets.filter((x) => x !== id)
        : [...s.favoriteBottlePresets, id],
    }))
  }, [])

  const resetAll = useCallback(() => {
    if (
      confirm(
        'Erase ALL bottles, sites, units, and transactions? This cannot be undone.',
      )
    ) {
      setState((s) => ({
        bottles: [],
        sites: [],
        units: [],
        transactions: [],
        customRefrigerants: [],
        favoriteRefrigerants: [],
        customBottlePresets: [],
        favoriteBottlePresets: [],
        technician: '',
        unit: s.unit,
        theme: s.theme,
        sync: s.sync,
      }))
    }
  }, [])

  const importState = useCallback((s: AppState) => setState(s), [])

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
      setTechnician,
      setUnit,
      setTheme,
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
      setTechnician,
      setUnit,
      setTheme,
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
