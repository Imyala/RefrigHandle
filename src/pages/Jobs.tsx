import { useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  TextArea,
  TextInput,
} from '../components/ui'
import { useStore } from '../lib/store'
import type { Job } from '../lib/types'
import { netWeight } from '../lib/types'
import { useToast } from '../lib/toast'
import { formatWeight, kgToDisplay } from '../lib/units'

export default function Jobs() {
  const { state, addJob, updateJob, deleteJob } = useStore()
  const { jobs, bottles, transactions, unit } = state
  const toast = useToast()

  const [editing, setEditing] = useState<Job | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Jobs
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add job</Button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          body="Add the sites or clients where bottles get used so you can track charges per job."
          action={<Button onClick={() => setAdding(true)}>+ Add job</Button>}
        />
      ) : (
        <div className="space-y-2">
          {jobs
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((j) => {
              const onJob = bottles.filter((b) => b.currentJobId === j.id)
              const charged = transactions
                .filter((t) => t.jobId === j.id && t.kind === 'charge')
                .reduce((s, t) => s + t.amount, 0)
              const recovered = transactions
                .filter((t) => t.jobId === j.id && t.kind === 'recover')
                .reduce((s, t) => s + t.amount, 0)
              return (
                <Card key={j.id} className="!p-3">
                  <button
                    className="w-full text-left"
                    onClick={() => setEditing(j)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {j.name}
                        </div>
                        {j.client && (
                          <div className="text-sm text-slate-500">{j.client}</div>
                        )}
                        {j.address && (
                          <div className="truncate text-xs text-slate-500">
                            {j.address}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-slate-400" aria-hidden>
                        ›
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <Stat value={onJob.length} label="on job" />
                      <Stat value={formatWeight(charged, unit)} label="charged" />
                      <Stat
                        value={formatWeight(recovered, unit)}
                        label="recovered"
                      />
                    </div>
                    {onJob.length > 0 && (
                      <div className="mt-2 text-xs text-slate-500">
                        Bottles here:{' '}
                        {onJob
                          .map(
                            (b) =>
                              `${b.bottleNumber} (${kgToDisplay(netWeight(b), unit).toFixed(1)} ${unit} ${b.refrigerantType})`,
                          )
                          .join(', ')}
                      </div>
                    )}
                  </button>
                </Card>
              )
            })}
        </div>
      )}

      <JobForm
        open={adding}
        title="New job"
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addJob(data)
          setAdding(false)
          toast.show('Job added')
        }}
      />

      <JobForm
        open={!!editing}
        title="Edit job"
        job={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing) updateJob(editing.id, data)
          setEditing(null)
          toast.show('Job updated')
        }}
        onDelete={
          editing
            ? () => {
                if (
                  confirm(
                    'Delete this job? Bottles assigned here will be unassigned.',
                  )
                ) {
                  deleteJob(editing.id)
                  setEditing(null)
                  toast.show('Job deleted', 'info')
                }
              }
            : undefined
        }
      />
    </div>
  )
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
      <div className="font-semibold text-slate-800 dark:text-slate-100">
        {value}
      </div>
      <div className="text-slate-500">{label}</div>
    </div>
  )
}

function JobForm({
  open,
  title,
  job,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  title: string
  job?: Job
  onClose: () => void
  onSave: (data: Omit<Job, 'id' | 'createdAt'>) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(job?.name ?? '')
  const [client, setClient] = useState(job?.client ?? '')
  const [address, setAddress] = useState(job?.address ?? '')
  const [notes, setNotes] = useState(job?.notes ?? '')

  const key = job?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
    setName(job?.name ?? '')
    setClient(job?.client ?? '')
    setAddress(job?.address ?? '')
    setNotes(job?.notes ?? '')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name: name.trim(),
      client: client.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Job / site name">
          <TextInput
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Westfield Mall — plant room"
          />
        </Field>
        <Field label="Client">
          <TextInput value={client} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label="Address">
          <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-2">
          <Button type="submit" full>
            Save
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
