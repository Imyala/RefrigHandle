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
  // Unknown / unidentified — e.g. a pump-down or recovery bottle holding
  // mixed or unlabelled refrigerant that hasn't been identified yet.
  'Unknown',
] as const

export type RefrigerantType = (typeof REFRIGERANT_TYPES)[number] | string

export type BottleStatus =
  | 'in_stock'
  | 'on_site'
  | 'returned'
  | 'empty'

// What kind of cylinder this is. A "pump-down" bottle is a dedicated
// cylinder used to pump down / recover a system's charge (its contents
// are often mixed or unidentified). Defaults to a standard single-
// refrigerant cylinder when unset.
export type BottleKind = 'standard' | 'pump_down'

export const BOTTLE_KIND_LABELS: Record<BottleKind, string> = {
  standard: 'Standard',
  pump_down: 'Pump-down',
}

export interface Bottle {
  id: string
  bottleNumber: string
  refrigerantType: RefrigerantType
  tareWeight: number // empty cylinder mass, kg
  grossWeight: number // current total mass (tare + refrigerant), kg
  initialNetWeight: number // refrigerant mass when first received, kg
  status: BottleStatus
  // Cylinder kind — defaults to 'standard' when unset (older bottles).
  bottleKind?: BottleKind
  currentSiteId?: string
  notes?: string
  // AS 2030 cylinder periodic test dates (ISO YYYY-MM-DD). Recovery
  // cylinders sold in Australia are stamped with the most recent test
  // date; periodic re-test interval is set by the cylinder's design
  // standard (typically 10 years for refrigerant recovery cylinders).
  lastHydroTestDate?: string
  nextHydroTestDate?: string
  // Set (to an ISO timestamp) when the cylinder has been sent away for
  // its periodic hydrostatic retest. While set, the bottle shows
  // "Awaiting retest" in place of the overdue alarm. Cleared when new
  // test dates are saved (the retest is done) or the tech cancels it.
  sentForRetestAt?: string
  // Where the cylinder came from — supplier name and their invoice /
  // docket number. ARC quarterly records require purchases to be
  // traceable to paperwork, not just weights. Also stamped onto the
  // intake transaction so the log row stays complete if the bottle
  // record is later deleted.
  supplier?: string
  invoiceNumber?: string
  createdAt: string
  // Tech name + RHL frozen at the time the bottle was added to the
  // system. Useful when a crew shares a device — anyone glancing at
  // the Bottles list can tell who entered each cylinder. Optional
  // because bottles created before this field existed won't have it.
  createdBy?: string
  createdByLicence?: string
  updatedAt: string
}

export interface Site {
  id: string
  // The site's identifier — its functional location (e.g. an FLOC code
  // like "BN-ASAC-ATSC"). Shown everywhere a site is referenced.
  name: string
  client?: string
  address?: string
  // State/territory the site is in (NSW, QLD, ...). Drives the Sites
  // page state filter bar.
  state?: string
  // Town / city within the state. Drives the collapsible grouping on
  // the Sites page.
  city?: string
  // Legacy free-text grouping label (pre state/city). Migrated into
  // `city` on load and no longer written by the form, but kept on the
  // type so old exports import cleanly.
  group?: string
  notes?: string
  createdAt: string
  // Stamped on every edit — drives last-write-wins per record when two
  // devices sync (see lib/merge.ts). Optional: pre-sync records lack it.
  updatedAt?: string
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
  // Stamped on every edit — drives last-write-wins per record when two
  // devices sync (see lib/merge.ts). Optional: pre-sync records lack it.
  updatedAt?: string
}

