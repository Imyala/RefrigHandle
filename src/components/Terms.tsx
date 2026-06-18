import { Link } from 'react-router-dom'
import { Card } from './ui'

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
        <strong>not a record-keeping service</strong>, and it does not store or
        retain your records on your behalf. Your data lives on your device (and
        on any devices you connect via optional sync) — if you lose the device
        or clear its data without a backup, the records are gone.
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
        You can request account closure at any time. On closure the app exports
        a full copy of your records for you to keep; after that, RefrigHandle no
        longer holds or is responsible for them, and you remain responsible for
        retaining them for the required period.
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </div>
      <p className="mt-0.5">{children}</p>
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
