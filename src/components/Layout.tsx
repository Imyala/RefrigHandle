import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Dashboard', icon: '📊', end: true },
  { to: '/bottles', label: 'Bottles', icon: '🛢️' },
  { to: '/locations', label: 'Sites', icon: '📍' },
  { to: '/transactions', label: 'Log', icon: '📝' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Layout() {
  return (
    <div className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛢️</span>
            <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
              RefrigHandle
            </h1>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-28">
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
                `flex flex-col items-center justify-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-500'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