export type TransactionKind =
  | 'charge' // refrigerant put INTO equipment, removed from bottle
  | 'recover' // refrigerant pulled OUT of equipment, added to bottle
  | 'transfer' // bottle moved to a site (no weight change)
  | 'return' // bottle returned to stock / supplier
  | 'adjust' // manual correction
  | 'intake' // a new bottle entered the system, bringing its net charge

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
  // Frozen display names, stamped when the referenced site/unit record
  // is deleted. Historical rows must keep saying where the work
  // happened even after the site/unit itself is removed from the
  // register — an audit printout that shows "—" for location because
  // someone tidied up old sites is a broken record. Unset while the
  // live record still exists (the id lookup wins).
  siteName?: string
  unitName?: string
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
  // Business trading name, ABN and ARC Refrigerant Trading
  // Authorisation (RTA) frozen at the time of work for the same reason
  // as the RHL above — an audit needs to see the operator that was in
  // force when the transaction happened, not whoever owns the licence
  // today.
  businessName?: string
  businessAbn?: string
  arcAuthorisationNumber?: string
  equipment?: string // free-text fallback if no Unit is picked
  reason?: TransactionReason
  // Whether a leak test was performed as part of this job. Optional —
  // only meaningful for charge/recover work, and undefined on older
  // records / movement rows. Surfaced on the log and in the audit CSV
  // so an auditor can see leak-test coverage at a glance.
  leakTestPerformed?: boolean
  notes?: string
  // Where the bottle was returned (store / supplier) — only for 'return' kind
  returnDestination?: string
  // Consignment / docket number for a return — the paper trail an ARC
  // audit follows to the supplier or destruction facility (e.g. an
  // RRA consignment note). Only for 'return' kind.
  docketNumber?: string
  // Supplier + invoice for an 'intake' row, frozen from the bottle at
  // the time it entered the system (see Bottle.supplier).
  supplier?: string
  invoiceNumber?: string
  // Stamped when the tech proceeded with a charge/recover where the
  // bottle's refrigerant didn't match the unit's. Frozen at the time
  // of work — even if the unit's refrigerantType is later edited, the
  // logbook still shows the mismatch that was acknowledged when the
  // transaction happened.
  refrigerantMismatch?: {
    bottleType: string
    unitType: string
  }
  // Correction link (append-only correction workflow). When set, this
  // transaction was logged to correct an earlier one — `correctsId` is
  // the id of the original entry and `correctionReason` is the typed
  // explanation. The original is NEVER edited or deleted: both rows stay
  // on the record and reference each other, so the full history is
  // preserved for an audit (a true voiding/offsetting entry).
  correctsId?: string
  correctionReason?: string
  // Soft-delete fields. A row with deletedAt set is hidden from the
  // normal activity log, dashboard, and equipment logbook, and is
  // excluded from cumulative calcs (leak top-ups, totals). It stays
  // in storage so business owners / auditors can see what was
  // removed and restore it if the deletion was accidental. Bottle
  // weight is NOT reverted on soft-delete — the historical weight
  // chain is preserved as it was at the time of work.
  deletedAt?: string
  deletedBy?: string // technician name who soft-deleted
  deletedByLicence?: string // RHL of the technician who soft-deleted
  deletedReason?: string
}

// --- Audit / change log ----------------------------------------------
//
// Every mutating action in the store appends an AuditEntry, giving the
// business owner a single history of who changed what and when. This is
// deliberately separate from the refrigerant activity log
// (Transactions): that only covers cylinder movements, whereas the
// audit log covers *everything* — adds, edits, removals, relocations,
// decommissions, settings changes and bulk import/reset operations.

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'relocate'
  | 'restore'
  | 'decommission'
  | 'reactivate'
  | 'settings'
  | 'reset'
  | 'import'

export type AuditEntity =
  | 'bottle'
  | 'site'
  | 'unit'
  | 'transaction'
  | 'technician'
  | 'settings'
  | 'refrigerant'
  | 'preset'
  | 'data'

// A single before/after for one field in an update.
export interface AuditChange {
  field: string
  from?: string
  to?: string
}

export interface AuditEntry {
  id: string
  at: string // ISO timestamp the change happened
  action: AuditAction
  entity: AuditEntity
  entityId?: string
  // Human label of the affected record (bottle number, site name…).
  target: string
  // One-line description of what happened.
  summary: string
  // Field-level before/after, populated for update-style actions.
  changes?: AuditChange[]
  // Who was in the seat when the change was made (active tech profile,
  // falling back to legacy single-tech identity). Frozen at the time.
  by?: string
  byLicence?: string
  // --- Tamper-evidence (see lib/auditChain.ts) -------------------------
  // Entries are sealed into a per-device hash chain shortly after they
  // are written: each carries the device's chain id, its sequence number
  // within that chain, the previous entry's hash, and its own SHA-256
  // over the canonical content. Editing or deleting a sealed entry
  // breaks every later link in its chain, which the verifier reports.
  // Per-DEVICE chains (not one global chain) because multi-device sync
  // merges logs by union — a single chain would fork on every merge.
  chainId?: string
  seq?: number
  prevHash?: string
  hash?: string
}

