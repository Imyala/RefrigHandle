// Presentation + diffing helpers for the change log (audit trail).
// The AuditEntry shape itself lives in types.ts (so AppState can
// reference it without a circular runtime import); everything here is
// the labelling/formatting layer used by the store when it records an
// entry and by the History page when it renders one.

import type {
  AuditAction,
  AuditChange,
  AuditEntity,
  Bottle,
  Job,
  Site,
  Technician,
  Unit,
} from './types'

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Added',
  update: 'Edited',
  delete: 'Removed',
  relocate: 'Relocated',
  restore: 'Restored',
  decommission: 'Decommissioned',
  reactivate: 'Reactivated',
  settings: 'Settings',
  reset: 'Reset',
  import: 'Imported',
  expire: 'Expired',
}

export const AUDIT_ENTITY_LABELS: Record<AuditEntity, string> = {
  bottle: 'Bottle',
  site: 'Site',
  unit: 'Unit',
  job: 'Job',
  transaction: 'Transaction',
  technician: 'Technician',
  settings: 'Settings',
  refrigerant: 'Refrigerant',
  preset: 'Bottle preset',
  data: 'Data',
}

// Pill colour per action — mirrors the tone vocabulary the ui Pill
// component already supports (green / amber / blue / slate / red).
export const AUDIT_ACTION_TONE: Record<
  AuditAction,
  'green' | 'amber' | 'blue' | 'slate' | 'red'
> = {
  create: 'green',
  update: 'amber',
  delete: 'red',
  relocate: 'blue',
  restore: 'green',
  decommission: 'slate',
  reactivate: 'green',
  settings: 'slate',
  reset: 'red',
  import: 'blue',
  expire: 'red',
}

// Field-label maps. ONLY the fields listed here are diffed into the
// audit trail — ids, timestamps and derived values are intentionally
// left out so the history reads like plain English instead of a data
// dump. The key is the model field; the value is the human label shown
// in "Status: In stock → On site".
type FieldLabels<T> = Partial<Record<keyof T, string>>

export const BOTTLE_FIELDS: FieldLabels<Bottle> = {
  bottleNumber: 'Bottle number',
  refrigerantType: 'Refrigerant',
  tareWeight: 'Tare weight',
  grossWeight: 'Gross weight',
  initialNetWeight: 'Initial net',
  status: 'Status',
  bottleKind: 'Cylinder kind',
  currentSiteId: 'Site',
  notes: 'Notes',
  lastHydroTestDate: 'Last test',
  nextHydroTestDate: 'Next test',
  sentForRetestAt: 'Retest',
  supplier: 'Supplier',
  invoiceNumber: 'Invoice #',
}

export const SITE_FIELDS: FieldLabels<Site> = {
  name: 'Name',
  client: 'Client',
  address: 'Address',
  state: 'State',
  city: 'City',
  group: 'Region / group',
  notes: 'Notes',
}

export const UNIT_FIELDS: FieldLabels<Unit> = {
  name: 'Name',
  kind: 'Type',
  refrigerantType: 'Refrigerant',
  refrigerantCharge: 'Charge',
  manufacturer: 'Manufacturer',
  model: 'Model',
  serial: 'Serial',
  installDate: 'Install date',
  status: 'Status',
  notes: 'Notes',
}

export const JOB_FIELDS: FieldLabels<Job> = {
  reference: 'Reference',
  siteId: 'Site',
  date: 'Date',
  notes: 'Notes',
  status: 'Status',
}

export const TECH_FIELDS: FieldLabels<Technician> = {
  name: 'Name',
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Surname',
  role: 'Role',
  arcLicenceNumber: 'RHL',
  licenceExpiry: 'RHL expiry',
}

function formatValue(v: unknown): string {
  if (v == null || v === '') return '—'
  return String(v)
}

// Meta fields that are never themselves an auditable "change" — ids and
// timestamps move on every write but aren't edits a person made.
const DEFAULT_IGNORED_FIELDS = new Set(['id', 'createdAt', 'updatedAt'])

// Catch-all diff: EVERY field in `patch` whose value actually changed,
// keyed by its raw field name. This is the safety net behind the friendly
// label maps above — it guarantees no stored-field change is ever silently
// unlogged, even a field nobody has given a nice label yet (or a new field
// added later). Callers pass extra `ignore` names for anything sensitive
// or handled specially (e.g. a technician's passwordHash, which is audited
// as "Password lock set/cleared", never as its hash).
export function rawChanges<T>(
  before: T,
  patch: Partial<T>,
  ignore: Iterable<string> = [],
): AuditChange[] {
  const skip = new Set<string>([...DEFAULT_IGNORED_FIELDS, ...ignore])
  const b = before as Record<string, unknown>
  const p = patch as Record<string, unknown>
  const out: AuditChange[] = []
  for (const key of Object.keys(p)) {
    if (skip.has(key)) continue
    if (b[key] === p[key]) continue
    out.push({ field: key, from: formatValue(b[key]), to: formatValue(p[key]) })
  }
  return out
}

// Diff the labelled fields present in `patch` against `before`. Returns
// one AuditChange per field that actually changed. `resolve` lets a
// caller map an opaque value to something readable (e.g. a siteId to a
// site name) for specific fields.
export function diffFields<T>(
  before: T,
  patch: Partial<T>,
  labels: FieldLabels<T>,
  resolve?: Partial<Record<keyof T, (v: unknown) => string>>,
): AuditChange[] {
  const b = before as Record<string, unknown>
  const p = patch as Record<string, unknown>
  const out: AuditChange[] = []
  for (const key of Object.keys(p)) {
    const label = labels[key as keyof T]
    if (!label) continue
    const fromV = b[key]
    const toV = p[key]
    if (fromV === toV) continue
    const fmt = resolve?.[key as keyof T] ?? formatValue
    out.push({ field: String(label), from: fmt(fromV), to: fmt(toV) })
  }
  return out
}
