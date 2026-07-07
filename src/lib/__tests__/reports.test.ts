import { describe, expect, it } from 'vitest'
import {
  complianceRows,
  monthlySummary,
  quarterCloseStatus,
  quarterlyTotals,
  rangeTotals,
} from '../reports'
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

  it("counts a sale's net contents in the reg-141 'sold' bucket", () => {
    const bottle = makeBottle({ id: 'b1', refrigerantType: 'R32', tareWeight: 10 })
    const live = [
      // Sold with 19 kg gross on a 10 kg tare -> 9 kg of refrigerant sold.
      makeTx({
        bottleId: 'b1',
        kind: 'sell',
        amount: 0,
        weightBefore: 19,
        bottleTareWeight: 10,
        date: '2026-05-10T02:00:00.000Z',
      }),
    ]
    const [r] = quarterlyTotals(live, [bottle], Q2, TZ)
    expect(r.soldKg).toBe(9)
    expect(r.returnedKg).toBe(0)
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

describe('rangeTotals (year / custom-range engine)', () => {
  it('aggregates across quarter boundaries over an arbitrary day range', () => {
    const bottle = makeBottle({ id: 'b1', refrigerantType: 'R32' })
    const live = [
      makeTx({ bottleId: 'b1', kind: 'charge', amount: 2, date: '2026-02-10T02:00:00.000Z' }), // Q1
      makeTx({ bottleId: 'b1', kind: 'charge', amount: 3, date: '2026-05-10T02:00:00.000Z' }), // Q2
      makeTx({ bottleId: 'b1', kind: 'charge', amount: 9, date: '2026-09-10T02:00:00.000Z' }), // Q3, out of range
    ]
    // Custom range Feb–Jun spans Q1 and Q2 but excludes Q3.
    const inRange = (day: string) => day >= '2026-02-01' && day <= '2026-06-30'
    const [r] = rangeTotals(live, [bottle], inRange, TZ)
    expect(r.chargedKg).toBe(5) // 2 + 3, not 9
  })

  it('quarterlyTotals matches rangeTotals restricted to that quarter', () => {
    const bottle = makeBottle({ id: 'b1', refrigerantType: 'R32' })
    const live = [
      makeTx({ bottleId: 'b1', kind: 'charge', amount: 4, date: '2026-05-10T02:00:00.000Z' }),
    ]
    const viaQuarter = quarterlyTotals(live, [bottle], Q2, TZ)
    const viaRange = rangeTotals(
      live,
      [bottle],
      (day) => day >= '2026-04-01' && day <= '2026-06-30',
      TZ,
    )
    expect(viaQuarter).toEqual(viaRange)
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

describe('quarterCloseStatus', () => {
  const base = {
    location: { country: 'Australia', region: 'NSW', city: 'Sydney', timezone: TZ },
  }

  it('is null outside the closing fortnight', () => {
    expect(quarterCloseStatus(makeState(base), '2026-05-01')).toBeNull()
  })

  it('appears in the window with the outstanding fixes listed', () => {
    const state = makeState({
      ...base,
      bottles: [
        makeBottle({ id: 'b1' }), // no test date -> 'unknown'
        makeBottle({ id: 'b2', status: 'sold' }), // out of fleet -> ignored
      ],
      transactions: [
        makeTx({ bottleId: 'b1', kind: 'charge', amount: 2, date: '2026-06-10T02:00:00.000Z' }),
      ],
    })
    const st = quarterCloseStatus(state, '2026-06-20')!
    expect(st).not.toBeNull()
    expect(st.quarterKey).toBe('2026-Q2')
    expect(st.closesOn).toBe('2026-06-30')
    expect(st.daysLeft).toBe(10)
    expect(st.movements).toBe(1)
    expect(st.items.some((i) => i.id === 'cyl-nodate' && i.label.includes('1 cylinder'))).toBe(true)
    expect(st.items.some((i) => i.id === 'risk-plan')).toBe(true)
  })

  it('shows no fix items when the quarter is genuinely ready', () => {
    const state = makeState({
      ...base,
      riskPlan: { items: {}, reviewedAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' },
    })
    const st = quarterCloseStatus(state, '2026-06-30')!
    expect(st.daysLeft).toBe(0)
    expect(st.items).toEqual([])
  })
})

describe('monthlySummary', () => {
  it('sums the previous calendar month and finds the top site', () => {
    const state = makeState({
      location: { country: 'Australia', region: 'NSW', city: 'Sydney', timezone: TZ },
      sites: [{ id: 's1', name: 'Harbour View', createdAt: '2026-01-01T00:00:00.000Z' }],
      bottles: [makeBottle({ id: 'b1', tareWeight: 10 })],
      transactions: [
        makeTx({ bottleId: 'b1', kind: 'charge', amount: 2, siteId: 's1', date: '2026-06-10T02:00:00.000Z' }),
        makeTx({ bottleId: 'b1', kind: 'charge', amount: 3, siteId: 's1', date: '2026-06-11T02:00:00.000Z' }),
        makeTx({ bottleId: 'b1', kind: 'recover', amount: 1, date: '2026-06-12T02:00:00.000Z' }),
        makeTx({ bottleId: 'b1', kind: 'sell', amount: 0, weightBefore: 19, bottleTareWeight: 10, date: '2026-06-13T02:00:00.000Z' }),
        // Out of the month -> excluded.
        makeTx({ bottleId: 'b1', kind: 'charge', amount: 9, date: '2026-07-02T02:00:00.000Z' }),
      ],
    })
    const m = monthlySummary(state, '2026-07-07')!
    expect(m.monthKey).toBe('2026-06')
    expect(m.monthLabel).toContain('June 2026')
    expect(m.movements).toBe(4)
    expect(m.chargedKg).toBe(5)
    expect(m.recoveredKg).toBe(1)
    expect(m.soldKg).toBe(9)
    expect(m.topSite).toEqual({ name: 'Harbour View', movements: 2 })
  })

  it('is null for a month with nothing logged', () => {
    expect(monthlySummary(makeState({}), '2026-07-07')).toBeNull()
  })
})
