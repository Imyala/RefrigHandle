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
  technician: string
  unit: WeightUnit
  sync: SyncSettings
}

export const EMPTY_STATE: AppState = {
  bottles: [],
  sites: [],
  units: [],
  transactions: [],
  customRefrigerants: [],
  favoriteRefrigerants: [],
  technician: '',
  unit: 'kg',
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
