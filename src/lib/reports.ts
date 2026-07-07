// Shared, pure report computations. Extracted from the Compliance-health
// card and the Quarterly-report modal so the printable Audit Pack reuses
// the EXACT same numbers — an auditor's pack and the on-screen cards can
// never disagree. No React, no formatting; just data in → data out.

import type { AppState, Bottle, Transaction } from './types'
import {
  expiryStatus,
  hydroStatusFor,
  isOutOfFleet,
  isTechnicianActive,
  leakStatusFor,
  quarterKey,
  quarterLabel,
  quarterOfDay,
  supersededIds,
  transactionLoss,
} from './types'
import { profileFor } from './compliance'
import { backupStatus } from './backup'
import { formatPlainDate, localDateTimeInput } from './datetime'

export type ComplianceLevel = 'ok' | 'attention' | 'action'

export interface ComplianceRow {
  id: string
  label: string
  level: ComplianceLevel
  summary: string
  // Where the on-screen card deep-links to fix it (unused in print).
  to: string
  state?: Record<string, unknown>
}

const RANK: Record<ComplianceLevel, number> = { ok: 0, attention: 1, action: 2 }

export function worstLevel(levels: ComplianceLevel[]): ComplianceLevel {
  return levels.reduce<ComplianceLevel>(
    (a, b) => (RANK[b] > RANK[a] ? b : a),
    'ok',
  )
}

function joinParts(parts: (string | false | 0)[]): string {
  return parts.filter(Boolean).join(' · ')
}

// The five compliance signals the app tracks: technician licences (RHL),
// the business authorisation (RTA), cylinder periodic testing (AS 2030),
// equipment leak rate (AIRAH DA19) and records backup.
export function complianceRows(state: AppState): ComplianceRow[] {
  const profile = profileFor(state.jurisdiction)
  const out: ComplianceRow[] = []

  // 1. Technician licences (RHL) — active technicians only.
  const actives = state.technicians.filter(isTechnicianActive)
  let licExpired = 0
  let licDueSoon = 0
  let licMissing = 0
  for (const t of actives) {
    if (!t.licenceExpiry) {
      licMissing += 1
      continue
    }
    const ex = expiryStatus(t.licenceExpiry)
    if (ex.level === 'expired') licExpired += 1
    else if (ex.level === 'due_soon') licDueSoon += 1
  }
  const licLevel: ComplianceLevel = licExpired
    ? 'action'
    : licDueSoon || licMissing
      ? 'attention'
      : 'ok'
  out.push({
    id: 'licences',
    label: `Technician ${profile.techLicenceShort}`,
    level: licLevel,
    summary:
      actives.length === 0
        ? 'No active technicians'
        : licExpired || licDueSoon || licMissing
          ? joinParts([
              licExpired && `${licExpired} expired`,
              licDueSoon && `${licDueSoon} due soon`,
              licMissing && `${licMissing} missing a date`,
            ])
          : `All ${actives.length} current`,
    to: '/settings',
    state: { scrollTo: 'business' },
  })

  // 2. Business authorisation (RTA) — only where the scheme has one.
  if (profile.hasBusinessAuthorisation) {
    let rtaLevel: ComplianceLevel = 'ok'
    let rtaSummary: string
    if (!state.arcAuthorisationExpiry) {
      rtaLevel = 'attention'
      rtaSummary = 'No expiry recorded'
    } else {
      const ex = expiryStatus(state.arcAuthorisationExpiry)
      if (ex.level === 'expired') {
        rtaLevel = 'action'
        rtaSummary = `Expired ${formatPlainDate(state.arcAuthorisationExpiry)}`
      } else if (ex.level === 'due_soon') {
        rtaLevel = 'attention'
        rtaSummary =
          ex.daysLeft === 0
            ? 'Expires today'
            : `Expires in ${ex.daysLeft} day${ex.daysLeft === 1 ? '' : 's'}`
      } else {
        rtaSummary = `Current${ex.daysLeft != null ? ` · ${ex.daysLeft} days left` : ''}`
      }
    }
    out.push({
      id: 'rta',
      label: `Business ${profile.businessAuthShort}`,
      level: rtaLevel,
      summary: rtaSummary,
      to: '/settings',
      state: { scrollTo: 'business' },
    })
  }

  // 3. Cylinder periodic testing (AS 2030) — cylinders still in service.
  const inService = state.bottles.filter((b) => !isOutOfFleet(b.status))
  let cOver = 0
  let cDue = 0
  let cUnknown = 0
  for (const b of inService) {
    const h = hydroStatusFor(b)
    if (h.status === 'overdue') cOver += 1
    else if (h.status === 'due_soon') cDue += 1
    else if (h.status === 'unknown') cUnknown += 1
  }
  const cylLevel: ComplianceLevel = cOver ? 'action' : cDue ? 'attention' : 'ok'
  out.push({
    id: 'cylinders',
    label: 'Cylinder testing (AS 2030)',
    level: cylLevel,
    summary:
      inService.length === 0
        ? 'No cylinders in service'
        : cOver || cDue
          ? joinParts([
              cOver && `${cOver} overdue`,
              cDue && `${cDue} due soon`,
              cUnknown && `${cUnknown} no date`,
            ])
          : cUnknown === inService.length
            ? 'No test dates recorded'
            : joinParts([
                `All ${inService.length - cUnknown} in date`,
                cUnknown && `${cUnknown} no date`,
              ]),
    to: '/bottles',
  })

  // 4. Equipment leak rate (AIRAH DA19) — active units over the threshold.
  const activeUnits = state.units.filter((u) => u.status === 'active')
  let leakSuspected = 0
  let leakWatch = 0
  for (const u of activeUnits) {
    const lk = leakStatusFor(u, state.transactions)
    if (lk.level === 'suspected') leakSuspected += 1
    else if (lk.level === 'watch') leakWatch += 1
  }
  const leakLevel: ComplianceLevel = leakSuspected
    ? 'action'
    : leakWatch
      ? 'attention'
      : 'ok'
  out.push({
    id: 'leaks',
    label: 'Equipment leak rate (DA19)',
    level: leakLevel,
    summary:
      activeUnits.length === 0
        ? 'No equipment in service'
        : leakSuspected || leakWatch
          ? joinParts([
              leakSuspected &&
                `${leakSuspected} suspected leak${leakSuspected === 1 ? '' : 's'}`,
              leakWatch && `${leakWatch} to watch`,
            ])
          : `All ${activeUnits.length} within range`,
    to: '/sites',
  })

  // 5. Records backup.
  const bs = backupStatus(state)
  let bkLevel: ComplianceLevel = 'ok'
  let bkSummary: string
  if (state.sync.enabled) {
    bkSummary = 'Syncing to your backend'
  } else if (bs.due) {
    bkLevel = 'attention'
    bkSummary = bs.lastBackupAt
      ? `Overdue · ${bs.daysSinceBackup} days since last`
      : 'No backup saved yet'
  } else {
    bkSummary = bs.lastBackupAt
      ? `Backed up ${bs.daysSinceBackup === 0 ? 'today' : `${bs.daysSinceBackup} days ago`}`
      : 'No records to back up yet'
  }
  out.push({
    id: 'backup',
    label: 'Records backup',
    level: bkLevel,
    summary: bkSummary,
    to: '/settings',
  })

  return out
}