// Deletion marker for hard-deleted records (bottles / sites / units /
// technicians / presets / custom refrigerants). Without these, syncing
// with a device that still holds the record would silently resurrect
// it. `id` is the record id (or the name, for custom refrigerants).
export interface Tombstone {
  entity:
    | 'bottle'
    | 'site'
    | 'unit'
    | 'technician'
    | 'preset'
    | 'refrigerant'
  id: string
  at: string // ISO timestamp of the deletion
}

export type WeightUnit = 'kg' | 'lb'

export type Theme = 'system' | 'light' | 'dark'

// 12-hour vs 24-hour clock — affects every place we render a time of
// day (transaction list, logbook PDFs, the time input in the
// transaction form). Stored values are always 24-hour internally; the
// setting only changes presentation and editing.
export type ClockFormat = '12h' | '24h'

export interface SyncSettings {
  enabled: boolean
  teamId: string
}

// Location is used for two things today:
// 1. The IANA timezone drives "now" defaults on the Transaction form
//    (so a tech in Sydney doesn't get a UTC default that's 10 hours
//    off). Also used by the logbook PDF for the "generated at" line.
// 2. Country/region/city are surfaced on the equipment logbook so
//    audit reports carry the business's operating location.
//
// All four are optional — empty strings just mean "use browser
// defaults / leave blank on PDF".
export interface LocationSettings {
  country: string // free text or ISO name, e.g. 'Australia'
  region: string // state / territory / province, e.g. 'NSW'
  city: string
  timezone: string // IANA name, e.g. 'Australia/Sydney'
}

// A technician profile carries the per-person identity that gets
// stamped onto every transaction the tech logs. Multiple profiles let
// a multi-tech crew use the same device (or, once cloud sync is real,
// the same business account) without overwriting each other's RHL.
export interface Technician {
  id: string
  name: string
  arcLicenceNumber: string // ARC RHL — personal licence, per tech
  // RHL expiry date (YYYY-MM-DD). RHLs run for two years; logging work
  // against a lapsed licence is itself a breach, so the app alerts as
  // expiry approaches (see expiryStatus).
  licenceExpiry?: string
  // Optional soft lock for switching the active profile on a shared
  // device. SHA-256 of `${id}:${password}` (id acts as salt). Storage
  // is localStorage, so this only deters casual snooping — anyone with
  // dev-tools access can still read every other tech's data.
  passwordHash?: string
  createdAt: string
  // Stamped on every edit — drives last-write-wins per record when two
  // devices sync (see lib/merge.ts). Optional: pre-sync records lack it.
  updatedAt?: string
}

export interface AppState {
  bottles: Bottle[]
  sites: Site[]
  units: Unit[]
  transactions: Transaction[]
  // Append-only change history covering every mutation in the app.
  // Newest entries first (the store prepends). Survives a data reset so
  // the record of the reset itself is preserved.
  auditLog: AuditEntry[]
  customRefrigerants: string[]
  favoriteRefrigerants: string[]
  customBottlePresets: BottlePreset[]
  favoriteBottlePresets: string[]
  // Per-tech profiles. Each profile carries a name + ARC RHL. When a
  // transaction is logged we stamp from the active profile.
  technicians: Technician[]
  // Which profile is currently in the seat on this device. Stored on
  // the shared state today (pre-auth) so a single-tech business gets
  // sticky behaviour; will move to per-device once we have real auth.
  activeTechnicianId?: string
  // Legacy single-tech fallback. Pre-profile installs only had one
  // tech name + RHL on the global state. We keep these around so an
  // old export still imports cleanly and migration into a profile is
  // lossless. New installs leave them empty.
  technician: string
  arcLicenceNumber: string
  // Australian compliance identity, surfaced on logbook PDFs and
  // auto-stamped onto each new Transaction so the historical record
  // is preserved if the licence/RTA changes later.
  arcAuthorisationNumber: string // ARC Refrigerant Trading Authorisation (RTA), per business
  // RTA expiry date (YYYY-MM-DD) — alerted on like RHL expiry.
  arcAuthorisationExpiry: string
  businessName: string
  businessAbn: string // Australian Business Number (11 digits)
  location: LocationSettings
  unit: WeightUnit
  theme: Theme
  clock: ClockFormat
  sync: SyncSettings
  // ISO timestamp set once the one-time first-run setup is finished
  // (business identity, ARC RTA, first technician and location all
  // entered). Until this is set, the app shows the onboarding gate and
  // blocks everything else. Existing installs are grandfathered in
  // `normalize()` so an upgrade never locks a returning user out.
  setupCompletedAt?: string
  // Deletion markers consumed by the sync merge — see Tombstone.
  tombstones: Tombstone[]
  // When the scalar settings block (business identity, location, units,
  // theme…) was last changed. The merge takes the whole block from
  // whichever side is newer.
  settingsUpdatedAt?: string
  // Stamped by "Erase all data" and by a backup import. During a merge,
  // records that exist only on the OTHER side and predate this moment
  // were erased here on purpose — they stay erased instead of being
  // resurrected by the union.
  dataResetAt?: string
}

