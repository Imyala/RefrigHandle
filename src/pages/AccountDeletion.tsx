import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, TextArea, TextInput } from '../components/ui'
import { Picker } from '../components/Picker'
import { DateInput } from '../components/DateInput'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { profileFor } from '../lib/compliance'
import { formatDateTime } from '../lib/datetime'

// Common reasons, offered as a picker so the request is quick to fill and
// the responses stay consistent. "Other" reveals the free-text box.
const REASONS: { value: string; label: string }[] = [
  { value: 'ceased_trading', label: 'Closing / ceased trading' },
  { value: 'no_longer_handling', label: 'No longer handling refrigerant' },
  { value: 'switching', label: 'Switching to another system' },
  { value: 'duplicate', label: 'Created in error / duplicate account' },
  { value: 'privacy', label: 'Privacy / data concerns' },
  { value: 'other', label: 'Other (describe below)' },
]

// Account-deletion request. This is a local-first app with no central
// account server today, so "submitting" produces a dated, printable
// request the business keeps and sends to whoever administers their
// account. The retention notice is the important part: refrigerant and
// business records are legally held for 5 years before anything is
// destroyed.
export default function AccountDeletion() {
  const { state } = useStore()
  const toast = useToast()
  const profile = profileFor(state.jurisdiction)

  const activeTech = state.technicians.find(
    (t) => t.id === state.activeTechnicianId,
  )

  const [business, setBusiness] = useState(state.businessName)
  const [abn, setAbn] = useState(state.businessAbn)
  const [rta, setRta] = useState(state.arcAuthorisationNumber)
  const [contactName, setContactName] = useState(activeTech?.name ?? '')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [ack, setAck] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)

  const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? ''
  const businessOk = business.trim() !== ''
  const contactOk = contactName.trim() !== ''
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const reasonOk =
    reason !== '' && (reason !== 'other' || details.trim() !== '')
  const canSubmit = businessOk && contactOk && emailOk && reasonOk && ack

  const e = (show: boolean, msg: string) =>
    attempted && show ? msg : undefined

  function submit() {
    if (!canSubmit) {
      setAttempted(true)
      return
    }
    setSubmittedAt(new Date().toISOString())
    toast.show('Deletion request prepared', 'success')
    // Scroll to top so the confirmation/printable summary is in view.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // --- Confirmation / printable request --------------------------------
  if (submittedAt) {
    const tz = state.location.timezone
    const stamp = formatDateTime(submittedAt, tz, state.clock, true)
    return (
      <div className="space-y-4">
        <BackLink />
        <Card className="!border-emerald-300 !bg-emerald-50 dark:!border-emerald-900/50 dark:!bg-emerald-900/20">
          <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
            Request prepared
          </div>
          <p className="mt-1 text-sm text-emerald-900/80 dark:text-emerald-100/80">
            Print or save this page as a PDF for your records, then send it to
            whoever administers your account. Keep a copy — it's part of your
            paper trail.
          </p>
        </Card>

        <Card>
          <div className="mb-2 text-base font-bold text-slate-900 dark:text-slate-100">
            Account deletion request
          </div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Requested" value={stamp} />
            <Row label="Business" value={business} />
            {abn.trim() && <Row label={profile.businessNumberShort} value={abn} />}
            {rta.trim() && (
              <Row label={profile.businessAuthShort} value={rta} />
            )}
            <Row label="Contact" value={contactName} />
            <Row label="Email" value={email} />
            {phone.trim() && <Row label="Phone" value={phone} />}
            <Row label="Reason" value={reasonLabel} />
            {details.trim() && <Row label="Details" value={details} />}
            {preferredDate && (
              <Row label="Preferred closure" value={preferredDate} />
            )}
          </dl>
          <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
            <strong>Retention notice:</strong> refrigerant handling and business
            records are retained for <strong>5 years</strong> as required by the
            Australian Taxation Office and the Ozone Protection and Synthetic
            Greenhouse Gas Management Regulations 1995. The account is closed on
            request, but these records are only destroyed after that period.
          </p>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => window.print()}>Print / Save PDF</Button>
          <Button variant="secondary" onClick={() => setSubmittedAt(null)}>
            Edit request
          </Button>
        </div>
      </div>
    )
  }

  // --- The form ---------------------------------------------------------
  return (
    <div className="space-y-4">
      <BackLink />

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Request account deletion
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Use this to request closure of your account. Fill in the details
          below and we'll prepare a dated request you can keep and send on.
        </p>
      </div>

      <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Before you request deletion
        </div>
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
          By law your refrigerant and business records must be kept for{' '}
          <strong>5 years</strong> — required by the ATO and the Ozone
          Protection and Synthetic Greenhouse Gas Management Regulations 1995.
          Closing the account does not delete those records before then. Export
          a full backup (Settings → Backup &amp; export) first if you want your
          own copy.
        </p>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Business
        </div>
        <div className="space-y-3">
          <Field label="Business name *" error={e(!businessOk, 'Enter your business name.')}>
            <TextInput
              value={business}
              invalid={!!e(!businessOk, 'x')}
              onChange={(ev) => setBusiness(ev.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={profile.businessNumberShort}>
              <TextInput
                value={abn}
                inputMode="numeric"
                onChange={(ev) => setAbn(ev.target.value)}
              />
            </Field>
            {profile.hasBusinessAuthorisation && (
              <Field label={profile.businessAuthShort}>
                <TextInput value={rta} onChange={(ev) => setRta(ev.target.value)} />
              </Field>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Contact
        </div>
        <div className="space-y-3">
          <Field label="Contact name *" error={e(!contactOk, 'Enter a contact name.')}>
            <TextInput
              value={contactName}
              invalid={!!e(!contactOk, 'x')}
              onChange={(ev) => setContactName(ev.target.value)}
            />
          </Field>
          <Field
            label="Email *"
            error={e(!emailOk, 'Enter a valid email address.')}
          >
            <TextInput
              type="email"
              inputMode="email"
              value={email}
              invalid={!!e(!emailOk, 'x')}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="e.g. you@business.com.au"
            />
          </Field>
          <Field label="Phone">
            <TextInput
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(ev) => setPhone(ev.target.value)}
              placeholder="e.g. 0400 000 000"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Reason
        </div>
        <div className="space-y-3">
          <Field
            label="Reason for deletion *"
            error={e(reason === '', 'Pick a reason.')}
          >
            <Picker
              title="Reason for deletion"
              value={reason}
              invalid={!!e(reason === '', 'x')}
              onChange={setReason}
              placeholder="— pick a reason —"
              options={REASONS}
            />
          </Field>
          <Field
            label={reason === 'other' ? 'Details *' : 'Details'}
            error={e(
              reason === 'other' && details.trim() === '',
              'Add a short description.',
            )}
            hint="Anything that helps us process the request."
          >
            <TextArea
              value={details}
              invalid={!!e(reason === 'other' && details.trim() === '', 'x')}
              onChange={(ev) => setDetails(ev.target.value)}
            />
          </Field>
          <Field label="Preferred closure date" hint="Optional.">
            <DateInput
              value={preferredDate}
              onChange={setPreferredDate}
              ariaLabel="Preferred closure date"
            />
          </Field>
        </div>
      </Card>

      <Card>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand-600"
            checked={ack}
            onChange={(ev) => setAck(ev.target.checked)}
          />
          <span>
            I understand my refrigerant and business records will be retained
            for <strong>5 years</strong> as required by the ATO and the Ozone
            Protection and Synthetic Greenhouse Gas Management Regulations 1995,
            and will only be destroyed after that period.
          </span>
        </label>
        {attempted && !ack && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            Please acknowledge the retention requirement to continue.
          </p>
        )}
      </Card>

      <Button full onClick={submit}>
        Prepare deletion request
      </Button>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/settings"
      className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
    >
      ← Back to Settings
    </Link>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-32 shrink-0 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-slate-700 dark:text-slate-300">
        {value}
      </dd>
    </div>
  )
}
