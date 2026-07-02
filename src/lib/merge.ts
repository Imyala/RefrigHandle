import type {
  AppState,
  AuditEntry,
  RecycleBinEntry,
  Tombstone,
  Transaction,
} from './types'
import { SYNCED_SETTINGS_FIELDS } from './types'

// Record-level merge of two AppStates — the difference between "two
// techs can use the app at once" and "two techs silently overwrite each
// other". The previous sync replaced the whole state blob (last write
// wins), so concurrent work on two devices lost one device's entries.
// This merge unions records by id and resolves conflicts per record:
//
// - transactions / audit entries: append-mostly — union by id. A
//   soft-deleted copy of a transaction beats a live copy (the deletion
//   is the newer fact); deletion metadata is carried over.
// - bottles / sites / units / technicians: per-id last-write-wins on
//   updatedAt (falling back to createdAt).
// - hard deletions: tombstones. A record present on only one side is
//   kept UNLESS a tombstone (or the other side's dataResetAt watermark)
//   says it was deliberately removed after it was created.
// - scalar settings block: taken wholesale from whichever side has the
//   newer settingsUpdatedAt.
// - per-device choices (sync switch, active technician seat): local.
//
// The merge is deterministic and commutative on the record level —
// both devices converge on the same superset after exchanging states.

// The merged view of a record's tombstone(s): the latest deletion
// moment and the latest revocation (restore) across both sides.
interface StoneState {
  at: string
  revokedAt?: string
}

// True when a tombstone kills this record: the deletion happened after
// the record's last write, and hasn't itself been revoked by a restore.
// A record edited AFTER its tombstone (clock skew, or genuinely
// re-created elsewhere) survives; so does a timestampless record whose
// tombstone was revoked (custom refrigerants / presets have no
// updatedAt to out-date the tombstone with).
function killedByTombstone(
  stones: Map<string, StoneState>,
  key: string,
  lastWrite: string | undefined,
): boolean {
  const st = stones.get(key)
  if (!st) return false
  if (st.revokedAt && st.revokedAt >= st.at) return false
  return !lastWrite || lastWrite <= st.at
}

// True when the OTHER side's reset watermark erases a record that only
// this side still has: the record predates the wipe, so its absence on
// the other side is deliberate, not "hasn't synced yet".
function killedByReset(
  resetAt: string | undefined,
  lastWrite: string | undefined,
): boolean {
  if (!resetAt) return false
  return !lastWrite || lastWrite < resetAt
}

interface Stamped {
  id: string
  createdAt?: string
  updatedAt?: string
}

function lastWriteOf(r: Stamped): string | undefined {
  return r.updatedAt ?? r.createdAt
}

// Merge one id-keyed collection. `entity` selects the tombstones that
// apply; `pick` resolves a record present on both sides.
function mergeCollection<T extends Stamped>(
  local: readonly T[],
  remote: readonly T[],
  stones: Map<string, StoneState>,
  entity: Tombstone['entity'],
  localResetAt: string | undefined,
  remoteResetAt: string | undefined,
  pick: (a: T, b: T) => T = newerOf,
): T[] {
  const out = new Map<string, T>()
  for (const r of local) out.set(r.id, r)
  for (const r of remote) {
    const mine = out.get(r.id)
    if (mine) {
      out.set(r.id, pick(mine, r))
    } else if (!killedByReset(localResetAt, lastWriteOf(r))) {
      // Remote-only record — keep unless OUR wipe erased it.
      out.set(r.id, r)
    }
  }
  // Local-only records erased by the REMOTE side's wipe.
  if (remoteResetAt) {
    for (const r of local) {
      if (
        !remote.some((x) => x.id === r.id) &&
        killedByReset(remoteResetAt, lastWriteOf(r))
      ) {
        out.delete(r.id)
      }
    }
  }
  // Tombstones from either side.
  for (const [key, ,] of stones) {
    const [ent, id] = splitKey(key)
    if (ent !== entity) continue
    const r = out.get(id)
    if (r && killedByTombstone(stones, key, lastWriteOf(r))) out.delete(id)
  }
  return [...out.values()]
}

