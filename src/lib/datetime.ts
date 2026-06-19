// Datetime helpers for the transaction "Date / time" input.
//
// Background: <input type="datetime-local"> uses the strings
// "YYYY-MM-DDTHH:MM" interpreted in the *browser's* local time, not
// UTC. The previous code defaulted with `new Date().toISOString()`,
// which produced a UTC string formatted as if it were local — for an
// Australian user that's 10–11 hours wrong.
//
// We also support an explicit user-set IANA timezone (Settings →
// Location → Timezone). When set, "now" defaults and timestamp
// displays use that zone instead of the browser zone — useful when
// office staff work in one tz but the cylinders/equipment are in
// another.

import { getDevicePrefs } from './devicePrefs'

// Timezone resolved from the device's physical location (geolocation),
// updated by the LocationTimezoneSync watcher when the "Use my location for
// accurate timezone" device pref is on. Overrides the device-clock zone for
// stamping new logs, so a tech whose phone clock doesn't auto-update still
// logs in the zone they're physically in.
let resolvedLocationTz = ''
export function setResolvedLocationTz(tz: string): void {
  resolvedLocationTz = tz || ''
}


// "YYYY-MM-DDTHH:MM" representing the instant `now` as seen in `tz`.
// Empty/invalid `tz` falls back to the browser's local timezone.
export function localDateTimeInput(
  now: Date = new Date(),
  tz?: string,
): string {
  const parts = ymdHmInTz(now, tz)
  if (!parts) return browserLocalDateTimeInput(now)
  return `${parts.y}-${pad2(parts.mo)}-${pad2(parts.d)}T${pad2(parts.h)}:${pad2(parts.mi)}`
}

// Same shape, but for a free `Date` rather than a timezone — used as
// fallback when Intl can't resolve the requested zone.
function browserLocalDateTimeInput(d: Date): string {
  const offMin = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offMin * 60_000)
  return local.toISOString().slice(0, 16)
}

// Parse a "YYYY-MM-DDTHH:MM" string interpreted in `tz` and return
// the corresponding UTC ISO string for storage. When `tz` is empty
// the input is interpreted as browser-local (matches native
// datetime-local semantics).
export function dateTimeInputToIso(input: string, tz?: string): string {
  if (!input) return ''
  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return ''
  const [, y, mo, d, h, mi] = m
  if (!tz || !isTzSupported(tz)) {
    // Browser-local interpretation: the constructor uses the runtime
    // tz directly.
    return new Date(
      parseInt(y), parseInt(mo) - 1, parseInt(d),
      parseInt(h), parseInt(mi), 0, 0,
    ).toISOString()
  }
  // Find the UTC instant whose representation in `tz` matches the
  // requested wall-clock components. Two passes because of DST: the
  // first guess can be off by ±60 min near a transition.
  let guess = Date.UTC(
    parseInt(y), parseInt(mo) - 1, parseInt(d),
    parseInt(h), parseInt(mi),
  )
  for (let i = 0; i < 2; i++) {
    const seen = ymdHmInTz(new Date(guess), tz)
    if (!seen) break
    const wantMin =
      (parseInt(y) * 525600) + (parseInt(mo) * 43800) + (parseInt(d) * 1440) +
      (parseInt(h) * 60) + parseInt(mi)
    const seenMin =
      (seen.y * 525600) + (seen.mo * 43800) + (seen.d * 1440) +
      (seen.h * 60) + seen.mi
    const diff = wantMin - seenMin
    if (diff === 0) break
    guess += diff * 60_000
  }
  return new Date(guess).toISOString()
}

