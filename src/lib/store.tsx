import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  type AppState,
  type Bottle,
  type Job,
  type Transaction,
} from './types'
import { loadState, saveState, uid } from './storage'

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
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }))
  }, [])

  const setTechnician = useCallback(
    (name: string) => setState((s) => ({ ...s, technician: name })),
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
      setState({
        bottles: [],
        jobs: [],
        transactions: [],
        customRefrigerants: [],
        technician: '',
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