// --- Quarterly refrigerant record ---------------------------------------

export interface QuarterTotals {
  refrigerant: string
  purchasedKg: number // intake rows (new cylinders entering the system)
  chargedKg: number // charge rows, equipment side
  recoveredKg: number // recover from equipment (bottle-to-bottle excluded)
  returnedKg: number // net refrigerant in cylinders when returned
  soldKg: number // net refrigerant in cylinders sold to another party (reg 141 'sold')
  adjustKg: number // signed manual adjustments
  lossKg: number // hose / decant losses on charge & recover rows
  rows: number
}

// Per-refrigerant totals over an arbitrary set of local calendar days,
// chosen by `inRange` (a predicate on the YYYY-MM-DD business-timezone day).
// `live` must already be the non-deleted transactions. This is the engine
// behind both the per-quarter record and the year / custom-range pack.
export function rangeTotals(
  live: Transaction[],
  bottles: Bottle[],
  inRange: (localDay: string) => boolean,
  tz: string,
): QuarterTotals[] {
  const dayOf = (t: Transaction) =>
    localDateTimeInput(new Date(t.date), tz).slice(0, 10)
  const byType = new Map<string, QuarterTotals>()
  const bucket = (refrigerant: string): QuarterTotals => {
    let b = byType.get(refrigerant)
    if (!b) {
      b = {
        refrigerant,
        purchasedKg: 0,
        chargedKg: 0,
        recoveredKg: 0,
        returnedKg: 0,
        soldKg: 0,
        adjustKg: 0,
        lossKg: 0,
        rows: 0,
      }
      byType.set(refrigerant, b)
    }
    return b
  }
  // Originals superseded by a re-statement correction are skipped — the
  // correction row carries the true amount on the same work date. The set
  // is built from ALL live rows so a correction logged in a later quarter
  // still voids its original here.
  const superseded = supersededIds(live)
  for (const t of live) {
    if (superseded.has(t.id)) continue
    if (!inRange(dayOf(t))) continue
    const bottle = bottles.find((b) => b.id === t.bottleId)
    const b = bucket(
      t.bottleRefrigerantType ?? bottle?.refrigerantType ?? 'Unknown',
    )
    b.rows += 1
    if (t.kind === 'intake') b.purchasedKg += t.amount
    else if (t.kind === 'charge') b.chargedKg += t.amount
    else if (t.kind === 'recover') {
      if (!t.sourceBottleId) b.recoveredKg += t.amount
    } else if (t.kind === 'return') {
      const tare = t.bottleTareWeight ?? bottle?.tareWeight
      if (tare != null) {
        b.returnedKg += Math.max(0, t.weightBefore - tare)
      }
    } else if (t.kind === 'sell') {
      // Reg 141's "sold" quantity — net contents of the cylinder at sale.
      const tare = t.bottleTareWeight ?? bottle?.tareWeight
      if (tare != null) {
        b.soldKg += Math.max(0, t.weightBefore - tare)
      }
    } else if (t.kind === 'adjust') {
      b.adjustKg += t.amount
    }
    b.lossKg += transactionLoss(t)
  }
  return [...byType.values()].sort((a, b) =>
    a.refrigerant.localeCompare(b.refrigerant),
  )
}

