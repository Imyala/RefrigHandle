import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from './ui'

// PWA install button. Browsers expose installation via three paths,
// so we have to handle all of them in one button:
//
//   1. Chrome/Edge/Samsung on Android + Chrome/Edge on desktop fire
//      a beforeinstallprompt event we capture and replay when the
//      user taps. This is the only way to get the native install
//      sheet to appear from a web page.
//
//   2. iOS Safari doesn't fire that event. The only path is the
//      Share sheet → Add to Home Screen. We show a themed Modal
//      walking the user through it.
//
//   3. Brave / Firefox / Opera / iOS Chrome / desktop Safari etc.
//      may not fire beforeinstallprompt either (engagement
//      heuristics, opt-out shields, browsers that don't support
//      PWA install at all). For those we fall back to instructions
//      pointing at the browser menu.
//
// The button hides itself once the app is running standalone (i.e.
// already installed) so we don't keep nagging.

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
  const ua = navigator.userAgent
  // iPadOS pretends to be Mac in newer Safari, but still has touch.
  const iPadLike = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadLike
}

interface InstallAppButtonProps {
  // 'compact' = small pill (header style); 'full' = full-width card
  // button (Settings style).
  variant?: 'compact' | 'full'
}

export function InstallAppButton({ variant = 'compact' }: InstallAppButtonProps) {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [canPrompt, setCanPrompt] = useState(false)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [helpOpen, setHelpOpen] = useState(false)
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

  // Already running as a standalone app — surface a confirmation
  // chip so the user knows install worked, instead of just hiding.
  if (installed) {
    if (variant === 'compact') return null
    return (
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
        <CheckIcon />
        App installed — running offline-ready
      </div>
    )
  }

  async function handleClick() {
    if (canPrompt && promptRef.current) {
      const evt = promptRef.current
      try {
        await evt.prompt()
        const { outcome } = await evt.userChoice
        if (outcome === 'accepted') setInstalled(true)
      } catch {
        // Some browsers throw if the prompt is rejected — fall
        // through to the manual instructions below.
        setHelpOpen(true)
      }
      promptRef.current = null
      setCanPrompt(false)
      return
    }
    // Native prompt not available — show manual instructions.
    setHelpOpen(true)
  }

  return (
    <>
      {variant === 'full' ? (
        <Button onClick={handleClick} full>
          <DownloadIcon />
          Install app
        </Button>
      ) : (
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
      )}

      <Modal
        open={helpOpen}
        title={ios ? 'Install on iPhone / iPad' : 'Install from your browser'}
        onClose={() => setHelpOpen(false)}
      >
        {ios ? (
          <>
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
                  <span className="font-semibold">Share</span> button at
                  the bottom of Safari (the square with an up-arrow).
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
                  top-right. The app will launch from your home screen
                  and keep working without internet.
                </span>
              </li>
            </ol>
            <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Open this page in Safari (not Chrome on iOS) — Add to Home
              Screen is only there.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your browser hasn't surfaced the install dialog yet. You
              can still install Refrigerant Handling manually so it
              opens like a normal app and works offline.
            </p>
            <ol className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex gap-3">
                <Step n={1} />
                <span>
                  Open the browser menu (the{' '}
                  <span className="font-semibold">⋮</span> icon — usually
                  top-right on Android, top-right on desktop).
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <span>
                  Tap{' '}
                  <span className="font-semibold">Install app</span>,{' '}
                  <span className="font-semibold">Add to Home screen</span>,
                  or <span className="font-semibold">Install</span>{' '}
                  (depending on the browser).
                </span>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span>
                  Confirm. The app will launch from your home screen /
                  desktop and keep working without internet.
                </span>
              </li>
            </ol>
            <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Some browsers (Brave, Firefox) gate the auto-prompt
              behind extra engagement or shields. The manual menu route
              works regardless.
            </p>
          </>
        )}
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

function CheckIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  )
}
