import { useEffect, useState } from 'react'
import { BackLink } from '../components/BackLink'
import { Button, Card, Field, TextArea, TextInput } from '../components/ui'
import { Picker } from '../components/Picker'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import { profileFor } from '../lib/compliance'

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
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  // Two separate confirmations: the legal duty to retain, and that the user
  // has their own copy and accepts the on-device erase.
  const [ackRetention, setAckRetention] = useState(false)
  const [ackBackup, setAckBackup] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)

  const reasonLabel = REASONS.find((r) => r.value === reason)?.label ?? ''
  // Only a name (stamped onto the closure record the business keeps) and a
  // reason. Deliberately NO email/phone: closure is an on-device action —
  // nothing is transmitted and nobody contacts you about it, so collecting
  // contact details here would be collecting them under a false promise.
  const contactOk = contactName.trim() !== ''
  const reasonOk =
    reason !== '' && (reason !== 'other' || details.trim() !== '')
  const canSubmit = contactOk && reasonOk && ackRetention && ackBackup

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
      message: `This closes the account and signs you out, and a few minutes later this device is erased back to a clean slate. A copy of your records (full backup + audit-log CSV) downloaded when you opened this page — keep it safe; it becomes your only copy. If your business uses the optional cloud sync, also delete the team's row in your own Supabase project (see the sync notes) and close the account on each device.`,
      confirmLabel: 'Close account',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    // Closure is entirely on-device: it writes a closure record (shown on
    // the closed screen for the business to print/keep), locks the app,
    // and the device later resets to a clean slate. Nothing is transmitted.
    requestAccountClosure({
      reason: reasonLabel,
      details,
      contactName,
    })
    toast.show('Account closed', 'info')
    // The AccountClosedGate takes over on the next render and replaces the
    // whole app, so there's nothing more to do here.
  }

  return (
    <div className="space-y-4">
      <BackLink>← Back to Settings</BackLink>

      <div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Close account &amp; erase this device
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Closing happens right here on the device — nothing is sent to
          anyone. Confirm the details below to close the account.
        </p>
      </div>

      <Card className="!border-amber-300 !bg-amber-50 dark:!border-amber-900/50 dark:!bg-amber-900/20">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Before you request closure
        </div>
        <div className="mt-1 space-y-2 text-sm text-amber-900/80 dark:text-amber-100/80">
          <p>
            This closes your account, signs you out, and — a few minutes
            later — erases the app's data from this device.
          </p>
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
            Closing the account erases the app's data <strong>from this
            device</strong> a few minutes after closure. RefrigHandle holds no
            server copy of your data. If your business enabled the optional
            self-hosted cloud sync, the synced copy lives in your own Supabase
            project — delete that row yourself (the sync notes show how), and
            close the account on each device your business used.
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
          Who is closing the account
        </div>
        <div className="space-y-3">
          <Field
            label="Closed by *"
            error={fieldErr(!contactOk, 'Enter your name.')}
            hint="Stamped on the closure record you keep — nothing is sent anywhere."
          >
            <TextInput
              value={contactName}
              invalid={!!fieldErr(!contactOk, 'x')}
              onChange={(ev) => setContactName(ev.target.value)}
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
              Regulations, as amended (the ARC / ARCtick scheme), and my business and
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
