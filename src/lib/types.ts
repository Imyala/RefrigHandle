export const REFRIGERANT_TYPES = [
  // Legacy CFC / HCFC
  'R12',
  'R22',
  'R23',
  'R401A',
  'R402A',
  'R408A',
  'R409A',
  'R502',
  // Common HVAC HFC
  'R32',
  'R134A',
  'R404A',
  'R407A',
  'R407C',
  'R407F',
  'R410A',
  // R404A / R134a replacements (lower GWP HFC blends)
  'R448A',
  'R449A',
  'R450A',
  'R452A',
  'R452B',
  'R454B',
  'R455A',
  'R466A',
  // Refrigeration / low-temp
  'R507A',
  'R508B',
  // Hydrocarbons
  'R290',
  'R600',
  'R600A',
  'R1270',
  // HFO
  'R1234YF',
  'R1234ZE',
  'R1233ZD',
  // Naturals
  'R717',
  'R744',
] as const

export type RefrigerantType = (typeof REFRIGERANT_TYPES)[number] | string

export type BottleStatus = 'in_stock' | 'on_site' | 'returned' | 'empty'

export interface Bottle {
  id: string
  bottleNumber: string
  refrigerantType: RefrigerantType
  tareWeight: number // empty cylinder mass, kg
  grossWeight: number // current total mass (tare + refrigerant), kg
  initialNetWeight: number // refrigerant mass when first received, kg
  status: BottleStatus
  currentSiteId?: string
  notes?: string
  // AS 2030 cylinder periodic test dates (ISO YYYY-MM-DD). Recovery
  // cylinders sold in Australia are stamped with the most recent test
  // date; periodic re-test interval is set by the cylinder's design
  // standard (typically 10 years for refrigerant recovery cylinders).
  lastHydroTestDate?: string
  nextHydroTestDate?: string
  createdAt: string
  updatedAt: string
}

export interface Site {
  id: string
  name: string
  client?: string
  address?: string
  notes?: string
  createdAt: string
}

export type UnitKind =
  | 'split'
  | 'split_ducted'
  | 'multi_head_split'
  | 'vrf_vrv'
  | 'heat_pump'
  | 'package'
  | 'chiller'
  | 'air_handler_dx'
  | 'air_handler_chw'
  | 'refrigeration'
  | 'chilled_water_pump'
  | 'cooling_tower'
  | 'boiler'
  | 'other'

export const UNIT_KIND_LABELS: Record<UnitKind, string> = {
  split: 'Split system',
  split_ducted: 'Split ducted',
  multi_head_split: 'Multihead split',
  vrf_vrv: 'VRF / VRV',
  heat_pump: 'Heat pump',
  package: 'Packaged unit',
  chiller: 'Chiller',
  air_handler_dx: 'Air handler / AHU (DX)',
  air_handler_chw: 'Air handler / AHU (chilled water)',
  refrigeration: 'Refrigeration',
  chilled_water_pump: 'Chilled water pump',
  cooling_tower: 'Cooling tower',
  boiler: 'Boiler',
  other: 'Other',
}

// Equipment that doesn't contain refrigerant — charging/recovering
// against it doesn't make physical sense. Used to soft-warn the user.
export const NON_REFRIGERANT_UNIT_KINDS: ReadonlySet<UnitKind> = new Set<UnitKind>([
  'air_handler_chw',
  'chilled_water_pump',
  'cooling_tower',
  'boiler',
])

export type UnitStatus = 'active' | 'decommissioned'

export interface Unit {
  id: string
  siteId: string
  name: string
  kind?: UnitKind
  refrigerantType?: RefrigerantType
  refrigerantCharge?: number // kg installed in this unit
  manufacturer?: string
  model?: string
  serial?: string
  installDate?: string // ISO date (YYYY-MM-DD)
  status: UnitStatus
  decommissionedAt?: string // ISO timestamp
  decommissionedReason?: string
  notes?: string
  createdAt: string
}

