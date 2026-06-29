import { useEffect, useState } from 'react'
import { BackLink } from '../components/BackLink'
import { Button, Card, Field, TextArea, TextInput } from '../components/ui'
import { Picker } from '../components/Picker'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { profileFor } from '../lib/compliance'
import { canEditCompanyIdentity, roleInfo } from '../lib/types'

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

  const [contactName, setContactName] = useState(activeTech?.name ?? '')
  const [email, setEmail] = useState('')
  const [confirmEmail, setConfirmEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  // Two separate confirmations: the legal duty to retain, and that the user
  // has their own copy and accepts we stop holding their records on closure.
  const [ackRetention, setAckRetention] = useState(false)
  const [ackBackup, setAckBackup] = useState(false)
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
  // Phone is required so the closure can also be confirmed by phone.
  const phoneOk = phone.trim() !== ''
  const canSubmit =
    contactOk &&
    emailOk &&
    emailsMatch &&
    phoneOk &&
    reasonOk &&
    ackRetention &&
    ackBackup

  const fieldErr = (show: boolean, msg: string) =>
    attempted && show ? msg : undefined

  async function submit() {
    if (busy) return
    if (!canSubmit) {
      setAttempted(true)
      return
    }
    // The records ZIP already downloaded when this page was opened (from
    // the "Request deletion of account" link). Saving and retaining it is
    // the user's responsibility; we don't re-download here.
    const ok = await confirm({
      title: 'Close this account?',
      message: `This closes your account and signs you out. A copy of your records (full backup + audit-log CSV) downloaded when you opened this page — export and securely retain your own copy; RefrigHandle should not be relied upon as your sole archive. Once closed, access may no longer be available, and account data may be deleted in accordance with RefrigHandle's Privacy Policy and internal data retention practices.`,
      confirmLabel: 'Close account',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    // No email is sent or opened — the closure is recorded in the account
    // and we're notified through our own systems; the business doesn't need
    // to email us.
    requestAccountClosure({
      reason: reasonLabel,
      details,
      contactName,
      contactEmail: email,
      contactPhone: phone,
    })
    toast.show('Account closed', 'info')
    // The AccountClosedGate takes over on the next render and replaces the
    // whole app, so there's nothing more to do here.
  }

  // Closing the whole business account is reserved for owner / supervisor —
  // the people who hold the regulatory relationship. The store enforces this
  // too; this guard keeps a lower role from ever seeing the form.
  if (!canEditCompanyIdentity(activeTech?.role)) {
    return (
      <div className="space-y-4">
        <BackLink>← Back to Settings</BackLink>
        <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
          <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            Owner or supervisor only
          </div>
          <p className="mt-1 text-sm text-amber-900/80 dark:text-amber-100/80">
            Closing the business account can only be requested by a business
            owner or supervisor. You’re signed in as{' '}
            {roleInfo(activeTech?.role).label}. Ask an owner or supervisor to
            make this request.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BackLink>← Back to Settings</BackLink>

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
        <div className="mt-1 space-y-2 text-sm text-amber-900/80 dark:text-amber-100/80">
          <p>Submitting this request will close your account and sign you out.</p>
          <p>
            <strong>
              Before closing your account, export and securely retain your own
              copies of all records.
            </strong>{' '}
            RefrigHandle should not be relied upon as your sole archive or
            backup system. A copy of your records (a full backup plus the
            audit-log CSV) downloaded to this device when you opened this page —
            save the file somewhere safe.
          </p>
          <p>
            You are responsible for retaining records for the period required
            under applicable laws and regulations. Requirements may vary
            depending on your circumstances and may include obligations under
            the ATO, ARC/ARCtick, ASIC and other legislation.
          </p>
          <p>
            If you are unsure which requirements apply, seek advice from the
            relevant authority or your own adviser.
          </p>
          <p>
            Once an account is closed, access may no longer be available.
            Account data may be deleted in accordance with RefrigHandle’s
            Privacy Policy and internal data retention practices.
          </p>
        </div>
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
          <Field
            label="Phone *"
            error={fieldErr(!phoneOk, 'Enter a contact phone number.')}
            hint="We use this to confirm the closure."
          >
            <TextInput
              type="tel"
              inputMode="tel"
              value={phone}
              invalid={!!fieldErr(!phoneOk, 'x')}
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
            hint={
              reason === 'other'
                ? 'Required — describe your reason for closure.'
                : 'Optional — anything you’d like to add about your request.'
            }
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
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={ackRetention}
              onChange={(ev) => setAckRetention(ev.target.checked)}
            />
            <span>
              I understand that keeping my records for the legally required
              period is my own responsibility — my refrigerant-handling records
              under the Ozone Protection and Synthetic Greenhouse Gas Management
              Regulations 1995 (the ARC / ARCtick scheme), and my business and
              financial records under the Australian Taxation Office (ATO) and,
              if I trade as a company, ASIC under the Corporations Act 2001.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-brand-600"
              checked={ackBackup}
              onChange={(ev) => setAckBackup(ev.target.checked)}
            />
            <span>
              I confirm I have downloaded or backed up all my records, and
              accept that once my account is closed RefrigHandle no longer
              holds, keeps, or is responsible for them, and is not responsible
              for my compliance with the laws above.
            </span>
          </label>
        </div>
        {attempted && (!ackRetention || !ackBackup) && (
          <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400">
            Please tick both boxes to continue.
          </p>
        )}
        <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800">
          RefrigHandle is a record-keeping tool, not a record-keeping service
          or a provider of legal or compliance advice. Meeting your retention
          and reporting obligations is your responsibility — if you're unsure
          what applies to you, check with the ATO, the ARC, ASIC, or your own
          adviser.
        </p>
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
