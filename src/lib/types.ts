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
  safeFillKg: number
  waterCapacityKg?: number
  custom?: boolean
}

export const BOTTLE_PRESETS: BottlePreset[] = [
  { id: '30lb',     label: '30 lb cylinder',                 labelKg: '11.9 kg cylinder',              labelLb: '30 lb cylinder',                  tareKg: 7.6,   waterCapacityKg: 11.9,  safeFillKg: safeFillFromWaterCapacity(11.9)  },
  { id: '50lb',     label: '50 lb cylinder',                 labelKg: '21.6 kg cylinder',              labelLb: '50 lb cylinder',                  tareKg: 13.3,  waterCapacityKg: 21.6,  safeFillKg: safeFillFromWaterCapacity(21.6)  },
  { id: '123lb',    label: '123 lb cylinder',                labelKg: '55.8 kg cylinder',              labelLb: '123 lb cylinder',                 tareKg: 26.3,  waterCapacityKg: 55.8,  safeFillKg: safeFillFromWaterCapacity(55.8)  },
  { id: '239lb-l',  label: '239 lb cylinder (light shell)',  labelKg: '108.4 kg cylinder (light shell)', labelLb: '239 lb cylinder (light shell)', tareKg: 33.1,  waterCapacityKg: 108.4, safeFillKg: safeFillFromWaterCapacity(108.4) },
  { id: '239lb-h',  label: '239 lb cylinder (heavy shell)',  labelKg: '108.4 kg cylinder (heavy shell)', labelLb: '239 lb cylinder (heavy shell)', tareKg: 51.3,  waterCapacityKg: 108.4, safeFillKg: safeFillFromWaterCapacity(108.4) },
  { id: '1000lb-l', label: '1,000 lb cylinder (light shell)',labelKg: '450 kg cylinder (light shell)',   labelLb: '1,000 lb cylinder (light shell)', tareKg: 130.2, waterCapacityKg: 450,   safeFillKg: safeFillFromWaterCapacity(450)   },
  { id: '1000lb-h', label: '1,000 lb cylinder (heavy shell)',labelKg: '450 kg cylinder (heavy shell)',   labelLb: '1,000 lb cylinder (heavy shell)', tareKg: 213.6, waterCapacityKg: 450,   safeFillKg: safeFillFromWaterCapacity(450)   },
]

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
