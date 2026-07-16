import type { AppState } from './types'
import { transactionLoss } from './types'
import { exportAttachments } from './attachments'
import { formatDateTime, localDateTimeInput } from './datetime'
import { createZip, type ZipEntry } from './zip'
import { getRecordedHead, verifyAuditChains } from './auditChain'
import { COMPLIANCE_DATASET, complianceVerifiedLabel } from './compliance'

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
// With merge-sync on, a copy lives on the team server, so the export
// nudge relaxes to a longer interval — but it does NOT go away. Sync
// replicates between devices; it is not a durable, independent archive
// (a deleted project, an account loss, or a never-delivered record all
// leave no off-device copy). A periodic export is still the only thing
// the user fully controls, so we keep reminding, just less often.
export const BACKUP_STALE_DAYS_SYNCED = 90
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

// UTF-8 byte-order mark. Excel (the app every bookkeeper and auditor
// actually opens a CSV in) mis-decodes UTF-8 as ANSI without it, turning
// site names and notes with any non-ASCII character into mojibake. Added
// at the download/share boundary so buildLogCsv stays a pure string
// builder for tests and the ZIP path.
const CSV_BOM = '\uFEFF'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

// Hand a file to another app via the device share sheet (Mail, Drive,
// WhatsApp, a Xero files inbox…) when the platform can share files —
// the only reliable way out of an installed PWA on iOS — and fall back
// to a plain download everywhere else.
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  title?: string,
): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && 'canShare' in navigator) {
    const payload = {
      files: [new File([blob], filename, { type: blob.type })],
      title: title ?? filename,
    }
    if (navigator.canShare(payload)) {
      try {
        await navigator.share(payload)
        return 'shared'
      } catch (e) {
        // Cancelling the share sheet must not surprise-download the file.
        if (e instanceof DOMException && e.name === 'AbortError') {
          return 'cancelled'
        }
        // Any other failure (permission, transient) — fall through.
      }
    }
  }
  triggerDownload(blob, filename)
  return 'downloaded'
}

export async function downloadBackup(state: AppState): Promise<void> {
  const json = await buildBackupJson(state)
  triggerDownload(
    new Blob([json], { type: 'application/json' }),
    `refrigister-${new Date().toISOString().slice(0, 10)}.json`,
  )
  markBackedUp()
}

// Share the full JSON backup to another app (email it to the office,
// drop it in Drive…). Only a completed share/download counts as a
// backup — a cancelled share sheet must not reset the freshness nudge.
export async function shareBackup(state: AppState): Promise<ShareOutcome> {
  const json = await buildBackupJson(state)
  const out = await shareOrDownload(
    new Blob([json], { type: 'application/json' }),
    `refrigister-${new Date().toISOString().slice(0, 10)}.json`,
    'Refrigister full backup',
  )
  if (out !== 'cancelled') markBackedUp()
  return out
}

// One ZIP holding the complete JSON backup and the auditor-readable CSV log
// — the records a business must retain for 5–7 years, downloaded in a
// single file at account closure.
export async function downloadRecordsZip(state: AppState): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10)
  const json = await buildBackupJson(state)
  const csv = CSV_BOM + buildLogCsv(state)
  const zip = createZip([
    { name: `refrigister-backup-${stamp}.json`, data: json },
    { name: `refrigister-log-${stamp}.csv`, data: csv },
  ])
  triggerDownload(zip, `refrigister-records-${stamp}.zip`)
  markBackedUp()
}

// --- Audit pack ZIP -------------------------------------------------------

