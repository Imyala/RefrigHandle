// Helpers for the linked cylinder hydrostatic-test dates (AS 2030).
//
// A cylinder's "last test" and "next due" months are tied together by a
// test interval: AS 2030.5 inspects steel refrigerant recovery cylinders
// every 10 years, so the next test is the last test plus that interval.
// The interval is configurable (Settings → cylinder test interval) and
// defaults to 10 years; other cylinder types or jurisdictions can change
// it. The test-date editors let a tech type either field and have the
// other auto-fill, which matters most when a cylinder comes back from
// retest and both dates move forward together.

export const DEFAULT_HYDRO_INTERVAL_YEARS = 10
// Sane bounds for the configurable interval — wide enough for any real
// cylinder schedule, tight enough that a fat-fingered value can't break
// the date maths.
export const MIN_HYDRO_INTERVAL_YEARS = 1
export const MAX_HYDRO_INTERVAL_YEARS = 50

// Coerce stored / user input to a whole number of years within bounds,
// falling back to the default for anything missing or nonsensical.
export function clampHydroInterval(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return DEFAULT_HYDRO_INTERVAL_YEARS
  const r = Math.round(v)
  if (r < MIN_HYDRO_INTERVAL_YEARS) return MIN_HYDRO_INTERVAL_YEARS
  if (r > MAX_HYDRO_INTERVAL_YEARS) return MAX_HYDRO_INTERVAL_YEARS
  return r
}

// Add `years` (which may be negative) to a YYYY-MM string. Returns ''
// on bad input so callers can no-op safely.
export function plusYearsYm(ym: string, years: number): string {
  if (!ym) return ''
  const m = ym.match(/^(\d{4})-(\d{2})$/)
  if (!m) return ''
  const y = Number(m[1]) + years
  const mo = Number(m[2])
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}`
}

// Given a freshly-entered "last test" month, decide what "next due"
// should become. We auto-derive next = last + interval, but keep a next
// date the tech deliberately set elsewhere. Overwrite next when it is
// empty, when it was the value previously derived from the old last test,
// or when it now falls on/before the new last test — an impossible
// ordering that means the stored value is stale (e.g. a cylinder just
// back from retest with both dates stepped forward).
export function autofillNextDue(
  newLast: string,
  prevLast: string,
  next: string,
  periodYears: number = DEFAULT_HYDRO_INTERVAL_YEARS,
): string {
  if (!newLast) return next
  const wasDerived =
    !!prevLast && plusYearsYm(prevLast, periodYears) === next
  if (!next || wasDerived || next <= newLast) {
    return plusYearsYm(newLast, periodYears)
  }
  return next
}

// Mirror of autofillNextDue for when the tech edits "next due" instead:
// back-fill last = next − interval under the same conditions, so the
// autofill works in both directions.
export function autofillLastTest(
  newNext: string,
  prevNext: string,
  last: string,
  periodYears: number = DEFAULT_HYDRO_INTERVAL_YEARS,
): string {
  if (!newNext) return last
  const wasDerived =
    !!prevNext && plusYearsYm(last, periodYears) === prevNext
  if (!last || wasDerived || last >= newNext) {
    return plusYearsYm(newNext, -periodYears)
  }
  return last
}
