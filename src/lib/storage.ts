import {
  EMPTY_STATE,
  type AppState,
  type Bottle,
  type Site,
  type Technician,
  type Transaction,
} from './types'

const KEY = 'refrighandle.v1'
const CORRUPTED_PREFIX = 'refrighandle.v1.corrupted.'

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
    | 'arcLicenceNumber'
    | 'arcAuthorisationNumber'
    | 'businessName'
    | 'location'
    | 'clock'
    | 'technicians'
    | 'activeTechnicianId'
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
  arcLicenceNumber?: string
  arcAuthorisationNumber?: string
  businessName?: string
  location?: Partial<AppState['location']>
  clock?: string
  technicians?: Technician[]
  activeTechnicianId?: string
}

export type LoadStatus = 'ok' | 'empty' | 'corrupted'

export interface LoadResult {
  state: AppState
  status: LoadStatus
  // When status === 'corrupted', the unparseable blob is preserved here
  // so the user can recover it from Settings → Storage health.
  corruptedBackupKey?: string
}

function normalize(parsed: LegacyState): AppState {
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

  // Seed a tech profile from the legacy single-tech fields when the
  // user has data but no profile list yet — keeps logged transactions
  // attributable after the upgrade without any manual step.
  const legacyTechName = (parsed.technician ?? '').trim()
  const legacyRhl = (parsed.arcLicenceNumber ?? '').trim()
  const existingTechnicians = parsed.technicians ?? []
  let technicians: Technician[] = existingTechnicians
  let activeTechnicianId: string | undefined = parsed.activeTechnicianId
  if (
    existingTechnicians.length === 0 &&
    (legacyTechName || legacyRhl)
  ) {
    const seeded: Technician = {
      id: uid(),
      name: legacyTechName || 'Technician',
      arcLicenceNumber: legacyRhl,
      createdAt: new Date().toISOString(),
    }
    technicians = [seeded]
    activeTechnicianId = seeded.id
  }
  if (
    activeTechnicianId &&
    !technicians.some((t) => t.id === activeTechnicianId)
  ) {
    activeTechnicianId = technicians[0]?.id
  }

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
    technicians,
    activeTechnicianId,
    technician: parsed.technician ?? '',
    arcLicenceNumber: parsed.arcLicenceNumber ?? '',
    arcAuthorisationNumber: parsed.arcAuthorisationNumber ?? '',
    businessName: parsed.businessName ?? '',
    location: {
      country: parsed.location?.country ?? '',
      region: parsed.location?.region ?? '',
      city: parsed.location?.city ?? '',
      timezone: parsed.location?.timezone ?? '',
    },
    unit: parsed.unit === 'lb' ? 'lb' : 'kg',
    theme:
      parsed.theme === 'light' || parsed.theme === 'dark'
        ? parsed.theme
        : 'system',
    clock: parsed.clock === '12h' ? '12h' : '24h',
    sync: {
      enabled: parsed.sync?.enabled ?? false,
      teamId: parsed.sync?.teamId ?? '',
    },
  }
}

export function loadState(): LoadResult {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // localStorage itself unavailable (private mode quota=0, disabled).
    // Treat as empty — saves will fail loudly later.
    return { state: { ...EMPTY_STATE }, status: 'empty' }
  }

  if (!raw) return { state: { ...EMPTY_STATE }, status: 'empty' }

  try {
    const parsed = JSON.parse(raw) as LegacyState
    return { state: normalize(parsed), status: 'ok' }
  } catch {
    // Move the bad blob to a timestamped backup key so the next save
    // can't overwrite it. The user can download or restore it from
    // Settings → Storage health.
    const backupKey = CORRUPTED_PREFIX + new Date().toISOString().replace(/[:.]/g, '-')
    try {
      localStorage.setItem(backupKey, raw)
      localStorage.removeItem(KEY)
    } catch {
      // If we can't even move it (quota full), leave it in place.
      // Returning empty state still loses the live view, but the raw
      // blob at KEY is untouched and recoverable manually.
    }
    return {
      state: { ...EMPTY_STATE },
      status: 'corrupted',
      corruptedBackupKey: backupKey,
    }
  }
}

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'unavailable' | 'unknown'; error?: unknown }

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; code?: number }
  // QuotaExceededError name varies across browsers; code 22 is the
  // legacy DOMException code, 1014 is Firefox's NS_ERROR equivalent.
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  )
}

export function saveState(state: AppState): SaveResult {
  let serialized: string
  try {
    serialized = JSON.stringify(state)
  } catch (error) {
    return { ok: false, reason: 'unknown', error }
  }
  try {
    localStorage.setItem(KEY, serialized)
    return { ok: true }
  } catch (error) {
    if (isQuotaError(error)) return { ok: false, reason: 'quota', error }
    // Other failures: localStorage disabled, security errors, etc.
    return { ok: false, reason: 'unavailable', error }
  }
}

export interface CorruptedBackup {
  key: string
  // ISO timestamp parsed from the key (best-effort)
  savedAt: string
  sizeBytes: number
}

export function listCorruptedBackups(): CorruptedBackup[] {
  const out: CorruptedBackup[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith(CORRUPTED_PREFIX)) continue
      const stamp = k.slice(CORRUPTED_PREFIX.length).replace(
        /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/,
        '$1T$2:$3:$4.$5Z',
      )
      const raw = localStorage.getItem(k) ?? ''
      out.push({ key: k, savedAt: stamp, sizeBytes: raw.length })
    }
  } catch {
    // ignore
  }
  return out.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

export function readCorruptedBackup(key: string): string | null {
  try {
    if (!key.startsWith(CORRUPTED_PREFIX)) return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function deleteCorruptedBackup(key: string): void {
  try {
    if (!key.startsWith(CORRUPTED_PREFIX)) return
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export interface StorageEstimate {
  usageBytes?: number
  quotaBytes?: number
}

export async function getStorageEstimate(): Promise<StorageEstimate> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const e = await navigator.storage.estimate()
      return { usageBytes: e.usage, quotaBytes: e.quota }
    }
  } catch {
    // ignore
  }
  return {}
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persisted) {
      return await navigator.storage.persisted()
    }
  } catch {
    // ignore
  }
  return false
}

// Ask the browser to mark this origin's storage as "persistent" so it
// won't be evicted under storage pressure. Returns true if granted.
// On Chrome/Edge this is auto-granted for installed PWAs and bookmarked
// sites; on Firefox it shows a prompt; on iOS Safari it returns false
// unless the user has added the app to Home Screen.
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
      return await navigator.storage.persist()
    }
  } catch {
    // ignore
  }
  return false
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