function newerOf<T extends Stamped>(a: T, b: T): T {
  const aw = lastWriteOf(a) ?? ''
  const bw = lastWriteOf(b) ?? ''
  return bw > aw ? b : a
}

const KEY_SEP = '\u0000'
function stoneKey(t: Tombstone): string {
  return `${t.entity}${KEY_SEP}${t.id}`
}
function splitKey(key: string): [string, string] {
  const i = key.indexOf(KEY_SEP)
  return [key.slice(0, i), key.slice(i + 1)]
}

// The moment of a transaction's most recent soft-delete / restore.
// Empty string for a row that has never been through that lifecycle, so
// any deletion or restore beats it in a merge.
function lifecycleAt(t: Transaction): string {
  const del = t.deletedAt ?? ''
  const res = t.restoredAt ?? ''
  return del > res ? del : res
}

function mergeTransactions(
  local: readonly Transaction[],
  remote: readonly Transaction[],
  localResetAt: string | undefined,
  remoteResetAt: string | undefined,
): Transaction[] {
  const out = new Map<string, Transaction>()
  for (const t of local) out.set(t.id, t)
  for (const t of remote) {
    const mine = out.get(t.id)
    if (!mine) {
      // Remote-only row — keep unless our wipe erased it. Compare the
      // moment the row was WRITTEN (loggedAt), not the user-entered work
      // date: a backdated catch-up entry logged after the wipe is new
      // work and must survive. Rows from before loggedAt existed fall
      // back to the work date.
      if (!killedByReset(localResetAt, t.deletedAt ?? t.loggedAt ?? t.date)) {
        out.set(t.id, t)
      }
      continue
    }
    // Same row on both sides. Rows are immutable except for the
    // soft-delete / restore lifecycle, so whichever copy reflects the
    // most recent lifecycle action wins: compare the later of each
    // copy's deletedAt / restoredAt. A plain (never-touched) copy has
    // neither and loses to any deletion or restore.
    if (lifecycleAt(t) > lifecycleAt(mine)) out.set(t.id, t)
  }
  if (remoteResetAt) {
    for (const t of local) {
      if (
        !remote.some((x) => x.id === t.id) &&
        killedByReset(remoteResetAt, t.deletedAt ?? t.loggedAt ?? t.date)
      ) {
        out.delete(t.id)
      }
    }
  }
  // Newest first, matching the store's prepend order.
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function mergeAuditLog(
  local: readonly AuditEntry[],
  remote: readonly AuditEntry[],
): AuditEntry[] {
  const out = new Map<string, AuditEntry>()
  // Remote first so a sealed local copy (hash fields added after the
  // remote snapshot was taken) wins over an unsealed remote twin.
  for (const e of remote) out.set(e.id, e)
  for (const e of local) {
    const theirs = out.get(e.id)
    if (!theirs || e.hash || !theirs.hash) out.set(e.id, e)
  }
  // No reset watermark here: unlike records, audit entries from the OTHER
  // device are never dropped by a dataResetAt during a sync merge — the
  // change log only ever grows by union. (A local account closure still
  // wipes this device's log via resetToFreshInstall, but only after the
  // business has been handed its records ZIP — see store.tsx.)
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at))
}

// Recycle bin: union by entry id (append-mostly, like the audit log). The
// bin is a recovery archive, so it only ever grows by union and is never
// pruned by a reset watermark — a deletion captured on one device stays
// recoverable everywhere. A restore drops the bin entry locally; the
// restored record's bumped updatedAt then beats its tombstone in the
// merge, so the record survives even if this stale bin copy lingers.
function mergeRecycleBin(
  local: readonly RecycleBinEntry[],
  remote: readonly RecycleBinEntry[],
): RecycleBinEntry[] {
  const out = new Map<string, RecycleBinEntry>()
  for (const e of remote) out.set(e.id, e)
  for (const e of local) out.set(e.id, e)
  return [...out.values()].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))
}

