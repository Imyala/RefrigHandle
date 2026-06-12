import type { AppState } from './types'

// Backup freshness tracking. Until records live on a server (team
// accounts), every byte of compliance history exists only in this
// browser's storage — a lost phone or an evicted origin erases years
// of RTA records that must legally be producible for 5 years. The app
// can't stop that, but it can make sure the user is never silently
// months away from their last copy.
//
// The timestamps are deliberately DEVICE-LOCAL (own localStorage keys,
// not part of the synced AppState): each device must keep its own
// backup, so one phone exporting must not silence another phone's
// nudge — and a restored backup must not carry a stale "just backed
// up" stamp with it.

const LAST_BACKUP_KEY = 'refrighandle.lastBackupAt.v1'
const SNOOZE_KEY = 'refrighandle.backupSnoozeUntil.v1'

// Nudge when the newest full backup is older than this.
export const BACKUP_STALE_DAYS = 30
// A never-backed-up install gets this much grace before the first
// nudge, so a brand-new user isn't nagged during their first jobs.
export const FIRST_BACKUP_GRACE_DAYS = 7
export const SNOOZE_DAYS = 7

export function getLastBackupAt(): string | null {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY)
  } catch {
    return null
  }
}

export function markBackedUp(): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString())
  } catch {
    // localStorage unavailable — nothing to record on.
  }
}

export function snoozeBackupReminder(): void {
  try {
    const until = new Date(Date.now() + SNOOZE_DAYS * 86400 * 1000)
    localStorage.setItem(SNOOZE_KEY, until.toISOString())
  } catch {
    // ignore
  }
}

function snoozedUntil(): string | null {
  try {
    return localStorage.getItem(SNOOZE_KEY)
  } catch {
    return null
  }
}

// Full-state JSON download — THE backup. Shared by Settings and the
// overdue-backup alert so both stamp the same freshness marker.
export function downloadBackup(state: AppState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `refrighandle-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  markBackedUp()
}

export interface BackupStatus {
  due: boolean
  // null = never backed up on this device.
  lastBackupAt: string | null
  daysSinceBackup: number | null
}

// Whether the overdue-backup nudge should show. Quiet when there's
// nothing worth losing, while a recent backup exists, while snoozed,
// or when merge-sync is on (the team backend then holds a copy).
export function backupStatus(state: AppState): BackupStatus {
  const lastBackupAt = getLastBackupAt()
  const now = Date.now()
  const daysSinceBackup = lastBackupAt
    ? Math.floor((now - new Date(lastBackupAt).getTime()) / 86400000)
    : null

  const status = (due: boolean): BackupStatus => ({
    due,
    lastBackupAt,
    daysSinceBackup,
  })

  if (state.sync.enabled) return status(false)
  if (state.transactions.length === 0) return status(false)

  const snooze = snoozedUntil()
  if (snooze && new Date(snooze).getTime() > now) return status(false)

  if (lastBackupAt) {
    return status((daysSinceBackup ?? 0) >= BACKUP_STALE_DAYS)
  }
  // Never backed up: give a fresh install a grace period, measured
  // from the oldest record so pre-existing data trips the nudge
  // immediately. `loggedAt` is the creation stamp; older rows only
  // have the work date, which is close enough for a grace check.
  let oldest = now
  for (const t of state.transactions) {
    const created = new Date(t.loggedAt ?? t.date).getTime()
    if (Number.isFinite(created) && created < oldest) oldest = created
  }
  const dataAgeDays = (now - oldest) / 86400000
  return status(dataAgeDays >= FIRST_BACKUP_GRACE_DAYS)
}
