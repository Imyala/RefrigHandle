import { useState, type ReactNode } from 'react'
import { Button, Card, Field, TextInput } from './ui'
import { Picker } from './Picker'
import { LocationFields, type LocationErrors } from './LocationFields'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import {
  isLocationComplete,
  isSetupComplete,
  roleInfo,
  SETUP_ROLE_CHOICES,
  type Jurisdiction,
  type LocationSettings,
  type TechnicianRole,
} from '../lib/types'
import { profileFor } from '../lib/compliance'

// Gate the whole app behind a one-time setup. Until the business
// identity, ARC RTA, first technician and location are entered, the
// router never mounts — so there is no way to add a bottle or log a
// transaction before the compliance basics exist. Established installs
// are grandfathered past this in storage's normalize(), so only a fresh
// device ever sees the screen.
export function OnboardingGate({ children }: { children: ReactNode }) {
  const { state } = useStore()
  if (isSetupComplete(state)) return <>{children}</>
  return <OnboardingScreen />
}

function OnboardingScreen() {
  const { completeSetup } = useStore()
  const toast = useToast()

  // Australia-only product: the jurisdiction is fixed to AU rather than
  // picked, so every install runs on the ARC (RHL/RTA) profile.
  const jurisdiction: Jurisdiction = 'AU'
  const [businessName, setBusinessName] = useState('')
  const [abn, setAbn] = useState('')
  const [arcAuth, setArcAuth] = useState('')
  const [techName, setTechName] = useState('')
  const [techRhl, setTechRhl] = useState('')
  // Role of the very first account: business owner, or supervisor for a
  // larger org where the owner won't use the app and a supervisor needs
  // full access. Restricted to SETUP_ROLE_CHOICES here.
  const [role, setRole] = useState<TechnicianRole>('owner')
  const [loc, setLoc] = useState<LocationSettings>({
    country: 'Australia',
    region: '',
    city: '',
    timezone: '',
  })
  // Flips true the first time "Finish setup" is pressed while something
  // is still missing. Until then the form stays clean (no red on fields
  // the tech hasn't reached yet); after a blocked attempt every
  // outstanding field is marked red so nothing is left to guess.
  const [attempted, setAttempted] = useState(false)

  const profile = profileFor(jurisdiction)

  const businessOk = businessName.trim() !== ''
  const abnOk = abn.trim() !== '' && profile.validateBusinessNumber(abn)
  const arcOk = !profile.hasBusinessAuthorisation || arcAuth.trim() !== ''
  const techOk = techName.trim() !== '' && techRhl.trim() !== ''
  const locOk = isLocationComplete(loc)
  const canFinish = businessOk && abnOk && arcOk && techOk && locOk

  // Exactly what's still outstanding, in field order — so a dead
  // "Finish setup" button can't leave the tech guessing which field is
  // the blocker. The ABN line is specific: a typed-but-invalid number
  // reads differently from a blank one.
  const missing: string[] = []
  if (!businessOk) missing.push('business name')
  if (!abnOk) {
    missing.push(
      abn.trim() === ''
        ? profile.businessNumberLabel
        : `a valid ${profile.businessNumberShort}`,
    )
  }
  if (!arcOk) missing.push(profile.businessAuthShort)
  if (techName.trim() === '') missing.push('technician name')
  if (techRhl.trim() === '') missing.push(profile.techLicenceShort)
  if (loc.country === 'Australia' && !loc.region.trim()) {
    missing.push('state / territory')
  }
  if (!loc.city.trim()) missing.push('city / town')
  if (!loc.timezone.trim()) missing.push('timezone')

  // Per-field red markers, shown only after a blocked finish attempt.
  const err = (show: boolean, msg: string) =>
    attempted && show ? msg : undefined
  const businessNameErr = err(!businessOk, 'Enter your trading / business name.')
  const abnErr = err(
    !abnOk,
    abn.trim() === ''
      ? `Enter your ${profile.businessNumberShort}.`
      : `Enter a valid ${profile.businessNumberShort}.`,
  )
  const arcErr = err(!arcOk, `Enter your ${profile.businessAuthShort}.`)
  const techNameErr = err(techName.trim() === '', 'Enter the technician name.')
  const techRhlErr = err(
    techRhl.trim() === '',
    `Enter the technician's ${profile.techLicenceShort}.`,
  )
  const locErrors: LocationErrors = {
    region: err(
      loc.country === 'Australia' && !loc.region.trim(),
      'Choose your state / territory.',
    ),
    city: err(!loc.city.trim(), 'Choose or type your city / town.'),
    timezone: err(!loc.timezone.trim(), 'Choose your timezone.'),
  }

  function finish() {
    if (!canFinish) {
      // Reveal the red markers and let the tech see every blocker at once
      // instead of silently doing nothing.
      setAttempted(true)
      return
    }
    completeSetup({
      businessName,
      businessAbn: abn,
      arcAuthorisationNumber: profile.hasBusinessAuthorisation ? arcAuth : '',
      technician: { name: techName, arcLicenceNumber: techRhl, role },
      location: loc,
      jurisdiction,
    })
    toast.show('Setup complete — welcome aboard', 'success')
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50 dark:bg-slate-950">
      <header
        className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Refrigerant Handling
          </h1>
          <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-brand-600 dark:text-brand-400">
            First-time setup
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-28">
        <div className="space-y-4">
          <p className="px-1 text-sm text-slate-600 dark:text-slate-400">
            Before you start logging work, we need your business and
            compliance details. They're stamped onto every transaction and
            shown on logbook printouts, so the audit trail is complete from
            day one. You can change any of this later in Settings.
          </p>

          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Business
            </div>
            {profile.id === 'AU' && (
              <p className="mb-3 text-xs text-slate-500">
                Your ARC Refrigerant Trading Authorisation (RTA) is issued to
                the business — look it up at{' '}
                <a
                  href="https://www.arctick.org/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  arctick.org
                </a>
                .
              </p>
            )}
            <div className="space-y-3">
              <Field label="Trading / business name *" error={businessNameErr}>
                <TextInput
                  value={businessName}
                  invalid={!!businessNameErr}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Acme Refrigeration Pty Ltd"
                />
              </Field>
              <Field
                label={`${profile.businessNumberLabel} *`}
                error={abnErr}
                hint={
                  abn.trim() !== '' && !abnOk
                    ? 'Must be a valid 11-digit ABN.'
                    : profile.businessNumberHint
                }
              >
                <TextInput
                  value={abn}
                  invalid={!!abnErr}
                  onChange={(e) => setAbn(e.target.value)}
                  inputMode={profile.id === 'AU' ? 'numeric' : undefined}
                  placeholder={
                    profile.id === 'AU' ? 'e.g. 51 824 753 556' : undefined
                  }
                />
              </Field>
              {profile.hasBusinessAuthorisation && (
                <Field
                  label={`${profile.businessAuthLabel} *`}
                  error={arcErr}
                  hint="Required to handle, buy or sell refrigerant."
                >
                  <TextInput
                    value={arcAuth}
                    invalid={!!arcErr}
                    onChange={(e) => setArcAuth(e.target.value)}
                    placeholder={
                      profile.id === 'AU' ? 'e.g. AU00000' : undefined
                    }
                  />
                </Field>
              )}
            </div>
          </Card>

          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              First account
            </div>
            <p className="mb-3 text-xs text-slate-500">
              This profile becomes the active technician. Their name and{' '}
              {profile.techLicenceLabel} are stamped onto each transaction
              they log. You can add more people later — only supervisors and
              owners can create accounts.
            </p>
            <div className="space-y-3">
              <Field
                label="Your role *"
                hint={
                  role === 'supervisor'
                    ? 'Choose Supervisor if the business owner won’t use the app — a supervisor gets full access when there’s no owner account.'
                    : roleInfo(role).blurb
                }
              >
                <Picker
                  title="Your role"
                  value={role}
                  onChange={(v) => setRole(v as TechnicianRole)}
                  options={SETUP_ROLE_CHOICES.map((r) => ({
                    value: r,
                    label: roleInfo(r).label,
                    hint:
                      r === 'owner'
                        ? 'You run the business and use the app.'
                        : 'For larger orgs — full access when the owner doesn’t use the app.',
                  }))}
                />
              </Field>
              <Field label="Technician name *" error={techNameErr}>
                <TextInput
                  value={techName}
                  invalid={!!techNameErr}
                  onChange={(e) => setTechName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                />
              </Field>
              <Field
                label={`${profile.techLicenceLabel} *`}
                error={techRhlErr}
                hint="The technician's personal licence number."
              >
                <TextInput
                  value={techRhl}
                  invalid={!!techRhlErr}
                  onChange={(e) => setTechRhl(e.target.value)}
                  placeholder={profile.id === 'AU' ? 'e.g. L000000' : undefined}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              Location
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Sets the timezone used for "now" defaults on transactions and the
              generated-at line on logbook PDFs.
            </p>
            <LocationFields
              loc={loc}
              setLoc={setLoc}
              jurisdiction={jurisdiction}
              errors={locErrors}
            />
          </Card>
        </div>
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto max-w-2xl">
          {/* Left enabled even when incomplete: pressing it reveals the
              red field markers (via finish() → setAttempted) rather than
              sitting dead and leaving the tech to guess the blocker. */}
          <Button full onClick={finish}>
            Finish setup
          </Button>
          {!canFinish && (
            <p
              className={`mt-2 text-center text-xs ${
                attempted ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
              }`}
            >
              Still needed:{' '}
              <span className="font-medium">{missing.join(', ')}</span>.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
