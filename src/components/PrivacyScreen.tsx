import { useEffect, useState } from 'react'
import { useDevicePrefs } from '../lib/devicePrefs'

// A browser-side privacy screen. When the app loses focus or is sent to the
// background (app switcher, tab switch, another window on top), we drop an
// opaque cover over everything so the records aren't visible in the OS
// app-switcher thumbnail or to someone glancing at the screen while the tech
// steps away. It clears the instant the app is focused again.
//
// Deliberate scope note (also surfaced to the user in Settings): the web
// platform gives a page NO way to stop a real screenshot or screen
// recording. That is native-only (Android FLAG_SECURE, iOS capture APIs) and
// would require wrapping this PWA in a native shell. This component is the
// honest, achievable part — a background/idle privacy cover, not a
// screenshot block. It must never be labelled as one.
export function PrivacyScreen() {
  const { privacyScreen } = useDevicePrefs()
  // Seed from the current visibility so a mount that happens while already
  // backgrounded starts covered. After that, only the event listeners below
  // drive it — no setState in the effect body.
  const [covered, setCovered] = useState(
    () => document.visibilityState === 'hidden',
  )

  useEffect(() => {
    // Listeners are only attached while the pref is on; when it's off the
    // render guard below hides the cover regardless of `covered`.
    if (!privacyScreen) return

    const cover = () => setCovered(true)
    const uncover = () => setCovered(false)

    // Cover on any signal that the app is no longer the thing being looked
    // at; uncover only when it's genuinely focused/visible again.
    const onVisibility = () => {
      setCovered(document.visibilityState === 'hidden')
    }

    window.addEventListener('blur', cover)
    window.addEventListener('focus', uncover)
    window.addEventListener('pagehide', cover)
    window.addEventListener('pageshow', uncover)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('blur', cover)
      window.removeEventListener('focus', uncover)
      window.removeEventListener('pagehide', cover)
      window.removeEventListener('pageshow', uncover)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [privacyScreen])

  if (!privacyScreen || !covered) return null

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-brand-700 text-white"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-10 w-10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </svg>
      <p className="text-lg font-semibold tracking-tight">Refrigerant Handling</p>
      <p className="text-sm text-white/80">Hidden while in the background</p>
    </div>
  )
}
