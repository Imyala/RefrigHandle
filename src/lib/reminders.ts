import type { AppState } from './types'
import {
  LICENCE_WARN_DAYS,
  isOutOfFleet,
  isTechnicianActive,
  quarterLabel,
} from './types'
import { shareOrDownload, type ShareOutcome } from './backup'

// Reminders that reach people OUTSIDE the app, with no server: an .ics
// calendar file the owner imports once. Their phone then does the
// nagging — licence and RTA renewals, cylinder test due dates, and the
// quarterly record cadence — even if the app isn't opened for weeks.
// Deterministic UIDs mean re-importing an updated file replaces events
// instead of duplicating them. When a real push/email backend lands
// this stays useful as the offline fallback.

export interface ReminderEvent {
  uid: string
  date: string // YYYY-MM-DD (all-day event)
  summary: string
  description: string
}

const CYLINDER_WARN_DAYS = 30
const QUARTER_WARN_DAYS = 14

function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Builds the reminder list from the current records. `today` is the
// local calendar day — events on or before it are dropped (a calendar
// full of already-missed reminders helps no one).
export function buildReminderEvents(
  state: AppState,
  today: string,
): ReminderEvent[] {
  const out: ReminderEvent[] = []
  const push = (e: ReminderEvent) => {
    if (e.date > today) out.push(e)
  }
  const pair = (
    uidBase: string,
    due: string,
    warnDays: number,
    what: string,
    description: string,
  ) => {
    push({
      uid: `${uidBase}-warn`,
      date: addDays(due, -warnDays),
      summary: `${what} — due ${due.split('-').reverse().join('/')}`,
      description,
    })
    push({
      uid: `${uidBase}-due`,
      date: due,
      summary: `${what} — due today`,
      description,
    })
  }

  // Technician RHL renewals.
  for (const t of state.technicians.filter(isTechnicianActive)) {
    if (!t.licenceExpiry) continue
    pair(
      `refrighandle-rhl-${t.id}-${t.licenceExpiry}`,
      t.licenceExpiry,
      LICENCE_WARN_DAYS,
      `Renew refrigerant handling licence — ${t.name}`,
      'ARC Refrigerant Handling Licence renewal. Update the expiry in RefrigHandle once renewed.',
    )
  }

  // Business RTA renewal.
  if (state.arcAuthorisationExpiry) {
    pair(
      `refrighandle-rta-${state.arcAuthorisationExpiry}`,
      state.arcAuthorisationExpiry,
      LICENCE_WARN_DAYS,
      `Renew Refrigerant Trading Authorisation${state.businessName ? ` — ${state.businessName}` : ''}`,
      'ARC RTA renewal. Update the expiry in RefrigHandle once renewed.',
    )
  }

  // Cylinder periodic tests (AS 2030) for cylinders still in the fleet.
  for (const b of state.bottles) {
    if (isOutOfFleet(b.status) || !b.nextHydroTestDate) continue
    pair(
      `refrighandle-cyltest-${b.id}-${b.nextHydroTestDate}`,
      b.nextHydroTestDate,
      CYLINDER_WARN_DAYS,
      `Cylinder test due (AS 2030) — ${b.bottleNumber}`,
      'Send the cylinder for its periodic test, or record the new stamp in RefrigHandle.',
    )
  }

  // Quarterly-record cadence: the next four quarter closes.
  const year = Number(today.slice(0, 4))
  const qEnds = [
    `${year}-03-31`,
    `${year}-06-30`,
    `${year}-09-30`,
    `${year}-12-31`,
    `${year + 1}-03-31`,
    `${year + 1}-06-30`,
    `${year + 1}-09-30`,
    `${year + 1}-12-31`,
  ]
  let added = 0
  for (const end of qEnds) {
    if (end <= today || added >= 4) continue
    added += 1
    const q = { year: Number(end.slice(0, 4)), q: (Math.floor((Number(end.slice(5, 7)) - 1) / 3) + 1) as 1 | 2 | 3 | 4 }
    push({
      uid: `refrighandle-quarter-${end}-warn`,
      date: addDays(end, -QUARTER_WARN_DAYS),
      summary: `ARC quarterly record — ${quarterLabel(q)} closes ${end.split('-').reverse().join('/')}`,
      description:
        'Check the quarter in RefrigHandle: leak-test answers complete, cylinders accounted for, then print or share the quarterly record.',
    })
  }

  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// RFC 5545 text escaping: backslash first, then structural characters.
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

export function buildReminderIcs(
  events: readonly ReminderEvent[],
  nowIso: string,
): string {
  const dtstamp = nowIso.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RefrigHandle//Reminders//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:RefrigHandle reminders',
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@refrighandle`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      `DESCRIPTION:${icsEscape(e.description)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  // RFC 5545 wants CRLF line endings.
  return lines.join('\r\n') + '\r\n'
}

// Build + hand the calendar file to the device (share sheet on phones —
// which is how it reaches the calendar app — download elsewhere).
export async function shareReminderCalendar(
  state: AppState,
  today: string,
): Promise<{ outcome: ShareOutcome; count: number }> {
  const events = buildReminderEvents(state, today)
  const ics = buildReminderIcs(events, new Date().toISOString())
  const outcome = await shareOrDownload(
    new Blob([ics], { type: 'text/calendar' }),
    'refrighandle-reminders.ics',
    'RefrigHandle reminders',
  )
  return { outcome, count: events.length }
}