// --- Quarter-close ritual -------------------------------------------------

// The card only appears in the closing stretch of a quarter — a nudge,
// not a permanent fixture.
export const QUARTER_CLOSE_WINDOW_DAYS = 14

export interface QuarterCloseItem {
  id: string
  label: string
  // Where the fix lives.
  to: string
}

export interface QuarterCloseStatus {
  quarterKey: string
  quarterLabelText: string
  closesOn: string // YYYY-MM-DD (last local day of the quarter)
  daysLeft: number // 0 = closes today
  movements: number // live movements logged this quarter so far
  items: QuarterCloseItem[] // outstanding fixes, empty = ready
}

// Turns the last fortnight of each quarter into a 5-minute routine: what
// still needs attention before the ARC quarterly record is worth
// printing. Returns null outside the window. Pure — `today` is the local
// calendar day in the business timezone.
export function quarterCloseStatus(
  state: AppState,
  today: string,
): QuarterCloseStatus | null {
  const q = quarterOfDay(today)
  if (!q) return null
  const endMonth = q.q * 3
  const lastDay = new Date(Date.UTC(q.year, endMonth, 0)).getUTCDate()
  const closesOn = `${q.year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const daysLeft = Math.round(
    (Date.parse(`${closesOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
      86400000,
  )
  if (daysLeft < 0 || daysLeft > QUARTER_CLOSE_WINDOW_DAYS) return null

  const items: QuarterCloseItem[] = []

  // Cylinders whose AS 2030 state would embarrass the record.
  const inService = state.bottles.filter((b) => !isOutOfFleet(b.status))
  const noTestDate = inService.filter(
    (b) => hydroStatusFor(b).status === 'unknown',
  ).length
  const overdue = inService.filter(
    (b) => hydroStatusFor(b).status === 'overdue',
  ).length
  if (overdue > 0) {
    items.push({
      id: 'cyl-overdue',
      label: `${overdue} cylinder${overdue === 1 ? '' : 's'} overdue for the AS 2030 test`,
      to: '/bottles',
    })
  }
  if (noTestDate > 0) {
    items.push({
      id: 'cyl-nodate',
      label: `${noTestDate} cylinder${noTestDate === 1 ? '' : 's'} with no test date recorded`,
      to: '/bottles',
    })
  }

  // Licences / RTA that lapse before or shortly after the close.
  const actives = state.technicians.filter(isTechnicianActive)
  const licProblem = actives.filter((t) => {
    if (!t.licenceExpiry) return true
    const lv = expiryStatus(t.licenceExpiry).level
    return lv === 'expired' || lv === 'due_soon'
  }).length
  if (licProblem > 0) {
    items.push({
      id: 'licences',
      label: `${licProblem} technician licence${licProblem === 1 ? '' : 's'} expired, expiring or missing a date`,
      to: '/settings',
    })
  }
  if (state.arcAuthorisationExpiry) {
    const lv = expiryStatus(state.arcAuthorisationExpiry).level
    if (lv !== 'ok') {
      items.push({
        id: 'rta',
        label: 'The RTA is expired or expiring — renew before the record is signed',
        to: '/settings',
      })
    }
  }

  // Risk plan (an RTA condition): never reviewed, or stale by a year.
  const reviewedAt = state.riskPlan?.reviewedAt
  const staleReview =
    !reviewedAt ||
    Date.parse(reviewedAt) < Date.parse(`${today}T00:00:00Z`) - 365 * 86400000
  if (staleReview) {
    items.push({
      id: 'risk-plan',
      label: reviewedAt
        ? 'Risk management plan review is over a year old'
        : 'Risk management plan has never been reviewed',
      to: '/settings',
    })
  }

  // A fresh backup belongs with a closed quarter.
  if (backupStatus(state).due) {
    items.push({
      id: 'backup',
      label: 'Records backup is overdue — export one with the record',
      to: '/settings',
    })
  }

  const key = quarterKey(q)
  const live = state.transactions.filter((t) => !t.deletedAt)
  const dayOf = (t: Transaction) =>
    localDateTimeInput(new Date(t.date), state.location.timezone).slice(0, 10)
  const movements = live.filter((t) => {
    const qd = quarterOfDay(dayOf(t))
    return !!qd && quarterKey(qd) === key
  }).length

  return {
    quarterKey: key,
    quarterLabelText: quarterLabel(q),
    closesOn,
    daysLeft,
    movements,
    items,
  }
}