export const EMPTY_STATE: AppState = {
  bottles: [],
  sites: [],
  units: [],
  transactions: [],
  auditLog: [],
  customRefrigerants: [],
  favoriteRefrigerants: [],
  customBottlePresets: [],
  favoriteBottlePresets: [],
  technicians: [],
  activeTechnicianId: undefined,
  technician: '',
  arcLicenceNumber: '',
  arcAuthorisationNumber: '',
  arcAuthorisationExpiry: '',
  businessName: '',
  businessAbn: '',
  location: { country: '', region: '', city: '', timezone: '' },
  unit: 'kg',
  theme: 'light',
  clock: '24h',
  sync: { enabled: false, teamId: '' },
  setupCompletedAt: undefined,
  tombstones: [],
  settingsUpdatedAt: undefined,
  dataResetAt: undefined,
}

// ABN checksum per the ATO algorithm: subtract 1 from the first digit,
// weight the 11 digits, and the weighted sum must divide by 89. Catches
// typos and transposed digits, not whether the ABN is actually
// registered. Spaces are ignored so "12 345 678 901" entry styles work.
export function isValidAbn(abn: string): boolean {
  const digits = abn.replace(/\s+/g, '')
  if (!/^\d{11}$/.test(digits)) return false
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const sum = weights.reduce(
    (acc, w, i) => acc + w * (Number(digits[i]) - (i === 0 ? 1 : 0)),
    0,
  )
  return sum % 89 === 0
}

// Location is "complete enough" for onboarding when we know the
// country, city and timezone. Region (state/territory) is only forced
// for Australia, where it's a clean dropdown and the Sites page leans
// on it; elsewhere it's free-text and optional.
export function isLocationComplete(l: LocationSettings): boolean {
  const hasCore =
    !!l.country.trim() && !!l.city.trim() && !!l.timezone.trim()
  if (!hasCore) return false
  return l.country !== 'Australia' || !!l.region.trim()
}

// True once the one-time first-run setup is done. We key off the
// explicit setupCompletedAt flag rather than re-deriving from the
// fields so that a later edit clearing, say, the business name can't
// silently re-trigger onboarding for an established install.
export function isSetupComplete(s: AppState): boolean {
  return !!s.setupCompletedAt
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

// Built-in Australian recovery cylinder presets (5.2 MPa rated). Tare and
// water capacity are nominal stamped values from supplier spec sheets
// (BOC, Coregas, Air Wholesalers, Supagas) — techs should still confirm
// against the actual cylinder's TW / WC stamp. Net refrigerant is worked
// out at fill time from WC × FR (refrigerant-specific).
export const BOTTLE_PRESETS: BottlePreset[] = [
  {
    id: 'au-rec-11wc',
    label: '11WC recovery (N Size)',
    labelKg: '11WC recovery (N Size, ~10 kg R-410A)',
    labelLb: '11WC recovery (N Size, ~22 lb R-410A)',
    tareKg: 6.25,
    waterCapacityKg: 11,
  },
  {
    id: 'au-rec-22wc',
    label: '22WC recovery (P Size / 50 lb)',
    labelKg: '22WC recovery (P Size, ~20 kg R-410A)',
    labelLb: '22WC recovery (50 lb, ~45 lb R-410A)',
    tareKg: 10,
    waterCapacityKg: 22,
  },
  {
    id: 'au-rec-46wc',
    label: '46WC recovery',
    labelKg: '46WC recovery (~43 kg R-410A)',
    labelLb: '46WC recovery (~95 lb R-410A)',
    tareKg: 21.2,
    waterCapacityKg: 46,
  },
  {
    id: 'au-rec-65wc',
    label: '65WC recovery (R Size)',
    labelKg: '65WC recovery (R Size, ~61 kg R-410A)',
    labelLb: '65WC recovery (R Size, ~134 lb R-410A)',
    tareKg: 31.3,
    waterCapacityKg: 65,
  },
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
    case 'intake':
      return 'Intake'
  }
}

