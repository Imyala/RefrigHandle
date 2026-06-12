import type {
  AppState,
  AuditEntry,
  Bottle,
  Transaction,
  Unit,
} from '../types'
import { normalizeState } from '../storage'

// Shared builders for the compliance-math tests. Every field that a
// calculation might read gets a sane default; tests override only what
// the scenario is about.

let n = 0
function nextId(prefix: string): string {
  n += 1
  return `${prefix}-${n}`
}

export function makeBottle(over: Partial<Bottle> = {}): Bottle {
  return {
    id: nextId('b'),
    bottleNumber: 'CYL-001',
    refrigerantType: 'R410A',
    tareWeight: 10,
    grossWeight: 19,
    initialNetWeight: 9,
    status: 'in_stock',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function makeUnit(over: Partial<Unit> = {}): Unit {
  return {
    id: nextId('u'),
    siteId: 's1',
    name: 'Chiller 1',
    kind: 'package',
    refrigerantType: 'R410A',
    refrigerantCharge: 10,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

export function makeTx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId('t'),
    bottleId: 'b1',
    kind: 'charge',
    amount: 1,
    weightBefore: 19,
    weightAfter: 18,
    date: '2026-05-14T02:00:00.000Z',
    ...over,
  }
}

export function makeAudit(over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: nextId('a'),
    at: '2026-05-14T02:00:00.000Z',
    action: 'create',
    entity: 'bottle',
    target: 'CYL-001',
    summary: 'Added bottle CYL-001',
    ...over,
  }
}

// Full AppState from a partial — normalizeState fills every default the
// app itself would (same code path as loading a stored blob).
export function makeState(over: Record<string, unknown> = {}): AppState {
  return normalizeState(over)
}
