import { describe, expect, it } from 'vitest'
import {
  COMPLIANCE_DATASET,
  COMPLIANCE_STALE_DAYS,
  complianceDataStale,
  complianceVerifiedLabel,
  profileFor,
} from '../compliance'

describe('compliance profile', () => {
  it('always resolves to the Australian (ARC) profile', () => {
    expect(profileFor(undefined).id).toBe('AU')
    expect(profileFor('AU').id).toBe('AU')
    expect(profileFor('AU').techLicenceShort).toBe('RHL')
    expect(profileFor('AU').businessAuthShort).toBe('RTA')
  })
})

describe('compliance dataset stamp', () => {
  it('goes stale ~two quarters after verifiedAsOf, not before', () => {
    const verified = new Date(COMPLIANCE_DATASET.verifiedAsOf + 'T00:00:00')
    const soon = new Date(verified.getTime() + 30 * 86400000)
    const late = new Date(verified.getTime() + (COMPLIANCE_STALE_DAYS + 1) * 86400000)
    expect(complianceDataStale(soon)).toBe(false)
    expect(complianceDataStale(late)).toBe(true)
  })

  it('names the AR4 GWP basis and the 2025 Code of Practice', () => {
    expect(COMPLIANCE_DATASET.summary).toContain('AR4')
    expect(COMPLIANCE_DATASET.summary).toContain('Code of Practice 2025')
    expect(complianceVerifiedLabel()).toMatch(/\d{4}/)
  })
})
