import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKUP_STALE_DAYS,
  BACKUP_STALE_DAYS_SYNCED,
  backupStatus,
  getLastBackupAt,
  markBackedUp,
  snoozeBackupReminder,
} from '../backup'
import { makeState, makeTx } from './fixtures'

// The backup nudge: device-local stamps in localStorage (deliberately
// NOT in the synced state), evaluated against the user's data.

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  })
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-13T00:00:00.000Z'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString()

function stateWithData(over: Record<string, unknown> = {}) {
  return makeState({
    transactions: [makeTx({ loggedAt: daysAgo(40), date: daysAgo(40) })],
    ...over,
  })
}

describe('backupStatus', () => {
  it('quiet when there is nothing worth losing', () => {
    expect(backupStatus(makeState({})).due).toBe(false)
  })

  it('merge-sync relaxes the export cadence but never silences it', () => {
    const synced = { sync: { enabled: true, teamId: 'team-1' } }
    // 40-day-old data that would nudge an offline install stays quiet
    // while synced — the server holds a copy, so the cadence relaxes.
    expect(backupStatus(stateWithData(synced)).due).toBe(false)
    // But sync is replication, not an archive: past the longer window an
    // export is still due, because a periodic off-device copy is the only
    // thing the user fully controls.
    const stale = makeState({
      transactions: [
        makeTx({
          loggedAt: daysAgo(BACKUP_STALE_DAYS_SYNCED + 1),
          date: daysAgo(BACKUP_STALE_DAYS_SYNCED + 1),
        }),
      ],
      ...synced,
    })
    expect(backupStatus(stale).due).toBe(true)
  })

  it('never backed up: due once the data outlives the grace period', () => {
    expect(backupStatus(stateWithData()).due).toBe(true)
    // Brand-new data (logged yesterday) gets grace.
    const young = makeState({
      transactions: [makeTx({ loggedAt: daysAgo(1), date: daysAgo(1) })],
    })
    expect(backupStatus(young).due).toBe(false)
  })

  it('measures data age from loggedAt, falling back to the work date', () => {
    const legacyRow = makeState({
      transactions: [makeTx({ date: daysAgo(40) })], // no loggedAt (older app)
    })
    expect(backupStatus(legacyRow).due).toBe(true)
  })

  it('recent backup silences the nudge; a stale one re-raises it', () => {
    markBackedUp()
    expect(backupStatus(stateWithData()).due).toBe(false)
    // Jump past the staleness window.
    vi.setSystemTime(
      new Date(Date.now() + (BACKUP_STALE_DAYS + 1) * 86400000),
    )
    const s = backupStatus(stateWithData())
    expect(s.due).toBe(true)
    expect(s.daysSinceBackup).toBe(BACKUP_STALE_DAYS + 1)
  })

  it('snooze suppresses the nudge for its window, then it returns', () => {
    const s = stateWithData()
    expect(backupStatus(s).due).toBe(true)
    snoozeBackupReminder()
    expect(backupStatus(s).due).toBe(false)
    vi.setSystemTime(new Date(Date.now() + 8 * 86400000))
    expect(backupStatus(stateWithData()).due).toBe(true)
  })

  it('stamp round-trips', () => {
    expect(getLastBackupAt()).toBeNull()
    markBackedUp()
    expect(getLastBackupAt()).toBe('2026-06-13T00:00:00.000Z')
  })
})
