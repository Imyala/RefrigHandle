import { describe, expect, it } from 'vitest'
import {
  euLeakCheckFor,
  euLeakCheckIntervalMonths,
  leakThresholdsFor,
  profileFor,
  usLeakRateThreshold,
  usThresholdApplies,
} from '../compliance'
import { makeTx, makeUnit } from './fixtures'

describe('jurisdiction profiles', () => {
  it('defaults to AU and survives unknown values', () => {
    expect(profileFor(undefined).id).toBe('AU')
    expect(profileFor('AU').id).toBe('AU')
  })
})

describe('US EPA §608 leak-rate thresholds', () => {
  it('comfort cooling 10%, commercial refrigeration 20%', () => {
    expect(usLeakRateThreshold('split')).toBe(0.1)
    expect(usLeakRateThreshold('chiller')).toBe(0.1)
    expect(usLeakRateThreshold('refrigeration')).toBe(0.2)
    expect(usLeakRateThreshold(undefined)).toBe(0.1)
  })

  it('thresholds only bind at or above the 15 lb full charge', () => {
    expect(usThresholdApplies(makeUnit({ refrigerantCharge: 6.8 }))).toBe(true)
    expect(usThresholdApplies(makeUnit({ refrigerantCharge: 5 }))).toBe(false)
  })

  it('leakThresholdsFor: US watch at half the regulatory line, AU advisory 5/10%', () => {
    expect(leakThresholdsFor('US', makeUnit({ kind: 'refrigeration' }))).toEqual({
      watch: 0.1,
      suspected: 0.2,
    })
    expect(leakThresholdsFor('AU', makeUnit())).toEqual({ watch: 0.05, suspected: 0.1 })
  })
})

describe('EU F-Gas 2024/573 leak-check schedule', () => {
  it('interval bands by CO2-equivalent: 5 t → 12 mo, 50 t → 6 mo, 500 t → 3 mo', () => {
    // R410A GWP 2088: 5 t ≈ 2.4 kg, 50 t ≈ 24 kg, 500 t ≈ 240 kg.
    expect(euLeakCheckIntervalMonths(2, 'R410A')).toBeNull() // 4.2 t — exempt
    expect(euLeakCheckIntervalMonths(3, 'R410A')).toBe(12) // 6.3 t
    expect(euLeakCheckIntervalMonths(25, 'R410A')).toBe(6) // 52 t
    expect(euLeakCheckIntervalMonths(250, 'R410A')).toBe(3) // 522 t
    expect(euLeakCheckIntervalMonths(undefined, 'R410A')).toBeNull()
    expect(euLeakCheckIntervalMonths(10, 'R-MYSTERY')).toBeNull() // unknown GWP
  })

  const NOW = '2026-06-13T00:00:00.000Z'
  const unit = makeUnit({ id: 'u1', refrigerantCharge: 10, refrigerantType: 'R410A' }) // ~20.9 t → 12 mo

  it('no_check until a leak test is on record', () => {
    expect(euLeakCheckFor(unit, [], NOW).status).toBe('no_check')
    // A transaction without a leak test doesn't count as a check.
    const noTest = makeTx({ unitId: 'u1', leakTestPerformed: false })
    expect(euLeakCheckFor(unit, [noTest], NOW).status).toBe('no_check')
  })

  it('ok / due_soon / overdue against the interval from the last test', () => {
    const tested = (date: string) =>
      makeTx({ unitId: 'u1', leakTestPerformed: true, date })
    expect(euLeakCheckFor(unit, [tested('2026-01-15T00:00:00.000Z')], NOW).status).toBe('ok')
    expect(euLeakCheckFor(unit, [tested('2025-07-01T00:00:00.000Z')], NOW).status).toBe('due_soon')
    expect(euLeakCheckFor(unit, [tested('2025-05-01T00:00:00.000Z')], NOW).status).toBe('overdue')
  })

  it('soft-deleted leak tests do not count', () => {
    const deleted = makeTx({
      unitId: 'u1',
      leakTestPerformed: true,
      date: '2026-06-01T00:00:00.000Z',
      deletedAt: '2026-06-02T00:00:00.000Z',
    })
    expect(euLeakCheckFor(unit, [deleted], NOW).status).toBe('no_check')
  })

  it('small charges are exempt', () => {
    const small = makeUnit({ refrigerantCharge: 1, refrigerantType: 'R410A' })
    expect(euLeakCheckFor(small, [], NOW).status).toBe('exempt')
  })
})
