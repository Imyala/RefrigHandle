import { describe, expect, it } from 'vitest'
import { buildReminderEvents, buildReminderIcs } from '../reminders'
import { makeBottle, makeState } from './fixtures'
import type { Technician } from '../types'

const TODAY = '2026-07-07'

function tech(over: Partial<Technician> = {}): Technician {
  return {
    id: 't1',
    name: 'Jane Smith',
    arcLicenceNumber: 'L012345',
    licenceExpiry: '2026-10-01',
    role: 'owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Technician
}

describe('buildReminderEvents', () => {
  it('creates warn + due events for licences, RTA and cylinder tests', () => {
    const state = makeState({
      businessName: 'Acme',
      arcAuthorisationExpiry: '2026-09-15',
      technicians: [tech()],
      bottles: [
        makeBottle({ id: 'b1', bottleNumber: 'B-1', nextHydroTestDate: '2026-08-20' }),
        // Out of the fleet — its test date must NOT nag anyone.
        makeBottle({ id: 'b2', bottleNumber: 'B-2', status: 'sold', nextHydroTestDate: '2026-08-21' }),
      ],
    })
    const events = buildReminderEvents(state, TODAY)
    const summaries = events.map((e) => e.summary)
    expect(summaries.some((s) => s.includes('Jane Smith') && s.includes('due 01/10/2026'))).toBe(true)
    expect(summaries.some((s) => s.includes('Trading Authorisation'))).toBe(true)
    expect(summaries.some((s) => s.includes('Cylinder test due (AS 2030) — B-1'))).toBe(true)
    expect(summaries.some((s) => s.includes('B-2'))).toBe(false)
    // RHL warn lands 60 days before 1 Oct.
    const warn = events.find((e) => e.uid.startsWith('refrighandle-rhl-t1') && e.uid.endsWith('warn'))!
    expect(warn.date).toBe('2026-08-02')
  })

  it('drops events already in the past and includes the next four quarter closes', () => {
    const state = makeState({
      technicians: [tech({ licenceExpiry: '2026-07-01' })], // already expired
    })
    const events = buildReminderEvents(state, TODAY)
    expect(events.every((e) => e.date > TODAY)).toBe(true)
    const quarters = events.filter((e) => e.uid.startsWith('refrighandle-quarter-'))
    expect(quarters.length).toBe(4)
    expect(quarters[0].summary).toContain('Q3 2026')
  })
})

describe('buildReminderIcs', () => {
  it('emits valid VCALENDAR with escaped text and stable UIDs', () => {
    const ics = buildReminderIcs(
      [
        {
          uid: 'refrighandle-test-1',
          date: '2026-08-02',
          summary: 'Renew; licence, now',
          description: 'Line1\nLine2',
        },
      ],
      '2026-07-07T00:00:00.000Z',
    )
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics).toContain('UID:refrighandle-test-1@refrighandle')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260802')
    expect(ics).toContain('SUMMARY:Renew\\; licence\\, now')
    expect(ics).toContain('DESCRIPTION:Line1\\nLine2')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics.includes('\r\n')).toBe(true)
  })
})
