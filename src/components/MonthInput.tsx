import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

// Month-only input — paired with DateInput, used for cylinder test
// dates where the stamp on the collar is month/year only.
//
// Internal value is "YYYY-MM" (e.g. "2035-07"). For backwards
// compatibility, a stored "YYYY-MM-DD" value is accepted on read and
// truncated to YYYY-MM for editing; saves always write YYYY-MM.

interface MonthInputProps {
  value: string // "YYYY-MM" or '' (or legacy "YYYY-MM-DD")
  onChange: (ym: string) => void
  placeholder?: string
  min?: string // "YYYY-MM"
  max?: string // "YYYY-MM"
  disabled?: boolean
  ariaLabel?: string
  required?: boolean
  className?: string
}

export function MonthInput({
  value,
  onChange,
  placeholder = 'mm/yyyy',
  min,
  max,
  disabled,
  ariaLabel,
  required,
  className = '',
}: MonthInputProps) {
  const normalized = normalizeStored(value)
  const [text, setText] = useState(() => mmyyyyFromYm(normalized))
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  useEffect(() => {
    if (document.activeElement === inputRef.current) return
    setText(mmyyyyFromYm(normalizeStored(value)))
  }, [value])

  function commitText(raw: string) {
    if (raw === '') {
      onChange('')
      return
    }
    const ym = parseMmyyyy(raw)
    if (!ym) {
      setText(mmyyyyFromYm(normalized))
      return
    }
    const out = `${pad4(ym.y)}-${pad2(ym.m)}`
    if (min && out < min) {
      setText(mmyyyyFromYm(normalized))
      return
    }
    if (max && out > max) {
      setText(mmyyyyFromYm(normalized))
      return
    }
    setText(mmyyyyFromYm(out))
    onChange(out)
  }

  function handleTextChange(raw: string) {
    setText(maskMmyyyy(raw))
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
            aria-label="Clear month"
            className="px-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            ✕
          </button>
        )}
        <button
          type="button"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
          aria-label={open ? 'Close month picker' : 'Open month picker'}
          aria-expanded={open}
          className="flex w-12 items-center justify-center rounded-r-xl border-l border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <CalendarIcon />
        </button>
      </div>
      {open && (
        <MonthPopover
          anchorRef={wrapperRef}
          selected={normalized || undefined}
          min={min}
          max={max}
          onPick={(ym) => {
            setText(mmyyyyFromYm(ym))
            onChange(ym)
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

function MonthPopover({
  anchorRef,
  selected,
  min,
  max,
  onPick,
  onClose,
}: {
  // The ref object (not .current) so the anchor element is read inside
  // effects, never during render.
  anchorRef: React.RefObject<HTMLElement | null>
  selected?: string
  min?: string
  max?: string
  onPick: (ym: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  const today = todayYm()
  const initialY = selected ? Number(selected.slice(0, 4)) : today.y
  const [viewY, setViewY] = useState(initialY)

  // Styles written straight to the node — see CalendarPopover in
  // DateInput.tsx for the rationale.
  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const el = ref.current
    if (!anchor || !el) return
    const r = anchor.getBoundingClientRect()
    const popWidth = 280
    const margin = 8
    const vw = window.innerWidth
    let left = r.left
    if (left + popWidth + margin > vw)
      left = Math.max(margin, vw - popWidth - margin)
    const vh = window.innerHeight
    const wantTop = r.bottom + 6
    const popHeight = 240
    const top =
      wantTop + popHeight + margin > vh
        ? Math.max(margin, r.top - popHeight - 6)
        : wantTop
    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }, [anchorRef])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current) return
      const t = e.target as Node
      if (ref.current.contains(t)) return
      if (anchorRef.current?.contains(t)) return
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
  }, [anchorRef, onClose])

  const minYm = min ?? ''
  const maxYm = max ?? ''
  const selY = selected ? Number(selected.slice(0, 4)) : null
  const selM = selected ? Number(selected.slice(5, 7)) : null

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', top: 0, left: 0, width: 280 }}
      className="z-[70] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900"
      role="dialog"
      aria-label="Pick a month"
    >
      <div className="flex items-center justify-between gap-1 border-b border-slate-100 px-2 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setViewY((y) => y - 1)}
          aria-label="Previous year"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ‹
        </button>
        <div className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
          {viewY}
        </div>
        <button
          type="button"
          onClick={() => setViewY((y) => y + 1)}
          aria-label="Next year"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1 px-2 py-3">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const ym = `${pad4(viewY)}-${pad2(m)}`
          const isSelected = viewY === selY && m === selM
          const isThisMonth = viewY === today.y && m === today.m
          const disabled =
            (minYm && ym < minYm) || (maxYm && ym > maxYm)
          return (
            <button
              key={m}
              type="button"
              disabled={!!disabled}
              onClick={() => {
                if (disabled) return
                onPick(ym)
              }}
              className={monthCellClass(isSelected, isThisMonth, !!disabled)}
            >
              {SHORT_MONTH_NAMES[m - 1]}
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onPick(`${pad4(today.y)}-${pad2(today.m)}`)}
          className="text-xs font-semibold text-brand-600 hover:underline"
        >
          This month
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

function monthCellClass(
  selected: boolean,
  thisMonth: boolean,
  disabled: boolean,
): string {
  const base =
    'flex h-10 items-center justify-center rounded-lg text-sm font-medium tabular-nums transition'
  if (disabled)
    return `${base} cursor-not-allowed text-slate-300 dark:text-slate-700`
  if (selected) return `${base} bg-brand-600 font-semibold text-white shadow`
  if (thisMonth)
    return `${base} font-semibold text-brand-700 ring-1 ring-inset ring-brand-500 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/30`
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

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface Ym {
  y: number
  m: number
}

function todayYm(): Ym {
  const d = new Date()
  return { y: d.getFullYear(), m: d.getMonth() + 1 }
}

// Accept stored YYYY-MM, or legacy YYYY-MM-DD (trim to YYYY-MM).
function normalizeStored(s: string): string {
  if (!s) return ''
  if (/^\d{4}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7)
  return ''
}

// "12025" → "1/2025" then "01/2025"? We keep it as user types and parse
// at commit. mm can be 1–12.
function maskMmyyyy(raw: string): string {
  const digits = raw.replace(/\D+/g, '').slice(0, 6)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

function parseMmyyyy(s: string): Ym | null {
  const m = s.match(/^(\d{1,2})\/(\d{2}|\d{4})$/)
  if (!m) return null
  const month = parseInt(m[1], 10)
  let year = parseInt(m[2], 10)
  if (m[2].length === 2) year = year < 50 ? 2000 + year : 1900 + year
  if (month < 1 || month > 12) return null
  return { y: year, m: month }
}

function mmyyyyFromYm(ym: string): string {
  if (!ym) return ''
  const m = ym.match(/^(\d{4})-(\d{2})/)
  if (!m) return ''
  return `${m[2]}/${m[1]}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}
function pad4(n: number): string {
  return n.toString().padStart(4, '0')
}
