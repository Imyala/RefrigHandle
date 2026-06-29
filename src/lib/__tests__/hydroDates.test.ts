import { describe, it, expect } from 'vitest'
import {
  plusYearsYm,
  autofillNextDue,
  autofillLastTest,
} from '../hydroDates'

describe('plusYearsYm', () => {
  it('adds years, preserving the month', () => {
    expect(plusYearsYm('2024-03', 10)).toBe('2034-03')
  })
  it('subtracts years with a negative argument', () => {
    expect(plusYearsYm('2034-03', -10)).toBe('2024-03')
  })
  it('returns "" for empty or malformed input', () => {
    expect(plusYearsYm('', 10)).toBe('')
    expect(plusYearsYm('2024', 10)).toBe('')
    expect(plusYearsYm('2024-03-01', 10)).toBe('')
  })
})

describe('autofillNextDue (editing "last test")', () => {
  it('fills an empty next due 10 years on', () => {
    expect(autofillNextDue('2024-03', '', '')).toBe('2034-03')
  })

  it('moves a previously auto-derived next due when last changes', () => {
    // Old pair was 2014-03 / 2024-03 (derived). Tech updates last.
    expect(autofillNextDue('2024-06', '2014-03', '2024-03')).toBe('2034-06')
  })

  it('refreshes a stale next due that now precedes the new last test', () => {
    // Cylinder back from retest: both dates step forward. The old next
    // due (2024-05) is before the new last test, so it is stale.
    expect(autofillNextDue('2024-08', '2014-03', '2024-05')).toBe('2034-08')
  })

  it('keeps a custom next due the tech deliberately set', () => {
    // Old next (2030-06) is not last+10 and is still after the new last,
    // so it is left untouched.
    expect(autofillNextDue('2024-02', '2024-01', '2030-06')).toBe('2030-06')
  })

  it('leaves next due alone when last test is cleared', () => {
    expect(autofillNextDue('', '2024-01', '2034-01')).toBe('2034-01')
  })
})

describe('autofillLastTest (editing "next due")', () => {
  it('fills an empty last test 10 years earlier', () => {
    expect(autofillLastTest('2034-03', '', '')).toBe('2024-03')
  })

  it('moves a previously auto-derived last test when next changes', () => {
    // Old pair 2024-03 / 2034-03 (last was next-10). Tech updates next.
    expect(autofillLastTest('2036-03', '2034-03', '2024-03')).toBe('2026-03')
  })

  it('refreshes a stale last test that now follows the new next due', () => {
    expect(autofillLastTest('2030-01', '2040-05', '2034-05')).toBe('2020-01')
  })

  it('keeps a custom last test the tech deliberately set', () => {
    // Old last (2024-01) is not next-10 and still precedes the new next,
    // so it is left untouched.
    expect(autofillLastTest('2035-02', '2030-06', '2024-01')).toBe('2024-01')
  })

  it('leaves last test alone when next due is cleared', () => {
    expect(autofillLastTest('', '2034-01', '2024-01')).toBe('2024-01')
  })
})
