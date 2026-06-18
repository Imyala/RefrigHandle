import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Field, TextArea, TextInput } from '../components/ui'
import { Picker } from '../components/Picker'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { profileFor } from '../lib/compliance'
import { downloadRecordsZip } from '../lib/backup'
import { businessStructureLabel, retentionSummary } from '../lib/types'

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

// Account-closure request. Business identity is pulled from the account
// (read-only) and the requester is pre-filled from the active profile. On
// submit the account is closed and the app locks (AccountClosedGate).
export default function AccountDeletion() {
  const { state, requestAccountClosure } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const profile = profileFor(state.jurisdiction)

  // This page is reached from the bottom of a long Settings page — make
  // sure we land at the top, not wherever Settings was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  const activeTech = state.technicians.find(
    (t) => t.id === state.activeTechnicianId,
  )
  const retention = retentionSummary(state.businessStructure)

  const [contactName, setContactName] = useState(activeTech?.name ?? '')
  const [email, setEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [ack, setAck] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)

  const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? ''
  const contactOk = contactName.trim() !== ''
  // A contact email is required so the closure can be confirmed, and it's
  // entered twice to catch a typo on something we can't easily fix later.
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())
  const emailsMatch =
    email.trim() !== '' && email.trim() === confirmEmail.trim()
  const reasonOk =
    reason !== '' && (reason !== 'other' || details.trim() !== '')
  const canSubmit = contactOk && emailOk && emailsMatch && reasonOk && ack

  const fieldErr = (show: boolean, msg: string) =>
    attempted && show ? msg : undefined

  async function submit() {
    if (busy) return
    if (!canSubmit) {
      setAttempted(true)
      return
    }
    const ok = await confirm({
      title: 'Close this account?',
      message: `This closes the account and locks the app on this device — you'll be logged out and won't be able to get back in (reactivation means contacting us directly). First we'll download a ZIP of all your records (full backup + audit-log CSV) and open an email with your request, so you keep everything for the ${retention} you must retain it.`,
      confirmLabel: 'Close account',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    // Hand the business its records BEFORE locking: one ZIP holding the
    // complete JSON backup (every bottle, site, unit, transaction,
    // technician, the change log, and photos/signatures) and the
    // auditor-readable CSV log — what must legally be retained for 5–7 years.
    try {
      await downloadRecordsZip(state)
    } catch {
      toast.show('Could not generate the records file — try again.', 'error')
      setBusy(false)
      return
    }
    // Open the user's email app with the closure request pre-filled.
    const mailto = `mailto:?subject=${encodeURIComponent(
      `Account closure request — ${state.businessName || 'RefrigHandle'}`,
    )}&body=${encodeURIComponent(closureEmailBody())}`
    const mail = document.createElement('a')
    mail.href = mailto
    mail.click()

    requestAccountClosure({
      reason: reasonLabel,
      details,
      contactName,
      contactEmail: email,
      contactPhone: phone,
    })
    toast.show('Account closed — records downloaded', 'info')
    // The AccountClosedGate takes over on the next render and replaces the
    // whole app, so there's nothing more to do here.
  }

  function closureEmailBody(): string {
    return [
      'ACCOUNT CLOSURE REQUEST',
      '',
      `Business: ${state.businessName || '—'}`,
      state.businessAbn ? `${profile.businessNumberShort}: ${state.businessAbn}` : '',
      state.arcAuthorisationNumber
        ? `${profile.businessAuthShort}: ${state.arcAuthorisationNumber}`
        : '',
      `Contact: ${contactName}`,
      email ? `Email: ${email}` : '',
      phone ? `Phone: ${phone}` : '',
      `Reason: ${reasonLabel}`,
      details.trim() ? `Details: ${details.trim()}` : '',
      '',
      'A full backup and audit-log CSV were exported at closure and retained by the business.',
    ]
      .filter(Boolean)
      .join('\n')
  }

  return (
    <div className="space-y-4">
      <Link
        to="/settings"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to Settings
      </Link>

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Request account deletion
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Confirm your details below to request closure of your account.
        </p>
      </div>

      <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Before you request closure
        </div>
        <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
          Submitting <strong>closes the account and locks this device</strong> —
          you'll be logged out and won't be able to get back in. To reactivate
          you'll need to contact us directly.
        </p>
        <p className="mt-2 text-sm text-amber-900/80 dark:text-amber-100/80">
          By law your refrigerant and business records must be kept for{' '}
          <strong>{retention}</strong>. When you submit, the app{' '}
          <strong>automatically downloads a ZIP of all your records</strong>{' '}
          (full backup + audit-log CSV) and opens an email with your request —
          keep that file safe for the whole retention period.
        </p>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Business (from your account)
        </div>
        <dl className="space-y-1.5 text-sm">
          <Row label="Business" value={state.businessName || '—'} />
          <Row
            label={profile.businessNumberShort}
            value={state.businessAbn || '—'}
          />
          {profile.hasBusinessAuthorisation && (
            <Row
              label={profile.businessAuthShort}
              value={state.arcAuthorisationNumber || '—'}
            />
          )}
          <Row
            label="Structure"
            value={businessStructureLabel(state.businessStructure) || '—'}
          />
        </dl>
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Contact
        </div>
        <div className="space-y-3">
          <Field
            label="Contact name *"
            error={fieldErr(!contactOk, 'Enter a contact name.')}
            hint="Pre-filled from the profile you're signed in as."
          >
            <TextInput
              value={contactName}
              invalid={!!fieldErr(!contactOk, 'x')}
              onChange={(ev) => setContactName(ev.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Email *"
              error={fieldErr(!emailOk, 'Enter a valid email address.')}
              hint="We use this to confirm the closure."
            >
              <TextInput
                type="email"
                inputMode="email"
                value={email}
                invalid={!!fieldErr(!emailOk, 'x')}
                onChange={(ev) => setEmail(ev.target.value)}
                placeholder="e.g. you@business.com.au"
              />
            </Field>
            <Field
              label="Confirm email *"
              error={fieldErr(emailOk && !emailsMatch, 'Emails don’t match.')}
            >
              <TextInput
                type="email"
                inputMode="email"
                value={confirmEmail}
                invalid={!!fieldErr(emailOk && !emailsMatch, 'x')}
                onChange={(ev) => setConfirmEmail(ev.target.value)}
                placeholder="Re-enter email"
              />
            </Field>
          </div>
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
            label="Reason for closure *"
            error={fieldErr(reason === '', 'Pick a reason.')}
          >
            <Picker
              title="Reason for closure"
              value={reason}
              invalid={!!fieldErr(reason === '', 'x')}
              onChange={setReason}
              placeholder="— pick a reason —"
              options={REASONS}
            />
          </Field>
          <Field
            label={reason === 'other' ? 'Details *' : 'Details'}
            error={fieldErr(
              reason === 'other' && details.trim() === '',
              'Add a short description.',
            )}
            hint="Anything that helps us process the request."
          >
            <TextArea
              value={details}
              invalid={!!fieldErr(reason === 'other' && details.trim() === '', 'x')}
              onChange={(ev) => setDetails(ev.target.value)}
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
            I understand this closes and locks the account, that I'll need to
            contact us to reactivate it, and that my records are retained for{' '}
            {retention} before they can be destroyed.
          </span>
        </label>
        {attempted && !ack && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            Please acknowledge to continue.
          </p>
        )}
      </Card>

      <Button full variant="danger" disabled={busy} onClick={submit}>
        {busy ? 'Closing…' : 'Submit & close account'}
      </Button>
    </div>
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
