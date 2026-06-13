import { describe, expect, it } from 'vitest'
import {
  chargeSanity,
  expiryStatus,
  fillingRatio,
  gwpFor,
  hydroStatusFor,
  isOverfilled,
  netWeight,
  overfillKg,
  quarterKey,
  quarterOfDay,
  roleAtLeast,
  roleInfo,
  safeFillKgFor,
  scaleDeltaKg,
  TECHNICIAN_ROLES,
  tonnesCO2eFor,
  transactionLoss,
} from '../types'
import { makeBottle, makeTx } from './fixtures'

describe('bottle weight math', () => {
  it('net weight is gross minus tare, floored at zero', () => {
    expect(netWeight(makeBottle({ grossWeight: 19, tareWeight: 10 }))).toBe(9)
    // A mis-entered tare must never produce negative refrigerant.
    expect(netWeight(makeBottle({ grossWeight: 8, tareWeight: 10 }))).toBe(0)
  })

  it('overfill is the excess over capacity, zero when unknown', () => {
    expect(overfillKg(10, 9)).toBe(1)
    expect(overfillKg(9, 9)).toBe(0)
    expect(overfillKg(10, 0)).toBe(0)
  })

  it('isOverfilled tolerates rounding noise', () => {
    expect(
      isOverfilled(
        makeBottle({ grossWeight: 19.005, tareWeight: 10, initialNetWeight: 9 }),
      ),
    ).toBe(false)
    expect(
      isOverfilled(
        makeBottle({ grossWeight: 19.5, tareWeight: 10, initialNetWeight: 9 }),
      ),
    ).toBe(true)
  })
})

describe('safe fill ratios (DOT/CFR-49 style)', () => {
  it('uses the per-refrigerant filling ratio', () => {
    expect(fillingRatio('R290')).toBe(0.43) // flammable hydrocarbon
    expect(fillingRatio('r290')).toBe(0.43) // case-insensitive
    expect(safeFillKgFor(10, 'R290')).toBe(4.3)
  })

  it('falls back to 80% of water capacity for unknown refrigerants', () => {
    expect(fillingRatio('R-CUSTOM-BLEND')).toBe(0.8)
    expect(safeFillKgFor(47.4)).toBe(37.92)
  })
})

describe('scale-reading deltas', () => {
  // Bottle at 19.0 kg gross. The reading is the NEW gross weight.
  it('charge: bottle got lighter by the charged amount', () => {
    expect(scaleDeltaKg('charge', 19, 16.5)).toBeCloseTo(2.5)
    // Reading heavier than current contradicts a charge → negative.
    expect(scaleDeltaKg('charge', 19, 20)).toBeLessThan(0)
  })
  it('recover: bottle got heavier', () => {
    expect(scaleDeltaKg('recover', 19, 21.2)).toBeCloseTo(2.2)
  })
  it('adjust: signed stocktake delta', () => {
    expect(scaleDeltaKg('adjust', 19, 18.4)).toBeCloseTo(-0.6)
    expect(scaleDeltaKg('adjust', 19, 19.6)).toBeCloseTo(0.6)
  })
  it('movement kinds have no delta', () => {
    expect(scaleDeltaKg('transfer', 19, 25)).toBe(0)
  })
})

describe('hose / decant loss', () => {
  it('charge: loss is bottle-out minus equipment-in', () => {
    expect(transactionLoss(makeTx({ kind: 'charge', amount: 3, bottleAmount: 3.4 }))).toBeCloseTo(0.4)
  })
  it('recover: loss is equipment-out minus bottle-in', () => {
    expect(transactionLoss(makeTx({ kind: 'recover', amount: 3, bottleAmount: 2.7 }))).toBeCloseTo(0.3)
  })
  it('never negative, zero when no bottle-side amount recorded', () => {
    expect(transactionLoss(makeTx({ kind: 'charge', amount: 3, bottleAmount: 2.5 }))).toBe(0)
    expect(transactionLoss(makeTx({ kind: 'charge', amount: 3 }))).toBe(0)
  })
})

describe('charge plausibility guard', () => {
  it('prefers the unit’s recorded charge: warn over 1.5×, block over 5×', () => {
    expect(chargeSanity(4, { recordedChargeKg: 10 }).level).toBe('ok')
    expect(chargeSanity(16, { recordedChargeKg: 10 }).level).toBe('warn')
    expect(chargeSanity(51, { recordedChargeKg: 10 }).level).toBe('block')
  })
  it('falls back to the per-kind soft threshold', () => {
    expect(chargeSanity(5, { unitKind: 'split' }).level).toBe('ok')
    expect(chargeSanity(50, { unitKind: 'split' }).level).toBe('block') // 50 kg into a split
  })
  it('passes when there is nothing to compare against', () => {
    expect(chargeSanity(50, {}).level).toBe('ok')
    expect(chargeSanity(0, { recordedChargeKg: 10 }).level).toBe('ok')
  })
})