export type TransactionKind =
  | 'charge' // refrigerant put INTO equipment, removed from bottle
  | 'recover' // refrigerant pulled OUT of equipment, added to bottle
  | 'transfer' // bottle moved to a site (no weight change)
  | 'return' // bottle returned to stock / supplier
  | 'adjust' // manual correction

export type TransactionReason =
  | 'install'
  | 'service'
  | 'leak_repair'
  | 'top_up'
  | 'decommission'
  | 'other'

export const REASON_LABELS: Record<TransactionReason, string> = {
  install: 'Install / commissioning',
  service: 'Service',
  leak_repair: 'Leak repair',
  top_up: 'Top up',
  decommission: 'Decommission',
  other: 'Other',
}

export interface Transaction {
  id: string
  bottleId: string
  // For 'recover' from another bottle: the SOURCE bottle (loses weight).
  // The main bottleId is always the bottle this transaction belongs to
  // (gains weight on recover, loses on charge).
  sourceBottleId?: string
  // Source-bottle weight tracking (only set when sourceBottleId is set)
  sourceWeightBefore?: number
  sourceWeightAfter?: number
  siteId?: string
  unitId?: string
  kind: TransactionKind
  amount: number // kg of refrigerant moved (always positive). For charge: into equipment. For recover: out of equipment.
  // Optional bottle-side amount when it differs from `amount` due to
  // hose/decant losses. If unset, bottle change == amount.
  // For charge: bottleAmount > amount means some refrigerant left the
  // bottle but didn't reach the equipment (vented / left in hoses).
  // For recover: bottleAmount < amount means some refrigerant came out
  // of the equipment but didn't make it into the bottle.
  bottleAmount?: number
  weightBefore: number // bottle gross weight before
  weightAfter: number // bottle gross weight after
  date: string // ISO date
  technician?: string
  // ARC Refrigerant Handling Licence number stamped at the time of
  // work — frozen so a logbook printed years later still shows the
  // licence that was in force, not what the tech happens to hold now.
  technicianLicence?: string
  equipment?: string // free-text fallback if no Unit is picked
  reason?: TransactionReason
  notes?: string
  // Where the bottle was returned (store / supplier) — only for 'return' kind
  returnDestination?: string
}

export type WeightUnit = 'kg' | 'lb'

export type Theme = 'system' | 'light' | 'dark'

export interface SyncSettings {
  enabled: boolean
  teamId: string
}

export interface AppState {
  bottles: Bottle[]
  sites: Site[]
  units: Unit[]
  transactions: Transaction[]
  customRefrigerants: string[]
  favoriteRefrigerants: string[]
  customBottlePresets: BottlePreset[]
  favoriteBottlePresets: string[]
  technician: string
  // Australian compliance identity, surfaced on logbook PDFs and
  // auto-stamped onto each new Transaction so the historical record
  // is preserved if the licence/RTA changes later.
  arcLicenceNumber: string // ARC Refrigerant Handling Licence (RHL), per technician
  arcAuthorisationNumber: string // ARC Refrigerant Trading Authorisation (RTA), per business
  businessName: string
  unit: WeightUnit
  theme: Theme
  sync: SyncSettings
}

export const EMPTY_STATE: AppState = {
  bottles: [],
  sites: [],
  units: [],
  transactions: [],
  customRefrigerants: [],
  favoriteRefrigerants: [],
  customBottlePresets: [],
  favoriteBottlePresets: [],
  technician: '',
  arcLicenceNumber: '',
  arcAuthorisationNumber: '',
  businessName: '',
  unit: 'kg',
  theme: 'system',
  sync: { enabled: false, teamId: '' },
}

// Returns the refrigerant list with favourites first (alphabetical),
// then the rest (in their original order).
export function sortRefrigerants(
  types: readonly string[],
  favorites: readonly string[],
): string[] {
  const fav = new Set(favorites)
  const favs = types.filter((t) => fav.has(t)).sort()
  const rest = types.filter((t) => !fav.has(t))
  return [...favs, ...rest]
}

export function refrigerantLabel(name: string, favorites: readonly string[]): string {
  return favorites.includes(name) ? `★ ${name}` : name
}

