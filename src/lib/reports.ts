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
