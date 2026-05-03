import { useEffect, useRef, useState } from 'react'
import { DateInput } from './DateInput'
import { Button } from './ui'
import { localDateTimeInput } from '../lib/datetime'
import type { ClockFormat } from '../lib/types'

// Date + time picker for the Transaction form. Replaces the native
// <input type="datetime-local"> so the calendar matches the rest of
// the UI and we can show a "Now" button (the most common operation
// for a tech logging work as it happens).
//
// Internal value is "YYYY-MM-DDTHH:MM" (the same format
// datetime-local uses) interpreted as the user's selected timezone.
// The TransactionForm converts to UTC ISO on save via
// dateTimeInputToIso(input, tz).
//
// Time mode follows Settings → Time format. In 24h the field is plain
// "HH:MM" text. In 12h the field shows "h:mm" (1-12, no leading zero)
// alongside an AM/PM segmented toggle. Internally we always store
// 24-hour "HH:MM" so transactions are clock-format-agnostic at rest.

interface DateTimeInputProps {
  value: string // "YYYY-MM-DDTHH:MM" or ''
  onChange: (next: string) => void
  // IANA timezone — only used to compute "Now". Display is timezone-
  // agnostic; the user types wall-clock values and the form converts
  // on save.
  timezone?: string
  clock?: ClockFormat
  ariaLabel?: string
}

export function DateTimeInput({
  value,
  onChange,
  timezone,
  clock = '24h',
  ariaLabel,
}: DateTimeInputProps) {
  const datePart = value.slice(0, 10) // "YYYY-MM-DD"
  const timePart = value.length >= 16 ? value.slice(11, 16) : ''

  function setDate(iso: string) {
    if (!iso) {
      onChange('')
      return
    }
    onChange(`${iso}T${timePart || '09:00'}`)
  }

  function setTime(t: string) {
    if (!datePart) {
      // No date yet — default to today in the configured tz so the
      // tech doesn't have to set them in a particular order.
      const now = localDateTimeInput(new Date(), timezone)
      onChange(`${now.slice(0, 10)}T${t}`)
      return
    }
    onChange(`${datePart}T${t}`)
  }

  function setNow() {
    onChange(localDateTimeInput(new Date(), timezone))
  }

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <div className="min-w-[10rem] flex-1">
        <DateInput
          value={datePart}
          onChange={setDate}
          ariaLabel={ariaLabel ? `${ariaLabel} — date` : 'Date'}
        />
      </div>
      <TimeInput
        value={timePart}
        onChange={setTime}
        clock={clock}
        ariaLabel={ariaLabel ? `${ariaLabel} — time` : 'Time'}
      />
      <Button type="button" variant="secondary" onClick={setNow}>
        Now
      </Button>
    </div>
  )
}

// --- TimeInput --------------------------------------------------------
//
// Stores 24-hour "HH:MM" but renders according to `clock`. In 12h the
// number field carries 1-12 and an AM/PM toggle sits next to it; we
// translate on every change.