export function netWeight(b: Bottle): number {
  return Math.max(0, b.grossWeight - b.tareWeight)
}

// Returns kg over the bottle's safe fill (initial net / capacity).
// Zero if the bottle has no capacity recorded or is within limits.
export function overfillKg(netKg: number, capacityKg: number): number {
  if (!capacityKg || capacityKg <= 0) return 0
  return Math.max(0, netKg - capacityKg)
}

export function isOverfilled(b: Bottle): boolean {
  return overfillKg(netWeight(b), b.initialNetWeight) > 0.01
}

// Common HVAC/R recovery cylinder presets. Tare is the nominal stamped
// tare from the manufacturer's spec sheet — techs should still confirm
// against the actual cylinder. Safe fill is calculated as 80 % of the
// water capacity, per DOT/CFR-49 rules for refrigerant cylinders.
export const SAFE_FILL_FRACTION = 0.8

export function safeFillFromWaterCapacity(wcKg: number): number {
  return Math.round(wcKg * SAFE_FILL_FRACTION * 100) / 100
}

export interface BottlePreset {
  id: string
  // Default label — used for custom presets, and as a fallback for
  // built-in ones. Built-in presets also carry kg/lb-specific labels
  // that match the unit selected in Settings.
  label: string
  labelKg?: string
  labelLb?: string
  tareKg: number
  // Water capacity (L). Drives refrigerant-aware safe fill (WC × FR).
  // Required for custom presets going forward.
  waterCapacityKg?: number
  // Optional pre-baked safe fill (legacy / custom-without-WC). When
  // waterCapacityKg is set, the picker uses WC × FR instead.
  safeFillKg?: number
  custom?: boolean
}

// No built-in presets. Each tech adds the cylinders they actually use,
// from which the picker is built. Tare comes from the cylinder stamp;
// water capacity drives the refrigerant-aware safe fill (WC × FR).
export const BOTTLE_PRESETS: BottlePreset[] = []

export function presetLabel(p: BottlePreset, unit: WeightUnit): string {
  if (p.custom) return p.label
  if (unit === 'kg' && p.labelKg) return p.labelKg
  if (unit === 'lb' && p.labelLb) return p.labelLb
  return p.label
}

// Filling ratios per refrigerant (kg of refrigerant per L of water capacity).
// Source: US DOT/CFR 49 173.304a Table 4 — values are nominally aligned with
// AS 2030.5 (Australia) but should always be verified against the actual
// cylinder's stamped FR for the refrigerant being recovered.
//
// max safe fill (kg) = water capacity (L) × FR
export const REFRIGERANT_FR: Record<string, number> = {
  // Common HVAC HFC
  R32: 0.78,
  R134A: 1.04,
  R404A: 0.82,
  R407A: 0.94,
  R407C: 0.94,
  R407F: 0.95,
  R410A: 0.94,
  // R404A / R134a replacements (lower-GWP HFC blends)
  R448A: 0.94,
  R449A: 0.94,
  R450A: 1.04,
  R452A: 0.86,
  R452B: 0.91,
  R454B: 0.86,
  R455A: 0.78,
  R466A: 0.94,
  // Refrigeration / low-temp
  R507A: 0.86,
  R508B: 1.04,
  // Legacy CFC / HCFC
  R12: 1.10,
  R22: 1.04,
  R23: 1.06,
  R401A: 1.06,
  R402A: 0.95,
  R408A: 0.96,
  R409A: 1.05,
  R502: 1.04,
  // Hydrocarbons (flammable — much lower fill density)
  R290: 0.43,
  R600: 0.42,
  R600A: 0.42,
  R1270: 0.43,
  // HFO
  R1234YF: 1.04,
  R1234ZE: 1.04,
  R1233ZD: 1.20,
  // Naturals
  R744: 0.68, // CO2 (high-pressure)
  R717: 0.53, // ammonia
}

// Conservative fallback when a refrigerant has no FR entry (custom blend,
// unknown refrigerant) — assumes water density. Picks 0.80 to match the
// generic "80 % of water capacity" rule of thumb used in older guidance.
export const FALLBACK_FR = 0.8

