import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDevicePrefs } from '../lib/devicePrefs'

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
            Refrigerant Handling
          </h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Tracking &amp; audit log
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-28">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div
          className="relative mx-auto grid max-w-3xl grid-cols-5"
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

          <TabLink
            to="/transactions"
            label="Log"
            aria="Refrigerant log"
            icon={<LogIcon />}
          />
          <TabLink to="/settings" label="Settings" icon={<SettingsIcon />} />
        </div>
      </nav>
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
