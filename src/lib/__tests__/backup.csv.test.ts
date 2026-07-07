import { describe, expect, it } from 'vitest'
import { buildLogCsv } from '../backup'
import { makeBottle, makeState, makeTx } from './fixtures'

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