function unionStrings(a: readonly string[], b: readonly string[]): string[] {
  return [...new Set([...a, ...b])]
}

export function mergeStates(local: AppState, remote: AppState): AppState {
  const stones = new Map<string, StoneState>()
  for (const t of [...local.tombstones, ...remote.tombstones]) {
    const k = stoneKey(t)
    const prev = stones.get(k)
    // Keep the latest deletion moment AND the latest revocation — both
    // maxes make the merge commutative, and "which is later" decides
    // whether the tombstone still kills (see killedByTombstone).
    stones.set(k, {
      at: !prev || t.at > prev.at ? t.at : prev.at,
      revokedAt:
        (t.revokedAt ?? '') > (prev?.revokedAt ?? '')
          ? t.revokedAt
          : prev?.revokedAt,
    })
  }
  const tombstones: Tombstone[] = [...stones.entries()].map(([k, st]) => {
    const [entity, id] = splitKey(k)
    return {
      entity: entity as Tombstone['entity'],
      id,
      at: st.at,
      ...(st.revokedAt ? { revokedAt: st.revokedAt } : {}),
    }
  })

  const lReset = local.dataResetAt
  const rReset = remote.dataResetAt

  // Scalar settings — resolved PER FIELD, not whole-block. Two devices
  // that each edited a different field offline both keep their change
  // (the old whole-block last-write-wins dropped the older device's edit).
  // For each field, the side with the newer per-field stamp wins; missing
  // per-field stamps fall back to the coarse block-level settingsUpdatedAt.
  const blockRemoteWin =
    (remote.settingsUpdatedAt ?? '') > (local.settingsUpdatedAt ?? '')
  const settingsSide = blockRemoteWin ? remote : local // fallback / non-listed fields
  const lFields = local.settingsFieldsUpdatedAt ?? {}
  const rFields = remote.settingsFieldsUpdatedAt ?? {}
  const fieldSide = (field: string): AppState => {
    const lt = lFields[field]
    const rt = rFields[field]
    // Both have a per-field stamp → newer wins.
    if (lt != null && rt != null) return rt > lt ? remote : local
    // Only one has a per-field stamp → that side made the more recent
    // tracked edit to this field.
    if (rt != null) return remote
    if (lt != null) return local
    // Neither → coarse block-level winner (back-compat with old states).
    return settingsSide
  }
  const pick = <K extends (typeof SYNCED_SETTINGS_FIELDS)[number]>(
    field: K,
  ): AppState[K] => fieldSide(field)[field]
  // Merged per-field stamps: the latest seen for each field across sides.
  const mergedFieldStamps: Record<string, string> = { ...lFields }
  for (const [k, v] of Object.entries(rFields)) {
    if (!mergedFieldStamps[k] || v > mergedFieldStamps[k]) mergedFieldStamps[k] = v
  }

  // Custom refrigerants: union minus ACTIVE tombstones. Plain strings
  // carry no timestamp, so an unrevoked tombstone always wins for them —
  // and a revoked one (restored from the recycle bin) never does.
  const customRefrigerants = unionStrings(
    local.customRefrigerants,
    remote.customRefrigerants,
  ).filter(
    (name) => !killedByTombstone(stones, `refrigerant${KEY_SEP}${name}`, undefined),
  )

  const customBottlePresets = mergeCollection(
    local.customBottlePresets,
    remote.customBottlePresets,
    stones,
    'preset',
    undefined,
    undefined,
    // Presets carry no timestamps — local copy wins arbitrarily (they
    // are value-identical in practice).
    (a) => a,
  )
  const presetIds = new Set(customBottlePresets.map((p) => p.id))

  const merged: AppState = {
    // Settings block — each field resolved independently (see fieldSide).
    technician: pick('technician'),
    arcLicenceNumber: pick('arcLicenceNumber'),
    arcAuthorisationNumber: pick('arcAuthorisationNumber'),
    arcAuthorisationExpiry: pick('arcAuthorisationExpiry'),
    businessName: pick('businessName'),
    businessAbn: pick('businessAbn'),
    jurisdiction: pick('jurisdiction'),
    location: pick('location'),
    unit: pick('unit'),
    theme: pick('theme'),
    clock: pick('clock'),
    settingsUpdatedAt:
      (remote.settingsUpdatedAt ?? '') > (local.settingsUpdatedAt ?? '')
        ? remote.settingsUpdatedAt
        : local.settingsUpdatedAt,
    settingsFieldsUpdatedAt: Object.keys(mergedFieldStamps).length
      ? mergedFieldStamps
      : undefined,

    // Per-device choices — never adopted from the other side.
    sync: local.sync,
    activeTechnicianId: local.activeTechnicianId,

    bottles: mergeCollection(
      local.bottles, remote.bottles, stones, 'bottle', lReset, rReset,
    ),
    sites: mergeCollection(
      local.sites, remote.sites, stones, 'site', lReset, rReset,
    ),
    units: mergeCollection(
      local.units, remote.units, stones, 'unit', lReset, rReset,
    ),
    jobs: mergeCollection(
      local.jobs ?? [], remote.jobs ?? [], stones, 'job', lReset, rReset,
    ),
    technicians: mergeCollection(
      local.technicians, remote.technicians, stones, 'technician',
      lReset, rReset,
    ),
    transactions: mergeTransactions(
      local.transactions, remote.transactions, lReset, rReset,
    ),
    auditLog: mergeAuditLog(local.auditLog, remote.auditLog),
    recycleBin: mergeRecycleBin(local.recycleBin ?? [], remote.recycleBin ?? []),
    // Union the "already logged this lapse" markers so two devices don't
    // each write the same expiry to the change log.
    loggedExpiryKeys: unionStrings(
      local.loggedExpiryKeys ?? [],
      remote.loggedExpiryKeys ?? [],
    ),

    customRefrigerants,
    favoriteRefrigerants: unionStrings(
      local.favoriteRefrigerants,
      remote.favoriteRefrigerants,
    ),
    customBottlePresets,
    favoriteBottlePresets: unionStrings(
      local.favoriteBottlePresets,
      remote.favoriteBottlePresets,
    ).filter((id) => presetIds.has(id) || BUILT_IN_PRESET_ID.test(id)),

    setupCompletedAt:
      [local.setupCompletedAt, remote.setupCompletedAt]
        .filter(Boolean)
        .sort()[0] ?? undefined,
    termsAcceptedAt:
      [local.termsAcceptedAt, remote.termsAcceptedAt]
        .filter(Boolean)
        .sort()[0] ?? undefined,
    // Keep the latest accepted version across devices. Versions are
    // lettered strings (e.g. 'v1.1b'), so we take the greatest by string
    // order rather than a numeric max.
    termsAcceptedVersion:
      [local.termsAcceptedVersion, remote.termsAcceptedVersion]
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? undefined,
    // Closure is sticky: once either device has requested it, the merged
    // account stays closed (earliest request wins).
    accountClosure:
      [local.accountClosure, remote.accountClosure]
        .filter(Boolean)
        .sort((a, b) => (a!.requestedAt < b!.requestedAt ? -1 : 1))[0] ??
      undefined,
    tombstones,
    dataResetAt:
      [lReset, rReset].filter(Boolean).sort().reverse()[0] ?? undefined,
  }

  // The active seat must point at a tech that survived the merge.
  if (
    merged.activeTechnicianId &&
    !merged.technicians.some((t) => t.id === merged.activeTechnicianId)
  ) {
    merged.activeTechnicianId = merged.technicians[0]?.id
  }

  return merged
}

// Built-in preset ids ("au-rec-22wc") must survive the favourites
// filter even though they aren't in customBottlePresets.
const BUILT_IN_PRESET_ID = /^au-/
