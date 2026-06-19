import { useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Window scroll restoration for the HashRouter — React Router's built-in
// <ScrollRestoration> only works with the data routers. Behaviour:
//   • New navigation (PUSH / REPLACE) → jump to the top of the new page.
//   • Back / forward (POP) → restore the scroll position you left.
// A navigation that carries its own scroll target (state.scrollTo, e.g. a
// compliance alert deep-linking into Settings) is left alone so the
// destination page can place itself.
//
// Positions are kept per history entry (location.key) in a ref, captured
// continuously via a scroll listener. React runs the previous entry's
// effect cleanup before the next entry's effect body, so the outgoing
// listener is removed before we programmatically scroll — the position we
// recorded while the user was on that page is preserved, not overwritten
// by the jump-to-top.
export function ScrollRestoration() {
  const location = useLocation()
  const navType = useNavigationType()
  const positions = useRef<Map<string, number>>(new Map())
  // Pages that carry their own scroll target manage their own placement.
  const hasOwnTarget = !!(
    location.state as { scrollTo?: string } | null
  )?.scrollTo

  useLayoutEffect(() => {
    const key = location.key
    if (!hasOwnTarget) {
      if (navType === 'POP') {
        window.scrollTo(0, positions.current.get(key) ?? 0)
      } else {
        window.scrollTo(0, 0)
      }
    }
    const onScroll = () => positions.current.set(key, window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [location.key, navType, hasOwnTarget])

  return null
}