export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural ?? singular + 's'}`
}

// Bottle-side delta implied by a scale reading, in kg. Positive =
// plausible for the kind; <= 0 means the reading contradicts the kind
// (e.g. a charge where the bottle got heavier). For 'adjust' the delta
// is signed — the reading IS the correction (stocktake weigh-in).
export function scaleDeltaKg(
  kind: TransactionKind,
  currentGrossKg: number,
  readingKg: number,
): number {
  if (kind === 'charge') return currentGrossKg - readingKg
  if (kind === 'recover') return readingKg - currentGrossKg
  if (kind === 'adjust') return readingKg - currentGrossKg
  return 0
}

export function transactionLoss(t: Transaction): number {
  if (t.bottleAmount === undefined || t.bottleAmount === null) return 0
  if (t.kind === 'charge') return Math.max(0, t.bottleAmount - t.amount)
  if (t.kind === 'recover') return Math.max(0, t.amount - t.bottleAmount)
  return 0
}

// The kinds that move a bottle between locations. Only these change a
// bottle's currentSiteId (see the store) — charge/recover/adjust leave
// the bottle where it is.
export function isMovement(k: TransactionKind): boolean {
  return k === 'transfer' || k === 'return'
}

// The site a bottle was located at immediately BEFORE the given movement
// (transfer / return) transaction. Movement rows only store the
// destination, so the origin has to be derived from history: it's the
// destination of the bottle's previous movement, or undefined when the
// bottle wasn't on any site then (fresh from stock, or its last move was
// a return). Pass the full, unsorted transactions array so the original
// insertion order can break ties between same-timestamp rows.
export function siteIdBeforeMovement(
  tx: Transaction,
  transactions: readonly Transaction[],
): string | undefined {
  const prev = movementBefore(tx, transactions)
  if (!prev || prev.kind === 'return') return undefined
  return prev.siteId
}

// The movement (transfer / return) immediately before the given one in
// the bottle's history, or undefined when this is the first move.
function movementBefore(
  tx: Transaction,
  transactions: readonly Transaction[],
): Transaction | undefined {
  const moves = transactions
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.bottleId === tx.bottleId && isMovement(t.kind))
  // Chronological ascending. The store prepends new rows, so within an
  // identical timestamp a higher array index means it was added earlier.
  moves.sort((a, b) => {
    if (a.t.date !== b.t.date) return a.t.date < b.t.date ? -1 : 1
    return b.i - a.i
  })
  const idx = moves.findIndex((m) => m.t.id === tx.id)
  if (idx <= 0) return undefined
  return moves[idx - 1].t
}

// A human-readable "from → to" for a movement transaction, using a
// caller-supplied site-name resolver. Returns null for non-movement
// kinds. "Stock" stands in for "not on any site" (in stock / supplier).
export function movementSummary(
  tx: Transaction,
  transactions: readonly Transaction[],
  siteName: (id: string | undefined) => string | undefined,
): { from: string; to: string } | null {
  if (!isMovement(tx.kind)) return null
  // Resolve via the live site record first, falling back to the name
  // frozen onto the row when the site was deleted.
  const prev = movementBefore(tx, transactions)
  const from =
    prev && prev.kind !== 'return'
      ? siteName(prev.siteId) ?? prev.siteName ?? 'Stock'
      : 'Stock'
  const to =
    tx.kind === 'return'
      ? tx.returnDestination?.trim() || 'Stock'
      : siteName(tx.siteId) ?? tx.siteName ?? 'Stock'
  return { from, to }
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

// --- Charge plausibility ----------------------------------------------
//
// Catches gross data-entry errors before they land in the record — e.g.
// logging 50 kg into a split system that holds ~2 kg. These are sanity
// guards, NOT regulatory limits: a tech with a genuine edge case can
// still proceed past a warning. We only hard-block physically absurd
// values that are almost certainly a typo (wrong decimal place, kg vs g).
//
// Per-kind soft thresholds are the upper end of a *single* charge for
// that equipment class (kg). Above the soft threshold we warn; well
// above it (or far beyond the unit's own recorded charge) we block.
export const PLAUSIBLE_MAX_CHARGE_KG: Partial<Record<UnitKind, number>> = {
  split: 6,
  split_ducted: 12,
  multi_head_split: 18,
  vrf_vrv: 80,
  heat_pump: 12,
  package: 40,
  air_handler_dx: 40,
  chiller: 1000,
  refrigeration: 300,
}

// Multiples applied to a known recorded charge (unit.refrigerantCharge)
// or to the per-kind soft threshold to decide warn vs. block.
export const CHARGE_WARN_MULTIPLE = 1.5
export const CHARGE_BLOCK_MULTIPLE = 5

export type ChargeSanityLevel = 'ok' | 'warn' | 'block'

export interface ChargeSanity {
  level: ChargeSanityLevel
  message?: string
}

// Assess whether `amountKg` is a plausible single charge into equipment.
// Prefers the unit's own recorded charge when known (most specific);
// otherwise falls back to the per-kind soft threshold. Returns 'ok' when
// we have nothing to compare against (unknown kind, no recorded charge).
export function chargeSanity(
  amountKg: number,
  opts: { unitKind?: UnitKind; recordedChargeKg?: number },
): ChargeSanity {
  if (!(amountKg > 0)) return { level: 'ok' }
  const { unitKind, recordedChargeKg } = opts

  if (recordedChargeKg && recordedChargeKg > 0) {
    if (amountKg > recordedChargeKg * CHARGE_BLOCK_MULTIPLE) {
      return {
        level: 'block',
        message: `${amountKg.toFixed(2)} kg is more than ${CHARGE_BLOCK_MULTIPLE}× this unit's recorded charge (${recordedChargeKg.toFixed(2)} kg) — almost certainly a typo.`,
      }
    }
    if (amountKg > recordedChargeKg * CHARGE_WARN_MULTIPLE) {
      return {
        level: 'warn',
        message: `${amountKg.toFixed(2)} kg exceeds this unit's recorded charge (${recordedChargeKg.toFixed(2)} kg). Double-check the amount.`,
      }
    }
    return { level: 'ok' }
  }

  const soft = unitKind ? PLAUSIBLE_MAX_CHARGE_KG[unitKind] : undefined
  if (soft) {
    if (amountKg > soft * 2) {
      return {
        level: 'block',
        message: `${amountKg.toFixed(2)} kg is far above the typical maximum for a ${UNIT_KIND_LABELS[unitKind!].toLowerCase()} (~${soft} kg) — check for a data-entry error.`,
      }
    }
    if (amountKg > soft) {
      return {
        level: 'warn',
        message: `${amountKg.toFixed(2)} kg is high for a ${UNIT_KIND_LABELS[unitKind!].toLowerCase()} (~${soft} kg typical). Double-check the amount.`,
      }
    }
  }
  return { level: 'ok' }
}

