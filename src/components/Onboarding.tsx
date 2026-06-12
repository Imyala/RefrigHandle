import { useState, type ReactNode } from 'react'
import { Button, Card, Field, TextInput } from './ui'
import { LocationFields } from './LocationFields'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import {
  isLocationComplete,
  isSetupComplete,
  isValidAbn,
  type LocationSettings,
} from '../lib/types'

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

  const [businessName, setBusinessName] = useState('')
  const [abn, setAbn] = useState('')
  const [arcAuth, setArcAuth] = useState('')
  const [techName, setTechName] = useState('')
  const [techRhl, setTechRhl] = useState('')
  const [loc, setLoc] = useState<LocationSettings>({
    country: '',
    region: '',
    city: '',
    timezone: '',
  })

  const businessOk = businessName.trim() !== ''
  const abnOk = isValidAbn(abn)
  const arcOk = arcAuth.trim() !== ''
  const techOk = techName.trim() !== '' && techRhl.trim() !== ''
  const locOk = isLocationComplete(loc)
  const canFinish = businessOk && abnOk && arcOk && techOk && locOk

  function finish() {
    if (!canFinish) return
    completeSetup({
      businessName,
      businessAbn: abn,
      arcAuthorisationNumber: arcAuth,
      technician: { name: techName, arcLicenceNumber: techRhl },
      location: loc,
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
            <p className="mb-3 text-xs text-slate-500">
              Your ARC Refrigerant Trading Authorisation (RTA) is issued to the
              business — look it up at{' '}
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
            <div className="space-y-3">
              <Field label="Trading / business name *">
                <TextInput
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Acme Refrigeration Pty Ltd"
                />
              </Field>
              <Field
                label="Business ABN *"
                hint={
                  abn.trim() !== '' && !abnOk
                    ? 'Must be a valid 11-digit ABN.'
                    : 'Your 11-digit Australian Business Number.'
                }
              >
                <TextInput
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 51 824 753 556"
                />
              </Field>
              <Field
                label="ARC Refrigerant Trading Authorisation (RTA) *"
                hint="Required to handle, buy or sell refrigerant."
              >
                <TextInput
                  value={arcAuth}
                  onChange={(e) => setArcAuth(e.target.value)}
                  placeholder="e.g. AU00000"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
              First technician
            </div>
            <p className="mb-3 text-xs text-slate-500">
              This profile becomes the active technician. Their name and ARC
              Refrigerant Handling Licence (RHL) are stamped onto each
              transaction they log. You can add more technicians later.
            </p>
            <div className="space-y-3">
              <Field label="Technician name *">
                <TextInput
                  value={techName}
                  onChange={(e) => setTechName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                />
              </Field>
              <Field
                label="ARC Refrigerant Handling Licence (RHL) *"
                hint="The technician's personal licence number."
              >
                <TextInput
                  value={techRhl}
                  onChange={(e) => setTechRhl(e.target.value)}
                  placeholder="e.g. L000000"
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
            <LocationFields loc={loc} setLoc={setLoc} />
          </Card>
        </div>
      </main>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto max-w-2xl">
          <Button full disabled={!canFinish} onClick={finish}>
            Finish setup
          </Button>
          {!canFinish && (
            <p className="mt-2 text-center text-xs text-slate-500">
              Fill in your business name, ABN, ARC RTA, technician (name +
              RHL) and location to continue.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
