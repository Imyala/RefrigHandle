import { useRef, useState } from 'react'
import { Button, Field, Modal, TextInput } from './ui'
import { verifyPassword } from '../lib/auth'
import type { Technician } from '../lib/types'

// Soft-lock prompt for switching the active technician on a shared
// device. Caller is responsible for the actual setActiveTechnicianId
// call inside onVerified — keeps this component policy-free.
export function PasswordPromptModal({
  tech,
  onClose,
  onVerified,
}: {
  tech: Technician | null
  onClose: () => void
  onVerified: (t: Technician) => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const open = !!tech
  const [seenId, setSeenId] = useState('')
  // Track the live prop inside async work — closures capture the value at
  // submit time, so without this a Cancel (or tech swap) mid-verify would
  // still flow through to onVerified once the hash resolves.
  const techRef = useRef(tech)
  techRef.current = tech
  if (open && tech && seenId !== tech.id) {
    setSeenId(tech.id)
    setPassword('')
    setError('')
  }
  if (!open && seenId !== '') {
    setSeenId('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!tech || busy) return
    setError('')
    const submittedTech = tech
    if (!submittedTech.passwordHash) {
      onVerified(submittedTech)
      return
    }
    setBusy(true)
    const ok = await verifyPassword(password, submittedTech.passwordHash)
    setBusy(false)
    if (techRef.current?.id !== submittedTech.id) return
    if (!ok) {
      setError('Wrong password.')
      setPassword('')
      return
    }
    onVerified(submittedTech)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tech ? `Switch to ${tech.name}` : ''}
    >
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-500">
          Enter {tech?.name}’s password to make them the active tech on this
          device.
        </p>
        <Field label="Password">
          <TextInput
            type="password"
            autoFocus
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
        </Field>
        {error && (
          <div className="text-xs text-red-600 dark:text-red-400">{error}</div>
        )}
        <div className="flex gap-2">
          <Button type="submit" full disabled={busy || !password}>
            {busy ? 'Checking…' : 'Switch'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Modal>
  )
}