// --- Leak detection ---------------------------------------------------
//
// Australian guidance (AIRAH DA19, the Australia and New Zealand
// Refrigerant Handling Code of Practice 2025, and AS/NZS 5149.2 §5.3)
// does not set a fixed numeric leak-rate threshold
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
    if (t.deletedAt) continue
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

// --- Timezones --------------------------------------------------------
//
// Australian timezones only — ARC RTA / RHL licensing is Australian,
// so the app is Australia-only. The "label" is what techs recognise
// (AEST, AWST); the "iana" name is what Intl.DateTimeFormat /
// new Date() actually understand.

export interface TimezoneOption {
  iana: string
  label: string
  group: 'Australia'
}

export const TIMEZONE_OPTIONS: readonly TimezoneOption[] = [
  { iana: 'Australia/Sydney', label: 'Sydney — AEST/AEDT (NSW, ACT, VIC)', group: 'Australia' },
  { iana: 'Australia/Melbourne', label: 'Melbourne — AEST/AEDT', group: 'Australia' },
  { iana: 'Australia/Hobart', label: 'Hobart — AEST/AEDT (TAS)', group: 'Australia' },
  { iana: 'Australia/Brisbane', label: 'Brisbane — AEST (QLD, no DST)', group: 'Australia' },
  { iana: 'Australia/Adelaide', label: 'Adelaide — ACST/ACDT (SA)', group: 'Australia' },
  { iana: 'Australia/Broken_Hill', label: 'Broken Hill — ACST/ACDT (far west NSW)', group: 'Australia' },
  { iana: 'Australia/Darwin', label: 'Darwin — ACST (NT, no DST)', group: 'Australia' },
  { iana: 'Australia/Perth', label: 'Perth — AWST (WA)', group: 'Australia' },
] as const

