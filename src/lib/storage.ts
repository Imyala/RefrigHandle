import { EMPTY_STATE, type AppState } from './types'

const KEY = 'refrighandle.v1'

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_STATE }
    const parsed = JSON.parse(raw) as Partial<AppState>
    return {
      ...EMPTY_STATE,
      ...parsed,
      bottles: parsed.bottles ?? [],
      locations: parsed.locations ?? [],
      transactions: parsed.transactions ?? [],
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
