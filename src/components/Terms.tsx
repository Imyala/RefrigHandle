import { useState, type ReactNode } from 'react'
import { BackLink } from './BackLink'
import { Button, Card, Modal } from './ui'
import { useStore } from '../lib/store'
import { isSetupComplete, TERMS_VERSION } from '../lib/types'
import { PrivacyContent } from './Privacy'
import { AcceptableUseContent } from './AcceptableUse'
import { BillingRefundContent } from './BillingRefund'
import { DataRetentionContent } from './DataRetention'
import { SecurityContent } from './Security'
import { DisclaimerContent } from './Disclaimer'
import { CopyrightContent } from './Copyright'

// The policies that form part of the Terms. Each is rendered inline in a
// modal so they are readable everywhere the Terms appear — including the
// first-run setup and the re-acceptance gate, which both sit OUTSIDE the
// router and so can't link to the standalone /privacy etc. pages.
const RELATED_POLICIES: readonly { title: string; Content: () => ReactNode }[] =
  [
    { title: 'Privacy Policy', Content: PrivacyContent },
    { title: 'Acceptable Use Policy', Content: AcceptableUseContent },
    { title: 'Billing and Refund Policy', Content: BillingRefundContent },
    { title: 'Data Retention and Deletion Policy', Content: DataRetentionContent },
    {
      title: 'Security and Responsible Disclosure Policy',
      Content: SecurityContent,
    },
    {
      title: 'Website and General Information Disclaimer',
      Content: DisclaimerContent,
    },
    { title: 'Copyright and Trademark Policy', Content: CopyrightContent },
  ]

// Effective date shown at the top of the Terms. Update this whenever the
// text materially changes so the published date stays accurate.
const EFFECTIVE_DATE = '18 June 2026'

// One place for the Terms of Use text, shown at first-run setup (with the
// acceptance tick) and on the standalone /terms page from Settings.
// Plain-English and deliberately conservative — it is NOT legal advice and
// should be reviewed by a solicitor before relying on it commercially.
export function TermsContent() {
  // Which related policy is open in the modal (index into RELATED_POLICIES),
  // or null when none is open.
  const [openPolicy, setOpenPolicy] = useState<number | null>(null)
  const active = openPolicy != null ? RELATED_POLICIES[openPolicy] : null
  return (
    <div className="space-y-3 text-sm text-slate-700 dark:text-slate-300">
      <p className="text-xs text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <Section title="What RefrigHandle is">
        RefrigHandle is designed to assist with recording and tracking
        refrigerant activities. It is{' '}
        <strong>not a record-keeping service</strong>. Users are responsible for
        maintaining their own records and backups and should not rely solely on
        RefrigHandle for statutory record retention. Data loss can occur despite
        reasonable safeguards, and users are responsible for maintaining their
        own backups.
      </Section>
      <Section title="Definitions">
        <p>
          <strong>Services</strong> means the RefrigHandle platform,
          applications, website and related services.
        </p>
        <p>
          <strong>Account Owner</strong> means the business, company, sole
          trader, partnership, trust, government entity or other organisation
          that has registered for RefrigHandle.
        </p>
        <p>
          <strong>Authorised User</strong> means an employee, contractor or
          other person granted access to an Account by the Account Owner.
        </p>
        <p>
          <strong>Business Data</strong> means information entered into
          RefrigHandle, including customer records, site records, refrigerant
          records, cylinder records, audit logs, technician information, notes
          and attachments.
        </p>
      </Section>
      <Section title="Your responsibilities">
        You are responsible for the accuracy of what you enter, for keeping your
        own backups, and for meeting all of your legal and regulatory
        obligations.
      </Section>
      <Section title="Record retention requirements">
        You are responsible for retaining your own records for the period
        required by applicable laws and regulations. Retention periods vary
        depending on your circumstances and may include requirements from the
        Australian Taxation Office (ATO), the Australian Refrigeration Council
        (ARC/ARCtick), ASIC and other authorities. If you are unsure, seek
        advice from the relevant authority or your own adviser.
      </Section>
      <Section title="Licence information">
        RefrigHandle does not verify Refrigerant Handling Licence numbers or the
        identity of users. Users and businesses are solely responsible for
        ensuring that all licence information entered into the platform is
        accurate, current, and compliant with applicable laws and regulations.
        RefrigHandle relies on information provided by users and makes no
        representation regarding the validity of any licence.
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
        You may request account closure at any time. Before closing your
        account, export and securely retain your own copies of all records —
        RefrigHandle should not be relied upon as your sole archive or backup
        system. Once an account is closed, access may no longer be available,
        and any future reactivation requests will be considered at
        RefrigHandle’s discretion. Account data may be deleted after closure in
        accordance with RefrigHandle’s Privacy Policy and internal data
        retention practices.
      </Section>
      <Section title="Related policies">
        <p>
          The following policies form part of these Terms of Use and apply to
          your use of the Services. Tap any policy to read it:
        </p>
        <ul className="space-y-1">
          {RELATED_POLICIES.map((p, i) => (
            <li key={p.title}>
              <button
                type="button"
                onClick={() => setOpenPolicy(i)}
                className="text-left font-medium text-brand-600 underline decoration-brand-600/40 underline-offset-2 hover:decoration-brand-600 dark:text-brand-400"
              >
                {p.title}
              </button>
            </li>
          ))}
        </ul>
      </Section>

      {/* Inline policy reader. Modal portals to <body>, so this works even
          on the first-run / re-acceptance screens that render outside the
          app router. */}
      <Modal
        open={active != null}
        title={active?.title ?? ''}
        size="lg"
        onClose={() => setOpenPolicy(null)}
      >
        {active && <active.Content />}
        <div className="mt-4">
          <Button full variant="secondary" onClick={() => setOpenPolicy(null)}>
            Close
          </Button>
        </div>
      </Modal>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <div className="mt-0.5 space-y-2">{children}</div>
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
          Our Terms of Use have been updated. Please read and accept them to
          keep using the app.
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
            <span>I have read and agree to the updated Terms of Use.</span>
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
      <BackLink>← Back to Settings</BackLink>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Terms of Use
      </h2>
      <Card>
        <TermsContent />
      </Card>
    </div>
  )
}
