import { useEffect, useRef, useState } from 'react'
import { DateInput } from './DateInput'
import { Button } from './ui'
import { localDateTimeInput } from '../lib/datetime'

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
// Time is a plain text input with hh:mm masking — typing "1330" turns
// into "13:30". 24-hour because that's what every tradesman's invoice
// system uses and it removes AM/PM ambiguity. Out-of-range values
// snap back on blur.

interface DateTimeInputProps {
  value: string // "YYYY-MM-DDTHH:MM" or ''
  onChange: (next: string) => void
  // IANA timezone — only used to compute "Now". Display in this
  // component is timezone-agnostic; the user types wall-clock values
  // and the form converts on save.
  timezone?: string
  ariaLabel?: string
}

export function DateTimeInput({
  value,
  onChange,
  timezone,
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
      <div className="w-28">
        <TimeInput value={timePart} onChange={setTime} ariaLabel={ariaLabel ? `${ariaLabel} — time` : 'Time'} />
      </div>
      <Button type="button" variant="secondary" onClick={setNow}>
        Now
      </Button>
    </div>
  )
}

// --- TimeInput --------------------------------------------------------

function TimeInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string // "HH:MM" or ''
  onChange: (v: string) => void
  ariaLabel?: string
}) {
  const [text, setText] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setText(value)
  }, [value])

  function commit(raw: string) {
    if (raw === '') {
      onChange('')
      return
    }
    const parsed = parseHm(raw)
    if (!parsed) {
      setText(value)
      return
    }
    const formatted = formatHm(parsed.h, parsed.m)
    setText(formatted)
    onChange(formatted)
  }

  function handleChange(raw: string) {
    setText(maskHm(raw))
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={ariaLabel}
      placeholder="hh:mm"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => commit(text)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit(text)
        }
      }}
      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-center text-base tabular-nums text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    />
  )
}

// --- Helpers ----------------------------------------------------------

// "1330" → "13:30", "9" → "9", "93" → "9:3"
function maskHm(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

function parseHm(s: string): { h: number; m: number } | null {
  const m = s.match(/^(\d{1,2}):?(\d{2})$/)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const mi = parseInt(m[2], 10)
  if (h < 0 || h > 23) return null
  if (mi < 0 || mi > 59) return null
  return { h, m: mi }
}

function formatHm(h: number, m: number): string {
  return `${pad2(h)}:${pad2(m)}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