describe('GWP / CO2-equivalent (IPCC AR4)', () => {
  it('computes tonnes CO2e from kg and GWP', () => {
    expect(gwpFor('R410A')).toBe(2088)
    expect(tonnesCO2eFor(10, 'R410A')).toBeCloseTo(20.88)
  })
  it('unknown refrigerant yields undefined, not zero', () => {
    expect(gwpFor('R-MYSTERY')).toBeUndefined()
    expect(tonnesCO2eFor(10, 'R-MYSTERY')).toBeUndefined()
  })
})

describe('ARC quarter bucketing', () => {
  it('maps calendar days to quarters', () => {
    expect(quarterOfDay('2026-01-01')).toEqual({ year: 2026, q: 1 })
    expect(quarterOfDay('2026-06-30')).toEqual({ year: 2026, q: 2 })
    expect(quarterOfDay('2026-12-31')).toEqual({ year: 2026, q: 4 })
    expect(quarterOfDay('garbage')).toBeNull()
  })
  it('keys are stable for grouping', () => {
    expect(quarterKey({ year: 2026, q: 2 })).toBe('2026-Q2')
  })
})

describe('licence expiry status', () => {
  const now = '2026-06-13T00:00:00.000Z'
  it('valid through the expiry day itself', () => {
    expect(expiryStatus('2030-01-01', now).level).toBe('ok')
    expect(expiryStatus('2026-06-13', now).level).toBe('due_soon') // expires today
  })
  it('warns inside the 60-day window and reports expired after', () => {
    expect(expiryStatus('2026-07-20', now).level).toBe('due_soon')
    expect(expiryStatus('2026-06-01', now).level).toBe('expired')
  })
  it('unknown when missing or malformed', () => {
    expect(expiryStatus(undefined, now).level).toBe('unknown')
    expect(expiryStatus('01/06/2026', now).level).toBe('unknown')
  })
})

describe('AS 2030 hydro test status', () => {
  const now = '2026-06-13T00:00:00.000Z'
  it('month-granular: due this month and next month are due_soon', () => {
    expect(hydroStatusFor(makeBottle({ nextHydroTestDate: '2026-06' }), now).status).toBe('due_soon')
    expect(hydroStatusFor(makeBottle({ nextHydroTestDate: '2026-07' }), now).status).toBe('due_soon')
    expect(hydroStatusFor(makeBottle({ nextHydroTestDate: '2026-08' }), now).status).toBe('ok')
  })
  it('overdue once past the due month, with months overdue', () => {
    const h = hydroStatusFor(makeBottle({ nextHydroTestDate: '2026-03' }), now)
    expect(h.status).toBe('overdue')
    expect(h.monthsUntilDue).toBe(-3)
  })
  it('accepts legacy YYYY-MM-DD stamps', () => {
    expect(hydroStatusFor(makeBottle({ nextHydroTestDate: '2026-06-15' }), now).status).toBe('due_soon')
  })
  it('unknown without a stamp', () => {
    expect(hydroStatusFor(makeBottle(), now).status).toBe('unknown')
  })
})

describe('technician roles', () => {
  it('roleInfo falls back to the default tier for unset/legacy profiles', () => {
    expect(roleInfo(undefined).value).toBe('technician')
    expect(roleInfo('owner').label).toBe('Business owner')
    expect(roleInfo('apprentice').level).toBe(1)
  })

  it('roles are ordered highest access first by level', () => {
    const levels = TECHNICIAN_ROLES.map((r) => r.level)
    expect(levels).toEqual([4, 3, 2, 1])
    expect(TECHNICIAN_ROLES[0].value).toBe('owner')
  })

  it('roleAtLeast compares access tiers, treating unset as technician', () => {
    expect(roleAtLeast('owner', 'supervisor')).toBe(true)
    expect(roleAtLeast('supervisor', 'supervisor')).toBe(true)
    expect(roleAtLeast('apprentice', 'technician')).toBe(false)
    expect(roleAtLeast(undefined, 'technician')).toBe(true)
    expect(roleAtLeast(undefined, 'supervisor')).toBe(false)
  })
})
