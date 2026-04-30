import { EMPTY_STATE, type AppState, type Bottle, type Transaction } from './types'

const KEY = 'refrighandle.v1'

interface LegacyBottle extends Omit<Bottle, 'currentJobId'> {
  currentLocationId?: string
}
interface LegacyTransaction extends Omit<Transaction, 'jobId'> {
  locationId?: string
}
interface LegacyState extends Omit<AppState, 'bottles' | 'transactions' | 'jobs'> {
  bottles?: LegacyBottle[]
  transactions?: LegacyTransaction[]
  jobs?: AppState['jobs']
  locations?: AppState['jobs']
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_STATE }
    const parsed = JSON.parse(raw) as LegacyState

    const bottles: Bottle[] = (parsed.bottles ?? []).map((b) => {
      const { currentLocationId, ...rest } = b
      const next = rest as unknown as Bottle
      return {
        ...next,
        currentJobId: next.currentJobId ?? currentLocationId,
      }
    })

    const transactions: Transaction[] = (parsed.transactions ?? []).map((t) => {
      const { locationId, ...rest } = t
      const next = rest as unknown as Transaction
      return {
        ...next,
        jobId: next.jobId ?? locationId,
      }
    })

    return {
      ...EMPTY_STATE,
      ...parsed,
      bottles,
      jobs: parsed.jobs ?? parsed.locations ?? [],
      transactions,
      customRefrigerants: parsed.customRefrigerants ?? [],
      technician: parsed.technician ?? '',
    }
  } catch {
    return { ...EMPTY_STATE }
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state))
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
