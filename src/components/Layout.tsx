import { NavLink, Outlet } from 'react-router-dom'
import { InstallAppButton } from './InstallAppButton'

const tabs = [
  { to: '/', label: 'Home', end: true },
  { to: '/bottles', label: 'Bottles' },
  { to: '/sites', label: 'Sites' },
  { to: '/transactions', label: 'Log' },
  { to: '/settings', label: 'Settings' },
]

export function Layout() {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-950">
      <header
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Refrigerant Handling
          </h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Tracking &amp; audit log
          </p>
          {/* Absolute so the title stays optically centred whether
              the install button is rendered or not (it disappears
              once the app is running standalone). */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2">
            <InstallAppButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-24">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div
          className="mx-auto grid max-w-3xl grid-cols-5"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex items-center justify-center py-4 text-sm font-medium transition ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-500'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
