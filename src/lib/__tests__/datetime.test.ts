import { describe, expect, it } from 'vitest'
import {
  dateTimeInputToIso,
  formatPlainDate,
  formatStampedTime,
  isoToDateTimeInput,
  localDateTimeInput,
  tzAbbrev,
} from '../datetime'

// The timezone bugs these guard against were real: the quick-log form
// once stamped UTC wall-clock as if it were local (10-11 h wrong for
// an Australian business).

describe('localDateTimeInput', () => {
  it('renders an instant as wall-clock in the business timezone', () => {
    const instant = new Date('2026-06-13T02:00:00.000Z')
    expect(localDateTimeInput(instant, 'Australia/Brisbane')).toBe('2026-06-13T12:00')
    expect(localDateTimeInput(instant, 'Australia/Perth')).toBe('2026-06-13T10:00')
  })

  it('crosses the date line correctly (late-evening UTC = next day AEST)', () => {
    const instant = new Date('2026-06-13T20:30:00.000Z')
    expect(localDateTimeInput(instant, 'Australia/Brisbane')).toBe('2026-06-14T06:30')
  })
})

describe('dateTimeInputToIso', () => {
  it('interprets the typed wall-clock in the business timezone', () => {
    expect(dateTimeInputToIso('2026-06-13T12:00', 'Australia/Brisbane')).toBe(
      '2026-06-13T02:00:00.000Z',
    )
  })

  it('handles AEDT (Sydney daylight saving) offsets', () => {
    // January = AEDT, UTC+11.
    expect(dateTimeInputToIso('2026-01-15T12:00', 'Australia/Sydney')).toBe(
      '2026-01-15T01:00:00.000Z',
    )
    // June = AEST, UTC+10.
    expect(dateTimeInputToIso('2026-06-15T12:00', 'Australia/Sydney')).toBe(
      '2026-06-15T02:00:00.000Z',
    )
  })

  it('round-trips through the form input', () => {
    const iso = dateTimeInputToIso('2026-05-14T07:45', 'Australia/Adelaide')
    expect(isoToDateTimeInput(iso, 'Australia/Adelaide')).toBe('2026-05-14T07:45')
  })

  it('returns a valid instant near a DST transition', () => {
    // 2026-10-04 02:30 does not exist in Sydney (clocks jump 02:00→03:00).
    const iso = dateTimeInputToIso('2026-10-04T02:30', 'Australia/Sydney')
    expect(Number.isNaN(new Date(iso).getTime())).toBe(false)
  })

  it('rejects malformed input with an empty string', () => {
    expect(dateTimeInputToIso('', 'Australia/Brisbane')).toBe('')
    expect(dateTimeInputToIso('14/05/2026 12:00', 'Australia/Brisbane')).toBe('')
  })
})

describe('formatPlainDate', () => {
  it('formats a wall-calendar date without timezone drift', () => {
    // new Date('YYYY-MM-DD') parses as UTC midnight — naive formatting
    // in a negative-offset zone would show 13 May. The helper must not.
    const out = formatPlainDate('2026-05-14')
    expect(out).toContain('14')
    expect(out).toContain('2026')
  })
  it('passes through values it cannot parse', () => {
    expect(formatPlainDate('May 2026')).toBe('May 2026')
  })
})

// Multi-state crews: a Brisbane tech and a Perth tech on the same synced
// account each log in their own timezone. The stored instant must reflect
// the zone the entry was made in, and the audit must render each entry in
// that zone with a label so it's never ambiguous.
describe('multi-timezone logging', () => {
  it('the same wall-clock in different zones is a different instant', () => {
    // 14:00 on 2026-06-15 — winter, neither zone observes DST.
    const brisbane = dateTimeInputToIso('2026-06-15T14:00', 'Australia/Brisbane')
    const perth = dateTimeInputToIso('2026-06-15T14:00', 'Australia/Perth')
    expect(brisbane).toBe('2026-06-15T04:00:00.000Z') // AEST = UTC+10
    expect(perth).toBe('2026-06-15T06:00:00.000Z') // AWST = UTC+8
  })

  it('renders a stamped time in its own zone, not the business zone', () => {
    const iso = '2026-06-15T06:00:00.000Z' // 14:00 Perth / 16:00 Brisbane
    expect(
      formatStampedTime(iso, 'Australia/Perth', 'Australia/Brisbane', '24h'),
    ).toMatch(/14:00/)
    expect(
      formatStampedTime(iso, 'Australia/Brisbane', 'Australia/Brisbane', '24h'),
    ).toMatch(/16:00/)
  })

  it('falls back to the business zone when a row has no stamped tz', () => {
    const iso = '2026-06-15T04:00:00.000Z' // 14:00 Brisbane
    expect(
      formatStampedTime(iso, undefined, 'Australia/Brisbane', '24h'),
    ).toMatch(/14:00/)
  })

  it('tzAbbrev distinguishes DST (Sydney summer vs winter)', () => {
    const summer = tzAbbrev('2026-01-15T00:00:00.000Z', 'Australia/Sydney')
    const winter = tzAbbrev('2026-06-15T00:00:00.000Z', 'Australia/Sydney')
    expect(summer).not.toBe('')
    expect(winter).not.toBe('')
    expect(summer).not.toBe(winter)
  })
})
