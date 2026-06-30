import { describe, expect, it } from 'vitest'
import { complianceRows, quarterlyTotals } from '../reports'
import { makeBottle, makeState, makeTx } from './fixtures'

// UTC dates land in 2026 Q2 for an Australian (UTC+) timezone too, so the
// quarter math is stable regardless of the test machine's clock.
const Q2 = '2026-Q2'
const TZ = 'Australia/Sydney'

describe('quarterlyTotals', () => {
  it('buckets each movement kind per refrigerant for the quarter', () => {
    const bottle = makeBottle({ id: 'b1', refrigerantType: 'R32', tareWeight: 10 })
    const live = [
      makeTx({ bottleId: 'b1', kind: 'intake', amount: 5, date: '2026-04-10T02:00:00.000Z' }),
      makeTx({ bottleId: 'b1', kind: 'charge', amount: 2, date: '2026-05-01T02:00:00.000Z' }),
      makeTx({ bottleId: 'b1', kind: 'recover', amount: 1, date: '2026-05-02T02:00:00.000Z' }),
      // bottle-to-bottle decant — excluded from "recovered from equipment"
      makeTx({ bottleId: 'b1', kind: 'recover', amount: 4, sourceBottleId: 'b2', date: '2026-05-03T02:00:00.000Z' }),
    ]
    const [r] = quarterlyTotals(live, [bottle], Q2, TZ)
    expect(r.refrigerant).toBe('R32')
    expect(r.purchasedKg).toBe(5)
    expect(r.chargedKg).toBe(2)
    expect(r.recoveredKg).toBe(1) // decant not counted
  })

  it('excludes movements outside the selected quarter', () => {
    const bottle = makeBottle({ id: 'b1' })
    const live = [
      makeTx({ bottleId: 'b1', kind: 'charge', amount: 9, date: '2026-01-10T02:00:00.000Z' }), // Q1
    ]
    expect(quarterlyTotals(live, [bottle], Q2, TZ)).toEqual([])
  })

  it('counts a re-statement correction in place of the superseded original', () => {
    const bottle = makeBottle({ id: 'b1', refrigerantType: 'R32' })
    const live = [
      makeTx({ id: 't1', bottleId: 'b1', kind: 'charge', amount: 5, date: '2026-05-01T02:00:00.000Z' }),
      makeTx({ id: 't2', bottleId: 'b1', kind: 'charge', amount: 3, correctsId: 't1', date: '2026-05-01T02:00:00.000Z' }),
    ]
    const [r] = quarterlyTotals(live, [bottle], Q2, TZ)
    expect(r.chargedKg).toBe(3) // the corrected figure, not 5+3
  })
})

describe('complianceRows', () => {
  it('flags an expired technician licence as action', () => {
    const state = makeState({
      technicians: [
        {
          id: 'tech1',
          name: 'Pat',
          arcLicenceNumber: 'L-1',
          role: 'owner',
          licenceExpiry: '2000-01-01',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    const row = complianceRows(state).find((r) => r.id === 'licences')
    expect(row?.level).toBe('action')
    expect(row?.summary).toContain('expired')
  })

  it('reports an overdue cylinder hydro test as action', () => {
    const state = makeState({
      bottles: [makeBottle({ status: 'in_stock', nextHydroTestDate: '2000-01' })],
    })
    const row = complianceRows(state).find((r) => r.id === 'cylinders')
    expect(row?.level).toBe('action')
    expect(row?.summary).toContain('overdue')
  })

  it('always includes the five compliance signals', () => {
    const ids = complianceRows(makeState()).map((r) => r.id)
    expect(ids).toEqual(['licences', 'rta', 'cylinders', 'leaks', 'backup'])
  })
})