// Australian states/territories — used for the Region dropdown when
// Country is Australia. Keeping it short avoids a 196-option country
// dropdown for the 95% case.
export const AU_REGIONS: readonly string[] = [
  'NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT',
] as const

// Curated city/town lists for the City pickers, grouped by state so
// the picker can filter. Covers the capitals plus the major regional
// cities and towns in each state — a tech in a smaller locality picks
// "Other" and types the name in.
export const AU_CITIES_BY_REGION: Record<string, readonly string[]> = {
  NSW: [
    'Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Maitland',
    'Wagga Wagga', 'Albury', 'Port Macquarie', 'Coffs Harbour',
    'Tamworth', 'Orange', 'Dubbo', 'Bathurst', 'Lismore', 'Nowra',
    'Queanbeyan', 'Tweed Heads', 'Goulburn', 'Armidale', 'Griffith',
    'Broken Hill', 'Grafton', 'Taree', 'Cessnock', 'Singleton',
    'Muswellbrook', 'Ballina', 'Moree', 'Parkes', 'Mudgee', 'Cowra',
    'Bega', 'Batemans Bay', 'Bowral',
  ],
  VIC: [
    'Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton',
    'Mildura', 'Warrnambool', 'Traralgon', 'Morwell', 'Moe', 'Sale',
    'Bairnsdale', 'Wodonga', 'Wangaratta', 'Horsham', 'Echuca',
    'Swan Hill', 'Colac', 'Portland', 'Hamilton', 'Ararat', 'Benalla',
    'Seymour', 'Castlemaine', 'Maryborough', 'Warragul', 'Drouin',
    'Leongatha', 'Torquay', 'Lakes Entrance',
  ],
  QLD: [
    'Brisbane', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns',
    'Toowoomba', 'Mackay', 'Rockhampton', 'Bundaberg', 'Hervey Bay',
    'Gladstone', 'Maryborough', 'Gympie', 'Yeppoon', 'Emerald',
    'Mount Isa', 'Warwick', 'Dalby', 'Roma', 'Charleville', 'Kingaroy',
    'Charters Towers', 'Ayr', 'Bowen', 'Airlie Beach', 'Moranbah',
    'Biloela', 'Innisfail', 'Mareeba', 'Atherton', 'Port Douglas',
    'Ingham', 'Longreach', 'Goondiwindi', 'Stanthorpe', 'Weipa',
  ],
  SA: [
    'Adelaide', 'Mount Gambier', 'Whyalla', 'Murray Bridge',
    'Port Augusta', 'Port Pirie', 'Port Lincoln', 'Victor Harbor',
    'Gawler', 'Mount Barker', 'Berri', 'Renmark', 'Loxton',
    'Naracoorte', 'Millicent', 'Kadina', 'Clare', 'Ceduna',
    'Roxby Downs', 'Coober Pedy',
  ],
  WA: [
    'Perth', 'Mandurah', 'Bunbury', 'Busselton', 'Geraldton',
    'Kalgoorlie', 'Albany', 'Broome', 'Karratha', 'Port Hedland',
    'Esperance', 'Carnarvon', 'Newman', 'Tom Price', 'Kununurra',
    'Derby', 'Margaret River', 'Collie', 'Narrogin', 'Northam',
    'Merredin', 'Manjimup', 'Exmouth',
  ],
  TAS: [
    'Hobart', 'Launceston', 'Devonport', 'Burnie', 'Ulverstone',
    'Kingston', 'New Norfolk', 'Sorell', 'George Town', 'Wynyard',
    'Smithton', 'Scottsdale', 'Huonville', 'Queenstown',
  ],
  NT: [
    'Darwin', 'Palmerston', 'Alice Springs', 'Katherine',
    'Tennant Creek', 'Nhulunbuy', 'Jabiru', 'Yulara',
  ],
  ACT: ['Canberra'],
}

