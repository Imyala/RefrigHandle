import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDevicePrefs } from '../lib/devicePrefs'
import { useStore } from '../lib/store'
import { useConfirm } from '../lib/confirm'
import { isTestAccount } from '../lib/testAccount'

// Bottom tab bar — "floating centre button" layout. Bottles is the core
// entity, so it's promoted to a raised circular button in the middle,
// flanked by the other destinations as outline-icon tabs. Short labels
// plus a glyph keep everything legible on a narrow phone; the full names
// ride on aria-label/title where a label is abbreviated.
function TabLink({
  to,
  end,
  label,
  aria,
  icon,
}: {
  to: string
  end?: boolean
  label: string
  aria?: string
  icon: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      aria-label={aria ?? label}
      title={aria ?? label}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 px-0.5 py-2.5 transition ${
          isActive
            ? 'text-brand-600 dark:text-brand-400'
            : 'text-slate-500 dark:text-slate-400'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden
            className={`flex h-8 w-full max-w-[3.25rem] items-center justify-center rounded-full transition ${
              isActive ? 'bg-brand-50 dark:bg-brand-900/30' : ''
            }`}
          >
            {icon}
          </span>
          <span className="text-[11px] font-medium leading-none tracking-tight">
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

export function Layout() {
  // Subscribe so the whole app (rendered through <Outlet/>) re-renders when
  // a display pref like "Show times in UTC" is toggled — the time formatters
  // read these prefs, so every visible timestamp updates live.
  useDevicePrefs()
  return (
    <div className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-950">
      <header
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Refrigister
          </h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Tracking &amp; audit log
          </p>
        </div>
      </header>

      <DemoBanner />
      <TestAccountBanner />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-10">
        <Outlet />
      </main>

      {/* Sticky (not fixed) so the bar occupies real layout space: the page
          can always scroll its last control clear of the bar, instead of
          relying on a guessed padding that a taller bar silently eats. */}
      <nav
        aria-label="Primary"
        className="sticky bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div
          className="relative mx-auto grid max-w-3xl grid-cols-6"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <TabLink to="/" end label="Home" icon={<HomeIcon />} />
          <TabLink to="/sites" label="Sites" icon={<SitesIcon />} />

          {/* Centre slot: Bottles is the core entity, so its tab carries a
              filled brand circle to stand out — but it sits flush in the bar
              at the same height as the other tabs rather than floating above
              it. */}
          <NavLink
            to="/bottles"
            aria-label="Bottles"
            title="Bottles"
            className="flex flex-col items-center justify-center gap-1 px-0.5 py-2.5 text-slate-500 transition dark:text-slate-400"
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm shadow-brand-900/20 transition ${
                    isActive ? 'bg-brand-700' : 'bg-brand-600'
                  }`}
                >
                  <BottleIcon />
                </span>
                <span
                  className={`text-[11px] font-medium leading-none tracking-tight transition ${
                    isActive ? 'text-brand-600 dark:text-brand-400' : ''
                  }`}
                >
                  Bottles
                </span>
              </>
            )}
          </NavLink>

          {/* Jobs earned a tab: fridgies think in jobs, and the UX review
              kept finding it stranded behind the Home card grid. */}
          <TabLink to="/jobs" label="Jobs" icon={<JobsIcon />} />

          {/* "Movements", not "Log": the page is the refrigerant ledger and
              links to the separate Change log (audit trail) — a tab called
              "Log" made three "log" concepts collide in one viewport. */}
          <TabLink
            to="/transactions"
            label="Moves"
            aria="Refrigerant movements"
            icon={<LogIcon />}
          />
          <TabLink to="/settings" label="Settings" icon={<SettingsIcon />} />
        </div>
      </nav>
    </div>
  )
}

// Persistent strip shown while exploring on sample data. Makes the demo
// state unmistakable and offers both ways out: commit to real setup, or
// exit guest mode back to the welcome screen without creating an account.
// Renders nothing outside demo mode.
function DemoBanner() {
  const { state, exitDemo } = useStore()
  const confirm = useConfirm()
  if (!state.demoStartedAt || state.setupCompletedAt) return null

  async function setUp() {
    const ok = await confirm({
      title: 'Set up your business?',
      message:
        'This clears the sample data and starts your real setup, where you enter your business, licence and authorisation details. Nothing from the demo is kept.',
      confirmLabel: 'Clear sample data & set up',
    })
    if (ok) exitDemo()
  }

  async function exitGuest() {
    const ok = await confirm({
      title: 'Exit guest mode?',
      message:
        'This discards the sample data and returns to the welcome screen. No account is created and nothing is kept.',
      confirmLabel: 'Exit guest mode',
    })
    if (ok) exitDemo()
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2">
        <p className="text-xs text-amber-900 dark:text-amber-100">
          <span className="font-semibold">Exploring with sample data.</span>{' '}
          Nothing here is a real record.
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void exitGuest()}
            className="min-h-11 rounded-lg border border-amber-600/60 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
          >
            Exit guest mode
          </button>
          <button
            type="button"
            onClick={() => void setUp()}
            className="min-h-11 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
          >
            Set up my business
          </button>
        </div>
      </div>
    </div>
  )
}

// Persistent strip while signed in to the built-in test account (the
// pre-server sign-in sandbox), so it can't be mistaken for a business's
// real records. One tap erases the sandbox and returns to the welcome
// screen. Renders nothing outside the test account.
function TestAccountBanner() {
  const { state, resetToFreshInstall } = useStore()
  const confirm = useConfirm()
  if (!isTestAccount(state)) return null

  async function leave() {
    const ok = await confirm({
      title: 'Erase the test account?',
      message:
        'This erases the test workspace from this device and returns to the welcome screen. Nothing from it is kept.',
      confirmLabel: 'Erase & leave',
      danger: true,
    })
    if (ok) resetToFreshInstall()
  }

  return (
    <div className="border-b border-blue-300 bg-blue-50 dark:border-blue-900/50 dark:bg-blue-900/20">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-4 py-2">
        <p className="text-xs text-blue-900 dark:text-blue-100">
          <span className="font-semibold">Built-in test account.</span> For
          trying sign-in only — nothing here is a real record.
        </p>
        <button
          type="button"
          onClick={() => void leave()}
          className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
        >
          Erase &amp; leave
        </button>
      </div>
    </div>
  )
}

// --- Outline icons -----------------------------------------------------
// Thin stroked glyphs (currentColor), 24px viewBox, rendered ~20px.
function Icon({ children, big }: { children: ReactNode; big?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={big ? 'h-7 w-7' : 'h-[22px] w-[22px]'}
      fill="none"
      stroke="currentColor"
      strokeWidth={big ? 1.8 : 1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function JobsIcon() {
  // Clipboard — the work-order metaphor.
  return (
    <Icon>
      <rect x="5" y="4.5" width="14" height="17" rx="2" />
      <path d="M9 4.5V3h6v1.5" />
      <path d="M8.5 10h7M8.5 13.5h7M8.5 17h4" />
    </Icon>
  )
}

function HomeIcon() {
  return (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </Icon>
  )
}

function BottleIcon({ big }: { big?: boolean }) {
  return (
    <Icon big={big}>
      <path d="M10 3h4v2.2h-4z" />
      <path d="M8 7.5a3 3 0 0 1 3-3h2a3 3 0 0 1 3 3V19a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" />
      <path d="M8 12h8" />
    </Icon>
  )
}

function SitesIcon() {
  return (
    <Icon>
      <path d="M3 21h18" />
      <path d="M6 21V4h9v17" />
      <path d="M15 21V9h3v12" />
      <path d="M9 7.5h3M9 11h3M9 14.5h3" />
    </Icon>
  )
}

function LogIcon() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4.5h6V7H9z" />
      <path d="M8.5 11.5h7M8.5 15.5h4.5" />
    </Icon>
  )
}

function SettingsIcon() {
  return (
    <Icon>
      <path d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V20a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 18.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  )
}
