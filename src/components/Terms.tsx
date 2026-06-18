import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card } from './ui'
import { useStore } from '../lib/store'
import { isSetupComplete, TERMS_VERSION } from '../lib/types'

// One place for the Terms & disclaimer text, shown at first-run setup (with
// the acceptance tick) and on the standalone /terms page from Settings.
// Plain-English and deliberately conservative — it is NOT legal advice and
// should be reviewed by a solicitor before relying on it commercially.
export function TermsContent() {
  return (
    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
      <Section title="What RefrigHandle is">
        RefrigHandle is a tool that helps you record and track refrigerant
        handling and keep your own compliance records. It is{' '}
        <strong>not a record-keeping service</strong> — you must keep your own
        copy of your records and must not rely on RefrigHandle to retain them
        for you. To provide the app we hold and process your data: it is stored
        on your device, and copies may be held on our servers and on any other
        devices you connect (for example via sync). Even so, keeping your own
        backups is your responsibility — if you lose your device or your records
        without a backup, they may be gone.
      </Section>
      <Section title="Your responsibilities">
        You are responsible for the accuracy of what you enter, for keeping
        your own backups, and for meeting all of your legal obligations. That
        includes retaining your refrigerant-handling records under the Ozone
        Protection and Synthetic Greenhouse Gas Management Regulations 1995 (the
        ARC / ARCtick scheme), and your business and financial records under the
        Australian Taxation Office (ATO) and, if you trade as a company, ASIC
        under the Corporations Act 2001 — for the period the law requires
        (generally 5 years, or 7 years for companies).
      </Section>
      <Section title="No legal or compliance advice">
        RefrigHandle does not provide legal, tax, or compliance advice. The
        guidance, alerts, and figures it shows are general information only. If
        you are unsure what applies to you, check with the ATO, the ARC, ASIC,
        or your own adviser.
      </Section>
      <Section title="Provided “as is”">
        The app is provided on an “as is” basis without warranties of any kind.
        To the extent permitted by law, RefrigHandle and its makers are not
        liable for any loss or damage — including lost data or any failure to
        meet a legal or regulatory obligation — arising from your use of, or
        reliance on, the app. Nothing here limits any rights you have under the
        Australian Consumer Law that cannot lawfully be excluded.
      </Section>
      <Section title="Closing your account">
        You can request account closure at any time. Before you close, you must
        export and keep your own full copy of your records; once your account is
        closed, RefrigHandle no longer holds or is responsible for them, and you
        remain responsible for retaining them for the required period.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <p className="mt-0.5">{children}</p>
    </div>
  )
}

// After setup, if the Terms differ from the version the user last accepted
// (or they predate the Terms entirely), require re-acceptance before the
// app can be used. Versions are lettered strings (e.g. 'v1.1b'), so we
// re-prompt on any change rather than comparing order. First acceptance is
// handled in onboarding.
export function TermsGate({ children }: { children: ReactNode }) {
  const { state } = useStore()
  if (
    isSetupComplete(state) &&
    state.termsAcceptedVersion !== TERMS_VERSION
  ) {
    return <TermsAcceptScreen />
  }
  return <>{children}</>
}

function TermsAcceptScreen() {
  const { acceptTerms } = useStore()
  const [agree, setAgree] = useState(false)
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
            Updated terms
          </p>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5">
        <p className="px-1 text-sm text-slate-600 dark:text-slate-400">
          Our Terms &amp; disclaimer have been updated. Please read and accept
          them to keep using the app.
        </p>
        <Card>
          <TermsContent />
        </Card>
        <Card>
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>I have read and agree to the updated Terms &amp; disclaimer.</span>
          </label>
          <div className="mt-3">
            <Button full disabled={!agree} onClick={acceptTerms}>
              Agree and continue
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}

// Standalone page reached from Settings, so users can re-read after setup.
export default function TermsPage() {
  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Settings
      </Link>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Terms &amp; disclaimer
      </h2>
      <Card>
        <TermsContent />
      </Card>
    </div>
  )
}