export function fillingRatio(refrigerant?: string): number {
  if (!refrigerant) return FALLBACK_FR
  return REFRIGERANT_FR[refrigerant.toUpperCase()] ?? FALLBACK_FR
}

export function safeFillKgFor(
  waterCapacityKg: number,
  refrigerant?: string,
): number {
  return Math.round(waterCapacityKg * fillingRatio(refrigerant) * 100) / 100
}

export function statusLabel(s: BottleStatus): string {
  switch (s) {
    case 'in_stock':
      return 'In stock'
    case 'on_site':
      return 'On site'
    case 'returned':
      return 'Returned'
    case 'empty':
      return 'Empty'
  }
}

export function transactionLabel(k: TransactionKind): string {
  switch (k) {
    case 'charge':
      return 'Charge'
    case 'recover':
      return 'Recover'
    case 'transfer':
      return 'Transfer'
    case 'return':
      return 'Return'
    case 'adjust':
      return 'Adjust'
  }
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`
}

export function transactionLoss(t: Transaction): number {
  if (t.bottleAmount === undefined || t.bottleAmount === null) return 0
  if (t.kind === 'charge') return Math.max(0, t.bottleAmount - t.amount)
  if (t.kind === 'recover') return Math.max(0, t.amount - t.bottleAmount)
  return 0
}

// Global Warming Potential (100-year, AR4 — IPCC Fourth Assessment).
// AR4 is the GWP basis used by Australia's Ozone Protection and
// Synthetic Greenhouse Gas Management Act 1989 / Regulations 1995, the
// EU F-Gas Regulation 517/2014, and most current product compliance
// labelling. Update to AR5/AR6 only when the regulator does — the
// reported tonnes-CO2-e on existing equipment changes if you don't.
//
// Sources cross-checked: IPCC AR4 WG1 Ch 2 Table 2.14, AIRAH DA19,
// EU F-gas Annex I/II. R1234yf/ze use AR5 values (AR4 omitted them).
export const REFRIGERANT_GWP: Record<string, number> = {
  // Legacy CFC / HCFC (phase-out)
  R12: 10900,
  R22: 1810,
  R23: 14800,
  R401A: 1182,
  R402A: 2788,
  R408A: 3152,
  R409A: 1909,
  R502: 4657,
  // HFC
  R32: 675,
  R134A: 1430,
  R404A: 3922,
  R407A: 2107,
  R407C: 1774,
  R407F: 1824,
  R410A: 2088,
  // R404A / R134a replacements (lower-GWP HFC blends)
  R448A: 1387,
  R449A: 1397,
  R450A: 605,
  R452A: 2141,
  R452B: 698,
  R454B: 466,
  R455A: 148,
  R466A: 733,
  // Refrigeration / low-temp
  R507A: 3985,
  R508B: 13396,
  // Hydrocarbons (very low GWP, flammable A3)
  R290: 3,
  R600: 4,
  R600A: 3,
  R1270: 2,
  // HFO (sub-1 GWP, AR5-listed)
  R1234YF: 4,
  R1234ZE: 7,
  R1233ZD: 1,
  // Naturals
  R717: 0, // ammonia
  R744: 1, // CO2
}

// Returns the GWP for a refrigerant, or `undefined` when unknown
// (custom blend, typo, refrigerant we haven't tabulated). Callers
// should treat undefined as "do not display tCO2-e" — silently
// substituting a fallback would mislead the auditor.
export function gwpFor(refrigerant?: string): number | undefined {
  if (!refrigerant) return undefined
  return REFRIGERANT_GWP[refrigerant.toUpperCase()]
}

// Tonnes CO2-equivalent for a given charge in kg. Returns undefined
// when the GWP is unknown (see gwpFor).
export function tonnesCO2eFor(
  kg: number,
  refrigerant?: string,
): number | undefined {
  const gwp = gwpFor(refrigerant)
  if (gwp == null) return undefined
  return (kg * gwp) / 1000
}

// --- Leak detection ---------------------------------------------------
//
// Australian guidance (AIRAH DA19, AREMA/AIRAH "Code of Practice for
// the reduction of emissions of fluorocarbon refrigerants" 2018, and
// AS/NZS 5149.2 §5.3) does not set a fixed numeric leak-rate threshold
// the way EU F-gas does. Instead the duty is to "investigate and
// rectify any leak detected" and to keep records of refrigerant added.
// Repeated top-ups against the same equipment are the recognised
// trigger for an investigation.
//
// We surface two soft levels rather than a single boolean — the
// thresholds below are conservative defaults aimed at flagging
// equipment for the technician's attention, not at making a
// regulatory determination.

export const LEAK_WATCH_FRACTION = 0.05 // 5% of charge in trailing 12 mo
export const LEAK_SUSPECTED_FRACTION = 0.1 // 10% of charge in trailing 12 mo
export const LEAK_TRAILING_DAYS = 365

export type LeakLevel = 'ok' | 'watch' | 'suspected' | 'unknown'

export interface LeakStatus {
  level: LeakLevel
  topUpKg: number // sum of charges in trailing window (excluding install)
  fraction: number // topUpKg / unit.refrigerantCharge, or 0 if no charge known
  windowDays: number
}

// Sum of charge transactions against a unit since `sinceISO`. Excludes
// reason='install' (commissioning charge isn't a top-up).
export function cumulativeTopUpKg(
  unitId: string,
  transactions: readonly Transaction[],
  sinceISO: string,
): number {
  let sum = 0
  for (const t of transactions) {
    if (t.unitId !== unitId) continue
    if (t.kind !== 'charge') continue
    if (t.reason === 'install') continue
    if (t.date < sinceISO) continue
    sum += t.amount
  }
  return sum
}

// Returns the unit's leak status against the trailing 12-month window.
// `nowISO` defaults to "today" but is injectable for tests/print views.
export function leakStatusFor(
  unit: Unit,
  transactions: readonly Transaction[],
  nowISO: string = new Date().toISOString(),
): LeakStatus {
  const windowDays = LEAK_TRAILING_DAYS
  const now = new Date(nowISO)
  const since = new Date(now.getTime() - windowDays * 86400 * 1000)
  const sinceISO = since.toISOString()
  const topUp = cumulativeTopUpKg(unit.id, transactions, sinceISO)
  const charge = unit.refrigerantCharge ?? 0
  if (charge <= 0) {
    return {
      level: topUp > 0 ? 'unknown' : 'ok',
      topUpKg: topUp,
      fraction: 0,
      windowDays,
    }
  }
  const fraction = topUp / charge
  const level: LeakLevel =
    fraction >= LEAK_SUSPECTED_FRACTION
      ? 'suspected'
      : fraction >= LEAK_WATCH_FRACTION
        ? 'watch'
        : 'ok'
  return { level, topUpKg: topUp, fraction, windowDays }
}

// --- Cylinder hydrostatic test ----------------------------------------
//
// AS 2030 requires recovery cylinders to be periodically pressure-
// tested. We don't enforce a specific interval — the bottle stamp is
// authoritative — but we surface "due soon" / "overdue" so the tech
// doesn't take a non-compliant cylinder to a job.

export const HYDRO_DUE_SOON_DAYS = 60

export type HydroStatus = 'unknown' | 'ok' | 'due_soon' | 'overdue'

export interface HydroState {
  status: HydroStatus
  daysUntilDue?: number // negative if overdue
}

export function hydroStatusFor(
  b: Bottle,
  nowISO: string = new Date().toISOString(),
): HydroState {
  if (!b.nextHydroTestDate) return { status: 'unknown' }
  const now = new Date(nowISO)
  const due = new Date(b.nextHydroTestDate)
  const diffDays = Math.floor((due.getTime() - now.getTime()) / 86400000)
  if (diffDays < 0) return { status: 'overdue', daysUntilDue: diffDays }
  if (diffDays <= HYDRO_DUE_SOON_DAYS) return { status: 'due_soon', daysUntilDue: diffDays }
  return { status: 'ok', daysUntilDue: diffDays }
}