// Render a stored ISO timestamp for display in the user's timezone.
// Falls back to the browser's locale-aware default when no tz is set.
// `clock` honours Settings → Time format ('12h' / '24h'); when omitted
// the locale default decides — which on en-AU is 12h with am/pm, on
// en-GB is 24h, etc. Pass it through wherever you want the user's
// preference to win regardless of locale. When `withZone` is true the
// timezone abbreviation (AEST / AWST / AEDT …) is appended so an audit
// reader can tell which zone the time is in regardless of where they are.
export function formatDateTime(
  iso: string,
  tz?: string,
  clock?: '12h' | '24h',
  withZone = false,
): string {
  if (!iso) return ''
  // "Show times in UTC" device pref overrides the display zone and always
  // labels the time so it can't be misread as local.
  const utc = getDevicePrefs().displayUtc
  const effTz = utc ? 'UTC' : tz
  const showZone = withZone || utc
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
  if (effTz && isTzSupported(effTz)) opts.timeZone = effTz
  if (clock === '12h') opts.hour12 = true
  else if (clock === '24h') opts.hour12 = false
  let out = d.toLocaleString(undefined, opts)
  if (showZone) {
    const ab = tzAbbrev(iso, effTz)
    if (ab) out += ` ${ab}`
  }
  return out
}

// The device's current IANA timezone — where this person physically is.
// Each device resolves its own, so a Brisbane tech and a Perth tech on
// the same synced account each log work in their own local time.
export function deviceTimeZone(): string {
  // Prefer the location-resolved zone when the user has opted into
  // location-based timezone and we've resolved one.
  if (getDevicePrefs().locationTimezone && resolvedLocationTz) {
    return resolvedLocationTz
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    return ''
  }
}

// Short timezone label (AEST / AEDT / AWST / ACST …) for an instant in a
// given zone — used to stamp timestamps so a time is never ambiguous on
// an audit. Falls back to the browser zone when `tz` is unset.
export function tzAbbrev(iso: string, tz?: string): string {
  if (!iso) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-AU', {
      timeZone: tz && isTzSupported(tz) ? tz : undefined,
      timeZoneName: 'short',
    }).formatToParts(new Date(iso))
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
  } catch {
    return ''
  }
}

// Format a transaction / audit timestamp in the zone it was recorded in
// (the frozen `stampedTz`), falling back to the business location zone
// for older records that predate the stamp. Always shows the zone label.
export function formatStampedTime(
  iso: string,
  stampedTz: string | undefined,
  fallbackTz: string | undefined,
  clock?: '12h' | '24h',
): string {
  return formatDateTime(iso, stampedTz || fallbackTz, clock, true)
}

// Date-only rendering of a stored ISO timestamp, in the configured
// timezone. Used on logbook / audit printouts where showing the date in
// the browser's zone instead of the business's could shift an
// early-morning job onto the previous calendar day.
export function formatDate(iso: string, tz?: string): string {
  if (!iso) return ''
  const effTz = getDevicePrefs().displayUtc ? 'UTC' : tz
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
  if (effTz && isTzSupported(effTz)) opts.timeZone = effTz
  return d.toLocaleDateString('en-AU', opts)
}

// Render a plain calendar date (YYYY-MM-DD, no time component) without
// round-tripping through Date — `new Date('YYYY-MM-DD')` parses as UTC
// midnight, so formatting it in a negative-offset zone shows the
// previous day. Install dates etc. are wall-calendar facts; format the
// parts directly.
export function formatPlainDate(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ymd
  // Construct at local noon so the formatter can't cross a date line.
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
  return d.toLocaleDateString('en-AU', { dateStyle: 'medium' })
}

// Convert a stored ISO timestamp into the "YYYY-MM-DDTHH:MM" string
// the form input expects, using the configured timezone.
export function isoToDateTimeInput(iso: string, tz?: string): string {
  if (!iso) return ''
  return localDateTimeInput(new Date(iso), tz)
}

// --- Internals --------------------------------------------------------

function ymdHmInTz(
  d: Date,
  tz?: string,
): { y: number; mo: number; d: number; h: number; mi: number } | null {
  if (tz && !isTzSupported(tz)) return null
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(d)
    const get = (t: string) =>
      parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10)
    let h = get('hour')
    if (h === 24) h = 0 // some Intl backends emit "24" for midnight
    return {
      y: get('year'),
      mo: get('month'),
      d: get('day'),
      h,
      mi: get('minute'),
    }
  } catch {
    return null
  }
}

const tzCache = new Map<string, boolean>()
function isTzSupported(tz: string): boolean {
  const cached = tzCache.get(tz)
  if (cached != null) return cached
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    tzCache.set(tz, true)
    return true
  } catch {
    tzCache.set(tz, false)
    return false
  }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
