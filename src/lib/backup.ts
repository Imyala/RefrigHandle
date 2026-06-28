import type { AppState } from './types'
import { transactionLoss } from './types'
import { exportAttachments } from './attachments'
import { formatDateTime, localDateTimeInput } from './datetime'
import { createZip } from './zip'

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
// Photos and signatures (IndexedDB, see lib/attachments.ts) ride along
// under `__attachments` so "full backup" stays true; import strips the
// key back out before the state is restored.
// The full backup as a JSON string — the entire app state plus photos and
// signatures bundled under `__attachments`. Shared by the JSON download and
// the closure ZIP so "full backup" means the same thing everywhere.
export async function buildBackupJson(state: AppState): Promise<string> {
  const attachments = await exportAttachments()
  const payload =
    attachments.length > 0 ? { ...state, __attachments: attachments } : state
  return JSON.stringify(payload, null, 2)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function downloadBackup(state: AppState): Promise<void> {
  const json = await buildBackupJson(state)
  triggerDownload(
    new Blob([json], { type: 'application/json' }),
    `refrighandle-${new Date().toISOString().slice(0, 10)}.json`,
  )
  markBackedUp()
}

// One ZIP holding the complete JSON backup and the auditor-readable CSV log
// — the records a business must retain for 5–7 years, downloaded in a
// single file at account closure.
export async function downloadRecordsZip(state: AppState): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10)
  const json = await buildBackupJson(state)
  const csv = buildLogCsv(state)
  const zip = createZip([
    { name: `refrighandle-backup-${stamp}.json`, data: json },
    { name: `refrighandle-log-${stamp}.csv`, data: csv },
  ])
  triggerDownload(zip, `refrighandle-records-${stamp}.zip`)
  markBackedUp()
}

// The audit-friendly CSV of the refrigerant log: active transactions, then
// a second section listing every soft-deleted row (with who/when/why), so
// an auditor sees the full ledger and what was removed from it. Optional
// inclusive date range (local calendar days, business timezone). Shared by
// Settings → Export and the account-closure auto-export.
export function buildLogCsv(
  state: AppState,
  from?: string,
  to?: string,
): string {
  const inRange = (iso: string) => {
    if (!from && !to) return true
    const day = localDateTimeInput(new Date(iso), state.location.timezone).slice(
      0,
      10,
    )
    if (from && day < from) return false
    if (to && day > to) return false
    return true
  }
  const liveHeader = [
    'id',
    'date',
    'local_datetime',
    'timezone',
    'kind',
    'bottleNumber',
    'sourceBottleNumber',
    'refrigerantType',
    'amount_into_equipment_kg',
    'amount_from_bottle_kg',
    'loss_kg',
    'weightBefore_kg',
    'weightAfter_kg',
    'sourceWeightBefore_kg',
    'sourceWeightAfter_kg',
    'site',
    'client',
    'unit',
    'unitSerial',
    'equipment',
    'reason',
    'leakTestPerformed',
    'correctsId',
    'correctionReason',
    'returnDestination',
    'docketNumber',
    'supplier',
    'invoiceNumber',
    'technician',
    'technicianLicence',
    'businessName',
    'businessAbn',
    'arcAuthorisationNumber',
    'notes',
  ]
  const deletedHeader = [
    ...liveHeader,
    'deletedAt',
    'deletedBy',
    'deletedByLicence',
    'deletedReason',
  ]
  function rowFor(t: AppState['transactions'][number]): string[] {
    const b = state.bottles.find((x) => x.id === t.bottleId)
    const sb = t.sourceBottleId
      ? state.bottles.find((x) => x.id === t.sourceBottleId)
      : null
    const s = state.sites.find((x) => x.id === t.siteId)
    const u = state.units.find((x) => x.id === t.unitId)
    const loss = transactionLoss(t)
    return [
      t.id,
      t.date,
      formatDateTime(t.date, t.tz || state.location.timezone, state.clock, true),
      t.tz || state.location.timezone || '',
      t.kind,
      b?.bottleNumber ?? '',
      sb?.bottleNumber ?? '',
      // Frozen refrigerant first so the CSV stays correct after a bottle
      // is deleted (matches the quarterly report).
      t.bottleRefrigerantType ?? b?.refrigerantType ?? '',
      t.amount.toFixed(3),
      (t.bottleAmount ?? t.amount).toFixed(3),
      loss.toFixed(3),
      t.weightBefore.toFixed(3),
      t.weightAfter.toFixed(3),
      t.sourceWeightBefore?.toFixed(3) ?? '',
      t.sourceWeightAfter?.toFixed(3) ?? '',
      s?.name ?? t.siteName ?? '',
      s?.client ?? '',
      u?.name ?? t.unitName ?? '',
      u?.serial ?? '',
      t.equipment ?? '',
      t.reason ?? '',
      t.leakTestPerformed === undefined ? '' : t.leakTestPerformed ? 'Yes' : 'No',
      t.correctsId ?? '',
      (t.correctionReason ?? '').replace(/[\r\n]+/g, ' '),
      t.returnDestination ?? '',
      t.docketNumber ?? '',
      t.supplier ?? '',
      t.invoiceNumber ?? '',
      t.technician ?? '',
      t.technicianLicence ?? '',
      t.businessName ?? '',
      t.businessAbn ?? '',
      t.arcAuthorisationNumber ?? '',
      (t.notes ?? '').replace(/[\r\n]+/g, ' '),
    ]
  }
  const liveTxs = state.transactions.filter((t) => !t.deletedAt && inRange(t.date))
  const deletedTxs = state.transactions
    .filter((t) => !!t.deletedAt && inRange(t.date))
    .slice()
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
  const rows: (string[] | string)[] = [
    ['ACTIVE TRANSACTIONS'],
    liveHeader,
    ...liveTxs.map((t) => rowFor(t)),
  ]
  if (deletedTxs.length > 0) {
    rows.push([])
    rows.push([`DELETED TRANSACTIONS (audit trail · ${deletedTxs.length})`])
    rows.push(deletedHeader)
    for (const t of deletedTxs) {
      rows.push([
        ...rowFor(t),
        t.deletedAt ?? '',
        t.deletedBy ?? '',
        t.deletedByLicence ?? '',
        (t.deletedReason ?? '').replace(/[\r\n]+/g, ' '),
      ])
    }
  }
  return rows
    .map((r) =>
      (Array.isArray(r) ? r : [r])
        .map((cell) => {
          let s = String(cell ?? '')
          // Spreadsheet formula-injection guard: a free-text field starting
          // with = @ + or - would execute as a formula in Excel. Prefix
          // with ' to force text — but leave plain negative numbers be.
          if (/^[=@]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s))) {
            s = `'${s}`
          }
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}

export function downloadLogCsv(state: AppState, from?: string, to?: string): void {
  const csv = buildLogCsv(state, from, to)
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const range = from || to ? `-${from || 'start'}-to-${to || 'now'}` : ''
  a.download = `refrighandle-log${range}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
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
