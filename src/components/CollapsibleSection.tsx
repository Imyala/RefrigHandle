import { useEffect, useState, type ReactNode } from 'react'

// Section header that can be collapsed/expanded with a tap. Used to
// keep busy pages (Dashboard, Settings) from flooding the viewport
// with content. Open/closed state is persisted in localStorage under
// `storageKey` so it survives navigation and reload.

interface CollapsibleSectionProps {
  title: string
  // Right-hand metadata next to the title (e.g. a count pill or a
  // "View all" link). Doesn't trigger the toggle when tapped.
  trailing?: ReactNode
  defaultOpen?: boolean
  storageKey?: string
  children: ReactNode
}

export function CollapsibleSection({
  title,
  trailing,
  defaultOpen = true,
  storageKey,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(() => {
    if (!storageKey) return defaultOpen
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved === '1') return true
      if (saved === '0') return false
    } catch {
      /* localStorage unavailable — fall back to default */
    }
    return defaultOpen
  })

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, open ? '1' : '0')
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }, [open, storageKey])

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-m-1 flex items-center gap-1.5 rounded-lg p-1 text-sm font-semibold uppercase tracking-wider text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        >
          <span
            aria-hidden
            className={`text-xs transition-transform ${open ? '' : '-rotate-90'}`}
          >
            ▾
          </span>
          {title}
        </button>
        {trailing && <div>{trailing}</div>}
      </div>
      {open && children}
    </section>
  )
}
