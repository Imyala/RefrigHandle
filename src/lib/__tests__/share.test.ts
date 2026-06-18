import { describe, expect, it } from 'vitest'
import { dayShareText, transactionShareText } from '../share'
import { makeBottle, makeState, makeTx } from './fixtures'

describe('transactionShareText', () => {
  const bottle = makeBottle({
    id: 'b1',
    bottleNumber: 'B-102',
    refrigerantType: 'R410A',
  })
  const state = makeState({
    businessName: 'Acme Refrigeration',
    businessAbn: '51824753556',
    arcAuthorisationNumber: 'AU00000',
    bottles: [bottle],
    sites: [{ id: 's1', name: 'BN-ASAC', address: '1 Airport Dr', createdAt: 'x' }],
  })

  it('produces a formatted job record with the key details', () => {
    const t = makeTx({
      kind: 'charge',
      bottleId: 'b1',
      siteId: 's1',
      amount: 2.5,
      weightBefore: 16.3,
      weightAfter: 13.8,
      reason: 'top_up',
      leakTestPerformed: true,
      technician: 'Jane Smith',
      technicianLicence: 'L000000',
    })
    const { subject, body } = transactionShareText(t, state)

    expect(body).toContain('REFRIGERANT JOB RECORD')
    expect(body).toContain('Acme Refrigeration')
    expect(body).toContain('Charge — 2.50 kg R410A')
    expect(body).toContain('Site: BN-ASAC')
    expect(body).toContain('Address: 1 Airport Dr')
    expect(body).toContain('Bottle: B-102 (R410A)')
    expect(body).toContain('Leak test performed: Yes')
    expect(body).toContain('Technician: Jane Smith · RHL L000000')
    // No giant gaps left by skipped optional lines.
    expect(body).not.toMatch(/\n{3,}/)
    expect(subject).toContain('Charge')
    expect(subject).toContain('R410A')
  })

  it('omits sections that have no data', () => {
    const t = makeTx({ kind: 'charge', bottleId: 'b1', amount: 1 })
    const { body } = transactionShareText(t, state)
    expect(body).not.toContain('Notes:')
    expect(body).not.toContain('Reason:')
    expect(body).not.toContain('Loss:')
  })
})

describe('dayShareText', () => {
  const bottle = makeBottle({ id: 'b1', bottleNumber: 'B-1', refrigerantType: 'R32' })
  // Brisbane (UTC+10, no DST) so the local day is deterministic.
  const state = makeState({
    businessName: 'Acme',
    bottles: [bottle],
    location: { country: 'Australia', region: 'QLD', city: 'Brisbane', timezone: 'Australia/Brisbane' },
  })

  it('bundles every job logged on the given day, in order', () => {
    const txs = [
      makeTx({ id: 'a', kind: 'charge', bottleId: 'b1', amount: 1, date: '2026-06-18T03:00:00.000Z' }),
      makeTx({ id: 'b', kind: 'recover', bottleId: 'b1', amount: 2, date: '2026-06-18T06:00:00.000Z' }),
      // Different day — must be excluded.
      makeTx({ id: 'c', kind: 'charge', bottleId: 'b1', amount: 3, date: '2026-06-19T03:00:00.000Z' }),
    ]
    const out = dayShareText(txs, state, '2026-06-18')
    expect(out).not.toBeNull()
    expect(out!.body).toContain('2 jobs')
    expect(out!.body).toContain('— Job 1 —')
    expect(out!.body).toContain('— Job 2 —')
    expect(out!.body).not.toContain('— Job 3 —')
    expect(out!.subject).toContain('2026-06-18')
  })

  it('returns null when nothing was logged that day', () => {
    expect(dayShareText([], state, '2026-06-18')).toBeNull()
    const deleted = [
      makeTx({ id: 'd', bottleId: 'b1', date: '2026-06-18T03:00:00.000Z', deletedAt: 'x' }),
    ]
    expect(dayShareText(deleted, state, '2026-06-18')).toBeNull()
  })
})
