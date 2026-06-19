import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

// A "back" control that pops history (a real back navigation) so the
// previous page's scroll position is restored, instead of a forward Link
// that would re-enter the destination at the top. Falls back to `to` when
// the page was opened directly with no in-app history to pop (e.g. a
// refreshed deep link).
export function BackLink({
  to = '/settings',
  children,
}: {
  to?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      onClick={() => {
        const idx = (window.history.state as { idx?: number } | null)?.idx
        if (typeof idx === 'number' && idx > 0) navigate(-1)
        else navigate(to, { replace: true })
      }}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
    >
      {children}
    </button>
  )
}