// Decode a data: URL to raw bytes for the ZIP. Returns null on anything
// malformed — one unreadable photo must not sink the whole pack.
function dataUrlBytes(dataUrl: string): Uint8Array | null {
  try {
    const comma = dataUrl.indexOf(',')
    if (comma < 0) return null
    const meta = dataUrl.slice(0, comma)
    const payload = dataUrl.slice(comma + 1)
    if (!/;base64$/i.test(meta)) return null
    const bin = atob(payload)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function extFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

export interface AuditPackOptions {
  from?: string // inclusive local day, YYYY-MM-DD
  to?: string
  periodLabel: string
}

// The one-file auditor hand-off: the period's movement CSV, the complete
// JSON backup, every photo and signature as a real image file (named by
// the record it documents, cross-referenceable to the CSV's id column),
// and a VERIFICATION.txt with the hash-chain result and the compliance
// ruleset stamp. Photos/signatures are included in full — attachments
// aren't dated by period, and an auditor would rather have too much
// evidence than a gap.
export async function buildAuditPackZip(
  state: AppState,
  opts: AuditPackOptions,
): Promise<Blob> {
  const stamp = new Date().toISOString().slice(0, 10)
  const entries: ZipEntry[] = []

  const csv = buildLogCsv(state, opts.from, opts.to)
  entries.push({ name: 'refrigerant-log.csv', data: CSV_BOM + csv })

  const attachments = await exportAttachments()
  let photoCount = 0
  let signatureCount = 0
  let skipped = 0
  const seq = new Map<string, number>()
  for (const a of attachments) {
    const bytes = dataUrlBytes(a.dataUrl)
    if (!bytes) {
      skipped += 1
      continue
    }
    const keyBase = `${a.kind}-${a.entityType}-${a.entityId}`
    const n = (seq.get(keyBase) ?? 0) + 1
    seq.set(keyBase, n)
    const folder = a.kind === 'signature' ? 'signatures' : 'photos'
    entries.push({
      name: `${folder}/${a.entityType}-${a.entityId}-${n}.${extFor(a.mimeType)}`,
      data: bytes,
    })
    if (a.kind === 'signature') signatureCount += 1
    else photoCount += 1
  }

  const json = await buildBackupJson(state)
  entries.push({ name: 'full-backup.json', data: json })

  const report = await verifyAuditChains(state.auditLog, getRecordedHead())
  const verification = [
    'REFRIGISTER AUDIT PACK — VERIFICATION STATEMENT',
    '='.repeat(60),
    '',
    `Business:        ${state.businessName || '(not set)'}`,
    `ABN:             ${state.businessAbn || '(not set)'}`,
    `ARC RTA:         ${state.arcAuthorisationNumber || '(not set)'}`,
    `Period:          ${opts.periodLabel}`,
    `Generated:       ${new Date().toISOString()}`,
    '',
    'CHANGE-LOG INTEGRITY (tamper-evident hash chain)',
    `  Entries:       ${report.total} (${report.sealed} sealed, ${report.unsealed} pending seal)`,
    `  Device chains: ${report.chains}`,
    `  Result:        ${report.valid ? 'VERIFIED — no tampering detected in any sealed chain' : 'FAILED — one or more sealed chains did not verify'}`,
    ...(report.valid
      ? []
      : report.problems
          .slice(0, 10)
          .map((p) => `  Problem:       [${p.chainId} #${p.seq ?? '?'}] ${p.message}`)),
    '',
    'COMPLIANCE RULESET',
    `  Version:       v${COMPLIANCE_DATASET.version} (verified against DCCEEW/ARC sources on ${complianceVerifiedLabel()})`,
    `  Basis:         ${COMPLIANCE_DATASET.summary}`,
    '',
    'CONTENTS',
    `  refrigerant-log.csv   Movement ledger for the period (active + deleted-row audit trail)`,
    `  full-backup.json      Complete dataset snapshot incl. change log and attachments`,
    `  photos/               ${photoCount} photo${photoCount === 1 ? '' : 's'} (all records on this device; filenames reference the record id in the CSV)`,
    `  signatures/           ${signatureCount} customer signature${signatureCount === 1 ? '' : 's'}`,
    ...(skipped ? [`  (${skipped} attachment${skipped === 1 ? '' : 's'} could not be decoded and were skipped)`] : []),
    '',
    'Deleted log entries are never erased: they appear in the CSV under',
    'DELETED TRANSACTIONS with who/when/why, and in the JSON backup.',
    `Exported from Refrigister on ${stamp}.`,
  ].join('\n')
  entries.push({ name: 'VERIFICATION.txt', data: verification })

  return createZip(entries)
}

// Build + hand off the pack in one tap (device share sheet where files
// can be shared, download otherwise). Counts as a backup — the ZIP
// contains the complete JSON snapshot.
export async function shareAuditPackZip(
  state: AppState,
  opts: AuditPackOptions,
): Promise<ShareOutcome> {
  const zip = await buildAuditPackZip(state, opts)
  const out = await shareOrDownload(
    zip,
    `refrigister-audit-pack-${new Date().toISOString().slice(0, 10)}.zip`,
    `Refrigister audit pack — ${opts.periodLabel}`,
  )
  if (out !== 'cancelled') markBackedUp()
  return out
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
    'local_date',
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
    'leakTestMethod',
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
    // dd/mm/yyyy in the record's own timezone — the column a spreadsheet
    // user (or a Xero import) actually sorts and filters on; the ISO
    // `date` and long-form `local_datetime` stay for precision.
    const localDay = localDateTimeInput(
      new Date(t.date),
      t.tz || state.location.timezone,
    ).slice(0, 10)
    const auDate = localDay.split('-').reverse().join('/')
    return [
      t.id,
      t.date,
      auDate,
      formatDateTime(t.date, t.tz || state.location.timezone, state.clock, true),
      t.tz || state.location.timezone || '',
      t.kind,
      // Frozen numbers first so the CSV stays correct after a bottle is
      // deleted (its movements stay on the record).
      t.bottleNumber ?? b?.bottleNumber ?? '',
      t.sourceBottleNumber ?? sb?.bottleNumber ?? '',
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
      t.leakTestMethod ?? '',
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

function csvFilename(from?: string, to?: string): string {
  const range = from || to ? `-${from || 'start'}-to-${to || 'now'}` : ''
  return `refrigister-log${range}-${new Date().toISOString().slice(0, 10)}.csv`
}

export function downloadLogCsv(state: AppState, from?: string, to?: string): void {
  const csv = buildLogCsv(state, from, to)
  triggerDownload(
    new Blob([CSV_BOM + csv], { type: 'text/csv' }),
    csvFilename(from, to),
  )
}

// Share the audit CSV to another app (mail it straight to the auditor
// or bookkeeper, drop it in a Xero files inbox…).
export async function shareLogCsv(
  state: AppState,
  from?: string,
  to?: string,
): Promise<ShareOutcome> {
  const csv = buildLogCsv(state, from, to)
  return shareOrDownload(
    new Blob([CSV_BOM + csv], { type: 'text/csv' }),
    csvFilename(from, to),
    'Refrigister refrigerant log',
  )
}

// Purchases CSV in Xero's bills-import column layout, one row per intake
// (cylinder entering the system) that has a recorded cost. This is a
// bookkeeping hand-off, not a compliance record: share it to the
// bookkeeper or a Xero files inbox, review, and import as draft bills.
// AccountCode is left for the business's own chart of accounts; Xero
// prompts for unmapped fields at import. Cost prefers the LIVE bottle
// value (bills usually get entered later) over the intake-time freeze.
export function buildPurchasesCsv(
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
  const header = [
    '*ContactName',
    '*InvoiceNumber',
    '*InvoiceDate',
    '*DueDate',
    'Description',
    '*Quantity',
    '*UnitAmount',
    '*AccountCode',
    '*TaxType',
  ]
  const rows: string[][] = [header]
  const intakes = state.transactions.filter(
    (t) => t.kind === 'intake' && !t.deletedAt && inRange(t.date),
  )
  for (const t of intakes) {
    const b = state.bottles.find((x) => x.id === t.bottleId)
    const cost = b?.costAud ?? t.costAud
    if (!cost || cost <= 0) continue
    const day = localDateTimeInput(
      new Date(t.date),
      t.tz || state.location.timezone,
    ).slice(0, 10)
    const auDate = day.split('-').reverse().join('/')
    const bottleNumber = t.bottleNumber ?? b?.bottleNumber ?? ''
    const refrigerant = t.bottleRefrigerantType ?? b?.refrigerantType ?? ''
    // Live bottle values first throughout — a bookkeeping export should
    // reflect corrections; the frozen copies only cover deleted bottles.
    rows.push([
      b?.supplier ?? t.supplier ?? 'Unknown supplier',
      b?.invoiceNumber ?? t.invoiceNumber ?? `RH-${bottleNumber || t.id.slice(0, 8)}`,
      auDate,
      auDate,
      `Refrigerant ${refrigerant} — cylinder ${bottleNumber}, ${t.amount.toFixed(2)} kg net`,
      '1',
      cost.toFixed(2),
      '',
      'GST on Expenses',
    ])
  }
  return rows
    .map((r) =>
      r
        .map((cell) => {
          let s = String(cell ?? '')
          if (/^[=@]/.test(s) || (/^[+-]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s))) {
            s = `'${s}`
          }
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(','),
    )
    .join('\n')
}

// Share the purchases CSV to the bookkeeper / a Xero files inbox.
export async function sharePurchasesCsv(
  state: AppState,
  from?: string,
  to?: string,
): Promise<ShareOutcome> {
  const csv = buildPurchasesCsv(state, from, to)
  const range = from || to ? `-${from || 'start'}-to-${to || 'now'}` : ''
  return shareOrDownload(
    new Blob([CSV_BOM + csv], { type: 'text/csv' }),
    `refrigister-purchases${range}-${new Date().toISOString().slice(0, 10)}.csv`,
    'Refrigister purchases (Xero bills format)',
  )
}

export interface BackupStatus {
  due: boolean
  // null = never backed up on this device.
  lastBackupAt: string | null
  daysSinceBackup: number | null
}

// Whether the overdue-backup nudge should show. Quiet when there's
// nothing worth losing, while a recent backup exists, or while snoozed.
// Merge-sync relaxes the cadence (the team server holds a copy) but
// never silences it — sync is replication, not an independent archive,
// so a periodic export is still warranted.
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

  if (state.transactions.length === 0) return status(false)

  const snooze = snoozedUntil()
  if (snooze && new Date(snooze).getTime() > now) return status(false)

  const staleDays = state.sync.enabled
    ? BACKUP_STALE_DAYS_SYNCED
    : BACKUP_STALE_DAYS

  if (lastBackupAt) {
    return status((daysSinceBackup ?? 0) >= staleDays)
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
  // Synced installs get the longer relaxed grace before the first export
  // nudge; an offline-only install is nudged after the short grace since
  // nothing else protects its records.
  const grace = state.sync.enabled
    ? BACKUP_STALE_DAYS_SYNCED
    : FIRST_BACKUP_GRACE_DAYS
  return status(dataAgeDays >= grace)
}
