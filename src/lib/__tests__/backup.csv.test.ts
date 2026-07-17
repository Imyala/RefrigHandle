import { describe, expect, it } from 'vitest'
import {
  buildAuditLogCsv,
  buildAuditPackZip,
  buildLogCsv,
  buildPurchasesCsv,
} from '../backup'
import { makeAudit, makeBottle, makeState, makeTx } from './fixtures'

describe('buildLogCsv', () => {
  const state = makeState({
    businessName: 'Acme',
    bottles: [makeBottle({ id: 'b1', bottleNumber: 'B-1', refrigerantType: 'R32' })],
    location: { country: 'Australia', region: 'QLD', city: 'Brisbane', timezone: 'Australia/Brisbane' },
    transactions: [
      makeTx({ id: 'a', kind: 'charge', bottleId: 'b1', amount: 2, date: '2026-06-18T03:00:00.000Z' }),
      makeTx({ id: 'b', kind: 'recover', bottleId: 'b1', amount: 1, date: '2026-07-01T03:00:00.000Z' }),
      makeTx({ id: 'c', kind: 'charge', bottleId: 'b1', amount: 3, date: '2026-06-20T03:00:00.000Z', deletedAt: '2026-06-21T00:00:00.000Z', deletedReason: 'mistake' }),
    ],
  })

  it('has the active-transaction header and a row per live tx', () => {
    const csv = buildLogCsv(state)
    expect(csv).toContain('ACTIVE TRANSACTIONS')
    expect(csv).toContain('refrigerantType')
    expect(csv).toContain('B-1')
    // Deleted rows are listed in their own audit section, not silently dropped.
    expect(csv).toContain('DELETED TRANSACTIONS')
    expect(csv).toContain('mistake')
  })

  it('honours an inclusive date range', () => {
    const csv = buildLogCsv(state, '2026-06-01', '2026-06-30')
    // June charge is in; the July recover is out.
    const lines = csv.split('\n')
    expect(lines.some((l) => l.startsWith('a,'))).toBe(true)
    expect(lines.some((l) => l.startsWith('b,'))).toBe(false)
  })

  it('carries a dd/mm/yyyy local_date column in the record timezone', () => {
    const csv = buildLogCsv(state)
    const lines = csv.split('\n')
    const header = lines[1].split(',')
    const idx = header.indexOf('local_date')
    expect(idx).toBeGreaterThan(-1)
    const rowA = lines.find((l) => l.startsWith('a,'))!.split(',')
    // 2026-06-18T03:00Z is 13:00 on 18 June in Brisbane (UTC+10).
    expect(rowA[idx]).toBe('18/06/2026')
  })
})

describe('buildPurchasesCsv', () => {
  const state = makeState({
    businessName: 'Acme',
    bottles: [
      makeBottle({ id: 'b1', bottleNumber: 'B-1', refrigerantType: 'R32', costAud: 412.5, supplier: 'BOC', invoiceNumber: 'INV-9' }),
      makeBottle({ id: 'b2', bottleNumber: 'B-2', refrigerantType: 'R410A' }),
    ],
    location: { country: 'Australia', region: 'QLD', city: 'Brisbane', timezone: 'Australia/Brisbane' },
    transactions: [
      makeTx({ id: 'i1', kind: 'intake', bottleId: 'b1', amount: 9, date: '2026-06-18T03:00:00.000Z' }),
      // No cost recorded anywhere -> not a bill, stays out of the export.
      makeTx({ id: 'i2', kind: 'intake', bottleId: 'b2', amount: 5, date: '2026-06-19T03:00:00.000Z' }),
      // Costed but not an intake -> ignored.
      makeTx({ id: 'c1', kind: 'charge', bottleId: 'b1', amount: 1, date: '2026-06-20T03:00:00.000Z' }),
    ],
  })

  it('emits one Xero bill row per costed intake, dd/mm/yyyy dates', () => {
    const csv = buildPurchasesCsv(state)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('*ContactName')
    expect(lines[0]).toContain('*TaxType')
    expect(lines.length).toBe(2) // header + the single costed intake
    expect(lines[1]).toContain('BOC')
    expect(lines[1]).toContain('INV-9')
    expect(lines[1]).toContain('18/06/2026')
    expect(lines[1]).toContain('412.50')
    expect(lines[1]).toContain('GST on Expenses')
    expect(lines[1]).toContain('cylinder B-1')
  })

  it('honours the date range', () => {
    expect(buildPurchasesCsv(state, '2026-06-19', undefined).split('\n').length).toBe(1)
  })
})

describe('buildAuditPackZip', () => {
  it('bundles the CSV, JSON backup and a verification statement', async () => {
    const state = makeState({
      businessName: 'Acme',
      businessAbn: '51824753556',
      bottles: [makeBottle({ id: 'b1', bottleNumber: 'B-1' })],
      transactions: [
        makeTx({ id: 'a', kind: 'charge', bottleId: 'b1', amount: 2, date: '2026-06-18T03:00:00.000Z' }),
      ],
    })
    const blob = await buildAuditPackZip(state, {
      from: '2026-06-01',
      to: '2026-06-30',
      periodLabel: 'Q2 2026',
    })
    expect(blob.type).toBe('application/zip')
    const text = new TextDecoder('latin1').decode(
      new Uint8Array(await blob.arrayBuffer()),
    )
    expect(text).toContain('refrigerant-log.csv')
    expect(text).toContain('full-backup.json')
    expect(text).toContain('VERIFICATION.txt')
    expect(text).toContain('Period:          Q2 2026')
    expect(text).toContain('COMPLIANCE RULESET')
    expect(text).toContain('Acme')
  })
})

describe('buildAuditLogCsv', () => {
  it('exports labelled change-log rows with flattened field changes', () => {
    const state = makeState({
      location: { country: 'Australia', region: 'QLD', city: 'Brisbane', timezone: 'Australia/Brisbane' },
      auditLog: [
        makeAudit({
          id: 'a1',
          at: '2026-07-17T01:15:00.000Z',
          action: 'update',
          entity: 'bottle',
          target: 'CYL-9',
          summary: 'Edited bottle CYL-9',
          by: 'Pat',
          byLicence: '12345',
          changes: [{ field: 'Status', from: 'In stock', to: 'On site' }],
          chainId: 'device-1',
          seq: 9,
          prevHash: 'prev',
          hash: 'hash',
        }),
      ],
    })
    const csv = buildAuditLogCsv(state)
    expect(csv).toContain('CHANGE LOG')
    expect(csv).toContain('action_label')
    expect(csv).toContain('Edited')
    expect(csv).toContain('Bottle')
    expect(csv).toContain('Status: In stock → On site')
    expect(csv).toContain('17/07/2026')
    expect(csv).toContain('Yes')
  })
})