// The marker the City picker uses to mean "let me type my own".
export const CITY_OTHER_VALUE = '__other__'

// --- Licence / authorisation expiry ------------------------------------
//
// ARC Refrigerant Handling Licences run for two years and the business
// RTA also has an expiry. Stamping work against a lapsed licence is a
// breach in its own right, so the app warns ahead of time. 60 days
// gives enough lead to lodge a renewal before the lapse.

export const LICENCE_WARN_DAYS = 60

export type ExpiryLevel = 'ok' | 'due_soon' | 'expired' | 'unknown'

export interface ExpiryStatus {
  level: ExpiryLevel
  // Whole days from "now" to expiry midnight. Negative = days past.
  daysLeft?: number
}

export function expiryStatus(
  expiryYmd?: string,
  nowISO: string = new Date().toISOString(),
): ExpiryStatus {
  if (!expiryYmd) return { level: 'unknown' }
  const m = expiryYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return { level: 'unknown' }
  // Licence is valid THROUGH its expiry date — compare against the end
  // of that day in local time.
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59)
  const days = Math.floor((end.getTime() - new Date(nowISO).getTime()) / 86_400_000)
  if (days < 0) return { level: 'expired', daysLeft: days }
  if (days <= LICENCE_WARN_DAYS) return { level: 'due_soon', daysLeft: days }
  return { level: 'ok', daysLeft: days }
}

// --- Calendar quarters (ARC reporting periods) --------------------------
//
// RTA record-keeping is quarterly: amounts bought, recovered, sold and
// disposed of each quarter, retained five years. These helpers bucket a
// local calendar day (YYYY-MM-DD, already resolved in the business
// timezone) into a calendar quarter.

export interface Quarter {
  year: number
  q: 1 | 2 | 3 | 4
}

export function quarterOfDay(ymd: string): Quarter | null {
  const m = ymd.match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const month = Number(m[2])
  return { year: Number(m[1]), q: (Math.ceil(month / 3) as Quarter['q']) }
}

export function quarterKey(qt: Quarter): string {
  return `${qt.year}-Q${qt.q}`
}

const QUARTER_MONTHS: Record<Quarter['q'], string> = {
  1: 'Jan – Mar',
  2: 'Apr – Jun',
  3: 'Jul – Sep',
  4: 'Oct – Dec',
}

export function quarterLabel(qt: Quarter): string {
  return `Q${qt.q} ${qt.year} (${QUARTER_MONTHS[qt.q]})`
}

// --- Cylinder hydrostatic test ----------------------------------------
//
// AS 2030 requires recovery cylinders to be periodically pressure-
// tested. We don't enforce a specific interval — the bottle stamp is
// authoritative — but we surface "due soon" / "overdue" so the tech
// doesn't take a non-compliant cylinder to a job.

export type HydroStatus = 'unknown' | 'ok' | 'due_soon' | 'overdue'

export interface HydroState {
  status: HydroStatus
  // Whole-month delta from "this month" to the due month. Positive =
  // months remaining; 0 = due this month; negative = months overdue.
  monthsUntilDue?: number
}

// Hydro test dates are stored as YYYY-MM (the stamp on the cylinder is
// month/year only). Legacy YYYY-MM-DD values are also accepted and
// truncated to YYYY-MM here.
export function hydroStatusFor(
  b: Bottle,
  nowISO: string = new Date().toISOString(),
): HydroState {
  const raw = b.nextHydroTestDate
  if (!raw) return { status: 'unknown' }
  const due = raw.slice(0, 7) // "YYYY-MM"
  const m = due.match(/^(\d{4})-(\d{2})$/)
  if (!m) return { status: 'unknown' }
  const dueY = Number(m[1])
  const dueM = Number(m[2])
  const now = new Date(nowISO)
  const curY = now.getFullYear()
  const curM = now.getMonth() + 1
  // Whole-month diff: how many months from "now" to "due".
  // due_soon fires the month BEFORE due (months=1) and the due month
  // itself (months=0). overdue once we're past the due month.
  const months = (dueY - curY) * 12 + (dueM - curM)
  if (months < 0) return { status: 'overdue', monthsUntilDue: months }
  if (months <= 1) return { status: 'due_soon', monthsUntilDue: months }
  return { status: 'ok', monthsUntilDue: months }
}
