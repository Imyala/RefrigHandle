import {
  EMPTY_STATE,
  type AppState,
  type Bottle,
  type Site,
  type Transaction,
} from './types'

const KEY = 'refrighandle.v1'

interface LegacyBottle
  extends Omit<Bottle, 'currentSiteId'> {
  currentSiteId?: string
  currentJobId?: string
  currentLocationId?: string
}
interface LegacyTransaction
  extends Omit<Transaction, 'siteId'> {
  siteId?: string
  jobId?: string
  locationId?: string
}
interface LegacyState
  extends Omit<
    AppState,
    | 'bottles'
    | 'transactions'
    | 'sites'
    | 'units'
    | 'unit'
    | 'sync'
    | 'theme'
    | 'customBottlePresets'
    | 'favoriteBottlePresets'
  > {
  bottles?: LegacyBottle[]
  transactions?: LegacyTransaction[]
  sites?: Site[]
  jobs?: Site[]
  locations?: Site[]
  units?: AppState['units']
  unit?: string
  theme?: string
  sync?: Partial<AppState['sync']>
  customBottlePresets?: AppState['customBottlePresets']
  favoriteBottlePresets?: AppState['favoriteBottlePresets']
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY_STATE }
    const parsed = JSON.parse(raw) as LegacyState

    const bottles: Bottle[] = (parsed.bottles ?? []).map((b) => {
      const { currentJobId, currentLocationId, ...rest } = b
      const next = rest as unknown as Bottle
      return {
        ...next,
        currentSiteId: next.currentSiteId ?? currentJobId ?? currentLocationId,
      }
    })

    const transactions: Transaction[] = (parsed.transactions ?? []).map((t) => {
      const { jobId, locationId, ...rest } = t
      const next = rest as unknown as Transaction
      return {
        ...next,
        siteId: next.siteId ?? jobId ?? locationId,
      }
    })

    const units = (parsed.units ?? []).map((u) => {
      const legacyKind = (u as { kind?: string }).kind
      let kind = legacyKind
      if (legacyKind === 'multi_split') kind = 'multi_head_split'
      else if (legacyKind === 'rooftop') kind = 'other'
      else if (legacyKind === 'air_handler') kind = 'air_handler_dx'
      return { ...u, kind } as AppState['units'][number]
    })

    return {
      ...EMPTY_STATE,
      ...parsed,
      bottles,
      sites: parsed.sites ?? parsed.jobs ?? parsed.locations ?? [],
      units,
      transactions,
      customRefrigerants: parsed.customRefrigerants ?? [],
      favoriteRefrigerants: parsed.favoriteRefrigerants ?? [],
      customBottlePresets: parsed.customBottlePresets ?? [],
      favoriteBottlePresets: parsed.favoriteBottlePresets ?? [],
      technician: parsed.technician ?? '',
      unit: parsed.unit === 'lb' ? 'lb' : 'kg',
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark'
          ? parsed.theme
          : 'system',
      sync: {
        enabled: parsed.sync?.enabled ?? false,
        teamId: parsed.sync?.teamId ?? '',
      },
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
