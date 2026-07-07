import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  full?: boolean
}

export function Button({
  variant = 'primary',
  full,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  // whitespace-nowrap: a button label must never break onto two lines —
  // where space is tight the surrounding layout stacks or wraps whole
  // buttons instead (see the grid-cols-1 sm:grid-cols-2 action rows).
  const base =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-3 text-base font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
  const variants: Record<string, string> = {
    primary:
      'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
    secondary:
      'bg-slate-200 text-slate-900 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600',
    danger:
      'bg-red-600 text-white hover:bg-red-700',
    ghost:
      'bg-transparent text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
  }
  return (
    <button
      type={type}
      className={`${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
  className = '',
}: {
  label: string
  hint?: string
  // When set, the field reads as invalid: the label gets a red marker and
  // this message replaces the hint, shown in red. Drives the red-marker
  // validation used on first-run setup and other required forms.
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span
        className={`text-sm font-medium ${
          error
            ? 'text-red-600 dark:text-red-400'
            : 'text-slate-700 dark:text-slate-200'
        }`}
      >
        {label}
        {error && <span aria-hidden className="ml-1 text-red-600 dark:text-red-400">●</span>}
      </span>
      {children}
      {error ? (
        <span
          role="alert"
          className="flex items-start gap-1 text-xs font-medium text-red-600 dark:text-red-400"
        >
          <WarningIcon />
          {error}
        </span>
      ) : (
        hint && (
          <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
        )
      )}
    </label>
  )
}

function WarningIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="mt-px h-3.5 w-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  )
}

// Border/focus colours split out from the structural classes so the
// invalid (red) variant cleanly replaces the normal (slate/brand) one —
// otherwise both border-colour utilities land in the class list and
// Tailwind's output order, not ours, decides which wins.
const inputBase =
  'w-full rounded-xl border bg-white px-3 py-3 text-base text-slate-900 outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-900 dark:text-slate-100'
const inputNormal =
  'border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700'
const inputInvalid =
  'border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/30 dark:border-red-500/70'

function inputCls(invalid?: boolean, extra = '') {
  return `${inputBase} ${invalid ? inputInvalid : inputNormal} ${extra}`
}

type Invalidable<T> = T & { invalid?: boolean }

export function TextInput({
  invalid,
  className,
  ...props
}: Invalidable<InputHTMLAttributes<HTMLInputElement>>) {
  return <input {...props} className={inputCls(invalid, className ?? '')} />
}

export function Select({
  invalid,
  className,
  ...props
}: Invalidable<SelectHTMLAttributes<HTMLSelectElement>>) {
  return <select {...props} className={inputCls(invalid, className ?? '')} />
}

export function TextArea({
  invalid,
  className,
  ...props
}: Invalidable<TextareaHTMLAttributes<HTMLTextAreaElement>>) {
  return <textarea rows={3} {...props} className={inputCls(invalid, className ?? '')} />
}

export function Card({
  children,
  className = '',
  id,
}: {
  children: ReactNode
  className?: string
  id?: string
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function Pill({
  tone = 'slate',
  title,
  children,
}: {
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue'
  title?: string
  children: ReactNode
}) {
  const tones: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  }
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/50 p-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        {title}
      </div>
      {body && (
        <p className="max-w-sm text-sm text-slate-600 dark:text-slate-400">
          {body}
        </p>
      )}
      {action}
    </div>
  )
}

// Modals can stack (e.g. the custom-cylinder form opens over the bottle
// form), so each open modal registers on a shared stack and Escape peels
// only the top layer.
const modalStack: (() => void)[] = []

export function Modal({
  open,
  title,
  onClose,
  children,
  size = 'sm',
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  size?: 'sm' | 'lg'
}) {
  // Only treat a click as a "close on backdrop" when the press STARTED on
  // the backdrop. Without this, selecting text inside a field and
  // releasing the mouse over the backdrop (a drag that ends outside the
  // dialog) fires a click on the overlay and wrongly closes the modal —
  // losing whatever the user was editing. Tracking the mousedown origin
  // means a drag-select that strays onto the backdrop never closes it.
  const pressedOnOverlayRef = useRef(false)
  // Ref so the Escape listener always calls the latest onClose without
  // re-subscribing on every render (callers pass inline arrows). Synced
  // in an effect — the lint rule (correctly) bans ref writes in render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    if (!open) return
    const close = () => onCloseRef.current()
    modalStack.push(close)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === close) {
        e.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      const i = modalStack.indexOf(close)
      if (i >= 0) modalStack.splice(i, 1)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  if (!open) return null
  const overlayCls =
    size === 'lg'
      ? 'fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4'
      : 'fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4'
  const containerCls =
    size === 'lg'
      ? 'flex h-svh w-full max-w-2xl flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900 sm:h-[92svh] sm:rounded-3xl'
      : 'max-h-[90svh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl'
  // Portal to <body> so the modal escapes any parent <form>. Otherwise,
  // a Save button inside a nested form (e.g. the Custom-cylinder form
  // rendered inside the BottleForm) ends up submitting the outer form
  // because HTML doesn't honour nested <form> elements.
  return createPortal(
    <div
      className={overlayCls}
      onMouseDown={(e) => {
        pressedOnOverlayRef.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        // Close only on a genuine backdrop click — press and release both
        // on the overlay itself, not a drag that began inside the dialog.
        if (e.target === e.currentTarget && pressedOnOverlayRef.current) {
          onClose()
        }
        pressedOnOverlayRef.current = false
      }}
    >
      <div
        className={containerCls}
        onClick={(e) => e.stopPropagation()}
        style={
          size === 'lg'
            ? {
                paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)',
              }
            : undefined
        }
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl text-slate-500 hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