function TimeInput({
  value,
  onChange,
  clock,
  ariaLabel,
}: {
  value: string // "HH:MM" 24h or ''
  onChange: (v: string) => void
  clock: ClockFormat
  ariaLabel?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(() => display24From(value, clock))
  const ampm: 'AM' | 'PM' = ampmFrom(value)

  // Re-derive the visible text whenever the parent value or clock
  // mode changes (e.g. user switches Settings → Time format mid-form).
  // Skip while the user is actively typing.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setText(display24From(value, clock))
  }, [value, clock])

  function commit(raw: string) {
    if (raw === '') {
      onChange('')
      return
    }
    const parsed = clock === '12h' ? parseHm12(raw) : parseHm24(raw)
    if (!parsed) {
      setText(display24From(value, clock))
      return
    }
    const stored = clock === '12h' ? to24FromParts12(parsed.h, parsed.m, ampm) : { h: parsed.h, m: parsed.m }
    const formatted = formatHm24(stored.h, stored.m)
    setText(display24From(formatted, clock))
    onChange(formatted)
  }

  function setAmPm(next: 'AM' | 'PM') {
    if (!value) return // nothing to translate yet
    const parsed = parseHm24(value)
    if (!parsed) return
    const newPair = to24FromParts12(parsed.h % 12 === 0 ? 12 : parsed.h % 12, parsed.m, next)
    const formatted = formatHm24(newPair.h, newPair.m)
    onChange(formatted)
    setText(display24From(formatted, clock))
  }

  function handleChange(raw: string) {
    setText(clock === '12h' ? maskHm12(raw) : maskHm24(raw))
  }

  return (
    <div className={clock === '12h' ? 'flex items-stretch gap-1' : 'w-28'}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        placeholder={clock === '12h' ? 'h:mm' : 'hh:mm'}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit(text)
          }
        }}
        className={`rounded-xl border border-slate-300 bg-white px-3 py-3 text-center text-base tabular-nums text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
          clock === '12h' ? 'w-20' : 'w-full'
        }`}
      />
      {clock === '12h' && (
        <div className="flex overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700">
          {(['AM', 'PM'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmPm(p)}
              className={`px-2 text-xs font-semibold transition ${
                ampm === p
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
              aria-pressed={ampm === p}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Helpers ----------------------------------------------------------

// Render the stored 24h "HH:MM" (or '') for the current clock mode.
function display24From(value: string, clock: ClockFormat): string {
  if (!value) return ''
  const p = parseHm24(value)
  if (!p) return ''
  if (clock === '24h') return formatHm24(p.h, p.m)
  // 12h display: 1-12 hour, no leading zero, no AM/PM in this string —
  // the AM/PM toggle next to the field carries that.
  const h12 = ((p.h + 11) % 12) + 1
  return `${h12}:${pad2(p.m)}`
}

function ampmFrom(value: string): 'AM' | 'PM' {
  const p = parseHm24(value)
  if (!p) return 'AM'
  return p.h >= 12 ? 'PM' : 'AM'
}

function to24FromParts12(
  h12: number,
  m: number,
  ampm: 'AM' | 'PM',
): { h: number; m: number } {
  let h = h12 % 12
  if (ampm === 'PM') h += 12
  return { h, m }
}

// Masks ----------------------------------------------------------------

function maskHm24(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

// 12h mask: hours are 1-12 (1-2 digits), minutes 00-59 (2 digits).
// Auto-insert ":" after first 1 or 2 digits.
function maskHm12(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(0, 4)
  if (digits.length === 0) return ''
  if (digits.length === 1) return digits
  // Two-digit hour like "12" stays as "12"; "13" becomes "1:3" because
  // 13 isn't a valid 12h hour.
  const twoDigitHour = parseInt(digits.slice(0, 2), 10)
  if (digits.length === 2) {
    return twoDigitHour >= 1 && twoDigitHour <= 12 ? digits : `${digits[0]}:${digits[1]}`
  }
  // 3+ digits: split as 1-digit hour or 2-digit hour depending on
  // whether the 2-digit prefix is a valid 12h hour.
  if (twoDigitHour >= 1 && twoDigitHour <= 12) {
    return `${digits.slice(0, 2)}:${digits.slice(2)}`
  }
  return `${digits[0]}:${digits.slice(1)}`
}

// Parsers --------------------------------------------------------------

function parseHm24(s: string): { h: number; m: number } | null {
  const m = s.match(/^(\d{1,2}):?(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h < 0 || h > 23) return null
  if (mi < 0 || mi > 59) return null
  return { h, m: mi }
}

function parseHm12(s: string): { h: number; m: number } | null {
  // Accept "h:mm" or "hh:mm" with hour 1-12.
  const m = s.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) {
    // Also accept bare 3-4 digits like "130" → 1:30, "1230" → 12:30
    const digits = s.match(/^(\d{3,4})$/)
    if (!digits) return null
    const d = digits[1]
    const hStr = d.length === 4 ? d.slice(0, 2) : d.slice(0, 1)
    const miStr = d.slice(d.length - 2)
    return parseHm12(`${hStr}:${miStr}`)
  }
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h < 1 || h > 12) return null
  if (mi < 0 || mi > 59) return null
  return { h, m: mi }
}

function formatHm24(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
