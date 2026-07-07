import { isValidAbn, type Jurisdiction } from './types'

// Australian compliance profile. The app is Australia-only (the ARC
// RHL/RTA scheme), so there is a single profile — but the rest of the
// app still asks the profile for its terminology rather than hard-coding
// "RHL" / "RTA" / "ABN" strings everywhere, which keeps those labels in
// one place.
//
// AU — Ozone Protection & SGG Management Act/Regulations, ARC scheme,
//      ANZ Refrigerant Handling Code of Practice 2025, AS/NZS 5149.

export interface ComplianceProfile {
  id: Jurisdiction
  name: string
  // Personal licence/certification carried by each technician.
  techLicenceLabel: string
  techLicenceShort: string // prefix shown next to the number, e.g. "RHL 12345"
  hasBusinessAuthorisation: boolean
  businessAuthLabel: string
  businessAuthShort: string
  // Business registration number label + validator.
  businessNumberLabel: string
  businessNumberShort: string // prefix on printouts, e.g. "ABN 51 824…"
  validateBusinessNumber: (s: string) => boolean
  businessNumberHint: string
  recordRetentionYears: number
  // Footer citation for logbook / audit printouts.
  citation: string
}

export const COMPLIANCE_PROFILES: Record<Jurisdiction, ComplianceProfile> = {
  AU: {
    id: 'AU',
    name: 'Australia (ARC)',
    techLicenceLabel: 'ARC Refrigerant Handling Licence (RHL)',
    techLicenceShort: 'RHL',
    hasBusinessAuthorisation: true,
    businessAuthLabel: 'ARC Refrigerant Trading Authorisation (RTA)',
    businessAuthShort: 'RTA',
    businessNumberLabel: 'Business ABN',
    businessNumberShort: 'ABN',
    validateBusinessNumber: (s) => s.trim() === '' || isValidAbn(s),
    businessNumberHint: 'Your 11-digit Australian Business Number.',
    // Conservative figure. Regulation 141 (OPSGGM Regulations) requires
    // up-to-date quarterly records producible within 14 days of a written
    // request, and ARC permit-condition checks ask for the last two
    // quarters; no shorter statutory period is stated, so the app holds
    // (and tells users to keep) five years — re-verify against reg 141 /
    // ARC guidance at each COMPLIANCE.md review.
    recordRetentionYears: 5,
    citation:
      'Recorded against AS/NZS 5149.4 §6 (service records), the Australia and New Zealand Refrigerant Handling Code of Practice 2025, and AIRAH DA19. GWP values per IPCC AR4 (100-year) as adopted by the Ozone Protection and Synthetic Greenhouse Gas Management Regulations.',
  },
}

export function profileFor(j: Jurisdiction | undefined): ComplianceProfile {
  return COMPLIANCE_PROFILES[j ?? 'AU'] ?? COMPLIANCE_PROFILES.AU
}

// ── Risk management plan (ARC RTA condition) ─────────────────────────
// ARC's RTA conditions include holding a risk management plan for the
// business's refrigerant handling. This is the app's guided version:
// stable keys (stored state hangs off them — never renumber), with the
// wording kept practical rather than legalistic. Reviewed against the
// CoP 2025 obligations at each COMPLIANCE.md pass.
export interface RiskPlanItemDef {
  key: string
  label: string
  hint: string
}

export const RISK_PLAN_ITEMS: readonly RiskPlanItemDef[] = [
  {
    key: 'leak_prevention',
    label: 'Leak prevention & minimisation',
    hint: 'Every charge and recovery is leak-tested and leaks are rectified before topping up (CoP 2025). The app records the leak-test answer on each entry.',
  },
  {
    key: 'recovery_equipment',
    label: 'Recovery equipment maintained',
    hint: 'Recovery units, hoses and manifolds are serviced and in good order; scales/gauges are checked so recorded weights are trustworthy.',
  },
  {
    key: 'cylinder_storage',
    label: 'Cylinder storage, transport & testing',
    hint: 'Cylinders stored secured, upright and ventilated; within their AS 2030 test date (the app tracks due dates); transported restrained and documented.',
  },
  {
    key: 'licensing',
    label: 'Licence coverage',
    hint: 'Everyone who handles refrigerant holds a current RHL of the right class; expiries are tracked (the app alerts before they lapse).',
  },
  {
    key: 'record_keeping',
    label: 'Record-keeping responsibility',
    hint: 'A named person is responsible for the quarterly records being complete and producible within 14 days of a written request.',
  },
  {
    key: 'trading',
    label: 'Refrigerant bought and sold correctly',
    hint: 'Refrigerant is purchased from and sold to appropriately authorised parties only, with the paperwork (invoices, dockets) captured.',
  },
  {
    key: 'emergency',
    label: 'Incident & emergency response',
    hint: 'A procedure exists for major leaks/spills: ventilate, isolate, PPE on hand, and the incident is recorded in the log with photos.',
  },
] as const

// ── Compliance dataset stamp ──────────────────────────────────────────
// The regulated facts baked into this build — the GWP table and its AR4
// basis, filling ratios, the AS 2030 10-year retest default, licence
// durations, leak-watch thresholds, the retention period, and the code
// editions cited above — were last verified against the sources below on
// this date. The stamp is shown in Settings and on printed reports so a
// ruleset that predates a standards change is VISIBLY stale, never
// silently stale. Bump `verifiedAsOf` (and version) each time the
// COMPLIANCE.md review checklist is completed — even when nothing
// changed, so "verified recently" stays an honest claim.
export const COMPLIANCE_DATASET = {
  version: '2026.07',
  verifiedAsOf: '2026-07-07',
  summary:
    'GWP per IPCC AR4 (100-year) as used by the OPSGGM legislation · ' +
    'ANZ Refrigerant Handling Code of Practice 2025 · AS/NZS 5149:2016 · ' +
    'AS 2030 (10-year cylinder test stamp) · ARC RTA quarterly record',
  sources: [
    'DCCEEW — ozone/SGG legislation, GWP values, HFC phase-down',
    'ARC (arctick.org) — RTA conditions, reporting templates, licence types',
    'Ozone Protection and SGG Management Act 1989 and Regulations (as amended)',
  ],
} as const

// Human-readable "verified" date for the stamp (en-AU, e.g. "7 July 2026").
export function complianceVerifiedLabel(): string {
  return new Date(
    COMPLIANCE_DATASET.verifiedAsOf + 'T00:00:00',
  ).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

// True once the dataset is more than ~two quarters old — the point where
// "current" can no longer be assumed and the user should look for an app
// update. Pure client-side date math so the nudge works fully offline.
export const COMPLIANCE_STALE_DAYS = 190

export function complianceDataStale(now: Date = new Date()): boolean {
  const verified = new Date(COMPLIANCE_DATASET.verifiedAsOf + 'T00:00:00')
  const days = (now.getTime() - verified.getTime()) / 86400000
  return days > COMPLIANCE_STALE_DAYS
}
