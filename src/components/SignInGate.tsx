import { useState, type ReactNode } from 'react'
import { Card, Pill } from './ui'
import { PasswordPromptModal } from './PasswordPromptModal'
import { useStore } from '../lib/store'
import {
  isSetupComplete,
  isTechnicianActive,
  roleInfo,
  type Technician,
} from '../lib/types'
import { profileFor } from '../lib/compliance'

// Sign-in screen for a set-up device with nobody in the seat. Records live
// on-device (pre-server), so signing in means choosing your profile and
// entering its password — the same credential the profile switcher uses.
// Once the cloud backend lands this becomes the local half of remote
// sign-in. Reached after "Sign out" in Settings (or a legacy signed-out
// state); the OnboardingGate handles fresh devices and the
// AccountClosedGate handles closed accounts before this runs.
export function SignInGate({ children }: { children: ReactNode }) {
  const { state } = useStore()
  if (!isSetupComplete(state)) return <>{children}</>
  const active = state.technicians.find(
    (t) => t.id === state.activeTechnicianId,
  )
  if (active && isTechnicianActive(active) && !active.suspendedAt) {
    return <>{children}</>
  }
  // Nobody usable is signed in. If the device has no signable profiles at
  // all (legacy installs could reach that), fall through rather than brick.
  const eligible = state.technicians.filter((t) => isTechnicianActive(t))
  if (eligible.length === 0) return <>{children}</>
  return <SignInScreen profiles={eligible} />
}

function SignInScreen({ profiles }: { profiles: Technician[] }) {
  const { state, setActiveTechnicianId } = useStore()
  const profile = profileFor(state.jurisdiction)
  // Profile awaiting its password in the modal (null = none).
  const [pending, setPending] = useState<Technician | null>(null)

  function pick(t: Technician) {
    if (t.suspendedAt) return
    // No password set on this profile — straight in (same rule as the
    // in-app profile switcher).
    if (!t.passwordHash) {
      setActiveTechnicianId(t.id)
      return
    }
    setPending(t)
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            {state.businessName || 'Refrigerant Handling'}
          </h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            Sign in
          </p>
        </div>

        <Card>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            Choose your profile to sign in on this device.
          </p>
          <div className="space-y-2">
            {profiles.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={!!t.suspendedAt}
                onClick={() => pick(t)}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-slate-100 px-3 py-3 text-left transition hover:bg-slate-200 disabled:opacity-50 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {t.name || '(unnamed)'}
                    </span>
                    {t.suspendedAt && <Pill tone="red">Suspended</Pill>}
                    <Pill tone={roleInfo(t.role).level >= 3 ? 'blue' : 'slate'}>
                      {roleInfo(t.role).label}
                    </Pill>
                  </div>
                  <div className="text-xs text-slate-500">
                    {t.email ??
                      (t.arcLicenceNumber
                        ? `${profile.techLicenceShort} ${t.arcLicenceNumber}`
                        : '')}
                  </div>
                </div>
                <span aria-hidden className="shrink-0 text-slate-400">
                  →
                </span>
              </button>
            ))}
          </div>
        </Card>

        <p className="text-center text-[11px] text-slate-400">
          Your records stay on this device — signing out never removes them.
        </p>
      </div>

      <PasswordPromptModal
        tech={pending}
        onClose={() => setPending(null)}
        title={pending ? `Sign in as ${pending.name}` : ''}
        description={`Enter ${pending?.name}’s password to sign in on this device.`}
        submitLabel="Sign in"
        onVerified={(t) => {
          setPending(null)
          setActiveTechnicianId(t.id)
        }}
      />
    </div>
  )
}
