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
  type Job,
  type SyncSettings,
  type Transaction,
  type WeightUnit,
} from './types'
import { loadState, saveState, uid } from './storage'
import { deletePhotos } from './photos'
import {
  isSyncConfigured,
  pullState,
  pushState,
  subscribeToState,
} from './sync'

interface StoreApi {
  state: AppState
  // bottles
  addBottle: (b: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'>) => Bottle
  updateBottle: (id: string, patch: Partial<Bottle>) => void
  deleteBottle: (id: string) => void
  // jobs
  addJob: (l: Omit<Job, 'id' | 'createdAt'>) => Job
  updateJob: (id: string, patch: Partial<Job>) => void
  deleteJob: (id: string) => void
  // transactions
  addTransaction: (
    t: Omit<Transaction, 'id' | 'weightBefore' | 'weightAfter'>,
  ) => Transaction | null
  deleteTransaction: (id: string) => void
  // settings
  setTechnician: (name: string) => void
  setUnit: (u: WeightUnit) => void
  setSyncSettings: (s: SyncSettings) => void
  addCustomRefrigerant: (name: string) => void
  removeCustomRefrigerant: (name: string) => void
  // bulk
  resetAll: () => void
  importState: (s: AppState) => void
}

const StoreContext = createContext<StoreApi | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => loadState())

  useEffect(() => {
    saveState(state)
  }, [state])

  // Optional cloud sync. No-ops unless the user has configured a team ID
  // AND build-time Supabase env vars are present. Last-write-wins.
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
    setState((s) => {
      const orphanedPhotoIds = s.transactions
        .filter((t) => t.bottleId === id)
        .flatMap((t) => t.photoIds ?? [])
      if (orphanedPhotoIds.length > 0) void deletePhotos(orphanedPhotoIds)
      return {
        ...s,
        bottles: s.bottles.filter((b) => b.id !== id),
        transactions: s.transactions.filter((t) => t.bottleId !== id),
      }
    })
  }, [])

  const addJob: StoreApi['addJob'] = useCallback((l) => {
    const job: Job = {
      ...l,
      id: uid(),
      createdAt: new Date().toISOString(),
    }
    setState((s) => ({ ...s, jobs: [...s.jobs, job] }))
    return job
  }, [])

  const updateJob: StoreApi['updateJob'] = useCallback((id, patch) => {
    setState((s) => ({
      ...s,
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    }))
  }, [])

  const deleteJob: StoreApi['deleteJob'] = useCallback((id) => {
    setState((s) => ({
      ...s,
      jobs: s.jobs.filter((j) => j.id !== id),
      bottles: s.bottles.map((b) =>
        b.currentJobId === id ? { ...b, currentJobId: undefined } : b,
      ),
      transactions: s.transactions.map((t) =>
        t.jobId === id ? { ...t, jobId: undefined } : t,
      ),
    }))
  }, [])

  const addTransaction: StoreApi['addTransaction'] = useCallback((t) => {
    let result: Transaction | null = null
    setState((s) => {
      const bottle = s.bottles.find((b) => b.id === t.bottleId)
      if (!bottle) return s
      const before = bottle.grossWeight
      let after = before
      if (t.kind === 'charge') after = before - t.amount
      else if (t.kind === 'recover') after = before + t.amount
      else if (t.kind === 'adjust') after = before + t.amount // signed
      // transfer / return don't change weight
      after = Math.max(0, Math.round(after * 1000) / 1000)

      const tx: Transaction = {
        ...t,
        id: uid(),
        weightBefore: before,
        weightAfter: after,
      }
      result = tx

      const updatedBottle: Bottle = {
        ...bottle,
        grossWeight: after,
        updatedAt: new Date().toISOString(),
      }
      // status side-effects
      if (t.kind === 'transfer' && t.jobId) {
        updatedBottle.currentJobId = t.jobId
        updatedBottle.status = 'on_site'
      } else if (t.kind === 'return') {
        updatedBottle.currentJobId = undefined
        updatedBottle.status = 'returned'
      }
      const net = Math.max(0, updatedBottle.grossWeight - updatedBottle.tareWeight)
      if (net <= 0.01 && updatedBottle.status !== 'returned') {
        updatedBottle.status = 'empty'
      }

      return {
        ...s,
        bottles: s.bottles.map((b) => (b.id === bottle.id ? updatedBottle : b)),
        transactions: [tx, ...s.transactions],
      }
    })
    return result
  }, [])

  const deleteTransaction: StoreApi['deleteTransaction'] = useCallback((id) => {
    setState((s) => {
      const tx = s.transactions.find((t) => t.id === id)
      if (tx?.photoIds?.length) void deletePhotos(tx.photoIds)
      return {
        ...s,
        transactions: s.transactions.filter((t) => t.id !== id),
      }
    })
  }, [])

  const setTechnician = useCallback(
    (name: string) => setState((s) => ({ ...s, technician: name })),
    [],
  )

  const setUnit = useCallback(
    (unit: WeightUnit) => setState((s) => ({ ...s, unit })),
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
    }))
  }, [])

  const resetAll = useCallback(() => {
    if (confirm('Erase ALL bottles, jobs, and transactions? This cannot be undone.')) {
      setState((s) => {
        const allPhotos = s.transactions.flatMap((t) => t.photoIds ?? [])
        if (allPhotos.length > 0) void deletePhotos(allPhotos)
        return {
          bottles: [],
          jobs: [],
          transactions: [],
          customRefrigerants: [],
          technician: '',
          unit: s.unit,
          sync: s.sync,
        }
      })
    }
  }, [])

  const importState = useCallback((s: AppState) => setState(s), [])

  const api = useMemo<StoreApi>(
    () => ({
      state,
      addBottle,
      updateBottle,
      deleteBottle,
      addJob,
      updateJob,
      deleteJob,
      addTransaction,
      deleteTransaction,
      setTechnician,
      setUnit,
      setSyncSettings,
      addCustomRefrigerant,
      removeCustomRefrigerant,
      resetAll,
      importState,
    }),
    [
      state,
      addBottle,
      updateBottle,
      deleteBottle,
      addJob,
      updateJob,
      deleteJob,
      addTransaction,
      deleteTransaction,
      setTechnician,
      setUnit,
      setSyncSettings,
      addCustomRefrigerant,
      removeCustomRefrigerant,
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
