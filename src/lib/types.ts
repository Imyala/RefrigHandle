// Ordered as a plain string sort of the code — character by character, so
// digits sort before letters (R12 < R134A < R22 < R23 < R290 < R32 < R401A…).
// This is "number order, then letter order" reading left to right, which is
// how the chips and every refrigerant dropdown read. "Unknown" is the one
// non-numeric entry and always sorts last.
export const REFRIGERANT_TYPES = [
  'R12',
  'R1233ZD',
  'R1234YF',
  'R1234ZE',
  'R1270',
  'R134A',
  'R22',
  'R23',
  'R290',
  'R32',
  'R401A',
  'R402A',
  'R404A',
  'R407A',
  'R407C',
  'R407F',
  'R408A',
  'R409A',
  'R410A',
  'R448A',
  'R449A',
  'R450A',
  'R452A',
  'R452B',
  'R454B',
  'R454C',
  'R455A',
  'R466A',
  'R502',
  'R507A',
  'R508B',
  'R513A',
  'R515B',
  'R600',
  'R600A',
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
  | 'sold'
  | 'empty'

// A cylinder that has left the fleet — returned to a supplier or sold to
// another party. The two statuses behave identically everywhere except
// the label; use this instead of comparing against 'returned' so "out of
// our possession" logic can't miss sold cylinders.
export function isOutOfFleet(s: BottleStatus): boolean {
  return s === 'returned' || s === 'sold'
}

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
  // its periodic pressure retest (AS 2030). While set, the bottle shows
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
  // What the cylinder + charge cost, AUD ex-GST. Purely for the
  // bookkeeping export (Xero purchases CSV) — no compliance figure uses
  // it. Editable after the fact: bills usually arrive later.
  costAud?: number
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
  // like "BN-ASAC-ATSC"). Optional: many businesses don't use FLOC codes,
  // so this may be blank — use siteLabel() to display a site, which falls
  // back to the address / town when there's no functional location.
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

// Display label for a site. The functional location (name) is optional, so
// fall back to the address, then the town/city, then a clear placeholder —
// a site is never shown blank in a list, picker, or audit.
export function siteLabel(site: {
  name?: string
  address?: string
  city?: string
}): string {
  return (
    site.name?.trim() ||
    site.address?.trim() ||
    site.city?.trim() ||
    'Unnamed site'
  )
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

// A job / work-order: one site visit, grouping the refrigerant movements
// logged against it (via Transaction.jobId) plus its photos and customer
// sign-off (in the attachment store, entityType 'job'). The container that
// turns a string of transactions into "the work we did at this site today"
// and the basis for a customer-facing service report.
export interface Job {
  id: string
  // Human reference / title: a work-order number, or a short description
  // like "AC service — Smith". Required so the job is identifiable.
  reference: string
  siteId?: string
  // Snapshots taken at creation so the job reads standalone even if the
  // site is later renamed or removed.
  siteName?: string
  clientName?: string
  // When the visit happened (ISO timestamp).
  date: string
  // Who attended — frozen name + ARC RHL, like a transaction's stamp.
  technician?: string
  technicianLicence?: string
  notes?: string
  status: 'open' | 'closed'
  closedAt?: string
  createdAt: string
  // Drives last-write-wins per record on sync (see lib/merge.ts).
  updatedAt?: string
}

export type TransactionKind =
  | 'charge' // refrigerant put INTO equipment, removed from bottle
  | 'recover' // refrigerant pulled OUT of equipment, added to bottle
  | 'transfer' // bottle moved to a site (no weight change)
  | 'return' // bottle returned to stock / supplier
  | 'sell' // cylinder + contents sold to another party (reg 141 'sold')
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
  // Optional work-order grouping: the job (site visit) this movement was
  // logged against. Lets a visit's charges/recoveries be gathered into one
  // record and a customer-facing service report. Unset for ad-hoc entries.
  jobId?: string
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
  // Bottle tare + refrigerant frozen at the time of work. Quarterly and
  // CSV figures need the cylinder's tare (returned net = gross − tare) and
  // its refrigerant (to bucket the row by gas) — freezing them here means
  // those numbers survive the bottle record later being deleted, instead
  // of silently dropping to zero / "Unknown". Optional: older rows fall
  // back to the live bottle lookup.
  bottleTareWeight?: number
  bottleRefrigerantType?: string
  // Cylinder number(s) frozen at the time of work, so the row still
  // identifies its cylinder(s) in every view and report after the bottle
  // record is deleted. A deleted bottle's movements stay LIVE — they are
  // historical facts that quarterly figures and logbooks must keep
  // counting — so they can't rely on the live bottle lookup. Optional:
  // older rows fall back to that lookup.
  bottleNumber?: string
  sourceBottleNumber?: string
  date: string // ISO date
  technician?: string
  // ARC Refrigerant Handling Licence number stamped at the time of
  // work — frozen so a logbook printed years later still shows the
  // licence that was in force, not what the tech happens to hold now.
  technicianLicence?: string
  // Access role the tech held when this was logged, frozen for the same
  // reason. A role change (e.g. apprentice → technician) applies only to
  // work logged from that point on; past rows keep the role of the day.
  technicianRole?: TechnicianRole
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
  // The detection method used when leakTestPerformed is true. Provides
  // richer audit evidence — e.g. confirming an electronic detector was
  // used as required on large A2L/A3 charge systems per AIRAH DA19.
  leakTestMethod?: LeakTestMethod
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
  // Purchase cost (AUD ex-GST) frozen from the bottle on intake. The
  // purchases export prefers the LIVE bottle value (costs are often
  // entered when the bill arrives, weeks later); this frozen copy keeps
  // the figure if the bottle record is deleted.
  costAud?: number
  // Stamped when the tech proceeded with a charge/recover where the
  // bottle's refrigerant didn't match the unit's. Frozen at the time
  // of work — even if the unit's refrigerantType is later edited, the
  // logbook still shows the mismatch that was acknowledged when the
  // transaction happened.
  refrigerantMismatch?: {
    bottleType: string
    unitType: string
  }
  // Acknowledged warnings — the tech saved THROUGH an on-screen warning
  // that the app allows past (per AS 2030.5 / consolidation workflows) but
  // a supervisor should still be able to see after the fact. Frozen at the
  // time of work so the override is auditable, not just a transient banner.
  // savedOverSafeFill: the move pushed the bottle's net over its safe-fill
  // limit. refrigerantContamination: a bottle-to-bottle decant where the
  // source and destination refrigerants differed.
  savedOverSafeFill?: boolean
  refrigerantContamination?: {
    sourceType: string
    destType: string
  }
  // Correction link (append-only correction workflow). When set, this
  // transaction was logged to correct an earlier one — `correctsId` is
  // the id of the original entry and `correctionReason` is the typed
  // explanation. The original is NEVER edited or deleted: both rows stay
  // on the record and reference each other, so the full history is
  // preserved for an audit (a true voiding/offsetting entry).
  //
  // Two correction shapes exist:
  // - Re-statement (kind === original's kind, charge/recover): the row
  //   re-states the original with the corrected amount and the same
  //   site/unit/work-date. The original is superseded — excluded from
  //   leak stats, logbook/site totals and quarterly figures in favour
  //   of this row (see supersededIds). The bottle is adjusted by the
  //   delta between corrected and original amounts.
  // - Legacy bottle adjustment (kind === 'adjust'): fixes the bottle
  //   ledger only; the original keeps counting on the equipment side.
  correctsId?: string
  correctionReason?: string
  // When the row was created (device clock), as distinct from `date`,
  // the time the work happened. Lets a correction carry the original's
  // work date (so leak windows and quarterly bucketing stay right)
  // while the record still shows when the fix was logged. Unset on
  // rows created before this field existed.
  loggedAt?: string
  // IANA timezone the time was recorded in — the local zone of the device
  // that logged it. A Perth tech's row reads in Perth time and a Brisbane
  // tech's in Brisbane time, frozen so the entry is unambiguous wherever
  // the audit is later read. Optional: rows logged before this existed
  // fall back to the business location timezone for display.
  tz?: string
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
  // Set when a soft-deleted row is restored (deletedAt is cleared at the
  // same time). Kept so a sync merge can tell a restore that happened
  // AFTER a deletion from a stale deleted copy still held elsewhere —
  // the later of deletedAt / restoredAt is the live fact (see merge.ts).
  restoredAt?: string
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
  // A licence (RHL) or authorisation (RTA) crossing its expiry date — a
  // time-driven state change, recorded automatically so a lapse is on the
  // audit trail even though no one "edited" anything.
  | 'expire'

export type AuditEntity =
  | 'bottle'
  | 'site'
  | 'unit'
  | 'job'
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
  // IANA timezone the change was made in (the device's local zone), shown
  // on the change log so times are unambiguous across a multi-state crew.
  // Display only — deliberately NOT part of the sealed hash (auditChain).
  tz?: string
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
  // Chain id of the DEVICE THAT CREATED the entry, stamped at write time
  // (before sealing). Sealing is restricted to entries this device
  // originated: if an unsealed entry ever reaches another device via
  // sync, both sides sealing it into their own chains would leave two
  // permanently different seals for the same entry id — endless merge
  // ping-pong and false tamper alarms. Routing metadata only; not part
  // of the sealed hash. Unset on entries written before this existed.
  origin?: string
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
    | 'job'
    | 'technician'
    | 'preset'
    | 'refrigerant'
  id: string
  at: string // ISO timestamp of the deletion
  // Set when the deletion was undone (restore from the recycle bin).
  // Needed for records that carry NO timestamps of their own (custom
  // refrigerants are plain strings, presets are unstamped): without it,
  // the other device's copy of the tombstone would win every merge and
  // re-delete the restored item forever. A revoked tombstone
  // (revokedAt >= at) no longer kills; a LATER re-delete writes a fresh
  // tombstone whose at beats the old revocation.
  revokedAt?: string
}

// Entities that can be sent to (and recovered from) the recycle bin.
export type RecyclableEntity =
  | 'bottle'
  | 'site'
  | 'unit'
  | 'job'
  | 'technician'
  | 'preset'
  | 'refrigerant'

// A recoverable record of a deletion. The app NEVER hard-drops a bottle,
// site, unit, technician profile, preset or custom refrigerant into
// oblivion — the removed record is captured here in full so an
// owner/supervisor can restore it later (Change log → Recently deleted).
// The live collection (state.bottles, …) still only holds active records,
// so every list/picker/report keeps working unchanged; the bin is the
// archive alongside it. Restoring re-inserts the record and clears its
// tombstone so a sync won't immediately re-delete it.
export interface RecycleBinEntry {
  id: string // id of THIS bin entry (not the record)
  entity: RecyclableEntity
  recordId: string // id of the deleted record (or the name, for refrigerants)
  label: string // human label for the recovery list, e.g. "Bottle ABC123"
  deletedAt: string
  deletedBy?: string
  deletedByLicence?: string
  deletedReason?: string
  // The full removed record, kept verbatim so a restore is lossless.
  record: unknown
}

// The app is Australia-only (the ARC RHL/RTA scheme). The type is kept
// as a single-member union so stored data and the compliance profile
// indirection in lib/compliance.ts stay typed, rather than being a bare
// string literal scattered through the code.
export type Jurisdiction = 'AU'

// Turn the monotonic build number (github.run_number — one per deploy)
// into a tidy lettered version in the same style as TERMS_VERSION: the
// trailing letter cycles a–z and the minor bumps on each full cycle, so it
// reads v1.1a → v1.1b → … → v1.1z → v1.2a. It's a 1:1 mapping, so the
// string still uniquely and accurately identifies the deployment.
export function formatBuildVersion(build: number): string {
  const idx = Math.max(0, Math.floor(build) - 1)
  const letter = String.fromCharCode(97 + (idx % 26))
  const minor = 1 + Math.floor(idx / 26)
  return `v1.${minor}${letter}`
}

// Released app version, shown small at the bottom of Settings. The deploy
// workflow injects VITE_APP_BUILD = github.run_number (which climbs by one
// per deployment), and we format it into the lettered string above — so it
// bumps automatically on every push to main / deploy with no manual edit.
// Falls back to 'dev' for local builds that don't set the env var.
const APP_BUILD = Number(import.meta.env.VITE_APP_BUILD as string | undefined)
export const APP_VERSION =
  Number.isFinite(APP_BUILD) && APP_BUILD > 0
    ? formatBuildVersion(APP_BUILD)
    : 'dev'

// Short commit the build was cut from, shown alongside APP_VERSION for
// support / traceability. Undefined on local builds.
export const APP_COMMIT = (
  import.meta.env.VITE_APP_COMMIT as string | undefined
)?.slice(0, 7)

// Bump when the Terms & disclaimer wording materially changes, so users are
// asked to re-accept (see TermsGate). Stored as termsAcceptedVersion. A
// lettered string, bumped by hand — unlike APP_VERSION this MUST NOT move
// every deploy, or users would be forced to re-accept the terms on each
// release. Re-acceptance triggers on any change, not on numeric ordering.
export const TERMS_VERSION = 'v1.1f'

// Recorded when an owner requests account closure. Its presence locks the
// app (see AccountClosedGate) — the device can't be used again until the
// closure is lifted by re-importing a pre-closure backup or clearing data.
export interface AccountClosure {
  requestedAt: string // ISO
  reason: string // label
  details?: string
  contactName: string
  contactEmail?: string
  contactPhone?: string
  // Snapshot of who the request was for, frozen at request time.
  businessName: string
  businessAbn: string
  arcAuthorisationNumber: string
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
// Access tier for a technician profile. Ordered highest-access first by
// `level`. Today roles are descriptive only — they drive labelling,
// ordering and the future permission model, but nothing is *enforced*
// because there are no per-tech logins yet (the server-side auth work is
// parked, see project roadmap). Once each tech signs in, `level` is the
// hook the backend gates features on: who can edit business details,
// manage other techs, or delete/correct records.
export type TechnicianRole =
  | 'owner'
  | 'supervisor'
  | 'lead_tech'
  | 'technician'
  | 'apprentice'

export interface TechnicianRoleInfo {
  value: TechnicianRole
  label: string
  // Coarse access tier: 4 = owner … 1 = apprentice. Higher can do
  // everything a lower tier can. Compare with roleAtLeast().
  level: number
  // Plain-English summary of the access this tier is intended to grant,
  // shown under the role picker so the choice is obvious.
  blurb: string
}

export const TECHNICIAN_ROLES: readonly TechnicianRoleInfo[] = [
  {
    value: 'owner',
    label: 'Business owner',
    level: 5,
    blurb:
      'Full access — business and compliance details, all technicians, and every record.',
  },
  {
    value: 'supervisor',
    label: 'Supervisor',
    level: 4,
    blurb:
      'Manage technicians and review all work; can correct and delete records, and edit company details.',
  },
  {
    value: 'lead_tech',
    label: 'Lead technician',
    level: 3,
    blurb:
      'Senior hands-on tech — corrects others’ entries (audit-safe re-statements), manages equipment, and onboards technicians and apprentices. Cannot delete records or change company details.',
  },
  {
    value: 'technician',
    label: 'Technician',
    level: 2,
    blurb: 'Full day-to-day refrigerant handling; logs and edits their own work.',
  },
  {
    value: 'apprentice',
    label: 'Apprentice',
    level: 1,
    blurb: 'Logs work under supervision; cannot delete records or change settings.',
  },
]

export const DEFAULT_TECHNICIAN_ROLE: TechnicianRole = 'technician'

// Falls back to the default tier for older profiles saved before roles
// existed, so callers never have to null-check.
export function roleInfo(role: TechnicianRole | undefined): TechnicianRoleInfo {
  return (
    TECHNICIAN_ROLES.find((r) => r.value === role) ??
    TECHNICIAN_ROLES.find((r) => r.value === DEFAULT_TECHNICIAN_ROLE)!
  )
}

// True when `role` sits at or above `min`'s access tier. The backend
// will use this to gate features once logins land.
export function roleAtLeast(
  role: TechnicianRole | undefined,
  min: TechnicianRole,
): boolean {
  return roleInfo(role).level >= roleInfo(min).level
}

// Roles offered when creating the very first account at first-run setup:
// the business owner, or a supervisor for larger organisations where the
// owner won't use the app themselves and a supervisor needs full access.
export const SETUP_ROLE_CHOICES: readonly TechnicianRole[] = [
  'owner',
  'supervisor',
]

// --- Capability gates -------------------------------------------------
// Descriptive today; the backend enforces them once per-tech sign-in
// exists. Until then the UI uses them as soft guidance (the active
// profile on a shared device can still be switched freely).

// Manage (add / deactivate / re-role) other technicians. Lead tech and
// above — but only ever people BELOW their own tier (see canManageTech /
// canAssignRole). A lead tech can onboard technicians and apprentices; a
// supervisor adds lead techs too; only an owner manages everyone.
export function canManageTechnicians(role: TechnicianRole | undefined): boolean {
  return roleAtLeast(role, 'lead_tech')
}

// Edit company / compliance identity (business name, ABN, RTA). Supervisor
// and above — a lead tech runs the crew but doesn't touch the business's
// regulatory identity.
export function canEditCompanyIdentity(
  role: TechnicianRole | undefined,
): boolean {
  return roleAtLeast(role, 'supervisor')
}

// Correct / re-state logged entries (append-only — the original stays on
// record). Lead tech and above, so a senior can fix a crew member's
// mistake without it being a management action.
export function canCorrectRecords(role: TechnicianRole | undefined): boolean {
  return roleAtLeast(role, 'lead_tech')
}

// Delete (soft-delete) logged records. Supervisor and above — a lead tech
// can correct but never remove, and an apprentice can do neither.
export function canDeleteRecords(role: TechnicianRole | undefined): boolean {
  return roleAtLeast(role, 'supervisor')
}

// Whether `actor` may manage a SPECIFIC technician (edit / deactivate /
// re-role them). Owners manage everyone; every other tier manages only
// people strictly below their own — so no one can act on a peer or a
// senior, which also stops sideways or upward privilege changes.
export function canManageTech(
  actor: TechnicianRole | undefined,
  target: TechnicianRole | undefined,
): boolean {
  if (!canManageTechnicians(actor)) return false
  if (roleAtLeast(actor, 'owner')) return true
  return roleInfo(target).level < roleInfo(actor).level
}

// Which role an actor is allowed to ASSIGN when adding or editing a tech.
// Owners can assign anything. Everyone else can assign only roles strictly
// below their own tier — so a lead tech can set technician/apprentice but
// not lead tech, supervisor or owner. The one exception: a supervisor (the
// top non-owner tier) may appoint an owner ONLY when no owner account
// exists yet, so a sole-supervisor business can still create one. This
// stops a supervisor — or anyone — promoting themselves to owner while an
// owner is already in charge.
export function canAssignRole(
  actor: TechnicianRole | undefined,
  target: TechnicianRole,
  ownerExists: boolean,
): boolean {
  if (!canManageTechnicians(actor)) return false
  if (roleAtLeast(actor, 'owner')) return true
  if (target === 'owner') return roleAtLeast(actor, 'supervisor') && !ownerExists
  return roleInfo(target).level < roleInfo(actor).level
}

// --- Deactivation lifecycle ------------------------------------------
// A technician who leaves is first deactivated (account disabled but
// kept), then fully purged after this many days. Their logged work is
// NEVER removed — transactions freeze the name/licence/role at the time
// of work — so deleting the profile leaves the audit trail intact.
export const TECHNICIAN_PURGE_DAYS = 90

export function isTechnicianActive(
  t: Pick<Technician, 'deactivatedAt'>,
): boolean {
  return !t.deactivatedAt
}

// Whole days until a deactivated profile is purged (0 or negative means
// it is due now). Returns null for an active profile.
export function daysUntilPurge(
  t: Pick<Technician, 'deactivatedAt'>,
  now: Date,
): number | null {
  if (!t.deactivatedAt) return null
  const elapsedDays = Math.floor(
    (now.getTime() - new Date(t.deactivatedAt).getTime()) / 86_400_000,
  )
  return TECHNICIAN_PURGE_DAYS - elapsedDays
}

// --- Structured names -------------------------------------------------

// Build the single display name from first / middle / surname, dropping
// blanks and collapsing whitespace.
export function composeName(parts: {
  firstName?: string
  middleName?: string
  lastName?: string
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' ')
}

// Seed the three boxes from a legacy single name when editing a profile
// saved before the split: first token → first name, last token →
// surname, anything between → middle.
export function splitName(name: string): {
  firstName: string
  middleName: string
  lastName: string
} {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return { firstName: '', middleName: '', lastName: '' }
  if (tokens.length === 1) {
    return { firstName: tokens[0], middleName: '', lastName: '' }
  }
  return {
    firstName: tokens[0],
    lastName: tokens[tokens.length - 1],
    middleName: tokens.slice(1, -1).join(' '),
  }
}

export interface Technician {
  id: string
  // Composed display name (e.g. "Jane Q Smith"), kept in sync from the
  // parts below so all existing name displays/stamps keep working.
  name: string
  // Structured name captured on account creation. Optional for profiles
  // saved before the split existed — splitName() seeds the boxes from
  // `name` when editing those.
  firstName?: string
  middleName?: string
  lastName?: string
  // Sign-in username (stored lowercased). Captured at account creation;
  // today it signs in on this device only, and — with the business ID —
  // it becomes the cloud login once the authenticated backend lands.
  // Optional: profiles created before sign-in existed (and secondary
  // tech profiles) may lack one.
  username?: string
  // Access tier (owner / supervisor / technician / apprentice). Optional
  // for back-compat: profiles saved before roles existed read as the
  // default tier via roleInfo(). normalize() promotes one profile per
  // install to owner.
  role?: TechnicianRole
  // Set when the profile is deactivated (a tech who left). The account
  // is disabled but kept for TECHNICIAN_PURGE_DAYS so their recent work
  // stays attributable, then it is purged. Unset = active.
  deactivatedAt?: string
  // Manager lock: while set the account is suspended — it can't be switched
  // into until a manager lifts the suspension. Distinct from deactivatedAt
  // (a leaver with a purge countdown); a suspension never purges.
  suspendedAt?: string
  arcLicenceNumber: string // ARC RHL — personal licence, per tech
  // ARC RHL licence class — determines the scope of work the licence
  // authorises. Optional: profiles created before this field lack it.
  arcLicenceClass?: ArcLicenceClass
  // RHL expiry date (YYYY-MM-DD). RHLs run for two years; logging work
  // against a lapsed licence is itself a breach, so the app alerts as
  // expiry approaches (see expiryStatus).
  licenceExpiry?: string
  // When the licence self-declaration was made at account creation — the
  // creator confirmed a current RHL appropriate for the work and that the
  // details are accurate. Refrigister does not verify licences (see the
  // Terms). Optional: profiles created before this requirement lack it.
  licenceDeclaredAt?: string
  // Optional soft lock for switching the active profile on a shared
  // device. A salted PBKDF2 derivation of the password (see lib/auth.ts).
  // Storage is localStorage, so this only deters casual snooping —
  // anyone with dev-tools access can still read every other tech's data.
  passwordHash?: string
  createdAt: string
  // Stamped on every edit — drives last-write-wins per record when two
  // devices sync (see lib/merge.ts). Optional: pre-sync records lack it.
  updatedAt?: string
}

// Refrigerant-handling risk management plan (an ARC RTA condition). The
// canonical checklist items live in lib/compliance.ts (RISK_PLAN_ITEMS);
// this stores each item's state keyed by its stable item key, plus the
// review stamp the audit pack prints.
export interface RiskPlanItemState {
  done: boolean
  note?: string
}

export interface RiskPlan {
  items: Record<string, RiskPlanItemState>
  // Who completed the most recent review, and when.
  reviewedAt?: string
  reviewedBy?: string
  // Merge tiebreaker — the copy touched most recently wins wholesale.
  updatedAt: string
}

export interface AppState {
  bottles: Bottle[]
  sites: Site[]
  units: Unit[]
  // Work-orders / jobs (optional grouping of a visit's movements).
  jobs: Job[]
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
  // Business registration number. Under the AU profile this is an ABN
  // (11 digits, checksum-validated); other jurisdictions treat it as a
  // free-form VAT / registration number. Field name kept for backward
  // compatibility with stored data and exports.
  businessAbn: string
  // Regulatory regime — see Jurisdiction / lib/compliance.ts.
  jurisdiction: Jurisdiction
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
  // Set when the user chose "Explore with sample data" instead of doing the
  // full compliance setup first. While set (and setup not yet complete) the
  // app is fully usable on seeded SAMPLE data, behind a persistent banner —
  // so a new user (or a demo on stage) can try logging before filling in
  // business/licence details. Leaving demo wipes the sample data and returns
  // to the setup screen. Never set once setup is complete.
  demoStartedAt?: string
  // When the Terms & disclaimer were accepted, and which version. Onboarding
  // requires the tick to finish; a later TERMS_VERSION bump re-prompts.
  termsAcceptedAt?: string
  termsAcceptedVersion?: string
  // Set when the owner has requested account closure. While present the
  // app is locked (AccountClosedGate) and nothing else is reachable.
  accountClosure?: AccountClosure
  // Keys of licence/RTA expiries already written to the change log, so a
  // lapse is recorded exactly once (not on every app open). Key encodes
  // the record and the expiry date, so renewing then lapsing again logs
  // afresh. Unioned across devices by the sync merge. See store.tsx.
  loggedExpiryKeys: string[]
  // Deletion markers consumed by the sync merge — see Tombstone.
  tombstones: Tombstone[]
  // Recoverable archive of every deleted record (bottle / site / unit /
  // technician / preset / custom refrigerant). Deletions move the record
  // here instead of discarding it, so nothing is ever permanently lost —
  // an owner/supervisor can restore it from the change log. See
  // RecycleBinEntry. Unioned (never reset-pruned) by the sync merge.
  recycleBin: RecycleBinEntry[]
  // Refrigerant-handling risk management plan — an ARC RTA condition.
  // A guided checklist reviewed periodically; the review stamp prints
  // on the audit pack. Merged wholesale by newest updatedAt.
  riskPlan?: RiskPlan
  // When the scalar settings block (business identity, location, units,
  // theme…) was last changed. A coarse fallback for the merge when the
  // per-field stamps below are absent (older states).
  settingsUpdatedAt?: string
  // Per-field last-changed timestamps for the synced settings (keyed by
  // field name, e.g. 'businessName', 'location'). Lets the sync merge
  // resolve each settings field independently — two devices editing
  // DIFFERENT fields offline no longer clobber each other (the old
  // whole-block last-write-wins dropped the older device's edit). Missing
  // keys fall back to settingsUpdatedAt. See lib/merge.ts.
  settingsFieldsUpdatedAt?: Record<string, string>
  // Stamped by "Erase all data" and by a backup import. During a merge,
  // records that exist only on the OTHER side and predate this moment
  // were erased here on purpose — they stay erased instead of being
  // resurrected by the union.
  dataResetAt?: string
}

// The scalar settings fields that sync between devices and are resolved
// per-field by the merge (see settingsFieldsUpdatedAt / lib/merge.ts).
// Per-device choices (sync, activeTechnicianId) are deliberately excluded.
export const SYNCED_SETTINGS_FIELDS = [
  'technician',
  'arcLicenceNumber',
  'arcAuthorisationNumber',
  'arcAuthorisationExpiry',
  'businessName',
  'businessAbn',
  'jurisdiction',
  'location',
  'unit',
  'theme',
  'clock',
] as const

export const EMPTY_STATE: AppState = {
  bottles: [],
  sites: [],
  units: [],
  jobs: [],
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
  jurisdiction: 'AU',
  location: { country: '', region: '', city: '', timezone: '' },
  unit: 'kg',
  theme: 'light',
  clock: '24h',
  sync: { enabled: false, teamId: '' },
  setupCompletedAt: undefined,
  demoStartedAt: undefined,
  loggedExpiryKeys: [],
  tombstones: [],
  recycleBin: [],
  settingsUpdatedAt: undefined,
  settingsFieldsUpdatedAt: undefined,
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

// Returns the refrigerant list with favourites first, then the rest. Both
// groups keep the order of the input list (REFRIGERANT_TYPES is already in
// R-number order), so favourites read in the same R-number sequence as the
// master list — NOT lexicographically (which would put e.g. R134A ahead of
// R22/R32).
export function sortRefrigerants(
  types: readonly string[],
  favorites: readonly string[],
): string[] {
  const fav = new Set(favorites)
  const favs = types.filter((t) => fav.has(t))
  const rest = types.filter((t) => !fav.has(t))
  return [...favs, ...rest]
}

export function refrigerantLabel(name: string, favorites: readonly string[]): string {
  return favorites.includes(name) ? `★ ${name}` : name
}

// The type a new-bottle form should start on. With no favourites set the
// R-number-ordered list puts R12 — a phased-out CFC nobody buys — first,
// and a rushed tap-through would stamp R12 onto the compliance record.
// Prefer the user's first favourite; otherwise fall back to R410A, the
// most common charge in the Australian field.
export function defaultRefrigerantType(
  ordered: readonly string[],
  favorites: readonly string[],
): string {
  if (ordered.length && favorites.includes(ordered[0])) return ordered[0]
  return ordered.includes('R410A') ? 'R410A' : (ordered[0] ?? 'R410A')
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

// Total safe weight — the gross figure a tech reads on the scale when a
// cylinder is filled to its maximum safe level. It's the tare plus the safe
// fill capacity (safe fill = water capacity × the refrigerant's filling
// ratio, stored as the bottle's initialNetWeight). Returns undefined until
// both tare and capacity are known, so callers can show it only once a
// cylinder is fully specified.
export function totalSafeWeight(b: Bottle): number | undefined {
  if (!(b.tareWeight > 0) || !(b.initialNetWeight > 0)) return undefined
  return Math.round((b.tareWeight + b.initialNetWeight) * 100) / 100
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

// Filling ratios per refrigerant: FR = 0.80 × saturated liquid density
// at 25 °C (kg/L), derived from the ANZ Refrigerant Handling Code of
// Practice 2025 and AS 2030.5 principle (max safe fill = WC × 0.80 × ρ).
// These are CONSERVATIVE REFERENCE values for the app's safe-fill GUIDE
// only — the authoritative limit for any given cylinder is the filling
// density / maximum fill stamped on that cylinder by its manufacturer.
// The app surfaces this caveat where safe fill is shown (SAFE_FILL_NOTE).
//
// Liquid density source: REFPROP / ASHRAE Fundamentals 2021 Table 2,
// saturated liquid at 25 °C.  Where components are at or above their
// critical temperature at 25 °C (R23: Tc = 26.1 °C; R508B components:
// Tc R116 = 19.9 °C, Tc R23 = 26.1 °C) the formula is not applicable;
// those refrigerants use specialist high-pressure cylinders and the
// conservative 0.80 fallback is used here.
//
// max safe fill (kg) = water capacity (L) × FR
export const REFRIGERANT_FR: Record<string, number> = {
  // Common HVAC HFC
  R32: 0.78,     // ρ₂₅ ≈ 0.97 kg/L
  R134A: 0.97,   // ρ₂₅ ≈ 1.21 kg/L (corrected from 1.04)
  R404A: 0.82,   // ρ₂₅ ≈ 1.05 kg/L (conservative — formula gives 0.84)
  R407A: 0.92,   // ρ₂₅ ≈ 1.15 kg/L
  R407C: 0.92,   // ρ₂₅ ≈ 1.14 kg/L
  R407F: 0.92,   // ρ₂₅ ≈ 1.16 kg/L
  R410A: 0.94,   // ρ₂₅ ≈ 1.17 kg/L
  // R404A / R134A replacements (lower-GWP HFC blends)
  R448A: 0.92,   // ρ₂₅ ≈ 1.15 kg/L
  R449A: 0.92,   // ρ₂₅ ≈ 1.15 kg/L
  R450A: 0.82,   // ρ₂₅ ≈ 1.03 kg/L (corrected from 1.04)
  R452A: 0.86,   // ρ₂₅ ≈ 1.08 kg/L
  R452B: 0.91,   // ρ₂₅ ≈ 1.15 kg/L (conservative — formula gives 0.92)
  R454B: 0.86,   // ρ₂₅ ≈ 1.07 kg/L
  R454C: 0.84,   // ρ₂₅ ≈ 1.05 kg/L (new A2L blend)
  R455A: 0.78,   // ρ₂₅ ≈ 0.97 kg/L
  R466A: 0.94,   // ρ₂₅ ≈ 1.17 kg/L
  // Refrigeration / low-temp
  R507A: 0.86,   // ρ₂₅ ≈ 1.07 kg/L
  // R508B: both components (R23 + R116) are above their critical temperatures
  // at 25 °C — the WC×0.8×ρ formula is not applicable. Requires specialist
  // high-pressure cylinders; use the conservative fallback.
  R508B: 0.80,
  // Legacy CFC / HCFC
  R12: 1.05,     // ρ₂₅ ≈ 1.31 kg/L (corrected from 1.10)
  R22: 0.95,     // ρ₂₅ ≈ 1.19 kg/L (corrected from 1.04)
  // R23: near-critical at 25 °C (Tc = 26.1 °C); use high-pressure cylinders.
  R23: 0.46,     // ρ₂₅ ≈ 0.58 kg/L (corrected from 1.06)
  R401A: 0.90,   // ρ₂₅ ≈ 1.12 kg/L (corrected from 1.06)
  R402A: 0.87,   // ρ₂₅ ≈ 1.09 kg/L (corrected from 0.95)
  R408A: 0.96,   // ρ₂₅ ≈ 1.19 kg/L
  R409A: 0.93,   // ρ₂₅ ≈ 1.16 kg/L (corrected from 1.05)
  R502: 0.96,    // ρ₂₅ ≈ 1.20 kg/L (corrected from 1.04)
  // Hydrocarbons (flammable A3 — much lower fill density)
  R290: 0.43,    // ρ₂₅ ≈ 0.52 kg/L
  R600: 0.42,    // ρ₂₅ ≈ 0.58 kg/L (conservative)
  R600A: 0.42,   // ρ₂₅ ≈ 0.56 kg/L (conservative)
  R1270: 0.43,   // ρ₂₅ ≈ 0.52 kg/L
  // HFO
  R1234YF: 0.87, // ρ₂₅ ≈ 1.09 kg/L (corrected from 1.04)
  R1234ZE: 0.92, // ρ₂₅ ≈ 1.15 kg/L (corrected from 1.04)
  R1233ZD: 1.00, // ρ₂₅ ≈ 1.25 kg/L (corrected from 1.20)
  // Drop-in R134A alternatives (new in Australian market)
  R513A: 0.92,   // ρ₂₅ ≈ 1.15 kg/L; A1 blend (R1234YF/R134A 56/44)
  R515B: 0.92,   // ρ₂₅ ≈ 1.15 kg/L; A1 blend (R1234ZE/R227EA 91.1/8.9)
  // Naturals
  R744: 0.57,    // CO2 — ρ₂₅ ≈ 0.72 kg/L at saturation (corrected from 0.68)
  R717: 0.48,    // ammonia — ρ₂₅ ≈ 0.60 kg/L (corrected from 0.53)
}

// Conservative fallback when a refrigerant has no FR entry (custom blend,
// unknown refrigerant) — assumes water density. Picks 0.80 to match the
// generic "80 % of water capacity" rule of thumb used in older guidance.
export const FALLBACK_FR = 0.8

// Shown wherever the app computes a safe fill, so a tech never treats the
// app's figure as authoritative over the cylinder's own stamp.
export const SAFE_FILL_NOTE =
  'Safe fill is a guide: water capacity (L) × 0.80 × refrigerant liquid ' +
  'density at 25 °C (kg/L), aligned with the ANZ Refrigerant Handling Code ' +
  'of Practice 2025 / AS 2030.5. Always defer to the filling density / ' +
  'maximum fill stamped on the cylinder — that stamp is the authoritative limit.'

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
    case 'sold':
      return 'Sold'
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
    case 'sell':
      return 'Sold'
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
  return k === 'transfer' || k === 'return' || k === 'sell'
}

// Movements that take the cylinder OUT of the fleet (back to a supplier
// or off to a buyer) — the "destination is not one of our sites" cases.
export function isOutboundMovement(k: TransactionKind): boolean {
  return k === 'return' || k === 'sell'
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
  if (!prev || isOutboundMovement(prev.kind)) return undefined
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
    prev && !isOutboundMovement(prev.kind)
      ? siteName(prev.siteId) ?? prev.siteName ?? 'Stock'
      : 'Stock'
  const to =
    tx.kind === 'return'
      ? tx.returnDestination?.trim() || 'Stock'
      : tx.kind === 'sell'
        ? tx.returnDestination?.trim() || 'Sold'
        : siteName(tx.siteId) ?? tx.siteName ?? 'Stock'
  return { from, to }
}

// Global Warming Potential (100-year, AR4 — IPCC Fourth Assessment).
// AR4 is the GWP basis used by Australia's Ozone Protection and
// Synthetic Greenhouse Gas Management Act 1989 and its Regulations (as
// amended) — deliberately retained by DCCEEW for consistency with the
// Montreal Protocol HFC phase-down baseline. Update to AR5/AR6 only
// when the regulator does — the reported tonnes-CO2-e on existing
// equipment changes if you don't. (The EU's F-gas rules, Regulation
// (EU) 2024/573, have moved on from AR4; Australia has not.)
//
// Sources cross-checked: IPCC AR4 WG1 Ch 2 Table 2.14, AIRAH DA19,
// DCCEEW published GWP tables. R1234yf/ze use AR5 values (AR4 omitted
// them). Verified as of COMPLIANCE_DATASET.verifiedAsOf (lib/compliance).
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
  R454C: 148,
  R455A: 148,
  R466A: 733,
  // Refrigeration / low-temp
  R507A: 3985,
  R508B: 13396,
  // Drop-in R134A alternatives
  R513A: 573,
  R515B: 299,
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

// --- ASHRAE 34 safety classification ----------------------------------
//
// The safety group assigned by ASHRAE Standard 34 to each refrigerant,
// combining toxicity (A = lower, B = higher) and flammability
// (1 = no flame, 2L = mildly flammable, 2 = flammable, 3 = highly flammable).
// A2L refrigerants (mildly flammable, LFL ≥ 0.10 kg/m³) include R32,
// R454B, R1234YF and other low-GWP alternatives entering the market.
// A3 refrigerants (highly flammable, LFL < 0.10 kg/m³) are the
// hydrocarbons. B2L is ammonia (toxic and mildly flammable).
// Displayed as badges in the refrigerant picker and on the log form to
// remind techs of ignition-source exclusion zone requirements per
// AIRAH DA19, AS/NZS 5149, and the ARC CoP 2025.
export type SafetyClass = 'A1' | 'A2L' | 'A3' | 'B2L'

export const REFRIGERANT_SAFETY_CLASS: Record<string, SafetyClass> = {
  R12: 'A1',
  R1233ZD: 'A1',
  R1234YF: 'A2L',
  R1234ZE: 'A2L',
  R1270: 'A3',
  R134A: 'A1',
  R22: 'A1',
  R23: 'A1',
  R290: 'A3',
  R32: 'A2L',
  R401A: 'A1',
  R402A: 'A1',
  R404A: 'A1',
  R407A: 'A1',
  R407C: 'A1',
  R407F: 'A1',
  R408A: 'A1',
  R409A: 'A1',
  R410A: 'A1',
  R448A: 'A1',
  R449A: 'A1',
  R450A: 'A1',
  R452A: 'A1',
  R452B: 'A2L',
  R454B: 'A2L',
  R454C: 'A2L',
  R455A: 'A2L',
  R466A: 'A1',
  R502: 'A1',
  R507A: 'A1',
  R508B: 'A1',
  R513A: 'A1',
  R515B: 'A1',
  R600: 'A3',
  R600A: 'A3',
  R717: 'B2L',
  R744: 'A1',
}

// Returns the ASHRAE 34 safety class for a refrigerant, or undefined for
// custom blends and unclassified refrigerants.
export function safetyClassFor(refrigerant?: string): SafetyClass | undefined {
  if (!refrigerant) return undefined
  return REFRIGERANT_SAFETY_CLASS[refrigerant.toUpperCase()]
}

// True for refrigerants with any flammability rating (A2L, A2, A3, B1L, B2L).
// Used to surface ignition-source exclusion zone warnings in the log form.
export function isFlammable(refrigerant?: string): boolean {
  const sc = safetyClassFor(refrigerant)
  return sc === 'A2L' || sc === 'A3' || sc === 'B2L'
}

// --- GWP equipment limits (DCCEEW, Australia) -------------------------
//
// From 1 July 2024: refrigerants with GWP > 750 are prohibited in
// newly manufactured or imported small air conditioners (split systems,
// multi-heads, window units ≤ 18 kW) under the Ozone Protection and
// Synthetic Greenhouse Gas Management Regulations.
// From 1 July 2025: the limit extends to ALL refrigerating and
// air-conditioning equipment. As of July 2026, all new equipment
// installations (including refrigeration) must use a refrigerant
// with GWP ≤ 750. Existing equipment is exempt; the ban targets
// new manufacture and importation.
// Source: DCCEEW ozone/SGG equipment rules and the OPSGGM Regulations
// (as amended for the 1 July 2024 / 1 July 2025 GWP-750 phase-in).
export const GWP_EQUIPMENT_BAN_LIMIT = 750
// Date from which the GWP ban applies to ALL refrigerating/AC equipment.
export const GWP_EQUIPMENT_BAN_DATE = '2025-07-01'

// Returns true if the refrigerant exceeds the GWP equipment ban limit.
// Ignores unknown refrigerants (returns false when GWP is not tabulated).
export function exceedsGwpBan(refrigerant?: string): boolean {
  const gwp = gwpFor(refrigerant)
  return gwp != null && gwp > GWP_EQUIPMENT_BAN_LIMIT
}

// --- Leak test method --------------------------------------------------
//
// AIRAH DA19 and the ANZ Refrigerant Handling Code of Practice 2025
// distinguish between leak detection methods. Recording the method
// alongside the binary yes/no result provides richer evidence for an
// ARC audit (e.g. confirming an electronic detector was used as
// required on large A2L/A3 charge systems).
export type LeakTestMethod =
  | 'electronic'
  | 'bubble'
  | 'pressure'
  | 'uv'
  | 'ultrasonic'

export const LEAK_TEST_METHOD_LABELS: Record<LeakTestMethod, string> = {
  electronic: 'Electronic detector',
  bubble: 'Bubble / soap solution',
  pressure: 'Pressure test (nitrogen)',
  uv: 'UV dye tracer',
  ultrasonic: 'Ultrasonic detector',
}

// --- ARC RHL licence class --------------------------------------------
//
// ARC issues several refrigerant handling licence (RHL) classes under
// the refrigerant trading scheme. Recording the class alongside the
// RHL number makes the audit pack show the scope of work the licence
// authorises, helping confirm the tech was qualified for the job type.
export type ArcLicenceClass =
  | 'full'
  | 'restricted_split'
  | 'restricted_small'
  | 'trainee'

export const ARC_LICENCE_CLASS_LABELS: Record<ArcLicenceClass, string> = {
  full: 'Full',
  restricted_split: 'Restricted — split systems (≤ 18 kW)',
  restricted_small: 'Restricted — small systems (≤ 2.5 kg charge)',
  trainee: 'Trainee (1-year, supervisor required)',
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

// A correction that RE-STATES its original (same equipment-side kind,
// as opposed to a legacy bottle-only 'adjust' correction). Re-statements
// replace the original in every aggregate: the original stays on the
// record for the audit trail but its amount no longer counts.
export function isRestatement(t: Transaction): boolean {
  return !!t.correctsId && (t.kind === 'charge' || t.kind === 'recover')
}

// Ids of transactions superseded by a live re-statement correction.
// Aggregations (leak top-ups, logbook and site totals, quarterly
// figures) must skip these rows — the linked correction carries the
// true amount and is counted in their place. Chains work per-link:
// if correction B is itself corrected by C, B's id is in the set too
// and only C counts.
export function supersededIds(
  transactions: readonly Transaction[],
): Set<string> {
  const ids = new Set<string>()
  for (const t of transactions) {
    if (t.deletedAt) continue
    if (isRestatement(t)) ids.add(t.correctsId!)
  }
  return ids
}

// Sum of charge transactions against a unit since `sinceISO`. Excludes
// reason='install' (commissioning charge isn't a top-up), soft-deleted
// rows, and originals superseded by a re-statement correction (the
// correction row itself is a charge and is counted instead).
export function cumulativeTopUpKg(
  unitId: string,
  transactions: readonly Transaction[],
  sinceISO: string,
): number {
  const superseded = supersededIds(transactions)
  let sum = 0
  for (const t of transactions) {
    if (t.unitId !== unitId) continue
    if (t.kind !== 'charge') continue
    if (t.reason === 'install') continue
    if (t.date < sinceISO) continue
    if (t.deletedAt) continue
    if (superseded.has(t.id)) continue
    sum += t.amount
  }
  return sum
}

// Returns the unit's leak status against the trailing 12-month window.
// `nowISO` defaults to "today" but is injectable for tests/print views.
// `thresholds` lets a jurisdiction profile substitute its own watch /
// suspected fractions (e.g. EPA 608 leak-rate thresholds vary by
// equipment class) — defaults to the conservative AU advisory levels.
export function leakStatusFor(
  unit: Unit,
  transactions: readonly Transaction[],
  nowISO: string = new Date().toISOString(),
  thresholds: { watch: number; suspected: number } = {
    watch: LEAK_WATCH_FRACTION,
    suspected: LEAK_SUSPECTED_FRACTION,
  },
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
    fraction >= thresholds.suspected
      ? 'suspected'
      : fraction >= thresholds.watch
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

// Each state/territory's dominant IANA timezone — used to auto-fill the
// timezone when a tech picks their state during onboarding / in
// Settings, so they don't have to know to set it separately (the most
// commonly missed setup field). Far-west NSW (Broken Hill) runs on ACST
// rather than AEST, but Sydney is right for >99% of NSW; the picker
// stays available to override.
export const AU_REGION_TIMEZONE: Record<string, string> = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin',
}

// Curated city/town lists for the City pickers, grouped by state so
// the picker can filter. Covers the capitals plus the major regional
// cities and towns in each state — a tech in a smaller locality picks
// "Other" and types the name in.
// Per-state city/town lists. Order here doesn't matter — the lists are
// alphabetised (and de-duplicated) into AU_CITIES_BY_REGION below, which
// is what the City pickers render. This covers the capitals and the great
// majority of named towns in each state, but Australia has thousands of
// localities and suburbs, so it can't be literally exhaustive — the
// picker's "Other — type my own" option always covers anything not here.
const AU_CITIES_RAW: Record<string, readonly string[]> = {
  NSW: [
    'Sydney', 'Newcastle', 'Wollongong', 'Central Coast', 'Maitland',
    'Cessnock', 'Singleton', 'Muswellbrook', 'Scone', 'Kurri Kurri',
    'Raymond Terrace', 'Nelson Bay', 'Forster', 'Tuncurry', 'Taree',
    'Wingham', 'Gloucester', 'Port Macquarie', 'Wauchope', 'Laurieton',
    'Kempsey', 'South West Rocks', 'Macksville', 'Nambucca Heads',
    'Bellingen', 'Dorrigo', 'Coffs Harbour', 'Sawtell', 'Woolgoolga',
    'Grafton', 'Maclean', 'Yamba', 'Ballina', 'Alstonville', 'Lismore',
    'Casino', 'Kyogle', 'Byron Bay', 'Bangalow', 'Mullumbimby',
    'Brunswick Heads', 'Tweed Heads', 'Murwillumbah', 'Evans Head',
    'Armidale', 'Tamworth', 'Gunnedah', 'Quirindi', 'Narrabri', 'Wee Waa',
    'Moree', 'Inverell', 'Glen Innes', 'Tenterfield', 'Walcha', 'Dubbo',
    'Wellington', 'Mudgee', 'Gulgong', 'Orange', 'Bathurst', 'Lithgow',
    'Katoomba', 'Springwood', 'Penrith', 'Richmond', 'Windsor', 'Cowra',
    'Canowindra', 'Blayney', 'Oberon', 'Parkes', 'Forbes', 'Grenfell',
    'Condobolin', 'Cobar', 'Nyngan', 'Bourke', 'Brewarrina', 'Walgett',
    'Lightning Ridge', 'Coonabarabran', 'Coonamble', 'Gilgandra', 'Warren',
    'Broken Hill', 'Wentworth', 'Griffith', 'Leeton', 'Narrandera', 'Hay',
    'Deniliquin', 'Finley', 'Tocumwal', 'Corowa', 'Albury', 'Holbrook',
    'Culcairn', 'Henty', 'Tumbarumba', 'Wagga Wagga', 'Junee', 'Coolamon',
    'Temora', 'West Wyalong', 'Young', 'Cootamundra', 'Gundagai', 'Tumut',
    'Batlow', 'Adelong', 'Goulburn', 'Crookwell', 'Yass', 'Queanbeyan',
    'Bungendore', 'Braidwood', 'Cooma', 'Jindabyne', 'Bombala', 'Nowra',
    'Kiama', 'Shellharbour', 'Gerringong', 'Berry', 'Ulladulla', 'Milton',
    'Sussex Inlet', 'Batemans Bay', 'Moruya', 'Narooma', 'Bega',
    'Merimbula', 'Pambula', 'Eden', 'Bowral', 'Mittagong', 'Moss Vale',
    'Bundanoon', 'Camden', 'Campbelltown', 'Picton',
  ],
  VIC: [
    'Melbourne', 'Geelong', 'Ballarat', 'Bendigo', 'Shepparton', 'Mildura',
    'Warrnambool', 'Traralgon', 'Morwell', 'Moe', 'Sale', 'Bairnsdale',
    'Wodonga', 'Wangaratta', 'Horsham', 'Echuca', 'Swan Hill', 'Colac',
    'Portland', 'Hamilton', 'Ararat', 'Benalla', 'Seymour', 'Castlemaine',
    'Maryborough', 'Warragul', 'Drouin', 'Leongatha', 'Torquay',
    'Lakes Entrance', 'Melton', 'Sunbury', 'Bacchus Marsh', 'Gisborne',
    'Kyneton', 'Woodend', 'Daylesford', 'Creswick', 'Ocean Grove',
    'Barwon Heads', 'Lara', 'Winchelsea', 'Apollo Bay', 'Lorne',
    'Camperdown', 'Terang', 'Cobden', 'Mortlake', 'Port Fairy', 'Koroit',
    'Casterton', 'Coleraine', 'Stawell', 'St Arnaud', 'Donald', 'Charlton',
    'Wycheproof', 'Warracknabeal', 'Nhill', 'Dimboola', 'Rochester',
    'Kyabram', 'Tatura', 'Numurkah', 'Cobram', 'Yarrawonga', 'Nathalia',
    'Kerang', 'Cohuna', 'Robinvale', 'Ouyen', 'Bright', 'Myrtleford',
    'Beechworth', 'Yackandandah', 'Rutherglen', 'Chiltern', 'Tallangatta',
    'Corryong', 'Mansfield', 'Alexandra', 'Mount Beauty', 'Marysville',
    'Healesville', 'Yarra Glen', 'Lilydale', 'Wonthaggi', 'Inverloch',
    'Korumburra', 'Foster', 'Yarram', 'Maffra', 'Stratford', 'Heyfield',
    'Cowes', 'Wallan', 'Kilmore', 'Broadford', 'Euroa', 'Nagambie',
    'Avoca', 'Beaufort', 'Pakenham', 'Cranbourne', 'Queenscliff',
    'Bannockburn',
  ],
  QLD: [
    'Brisbane', 'Gold Coast', 'Sunshine Coast', 'Toowoomba', 'Ipswich',
    'Logan', 'Redcliffe', 'Caboolture', 'Caloundra', 'Maroochydore',
    'Nambour', 'Noosa Heads', 'Tewantin', 'Cooroy', 'Pomona', 'Eumundi',
    'Maleny', 'Beerwah', 'Landsborough', 'Beenleigh', 'Jimboomba',
    'Beaudesert', 'Boonah', 'Gympie', 'Maryborough', 'Hervey Bay',
    'Childers', 'Bundaberg', 'Bargara', 'Gin Gin', 'Gladstone',
    'Tannum Sands', 'Agnes Water', 'Rockhampton', 'Yeppoon', 'Mount Morgan',
    'Emerald', 'Blackwater', 'Capella', 'Springsure', 'Biloela', 'Moura',
    'Theodore', 'Monto', 'Mackay', 'Sarina', 'Proserpine', 'Airlie Beach',
    'Bowen', 'Moranbah', 'Clermont', 'Dysart', 'Middlemount', 'Ayr',
    'Home Hill', 'Charters Towers', 'Townsville', 'Ingham', 'Cardwell',
    'Tully', 'Innisfail', 'Cairns', 'Gordonvale', 'Mareeba', 'Atherton',
    'Malanda', 'Kuranda', 'Port Douglas', 'Mossman', 'Cooktown', 'Weipa',
    'Mount Isa', 'Cloncurry', 'Hughenden', 'Richmond', 'Winton',
    'Longreach', 'Barcaldine', 'Blackall', 'Charleville', 'Cunnamulla',
    'Quilpie', 'Roma', 'Mitchell', 'St George', 'Dalby', 'Chinchilla',
    'Miles', 'Goondiwindi', 'Warwick', 'Stanthorpe', 'Texas', 'Kingaroy',
    'Murgon', 'Nanango', 'Yarraman', 'Esk', 'Gatton', 'Laidley',
    'Crows Nest', 'Kilcoy',
  ],
  SA: [
    'Adelaide', 'Gawler', 'Mount Barker', 'Strathalbyn', 'Victor Harbor',
    'Goolwa', 'Yankalilla', 'Normanville', 'Aldinga', 'McLaren Vale',
    'Willunga', 'Hahndorf', 'Stirling', 'Nairne', 'Lobethal', 'Mount Gambier',
    'Millicent', 'Penola', 'Naracoorte', 'Bordertown', 'Keith', 'Kingston SE',
    'Robe', 'Murray Bridge', 'Mannum', 'Tailem Bend', 'Meningie', 'Berri',
    'Renmark', 'Loxton', 'Barmera', 'Waikerie', 'Tanunda', 'Nuriootpa',
    'Angaston', 'Lyndoch', 'Kapunda', 'Two Wells', 'Mallala', 'Balaklava',
    'Clare', 'Burra', 'Snowtown', 'Port Wakefield', 'Kadina', 'Wallaroo',
    'Moonta', 'Port Broughton', 'Port Pirie', 'Crystal Brook', 'Jamestown',
    'Peterborough', 'Port Augusta', 'Quorn', 'Hawker', 'Leigh Creek',
    'Roxby Downs', 'Andamooka', 'Coober Pedy', 'Whyalla', 'Cowell', 'Cleve',
    'Kimba', 'Tumby Bay', 'Port Lincoln', 'Cummins', 'Wudinna', 'Streaky Bay',
    'Ceduna',
  ],
  WA: [
    'Perth', 'Fremantle', 'Joondalup', 'Rockingham', 'Mandurah', 'Pinjarra',
    'Yanchep', 'Two Rocks', 'Harvey', 'Collie', 'Bunbury', 'Donnybrook',
    'Busselton', 'Dunsborough', 'Margaret River', 'Augusta', 'Nannup',
    'Bridgetown', 'Boyup Brook', 'Manjimup', 'Pemberton', 'Northam', 'York',
    'Beverley', 'Toodyay', 'New Norcia', 'Moora', 'Dalwallinu',
    'Wongan Hills', 'Goomalling', 'Cunderdin', 'Kellerberrin', 'Merredin',
    'Southern Cross', 'Narrogin', 'Wagin', 'Williams', 'Pingelly',
    'Brookton', 'Corrigin', 'Katanning', 'Kojonup', 'Albany', 'Denmark',
    'Mount Barker', 'Esperance', 'Norseman', 'Kalgoorlie', 'Boulder',
    'Coolgardie', 'Kambalda', 'Leonora', 'Laverton', 'Geraldton',
    'Northampton', 'Kalbarri', 'Dongara', 'Three Springs', 'Morawa',
    'Mullewa', 'Cervantes', 'Jurien Bay', 'Carnarvon', 'Exmouth', 'Onslow',
    'Karratha', 'Dampier', 'Roebourne', 'Port Hedland', 'South Hedland',
    'Newman', 'Tom Price', 'Paraburdoo', 'Marble Bar', 'Meekatharra',
    'Mount Magnet', 'Cue', 'Wiluna', 'Broome', 'Derby', 'Fitzroy Crossing',
    'Halls Creek', 'Kununurra', 'Wyndham',
  ],
  TAS: [
    'Hobart', 'Glenorchy', 'Kingston', 'Brighton', 'Bridgewater', 'Sorell',
    'New Norfolk', 'Richmond', 'Huonville', 'Cygnet', 'Geeveston', 'Dover',
    'Oatlands', 'Bothwell', 'Hamilton', 'Triabunna', 'Orford', 'Swansea',
    'Bicheno', 'St Helens', 'St Marys', 'Launceston', 'Perth', 'Evandale',
    'Longford', 'Westbury', 'Deloraine', 'Mole Creek', 'Campbell Town',
    'Ross', 'George Town', 'Beaconsfield', 'Scottsdale', 'Bridport',
    'Devonport', 'Latrobe', 'Sheffield', 'Ulverstone', 'Penguin', 'Burnie',
    'Somerset', 'Wynyard', 'Stanley', 'Smithton', 'Currie', 'Queenstown',
    'Strahan', 'Rosebery', 'Zeehan',
  ],
  NT: [
    'Darwin', 'Palmerston', 'Howard Springs', 'Humpty Doo', 'Batchelor',
    'Adelaide River', 'Pine Creek', 'Katherine', 'Tindal', 'Mataranka',
    'Larrimah', 'Daly Waters', 'Borroloola', 'Timber Creek', 'Wadeye',
    'Maningrida', 'Nhulunbuy', 'Jabiru', 'Tennant Creek', 'Elliott',
    'Alice Springs', 'Yulara', 'Kings Canyon',
  ],
  ACT: ['Canberra', 'Belconnen', 'Gungahlin', 'Tuggeranong', 'Woden', 'Hall'],
}

// City/town lists per state, alphabetised and de-duplicated — what the
// City pickers render.
export const AU_CITIES_BY_REGION: Record<string, readonly string[]> =
  Object.fromEntries(
    Object.entries(AU_CITIES_RAW).map(([region, cities]) => [
      region,
      Array.from(new Set(cities)).sort((a, b) => a.localeCompare(b)),
    ]),
  )

// The marker the City picker uses to mean "let me type my own".
export const CITY_OTHER_VALUE = '__other__'

// Reverse lookup: which state/territory a curated town belongs to. Built
// once from AU_CITIES_BY_REGION. A town name that appears in more than one
// state maps to undefined — ambiguous, so we don't guess the state for the
// user. Lets a site form auto-fill the state once a town is picked.
const AU_REGION_BY_CITY: Record<string, string | undefined> = (() => {
  const seen: Record<string, string | undefined> = {}
  for (const region of AU_REGIONS) {
    for (const city of AU_CITIES_BY_REGION[region] ?? []) {
      seen[city] = city in seen ? undefined : region
    }
  }
  return seen
})()

export function regionForCity(city: string): string | undefined {
  return AU_REGION_BY_CITY[city.trim()]
}

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

// --- Cylinder periodic test -------------------------------------------
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

// Periodic-test dates are stored as YYYY-MM (the stamp on the cylinder is
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

// Case-insensitive duplicate check on bottle numbers, ignoring the
// bottle being edited (pass its id as `excludeId`). Shared by the bottle
// forms and the quick-add. (Moved here so the quick-add components can be
// reused outside the Bottles page without a circular import.)
export function isDuplicateBottleNumber(
  bottles: readonly Bottle[],
  bottleNumber: string,
  excludeId?: string,
): boolean {
  const n = bottleNumber.trim().toLowerCase()
  if (!n) return false
  return bottles.some(
    (b) => b.id !== excludeId && b.bottleNumber.trim().toLowerCase() === n,
  )
}

// Stronger variant: a duplicate of an ACTIVE (not returned) cylinder. This
// is the dangerous case — two in-service bottles sharing a number make
// every scan / search / history lookup ambiguous, so it's blocked rather
// than warned. Re-using the number of a cylinder that's been returned to
// the supplier is still allowed (the old one has left our possession).
export function isDuplicateActiveBottleNumber(
  bottles: readonly Bottle[],
  bottleNumber: string,
  excludeId?: string,
): boolean {
  const n = bottleNumber.trim().toLowerCase()
  if (!n) return false
  return bottles.some(
    (b) =>
      b.id !== excludeId &&
      !isOutOfFleet(b.status) &&
      b.bottleNumber.trim().toLowerCase() === n,
  )
}