// --- Monthly owner summary --------------------------------------------

export interface MonthlySummary {
  monthLabel: string // e.g. "June 2026"
  monthKey: string // YYYY-MM
  movements: number
  chargedKg: number
  recoveredKg: number
  purchasedKg: number
  soldKg: number
  topSite?: { name: string; movements: number }
  leakWatchUnits: number // active units currently at watch/suspected
}

// "Last month at a glance" — the numbers an owner forwards to a partner.
// Covers the previous calendar month relative to `today`; null when it
// had no movements (a fresh install shouldn't show a wall of zeros).
export function monthlySummary(
  state: AppState,
  today: string,
): MonthlySummary | null {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7)) // 1–12
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const monthKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}`
  const tz = state.location.timezone

  const superseded = supersededIds(
    state.transactions.filter((t) => !t.deletedAt),
  )
  const rows = state.transactions.filter((t) => {
    if (t.deletedAt || superseded.has(t.id)) return false
    return (
      localDateTimeInput(new Date(t.date), tz).slice(0, 7) === monthKey
    )
  })
  if (rows.length === 0) return null

  let chargedKg = 0
  let recoveredKg = 0
  let purchasedKg = 0
  let soldKg = 0
  const bySite = new Map<string, number>()
  for (const t of rows) {
    if (t.kind === 'charge') chargedKg += t.amount
    else if (t.kind === 'recover' && !t.sourceBottleId) recoveredKg += t.amount
    else if (t.kind === 'intake') purchasedKg += t.amount
    else if (t.kind === 'sell') {
      const bottle = state.bottles.find((b) => b.id === t.bottleId)
      const tare = t.bottleTareWeight ?? bottle?.tareWeight
      if (tare != null) soldKg += Math.max(0, t.weightBefore - tare)
    }
    const siteName =
      state.sites.find((s) => s.id === t.siteId)?.name ?? t.siteName
    if (siteName) bySite.set(siteName, (bySite.get(siteName) ?? 0) + 1)
  }
  const top = [...bySite.entries()].sort((a, b) => b[1] - a[1])[0]

  const leakWatchUnits = state.units.filter((u) => {
    if (u.status !== 'active') return false
    const lv = leakStatusFor(u, state.transactions).level
    return lv === 'watch' || lv === 'suspected'
  }).length

  const monthLabel = new Date(
    Date.UTC(prevYear, prevMonth - 1, 1),
  ).toLocaleDateString('en-AU', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return {
    monthLabel,
    monthKey,
    movements: rows.length,
    chargedKg,
    recoveredKg,
    purchasedKg,
    soldKg,
    topSite: top ? { name: top[0], movements: top[1] } : undefined,
    leakWatchUnits,
  }
}

// Per-refrigerant totals for one calendar quarter — the ARC quarterly
// record. Thin wrapper over rangeTotals so the on-screen Quarterly report
// keeps its API while the audit pack reuses the same engine.
export function quarterlyTotals(
  live: Transaction[],
  bottles: Bottle[],
  selectedKey: string,
  tz: string,
): QuarterTotals[] {
  return rangeTotals(
    live,
    bottles,
    (day) => {
      const q = quarterOfDay(day)
      return !!q && quarterKey(q) === selectedKey
    },
    tz,
  )
}
