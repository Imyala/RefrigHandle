import { NavLink, Outlet } from 'react-router-dom'
import type { ReactNode } from 'react'

// Bottom tab bar. Each tab pairs a glyph with a short, plain label so the
// six destinations stay legible on a narrow phone (text-only labels like
// "Refrigerant Log" used to wrap and crowd each other). `aria`/`title`
// carry the full name for screen readers and long-press tooltips where
// the visible label is abbreviated.
const tabs: {
  to: string
  label: string
  aria?: string
  end?: boolean
  icon: ReactNode
}[] = [
  { to: '/', label: 'Home', end: true, icon: <HomeIcon /> },
  { to: '/bottles', label: 'Bottles', icon: <BottleIcon /> },
  { to: '/sites', label: 'Sites', icon: <SitesIcon /> },
  {
    to: '/transactions',
    label: 'Log',
    aria: 'Refrigerant log',
    icon: <LogIcon />,
  },
  {
    to: '/history',
    label: 'Changes',
    aria: 'Change log',
    icon: <HistoryIcon />,
  },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
]

export function Layout() {
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Primary"
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
      >
        <div
          className="mx-auto grid max-w-3xl grid-cols-6"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              aria-label={t.aria ?? t.label}
              title={t.aria ?? t.label}
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
                    className={`flex h-9 w-full max-w-[3.5rem] items-center justify-center rounded-full transition ${
                      isActive ? 'bg-brand-50 dark:bg-brand-900/30' : ''
                    }`}
                  >
                    {t.icon}
                  </span>
                  <span className="text-[11px] font-medium leading-none tracking-tight">
                    {t.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

// --- Icons -------------------------------------------------------------
// Simple stroked glyphs (currentColor) matching the chevrons used
// elsewhere in the app. 22px viewBox, rendered at ~20px.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
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

function BottleIcon() {
  return (
    <Icon>
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
      <path d="M6 21V6l6-3v18" />
      <path d="M12 21V10l6 3v8" />
      <path d="M9 9h0M9 13h0M9 17h0" />
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

function HistoryIcon() {
  return (
    <Icon>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v4h4" />
      <path d="M12 8v4.3l3 1.8" />
    </Icon>
  )
}

function SettingsIcon() {
  return (
    <Icon>
      <path d="M3.5 7h9" />
      <path d="M16.5 7H20.5" />
      <circle cx="14.5" cy="7" r="2.1" />
      <path d="M3.5 17h3" />
      <path d="M10.5 17h10" />
      <circle cx="8.5" cy="17" r="2.1" />
    </Icon>
  )
}
