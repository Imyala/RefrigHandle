import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// A "back" control that pops history (a real back navigation) so the
// previous page's scroll position is restored, instead of a forward Link
// that would re-enter the destination at the top. Only falls back to `to`
// when this page is the very first history entry (opened directly / a
// refresh), where there is nothing in-app to pop to — React Router gives
// that initial entry the key 'default'.
export function BackLink({
  to = '/settings',
  children,
}: {
  to?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  return (
    <button
      type="button"
      onClick={() => {
        if (location.key !== 'default') navigate(-1)
        else navigate(to, { replace: true })
      }}
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
    >
      {children}
    </button>
  )
}
