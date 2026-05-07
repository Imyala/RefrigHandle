import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

// Custom date picker — replaces <input type="date"> so the calendar
// looks consistent across Chrome/Edge/Firefox/Safari/iOS instead of
// being whatever the OS hands us. Both modes are always available:
// type "12052026" into the field (slashes auto-insert) OR tap the
// calendar icon to pick.
//
// Internal value is ISO YYYY-MM-DD to match every other date in the
// app (Bottle.nextHydroTestDate, Unit.installDate, Transaction.date).

interface DateInputProps {
  value: string // ISO YYYY-MM-DD or ''
  onChange: (iso: string) => void
  placeholder?: string
  min?: string // ISO
  max?: string // ISO
  disabled?: boolean
  ariaLabel?: string
  required?: boolean
  // Marks the input as the "first" date in a date-range — currently
  // only affects ARIA labelling on the calendar grid header.
  className?: string
}

export function DateInput({
  value,
  onChange,
  placeholder = 'dd/mm/yyyy',
  min,
  max,
  disabled,
  ariaLabel,
  required,
  className = '',
}: DateInputProps) {
  const [text, setText] = useState(() => ddmmyyyyFromIso(value))
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  // Keep the visible text synced when the parent value changes from
  // the outside (e.g. preset / reset). Don't overwrite while the user
  // is mid-edit — cheap proxy: only sync when the field is not focused.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setText(ddmmyyyyFromIso(value))
  }, [value])

  function commitText(raw: string) {
    if (raw === '') {
      onChange('')
      return
    }
    const ymd = parseDdmmyyyy(raw)
    if (!ymd) {
      // invalid: snap back to the last good value
      setText(ddmmyyyyFromIso(value))
      return
    }
    const iso = isoFromYmd(ymd.y, ymd.m, ymd.d)
    if (min && iso < min) {
      setText(ddmmyyyyFromIso(value))
      return
    }
    if (max && iso > max) {
      setText(ddmmyyyyFromIso(value))
      return
    }
    setText(ddmmyyyyFromIso(iso))
    onChange(iso)
  }

  function handleTextChange(raw: string) {
    setText(maskDdmmyyyy(raw))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitText(text)
      setOpen(false)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  function clear() {
    setText('')
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div
        className={`flex w-full items-stretch rounded-xl border border-slate-300 bg-white text-slate-900 outline-none focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${
          disabled ? 'opacity-50' : ''
        }`}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={() => commitText(text)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 py-3 text-base outline-none placeholder:text-slate-400"
        />
        {text && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear date"
            className="px-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          aria-label={open ? 'Close calendar' : 'Open calendar'}
          aria-expanded={open}
          className="flex w-12 items-center justify-center rounded-r-xl border-l border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <CalendarIcon />
        </button>
      </div>
      {open && (
        <CalendarPopover
          anchor={wrapperRef.current}
          selected={value || undefined}
          min={min}
          max={max}
          onPick={(iso) => {
            setText(ddmmyyyyFromIso(iso))
            onChange(iso)
            setOpen(false)
            inputRef.current?.focus()
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

// --- Popover -----------------------------------------------------------

function CalendarPopover({
  anchor,
  selected,
  min,
  max,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null
  selected?: string
  min?: string
  max?: string
  onPick: (iso: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>(
    { top: 0, left: 0, width: 280 },
  )

  // Initial month is the selected month, today's month, or min/max
  // clamped — whichever is most useful.
  const initialYmd =
    (selected ? ymdFromIso(selected) : null) ??
    (min ? ymdFromIso(min) : null) ??
    todayYmd()
  const [view, setView] = useState({ y: initialYmd.y, m: initialYmd.m })
  const [mode, setMode] = useState<'days' | 'years'>('days')

  // Position below the anchor using fixed coords (anchor is inside a
  // portaled modal that scrolls; the popover lives in its own portal
  // so positioning ignores the modal's scroll offset).
  useLayoutEffect(() => {
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    const popWidth = 296
    const margin = 8
    const vw = window.innerWidth
    let left = r.left
    if (left + popWidth + margin > vw) left = Math.max(margin, vw - popWidth - margin)
    const vh = window.innerHeight
    const wantTop = r.bottom + 6
    const popHeight = 320
    const top =
      wantTop + popHeight + margin > vh
        ? Math.max(margin, r.top - popHeight - 6)
        : wantTop
    setPos({ top, left, width: popWidth })
  }, [anchor])

  // Click-outside / Escape to close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      const t = e.target as Node
      if (ref.current.contains(t)) return
      if (anchor && anchor.contains(t)) return
      onClose()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  const today = todayYmd()
  const todayIso = isoFromYmd(today.y, today.m, today.d)
  const cells = monthGrid(view.y, view.m)

  function shiftMonth(delta: number) {
    let y = view.y
    let m = view.m + delta
    while (m < 1) {
      m += 12
      y -= 1
    }
    while (m > 12) {
      m -= 12
      y += 1
    }
    setView({ y, m })
  }

  // Year picker shows a 4×3 grid centred on the current view year.
  const YEAR_PAGE = 12
  const yearPageStart = view.y - 5
  const minYear = min ? (ymdFromIso(min)?.y ?? -Infinity) : -Infinity
  const maxYear = max ? (ymdFromIso(max)?.y ?? Infinity) : Infinity

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
      className="z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      role="dialog"
      aria-label="Pick a date"
    >
      <div className="flex items-center justify-between gap-1 border-b border-slate-100 px-2 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() =>
            mode === 'years' ? setView({ ...view, y: view.y - YEAR_PAGE }) : shiftMonth(-12)
          }
          aria-label={mode === 'years' ? 'Previous years' : 'Previous year'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Previous month"
          disabled={mode === 'years'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setMode((m) => (m === 'years' ? 'days' : 'years'))}
          aria-label={mode === 'years' ? 'Back to days' : 'Pick a year'}
          aria-expanded={mode === 'years'}
          className="min-w-0 flex-1 rounded-md px-2 py-1 text-center text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {mode === 'years'
            ? `${yearPageStart} – ${yearPageStart + YEAR_PAGE - 1}`
            : `${monthName(view.m)} ${view.y}`}
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Next month"
          disabled={mode === 'years'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800"
        >
          ›
        </button>
        <button
          type="button"
          onClick={() =>
            mode === 'years' ? setView({ ...view, y: view.y + YEAR_PAGE }) : shiftMonth(12)
          }
          aria-label={mode === 'years' ? 'Next years' : 'Next year'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          »
        </button>
      </div>
      {mode === 'years' ? (
        <div className="grid grid-cols-4 gap-1 px-2 py-3">
          {Array.from({ length: YEAR_PAGE }, (_, i) => yearPageStart + i).map((y) => {
            const yDisabled = y < minYear || y > maxYear
            const isViewYear = y === view.y
            const isSelectedYear =
              !!selected && ymdFromIso(selected)?.y === y
            const isThisYear = y === today.y
            return (
              <button
                key={y}
                type="button"
                disabled={yDisabled}
                onClick={() => {
                  setView({ y, m: view.m })
                  setMode('days')
                }}
                className={yearCellClass(isSelectedYear, isViewYear, isThisYear, yDisabled)}
              >
                {y}
              </button>
            )
          })}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-0.5 px-2 pt-2 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
            {cells.map((c) => {
              const iso = isoFromYmd(c.y, c.m, c.d)
              const disabled =
                (min != null && iso < min) || (max != null && iso > max)
              const isSelected = !!selected && selected === iso
              const isToday = iso === todayIso
              const inMonth = c.m === view.m
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    if (disabled) return
                    onPick(iso)
                  }}
                  disabled={disabled}
                  className={cellClass(isSelected, isToday, inMonth, disabled)}
                  aria-label={`${c.d} ${monthName(c.m)} ${c.y}`}
                  aria-current={isToday ? 'date' : undefined}
                  aria-selected={isSelected || undefined}
                >
                  {c.d}
                </button>
              )
            })}
          </div>
        </>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onPick(todayIso)}
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          Today
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Close
        </button>
      </div>
    </div>,
    document.body,
  )
}

function cellClass(
  selected: boolean,
  today: boolean,
  inMonth: boolean,
  disabled: boolean,
): string {
  const base =
    'flex h-9 items-center justify-center rounded-full text-sm tabular-nums transition'
  if (disabled)
    return `${base} cursor-not-allowed text-slate-300 dark:text-slate-700`
  if (selected)
    return `${base} bg-brand-600 font-semibold text-white shadow`
  if (today)
    return `${base} font-semibold text-brand-700 ring-1 ring-inset ring-brand-500 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30`
  if (!inMonth)
    return `${base} text-slate-400 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800`
  return `${base} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800`
}

function yearCellClass(
  selected: boolean,
  viewYear: boolean,
  thisYear: boolean,
  disabled: boolean,
): string {
  const base =
    'flex h-10 items-center justify-center rounded-lg text-sm tabular-nums transition'
  if (disabled)
    return `${base} cursor-not-allowed text-slate-300 dark:text-slate-700`
  if (selected)
    return `${base} bg-brand-600 font-semibold text-white shadow`
  if (viewYear)
    return `${base} font-semibold text-brand-700 ring-1 ring-inset ring-brand-500 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30`
  if (thisYear)
    return `${base} font-semibold text-brand-700 hover:bg-slate-100 dark:text-brand-300 dark:hover:bg-slate-800`
  return `${base} text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800`
}

function CalendarIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

// --- Helpers -----------------------------------------------------------

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
function monthName(m: number): string {
  return MONTH_NAMES[m - 1] ?? ''
}

interface Ymd {
  y: number
  m: number
  d: number
}

function todayYmd(): Ymd {
  const d = new Date()
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
}

function daysInMonth(y: number, m: number): number {
  // m is 1-indexed; new Date(y, m, 0) gives last day of previous month
  return new Date(y, m, 0).getDate()
}

// Strip non-digits, cap at 8, re-insert slashes after dd and mm.
// "12052026" → "12/05/2026", "1" → "1", "12" → "12", "123" → "12/3".
function maskDdmmyyyy(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(0, 8)
  const d = digits
  if (d.length <= 2) return d
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
}

function parseDdmmyyyy(s: string): Ymd | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  let year = parseInt(m[3], 10)
  // 2-digit-year heuristic — pivot at 50, matches Excel/most desktop apps.
  // "26" → 2026, "75" → 1975. Cylinder test dates are virtually always
  // forward-looking so this is fine in practice.
  if (m[3].length === 2) year = year < 50 ? 2000 + year : 1900 + year
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { y: year, m: month, d: day }
}

function isoFromYmd(y: number, m: number, d: number): string {
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`
}

function ymdFromIso(iso: string): Ymd | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return { y: +m[1], m: +m[2], d: +m[3] }
}

function ddmmyyyyFromIso(iso: string): string {
  const x = ymdFromIso(iso)
  if (!x) return ''
  return `${pad2(x.d)}/${pad2(x.m)}/${pad4(x.y)}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
function pad4(n: number): string {
  return n.toString().padStart(4, '0')
}

// 6 weeks × 7 days = 42 cells, Monday-start (Australian convention).
function monthGrid(year: number, month: number): Ymd[] {
  const cells: Ymd[] = []
  const first = new Date(year, month - 1, 1)
  // JS getDay: 0=Sun..6=Sat. We want 0=Mon..6=Sun.
  const lead = (first.getDay() + 6) % 7
  const startDate = new Date(year, month - 1, 1 - lead)
  for (let i = 0; i < 42; i++) {
    const d = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + i,
    )
    cells.push({ y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })
  }
  return cells
}
