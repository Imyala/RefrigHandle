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
export function formatDateTime(iso: string, tz?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  const opts: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
  if (tz && isTzSupported(tz)) opts.timeZone = tz
  return d.toLocaleString(undefined, opts)
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
