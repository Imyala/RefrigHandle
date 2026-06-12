import {
  isValidAbn,
  tonnesCO2eFor,
  type Jurisdiction,
  type Transaction,
  type Unit,
  type UnitKind,
} from './types'

// Jurisdiction compliance profiles. One place that knows what each
// regulatory regime calls things, how it validates identifiers, which
// leak-monitoring rule applies, and what the printed reports should
// cite. Everything else in the app asks the active profile instead of
// hard-coding Australian terminology.
//
// AU — Ozone Protection & SGG Management Act/Regulations, ARC scheme,
//      ANZ Refrigerant Handling Code of Practice 2025, AS/NZS 5149.
// EU — Regulation (EU) 2024/573 (F-Gas): leak checks scheduled by the
//      charge's CO2-equivalent, per-equipment records, 5-year retention.
// US — Clean Air Act §608 + AIM Act subsection (h): annualized leak
//      rate thresholds by appliance type for appliances ≥ 15 lb,
//      3-year records, EPA 608 technician certification.

export interface ComplianceProfile {
  id: Jurisdiction
  name: string
  // Personal licence/certification carried by each technician.
  techLicenceLabel: string
  techLicenceShort: string // prefix shown next to the number, e.g. "RHL 12345"
  // Business-level authorisation. Not all regimes have one (US §608
  // certifies people, not companies) — hide the fields when false.
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
  // Which leak-monitoring regime the UI applies (see helpers below).
  leakRegime: 'topup-advisory' | 'co2e-schedule' | 'leak-rate'
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
    recordRetentionYears: 5,
    citation:
      'Recorded against AS/NZS 5149.4 §6 (service records), the Australia and New Zealand Refrigerant Handling Code of Practice 2025, and AIRAH DA19. GWP values per IPCC AR4 (100-year) as adopted by the Ozone Protection and Synthetic Greenhouse Gas Management Regulations.',
    leakRegime: 'topup-advisory',
  },
  EU: {
    id: 'EU',
    name: 'European Union (F-Gas)',
    techLicenceLabel: 'F-gas certificate (personnel)',
    techLicenceShort: 'F-gas cert',
    hasBusinessAuthorisation: true,
    businessAuthLabel: 'Company F-gas certificate',
    businessAuthShort: 'Company cert',
    businessNumberLabel: 'VAT / business number',
    businessNumberShort: 'VAT/Reg',
    validateBusinessNumber: () => true,
    businessNumberHint: 'Your VAT or national business registration number.',
    recordRetentionYears: 5,
    citation:
      'Equipment records per Regulation (EU) 2024/573 (F-Gas) Art. 7 — operators must record quantity and type of gas installed, added and recovered, leak-check results and the certified personnel involved; records kept 5 years. CO2-equivalent figures computed from IPCC AR4 100-year GWP values (minor deviations from the Regulation annexes possible for some blends).',
    leakRegime: 'co2e-schedule',
  },
  US: {
    id: 'US',
    name: 'United States (EPA §608)',
    techLicenceLabel: 'EPA Section 608 certification',
    techLicenceShort: 'EPA 608',
    hasBusinessAuthorisation: false,
    businessAuthLabel: '',
    businessAuthShort: '',
    businessNumberLabel: 'EIN / business number',
    businessNumberShort: 'EIN',
    validateBusinessNumber: () => true,
    businessNumberHint: 'Your EIN or state business registration number.',
    recordRetentionYears: 3,
    citation:
      'Service and leak-repair records per 40 CFR Part 82 Subpart F (Clean Air Act §608) and the AIM Act subsection (h) refrigerant-management rule — leak-rate thresholds apply to appliances with a full charge of 15 lb or more; records kept 3 years.',
    leakRegime: 'leak-rate',
  },
}

export function profileFor(j: Jurisdiction | undefined): ComplianceProfile {
  return COMPLIANCE_PROFILES[j ?? 'AU'] ?? COMPLIANCE_PROFILES.AU
}

// --- US EPA §608 leak-rate thresholds ----------------------------------
//
// Annualized leak rate that triggers the duty to repair, by appliance
// type: comfort cooling 10%, commercial refrigeration 20%, industrial
// process refrigeration 30%. Applies to appliances with a full charge
// of ≥ 15 lb (6.8 kg). Our trailing-12-month top-up fraction is the
// standard "annualizing" approximation of the EPA leak-rate method.
export const US_CHARGE_THRESHOLD_KG = 6.8 // 15 lb

