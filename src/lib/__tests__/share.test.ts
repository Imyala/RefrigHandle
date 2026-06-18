import { describe, expect, it } from 'vitest'
import { transactionShareText } from '../share'
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
