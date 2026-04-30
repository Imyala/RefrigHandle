import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  full?: boolean
}

export function Button({
  variant = 'primary',
  full,
  className = '',
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-medium transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed'
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
      className={`${base} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      )}
    </label>
  )
}

const inputStyle =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputStyle} ${props.className ?? ''}`} />
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputStyle} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${inputStyle} ${props.className ?? ''}`}
    />
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function Pill({
  tone = 'slate',
  children,
}: {
  tone?: 'slate' | 'green' | 'amber' | 'red' | 'blue'
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
  if (!open) return null
  const overlayCls =
    size === 'lg'
      ? 'fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:items-center sm:p-4'
      : 'fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4'
  const containerCls =
    size === 'lg'
      ? 'flex h-svh w-full max-w-2xl flex-col overflow-y-auto bg-white p-5 shadow-xl dark:bg-slate-900 sm:h-[92svh] sm:rounded-3xl'
      : 'max-h-[90svh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl dark:bg-slate-900 sm:rounded-3xl'
  return (
    <div className={overlayCls} onClick={onClose}>
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
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
