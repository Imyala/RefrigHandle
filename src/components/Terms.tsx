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
        RefrigHandle is designed to assist with recording and tracking
        refrigerant activities. It is{' '}
        <strong>not a record-keeping service</strong>. Users are responsible for
        maintaining their own records and backups and should not rely solely on
        RefrigHandle for statutory record retention. Data loss can occur despite
        reasonable safeguards, and users are responsible for maintaining their
        own backups.
      </Section>
      <Section title="Your responsibilities">
        You are responsible for the accuracy of what you enter, for keeping your
        own backups, and for meeting all of your legal obligations. Users are
        responsible for retaining records for the period required under
        applicable ARC, ATO, ASIC and other relevant legislation.
      </Section>
      <Section title="No legal or compliance advice">
        Information provided by RefrigHandle is general in nature and should not
        be relied upon as legal, taxation or compliance advice. If you are
        unsure what applies to you, check with the ATO, the ARC, ASIC, or your
        own adviser.
      </Section>
      <Section title="Provided “as is”">
        The app is provided on an “as is” basis without warranties of any kind.
        To the extent permitted by law, RefrigHandle and its operators exclude
        liability for indirect, incidental or consequential loss arising from
        the use of the app. Nothing in these terms excludes rights that cannot
        lawfully be excluded under the Australian Consumer Law.
      </Section>
      <Section title="Privacy">
        RefrigHandle’s collection, storage and processing of personal
        information is governed by the Privacy Policy.
      </Section>
      <Section title="Closing your account">
        You may request account closure at any time. Before doing so, you should
        export and retain copies of all records you wish to keep. Users remain
        responsible for complying with any statutory record retention
        obligations. RefrigHandle may delete account data after closure in
        accordance with its Privacy Policy and internal data retention
        practices.
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
