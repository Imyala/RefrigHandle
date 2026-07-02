import { describe, expect, it } from 'vitest'
import { normalizeState } from '../storage'

// `jobId` has meant two different things across the app's history:
// ANCIENT blobs (before the `sites` array existed) used it as the SITE
// link on a transaction; modern blobs use it as the WORK-ORDER link.
// normalize() folds only the ancient shape — a modern blob's jobId must
// survive every load, or the Jobs feature (service reports, job totals)
// silently empties out on every app start and the loss syncs team-wide.
describe('transaction jobId migration in normalizeState', () => {
  it('preserves the work-order jobId on a modern blob (sites array present)', () => {
    const state = normalizeState({
      sites: [],
      jobs: [
        {
          id: 'job-9',
          reference: 'WO-1042',
          status: 'open',
          date: '2026-06-01T00:00:00.000Z',
          createdAt: '2026-06-01T00:00:00.000Z',
        },
      ],
      transactions: [
        {
          id: 'tx-1',
          bottleId: 'b1',
          kind: 'charge',
          amount: 2,
          weightBefore: 50,
          weightAfter: 48,
          date: '2026-06-01T00:00:00.000Z',
          jobId: 'job-9',
          siteId: 'site-1',
        },
      ],
    })
    expect(state.transactions[0].jobId).toBe('job-9')
    expect(state.transactions[0].siteId).toBe('site-1')
    expect(state.jobs).toHaveLength(1)
  })

  it('folds the ancient site-link jobId into siteId (no sites array)', () => {
    const state = normalizeState({
      transactions: [
        {
          id: 'tx-1',
          bottleId: 'b1',
          kind: 'charge',
          amount: 2,
          weightBefore: 50,
          weightAfter: 48,
          date: '2024-06-01T00:00:00.000Z',
          jobId: 'old-site-7',
        },
      ],
    })
    expect(state.transactions[0].siteId).toBe('old-site-7')
    expect(state.transactions[0].jobId).toBeUndefined()
  })

  it('normalize is idempotent for the modern shape (load → save → load)', () => {
    const once = normalizeState({
      sites: [],
      transactions: [
        {
          id: 'tx-1',
          bottleId: 'b1',
          kind: 'charge',
          amount: 2,
          weightBefore: 50,
          weightAfter: 48,
          date: '2026-06-01T00:00:00.000Z',
          jobId: 'job-9',
        },
      ],
    })
    const twice = normalizeState(JSON.parse(JSON.stringify(once)))
    expect(twice.transactions[0].jobId).toBe('job-9')
  })
})
