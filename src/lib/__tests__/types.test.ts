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
  canAssignRole,
  canManageTech,
  canManageTechnicians,
  retentionSummary,
  retentionYears,
  composeName,
  daysUntilPurge,
  isTechnicianActive,
  splitName,
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

describe('records retention by business structure', () => {
  it('companies keep records 7 years, everyone else 5', () => {
    expect(retentionYears('company')).toBe(7)
    expect(retentionYears('sole_trader')).toBe(5)
    expect(retentionYears('partnership')).toBe(5)
    expect(retentionYears('trust')).toBe(5)
  })

  it('is unknown until the structure is set', () => {
    expect(retentionYears(undefined)).toBeNull()
    expect(retentionSummary(undefined)).toContain('5–7 years')
  })

  it('summary names the right period and regulator', () => {
    expect(retentionSummary('company')).toContain('7 years')
    expect(retentionSummary('company')).toContain('ASIC')
    expect(retentionSummary('sole_trader')).toContain('5 years')
    expect(retentionSummary('sole_trader')).toContain('ATO')
  })
})

describe('role assignment guard (canAssignRole / canManageTech)', () => {
  it('a supervisor cannot grant owner while an owner exists', () => {
    expect(canAssignRole('supervisor', 'owner', true)).toBe(false)
  })

  it('a supervisor can appoint an owner only when none exists', () => {
    expect(canAssignRole('supervisor', 'owner', false)).toBe(true)
  })

  it('no one but an owner can assign at or above their own tier', () => {
    // A supervisor can't mint another supervisor (lateral), only roles
    // strictly below them.
    expect(canAssignRole('supervisor', 'supervisor', true)).toBe(false)
    expect(canAssignRole('supervisor', 'lead_tech', true)).toBe(true)
    expect(canAssignRole('supervisor', 'technician', true)).toBe(true)
  })

  it('a lead tech assigns only technician and apprentice', () => {
    expect(canAssignRole('lead_tech', 'technician', true)).toBe(true)
    expect(canAssignRole('lead_tech', 'apprentice', true)).toBe(true)
    // Nothing at or above their own tier — including appointing an owner.
    expect(canAssignRole('lead_tech', 'lead_tech', true)).toBe(false)
    expect(canAssignRole('lead_tech', 'supervisor', true)).toBe(false)
    expect(canAssignRole('lead_tech', 'owner', false)).toBe(false)
  })

  it('an owner can assign any role', () => {
    expect(canAssignRole('owner', 'owner', true)).toBe(true)
    expect(canAssignRole('owner', 'supervisor', true)).toBe(true)
    expect(canAssignRole('owner', 'apprentice', true)).toBe(true)
  })

  it('non-managers cannot assign any role', () => {
    expect(canAssignRole('technician', 'apprentice', false)).toBe(false)
    expect(canAssignRole('apprentice', 'apprentice', false)).toBe(false)
    expect(canAssignRole(undefined, 'technician', false)).toBe(false)
  })

  it('canManageTech only acts on strictly lower tiers (owner manages all)', () => {
    expect(canManageTech('lead_tech', 'technician')).toBe(true)
    expect(canManageTech('lead_tech', 'lead_tech')).toBe(false)
    expect(canManageTech('lead_tech', 'supervisor')).toBe(false)
    expect(canManageTech('supervisor', 'owner')).toBe(false)
    expect(canManageTech('owner', 'supervisor')).toBe(true)
    expect(canManageTech('technician', 'apprentice')).toBe(false)
  })
})

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
    expect(levels).toEqual([5, 4, 3, 2, 1])
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

describe('technician deactivation lifecycle', () => {
  it('canManageTechnicians is lead tech and above', () => {
    expect(canManageTechnicians('owner')).toBe(true)
    expect(canManageTechnicians('supervisor')).toBe(true)
    expect(canManageTechnicians('lead_tech')).toBe(true)
    expect(canManageTechnicians('technician')).toBe(false)
    expect(canManageTechnicians('apprentice')).toBe(false)
    // Unset reads as the default (technician) tier — no management.
    expect(canManageTechnicians(undefined)).toBe(false)
  })

  it('isTechnicianActive reflects the deactivatedAt flag', () => {
    expect(isTechnicianActive({})).toBe(true)
    expect(isTechnicianActive({ deactivatedAt: '2026-01-01T00:00:00.000Z' })).toBe(false)
  })

  it('daysUntilPurge counts down 90 days from deactivation', () => {
    const now = new Date('2026-06-13T00:00:00.000Z')
    expect(daysUntilPurge({}, now)).toBeNull()
    expect(daysUntilPurge({ deactivatedAt: '2026-06-13T00:00:00.000Z' }, now)).toBe(90)
    // Deactivated 10 days ago → 80 days left.
    expect(daysUntilPurge({ deactivatedAt: '2026-06-03T00:00:00.000Z' }, now)).toBe(80)
    // Deactivated 95 days ago → overdue (negative).
    const overdue = daysUntilPurge({ deactivatedAt: '2026-03-10T00:00:00.000Z' }, now)
    expect(overdue).not.toBeNull()
    expect(overdue as number).toBeLessThan(0)
  })
})

describe('structured names', () => {
  it('composeName joins parts and drops blanks', () => {
    expect(composeName({ firstName: 'Jane', middleName: 'Quinn', lastName: 'Smith' })).toBe('Jane Quinn Smith')
    expect(composeName({ firstName: 'Jane', lastName: 'Smith' })).toBe('Jane Smith')
    expect(composeName({ firstName: '  Jane  ', middleName: '', lastName: 'Smith' })).toBe('Jane Smith')
    expect(composeName({})).toBe('')
  })

  it('splitName seeds first / middle / surname from a single name', () => {
    expect(splitName('Jane Smith')).toEqual({ firstName: 'Jane', middleName: '', lastName: 'Smith' })
    expect(splitName('Jane Quinn Smith')).toEqual({ firstName: 'Jane', middleName: 'Quinn', lastName: 'Smith' })
    expect(splitName('Jane Q A Smith')).toEqual({ firstName: 'Jane', middleName: 'Q A', lastName: 'Smith' })
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', middleName: '', lastName: '' })
    expect(splitName('   ')).toEqual({ firstName: '', middleName: '', lastName: '' })
  })

  it('compose and split round-trip a simple first+last name', () => {
    const parts = splitName('Jane Smith')
    expect(composeName(parts)).toBe('Jane Smith')
  })
})
