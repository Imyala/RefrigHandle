import { describe, expect, it } from 'vitest'
import {
  listShareText,
  periodShareText,
  rangeShareText,
  transactionShareText,
  serviceReportText,
} from '../share'
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

describe('rangeShareText / periodShareText', () => {
  const bottle = makeBottle({ id: 'b1', bottleNumber: 'B-1', refrigerantType: 'R32' })
  // Brisbane (UTC+10, no DST) so the local day is deterministic.
  const state = makeState({
    businessName: 'Acme',
    bottles: [bottle],
    location: { country: 'Australia', region: 'QLD', city: 'Brisbane', timezone: 'Australia/Brisbane' },
  })

  it('bundles jobs within a single-day range, in order', () => {
    const txs = [
      makeTx({ id: 'a', kind: 'charge', bottleId: 'b1', amount: 1, date: '2026-06-18T03:00:00.000Z' }),
      makeTx({ id: 'b', kind: 'recover', bottleId: 'b1', amount: 2, date: '2026-06-18T06:00:00.000Z' }),
      // Different day — must be excluded.
      makeTx({ id: 'c', kind: 'charge', bottleId: 'b1', amount: 3, date: '2026-06-19T03:00:00.000Z' }),
    ]
    const out = rangeShareText(txs, state, '2026-06-18', '2026-06-18')
    expect(out).not.toBeNull()
    expect(out!.body).toContain('2 jobs')
    expect(out!.body).toContain('— Job 1 —')
    expect(out!.body).toContain('— Job 2 —')
    expect(out!.body).not.toContain('— Job 3 —')
    expect(out!.subject).toContain('2026-06-18')
  })

  it('a multi-day range spans both ends inclusively', () => {
    const txs = [
      makeTx({ id: 'a', bottleId: 'b1', amount: 1, date: '2026-06-15T03:00:00.000Z' }),
      makeTx({ id: 'b', bottleId: 'b1', amount: 1, date: '2026-06-21T03:00:00.000Z' }),
      makeTx({ id: 'c', bottleId: 'b1', amount: 1, date: '2026-06-22T03:00:00.000Z' }), // outside
    ]
    const out = rangeShareText(txs, state, '2026-06-15', '2026-06-21')
    expect(out!.body).toContain('2 jobs')
    expect(out!.body).toContain('2026-06-15 to 2026-06-21')
  })

  it('returns null when nothing was logged in the range', () => {
    expect(rangeShareText([], state, '2026-06-18', '2026-06-18')).toBeNull()
    const deleted = [
      makeTx({ id: 'd', bottleId: 'b1', date: '2026-06-18T03:00:00.000Z', deletedAt: 'x' }),
    ]
    expect(rangeShareText(deleted, state, '2026-06-18', '2026-06-18')).toBeNull()
  })

  it('periodShareText("today") only includes today', () => {
    const todayTx = makeTx({ id: 'now', bottleId: 'b1', amount: 1, date: new Date().toISOString() })
    const oldTx = makeTx({ id: 'old', bottleId: 'b1', amount: 1, date: '2020-01-01T03:00:00.000Z' })
    const out = periodShareText([todayTx, oldTx], state, 'today')
    expect(out).not.toBeNull()
    expect(out!.body).toContain('1 job')
  })

  it('adds a totals line summing amounts by kind', () => {
    const txs = [
      makeTx({ id: 'a', kind: 'charge', bottleId: 'b1', amount: 2.5, date: '2026-06-18T03:00:00.000Z' }),
      makeTx({ id: 'b', kind: 'charge', bottleId: 'b1', amount: 1.5, date: '2026-06-18T04:00:00.000Z' }),
      makeTx({ id: 'c', kind: 'recover', bottleId: 'b1', amount: 1, date: '2026-06-18T05:00:00.000Z' }),
    ]
    const out = rangeShareText(txs, state, '2026-06-18', '2026-06-18')
    expect(out!.body).toContain('Totals: Charge 4.00 kg · Recover 1.00 kg')
  })

  it('listShareText bundles an arbitrary filtered list', () => {
    const txs = [
      makeTx({ id: 'a', kind: 'charge', bottleId: 'b1', amount: 1 }),
      makeTx({ id: 'b', kind: 'recover', bottleId: 'b1', amount: 1 }),
    ]
    const out = listShareText(txs, state, 'Filtered: R32')
    expect(out).not.toBeNull()
    expect(out!.body).toContain('Filtered: R32 · 2 jobs')
    expect(listShareText([], state, 'x')).toBeNull()
  })
})

describe('serviceReportText', () => {
  it('reads as a customer document: header, work, totals, sign-off note', () => {
    const job = {
      id: 'j1',
      reference: 'WO-1042',
      status: 'closed' as const,
      date: '2026-06-18T03:00:00.000Z',
      siteName: 'Harbour View Apartments',
      clientName: 'Strata Co',
      createdAt: '2026-06-18T03:00:00.000Z',
    }
    const state = makeState({
      businessName: 'Acme Refrigeration',
      businessAbn: '51824753556',
      // A modern blob always serialises `sites` — without it, normalize
      // treats jobId as the ANCIENT site link and strips it.
      sites: [],
      bottles: [makeBottle({ id: 'b1', bottleNumber: 'B-1', refrigerantType: 'R32' })],
      jobs: [job],
      transactions: [
        makeTx({ id: 't1', jobId: 'j1', bottleId: 'b1', kind: 'charge', amount: 2.5, date: '2026-06-18T04:00:00.000Z' }),
        // deleted row must not leak into the customer's report
        makeTx({ id: 't2', jobId: 'j1', bottleId: 'b1', kind: 'charge', amount: 9, date: '2026-06-18T05:00:00.000Z', deletedAt: '2026-06-19T00:00:00.000Z' }),
      ],
    })
    const { subject, body } = serviceReportText(job, state)
    expect(subject).toBe('Service report — WO-1042 · Harbour View Apartments')
    expect(body).toContain('REFRIGERANT SERVICE REPORT')
    expect(body).toContain('Acme Refrigeration')
    expect(body).toContain('Job: WO-1042')
    expect(body).toContain('Client: Strata Co')
    expect(body).toContain('WORK PERFORMED (1 movement)')
    expect(body).toContain('Charge — 2.50 kg R32')
    expect(body).not.toContain('Charge — 9.00') // the deleted row
    expect(body).toContain('Refrigerant Trading Authorisation')
  })
})
