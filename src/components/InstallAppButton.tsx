import { useEffect, useRef, useState } from 'react'
import { Modal } from './ui'

// PWA install button. The native "Install" prompt on Chrome/Android
// fires a beforeinstallprompt event we have to capture and replay
// when the user taps our button. iOS Safari doesn't support the
// programmatic prompt at all — we fall back to a short instructions
// modal pointing the user at Share → Add to Home Screen.
//
// Hidden once the app is running standalone (already installed) so
// it disappears after the first successful install.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari exposes a non-standard navigator.standalone flag.
  const navStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone
  return !!navStandalone
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  // iPadOS pretends to be Mac in newer Safari, but still has touch.
  const ua = navigator.userAgent
  const iPadLike =
    /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadLike
}

export function InstallAppButton() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [canPrompt, setCanPrompt] = useState(false)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const ios = isIos()

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault()
      promptRef.current = e as BeforeInstallPromptEvent
      setCanPrompt(true)
    }
    function onInstalled() {
      promptRef.current = null
      setCanPrompt(false)
      setInstalled(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Already running as a standalone app — nothing to do.
  if (installed) return null

  // Chrome/Android haven't surfaced a prompt yet, and we're not on
  // iOS where we'd show the manual instructions. Render nothing
  // rather than a dead button.
  if (!canPrompt && !ios) return null

  async function handleClick() {
    if (canPrompt && promptRef.current) {
      const evt = promptRef.current
      await evt.prompt()
      const { outcome } = await evt.userChoice
      if (outcome === 'accepted') {
        setInstalled(true)
      }
      promptRef.current = null
      setCanPrompt(false)
      return
    }
    // iOS — show the Add-to-Home-Screen walkthrough.
    setIosHelpOpen(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Install app for offline use"
        aria-label="Install app for offline use"
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-95"
      >
        <DownloadIcon />
        <span className="hidden sm:inline">Install app</span>
        <span className="sm:hidden">Install</span>
      </button>

      <Modal
        open={iosHelpOpen}
        title="Install on iPhone / iPad"
        onClose={() => setIosHelpOpen(false)}
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          iOS Safari doesn't show an install prompt, but you can still
          add Refrigerant Handling to your home screen so it works
          fully offline.
        </p>
        <ol className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
          <li className="flex gap-3">
            <Step n={1} />
            <span>
              Tap the{' '}
              <span className="font-semibold">Share</span> button at the
              bottom of Safari (the square with an up-arrow).
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <span>
              Scroll down and tap{' '}
              <span className="font-semibold">Add to Home Screen</span>.
            </span>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <span>
              Tap <span className="font-semibold">Add</span> in the
              top-right. The app will launch from your home screen and
              keep working without internet.
            </span>
          </li>
        </ol>
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Open this page in Safari (not Chrome on iOS) — the Add to
          Home Screen option is only there.
        </p>
      </Modal>
    </>
  )
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
    >
      {n}
    </span>
  )
}

function DownloadIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 4v11" />
      <path d="M6 11l6 6 6-6" />
      <path d="M5 20h14" />
    </svg>
  )
}