const US_COMFORT_COOLING: ReadonlySet<UnitKind> = new Set<UnitKind>([
  'split',
  'split_ducted',
  'multi_head_split',
  'vrf_vrv',
  'heat_pump',
  'package',
  'air_handler_dx',
  'chiller',
])

export function usLeakRateThreshold(kind?: UnitKind): number {
  if (!kind) return 0.1 // conservative default: comfort cooling
  if (US_COMFORT_COOLING.has(kind)) return 0.1
  if (kind === 'refrigeration') return 0.2
  return 0.1
}

// Watch level at half the regulatory threshold so a unit trending
// toward its duty-to-repair line is visible before it crosses.
export function leakThresholdsFor(
  j: Jurisdiction,
  unit: Unit,
): { watch: number; suspected: number } {
  if (j === 'US') {
    const t = usLeakRateThreshold(unit.kind)
    return { watch: t / 2, suspected: t }
  }
  // AU advisory defaults; EU uses the same advisory fractions for the
  // top-up pill — its primary regime is the check schedule below.
  return { watch: 0.05, suspected: 0.1 }
}

// True when the US regulatory thresholds actually bind this unit
// (charge at or above 15 lb). Below that the pill is advisory only.
export function usThresholdApplies(unit: Unit): boolean {
  return (unit.refrigerantCharge ?? 0) >= US_CHARGE_THRESHOLD_KG
}

// --- EU leak-check schedule (Regulation (EU) 2024/573) ------------------
//
// Mandatory leak-check interval by the charge's CO2-equivalent:
//   ≥ 5 t CO2e  → every 12 months
//   ≥ 50 t      → every 6 months
//   ≥ 500 t     → every 3 months
// (Intervals double with a fixed leak-detection system — not yet
// tracked per unit, so we show the undoubled, conservative schedule.)

export type EuCheckStatus = 'exempt' | 'no_check' | 'ok' | 'due_soon' | 'overdue'

export interface EuLeakCheck {
  status: EuCheckStatus
  intervalMonths?: 3 | 6 | 12
  tCO2e?: number
  lastCheck?: string // ISO date of the latest recorded leak test
  dueBy?: string // ISO date the next check is due
}

export function euLeakCheckIntervalMonths(
  chargeKg?: number,
  refrigerant?: string,
): 3 | 6 | 12 | null {
  if (!chargeKg || chargeKg <= 0) return null
  const t = tonnesCO2eFor(chargeKg, refrigerant)
  if (t == null) return null
  if (t >= 500) return 3
  if (t >= 50) return 6
  if (t >= 5) return 12
  return null
}

export function euLeakCheckFor(
  unit: Unit,
  transactions: readonly Transaction[],
  nowISO: string = new Date().toISOString(),
): EuLeakCheck {
  const intervalMonths = euLeakCheckIntervalMonths(
    unit.refrigerantCharge,
    unit.refrigerantType,
  )
  const tCO2e = unit.refrigerantCharge
    ? tonnesCO2eFor(unit.refrigerantCharge, unit.refrigerantType)
    : undefined
  if (!intervalMonths) return { status: 'exempt', tCO2e }

  // The latest live transaction on this unit where a leak test was
  // recorded as performed.
  let lastCheck: string | undefined
  for (const t of transactions) {
    if (t.unitId !== unit.id || t.deletedAt) continue
    if (t.leakTestPerformed !== true) continue
    if (!lastCheck || t.date > lastCheck) lastCheck = t.date
  }
  if (!lastCheck) {
    return { status: 'no_check', intervalMonths, tCO2e }
  }

  const due = new Date(lastCheck)
  due.setMonth(due.getMonth() + intervalMonths)
  const dueBy = due.toISOString()
  const now = new Date(nowISO).getTime()
  const status: EuCheckStatus =
    now > due.getTime()
      ? 'overdue'
      : now > due.getTime() - 30 * 86_400_000
        ? 'due_soon'
        : 'ok'
  return { status, intervalMonths, tCO2e, lastCheck, dueBy }
}
