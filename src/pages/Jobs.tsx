import { useEffect, useMemo, useState } from 'react'
import { Button, Card, EmptyState, Field, Modal, Pill, TextArea, TextInput } from '../components/ui'
import { Picker } from '../components/Picker'
import { DateTimeInput } from '../components/DateTimeInput'
import { IntegrityStamp } from '../components/IntegrityStamp'
import { PhotoSection } from '../components/Photos'
import { SignatureSection } from '../components/Signatures'
import { TransactionDetails } from '../components/TransactionDetails'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import {
  type Job,
  type Transaction,
  REASON_LABELS,
  canDeleteRecords,
  siteLabel,
  supersededIds,
  transactionLabel,
} from '../lib/types'
import { profileFor } from '../lib/compliance'
import { serviceReportText } from '../lib/share'
import { ShareTextModal } from '../components/ShareSheet'
import { listAttachments, type Attachment } from '../lib/attachments'
import {
  dateTimeInputToIso,
  deviceTimeZone,
  formatDateTime,
  formatPlainDate,
  localDateTimeInput,
} from '../lib/datetime'
import { formatWeight } from '../lib/units'

// Jobs / work-orders: an optional grouping of a site visit's refrigerant
// movements (via Transaction.jobId), the home for a job's photos and
// customer sign-off, and the basis for a printable service report. Movements
// are still logged from the bottle quick-log / Refrigerant-log "+ Log"
// (where a Job picker attaches them); this page creates and manages the jobs
// and produces the report.

const PAGE = 30

export default function Jobs() {
  const { state, addJob } = useStore()
  const [creating, setCreating] = useState(false)
  const [openJobId, setOpenJobId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const jobs = useMemo(
    () =>
      state.jobs
        .slice()
        .sort((a, b) =>
          a.status !== b.status
            ? a.status === 'open'
              ? -1
              : 1
            : a.date < b.date
              ? 1
              : -1,
        ),
    [state.jobs],
  )
  // Search spans reference, site and client — the things a job is
  // remembered by months later.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return jobs
    return jobs.filter((j) =>
      [j.reference, j.siteName, j.clientName]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(q)),
    )
  }, [jobs, query])
  const visible = filtered.slice(0, limit)
  const openJob = openJobId ? state.jobs.find((j) => j.id === openJobId) : null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Jobs
        </h2>
        <Button onClick={() => setCreating(true)}>+ New job</Button>
      </div>
      <p className="-mt-1 text-xs text-slate-500">
        A job groups one visit's work into a single record, with a service
        report you can hand the customer — pick the job in the Job field when
        you log a charge or recovery.
      </p>

      {jobs.length > 3 && (
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by reference, site or client"
        />
      )}

      {jobs.length > 0 && query.trim() !== '' && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500 dark:text-slate-400">
          <span>
            Showing {filtered.length} of {jobs.length}{' '}
            {jobs.length === 1 ? 'job' : 'jobs'}
          </span>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="shrink-0 font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Clear search
          </button>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          title="No jobs yet"
          body="Open a job for a site visit, then log the charges and recoveries against it."
          action={<Button onClick={() => setCreating(true)}>+ New job</Button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          body="Your jobs are still here — this search just matches none of them."
          action={
            <Button variant="secondary" onClick={() => setQuery('')}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {visible.map((j) => (
            <JobCard key={j.id} job={j} onOpen={() => setOpenJobId(j.id)} />
          ))}
          {filtered.length > limit && (
            <Button
              variant="secondary"
              full
              onClick={() => setLimit((l) => l + PAGE)}
            >
              Show older ({filtered.length - limit} more)
            </Button>
          )}
        </div>
      )}

      <JobForm
        open={creating}
        onClose={() => setCreating(false)}
        onSave={(data) => {
          addJob(data)
          setCreating(false)
        }}
      />

      {openJob && (
        <JobDetail job={openJob} onClose={() => setOpenJobId(null)} />
      )}
    </div>
  )
}

// Live movements logged against a job (newest first), excluding soft-deleted
// rows and originals superseded by a re-statement correction — the linked
// correction carries the true amount and appears in their place, matching
// every other aggregate (logbook, site totals, quarterly figures).
function jobTransactions(job: Job, all: Transaction[]): Transaction[] {
  const superseded = supersededIds(all)
  return all
    .filter((t) => t.jobId === job.id && !t.deletedAt && !superseded.has(t.id))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

function JobCard({ job, onOpen }: { job: Job; onOpen: () => void }) {
  const { state } = useStore()
  const txs = jobTransactions(job, state.transactions)
  const charged = txs
    .filter((t) => t.kind === 'charge')
    .reduce((s, t) => s + t.amount, 0)
  const recovered = txs
    .filter((t) => t.kind === 'recover' && !t.sourceBottleId)
    .reduce((s, t) => s + t.amount, 0)
  return (
    <Card className="!p-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {job.reference}
            </span>
            <Pill tone={job.status === 'open' ? 'green' : 'slate'}>
              {job.status === 'open' ? 'Open' : 'Closed'}
            </Pill>
          </div>
          <div className="truncate text-sm text-slate-500">
            {[job.siteName, job.clientName].filter(Boolean).join(' · ') ||
              'No site'}
          </div>
          <div className="mt-0.5 text-xs text-slate-400">
            {formatPlainDate(job.date.slice(0, 10))} ·{' '}
            {txs.length === 1 ? '1 movement' : `${txs.length} movements`}
            {charged > 0 ? ` · ${formatWeight(charged, state.unit)} charged` : ''}
            {recovered > 0
              ? ` · ${formatWeight(recovered, state.unit)} recovered`
              : ''}
          </div>
        </div>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4 shrink-0 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </Card>
  )
}

function JobForm({
  open,
  job,
  onClose,
  onSave,
}: {
  open: boolean
  job?: Job
  onClose: () => void
  onSave: (data: {
    reference: string
    siteId?: string
    date: string
    notes?: string
  }) => void
}) {
  const { state } = useStore()
  const tz = deviceTimeZone() || state.location.timezone
  const [reference, setReference] = useState('')
  const [siteId, setSiteId] = useState('')
  const [date, setDate] = useState(() => localDateTimeInput(new Date(), tz))
  const [notes, setNotes] = useState('')

  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    setReference(job?.reference ?? '')
    setSiteId(job?.siteId ?? '')
    setDate(
      job
        ? localDateTimeInput(new Date(job.date), tz)
        : localDateTimeInput(new Date(), tz),
    )
    setNotes(job?.notes ?? '')
  } else if (!open && lastOpen) {
    setLastOpen(false)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!reference.trim()) return
    onSave({
      reference: reference.trim(),
      siteId: siteId || undefined,
      date: dateTimeInputToIso(date, tz),
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Modal open={open} title={job ? 'Edit job' : 'New job'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Reference / title" hint="A work-order number or short description.">
          <TextInput
            autoFocus
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="e.g. WO-1042, AC service — Smith"
          />
        </Field>
        <Field label="Site (optional)">
          <Picker
            title="Site"
            value={siteId}
            onChange={setSiteId}
            emptyLabel="— none —"
            placeholder="— none —"
            options={state.sites.map((s) => ({ value: s.id, label: siteLabel(s) }))}
          />
        </Field>
        <Field label="Date / time">
          <DateTimeInput
            value={date}
            onChange={setDate}
            timezone={tz}
            clock={state.clock}
            ariaLabel="Job date and time"
          />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button type="submit" full disabled={!reference.trim()}>
          {job ? 'Save job' : 'Open job'}
        </Button>
      </form>
    </Modal>
  )
}

function JobDetail({ job, onClose }: { job: Job; onClose: () => void }) {
  const { state, setJobStatus, updateJob, deleteJob } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [report, setReport] = useState(false)
  const txs = jobTransactions(job, state.transactions)
  const mayDelete = canDeleteRecords(
    state.technicians.find((t) => t.id === state.activeTechnicianId)?.role,
  )

  async function remove() {
    const ok = await confirm({
      title: `Remove "${job.reference}"?`,
      message:
        'The job moves to Recently deleted (Change log → Recently deleted), where a supervisor can restore it. Its logged movements are untouched and keep their grouping.',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    deleteJob(job.id)
    toast.show('Job removed — restore it from Recently deleted', 'info')
    onClose()
  }

  return (
    <Modal open title={job.reference} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={job.status === 'open' ? 'green' : 'slate'}>
            {job.status === 'open' ? 'Open' : 'Closed'}
          </Pill>
          <span className="text-sm text-slate-500">
            {[job.siteName, job.clientName].filter(Boolean).join(' · ') ||
              'No site'}{' '}
            · {formatPlainDate(job.date.slice(0, 10))}
          </span>
        </div>
        {job.notes && (
          <p className="text-sm text-slate-600 dark:text-slate-300">{job.notes}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setReport(true)}>Service report</Button>
          <Button
            variant="secondary"
            onClick={() =>
              setJobStatus(job.id, job.status === 'open' ? 'closed' : 'open')
            }
          >
            {job.status === 'open' ? 'Close job' : 'Reopen'}
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {mayDelete && (
            <Button variant="ghost" onClick={() => void remove()}>
              Remove
            </Button>
          )}
        </div>

        <section>
          <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            Movements ({txs.length})
          </div>
          {txs.length === 0 ? (
            <p className="text-sm text-slate-500">
              No movements logged against this job yet. Open the bottle
              quick-log or the Movements tab and pick this job.
            </p>
          ) : (
            <div className="space-y-2">
              {txs.map((t) => (
                <Card key={t.id} className="!p-3">
                  <TransactionDetails t={t} />
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            Photos
          </div>
          <PhotoSection
            entityType="job"
            entityId={job.id}
            hint="Site, nameplate, gauges, the finished job — stored on this device and included in the JSON backup."
          />
        </section>

        <section>
          <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
            Customer sign-off
          </div>
          <SignatureSection entityType="job" entityId={job.id} />
        </section>
      </div>

      <JobForm
        open={editing}
        job={job}
        onClose={() => setEditing(false)}
        onSave={(data) => {
          updateJob(job.id, data)
          setEditing(false)
        }}
      />

      {report && (
        <ServiceReport job={job} onClose={() => setReport(false)} />
      )}
    </Modal>
  )
}

function ServiceReport({ job, onClose }: { job: Job; onClose: () => void }) {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)
  const tz = state.location.timezone
  const [sharing, setSharing] = useState(false)
  const txs = jobTransactions(job, state.transactions)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // The job's captured evidence — photos and the customer's on-screen
  // signature — belongs ON the report, not behind it: a report printed
  // with a blank customer line while a signature exists undersells the
  // record. Loaded from the attachment store as object URLs.
  const [loaded, setLoaded] = useState<{ a: Attachment; url: string }[]>([])
  useEffect(() => {
    let cancelled = false
    let urls: string[] = []
    listAttachments('job', job.id)
      .then((list) => {
        if (cancelled) return
        const l = list.map((a) => ({ a, url: URL.createObjectURL(a.blob) }))
        urls = l.map((x) => x.url)
        setLoaded(l)
      })
      .catch(() => {
        // Storage unavailable (private mode) — the report still prints,
        // just without the images.
      })
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [job.id])
  const photos = loaded.filter((x) => x.a.kind === 'photo')
  const signature = loaded.filter((x) => x.a.kind === 'signature').at(-1)

  // Per-refrigerant charged / recovered for the job summary.
  const byRef = new Map<string, { charged: number; recovered: number }>()
  for (const t of txs) {
    const bottle = state.bottles.find((b) => b.id === t.bottleId)
    const ref = t.bottleRefrigerantType ?? bottle?.refrigerantType ?? 'Unknown'
    const r = byRef.get(ref) ?? { charged: 0, recovered: 0 }
    if (t.kind === 'charge') r.charged += t.amount
    else if (t.kind === 'recover' && !t.sourceBottleId) r.recovered += t.amount
    byRef.set(ref, r)
  }
  const generatedAt = formatDateTime(new Date().toISOString(), tz, state.clock)

  return (
    <Modal open title="Service report" onClose={onClose} size="lg">
      <div className="no-print mb-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
        {/* Text version for the customer's inbox / job card — same
            share-copy-email sheet as a transaction share. */}
        <Button variant="secondary" onClick={() => setSharing(true)}>
          Share…
        </Button>
      </div>

      <div className="print-region space-y-4 text-sm text-slate-900 dark:text-slate-100">
        <header className="border-b-2 border-slate-800 pb-3 dark:border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Refrigerant Service Report
          </div>
          <div className="mt-1 text-xl font-bold">
            {state.businessName || 'Business name not set in Settings'}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {[
              state.businessAbn && `${profile.businessNumberShort} ${state.businessAbn}`,
              profile.hasBusinessAuthorisation &&
                state.arcAuthorisationNumber &&
                `${profile.businessAuthShort} ${state.arcAuthorisationNumber}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </header>

        <section className="break-inside-avoid">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <Kv label="Job" v={job.reference} />
            <Kv label="Date" v={formatPlainDate(job.date.slice(0, 10))} />
            {job.siteName && <Kv label="Site" v={job.siteName} />}
            {job.clientName && <Kv label="Client" v={job.clientName} />}
            {job.technician && (
              <Kv
                label="Technician"
                v={[
                  job.technician,
                  job.technicianLicence &&
                    `${profile.techLicenceShort} ${job.technicianLicence}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            )}
            <Kv label="Status" v={job.status === 'open' ? 'Open' : 'Closed'} />
          </div>
          {job.notes && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {job.notes}
            </p>
          )}
        </section>

        <section className="break-inside-avoid">
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            Work performed
          </h3>
          {txs.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No refrigerant movements recorded on this job.
            </p>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="border-b border-slate-400 text-left font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
                <tr>
                  <th className="py-1 pr-2">Date</th>
                  <th className="py-1 pr-2">Cylinder</th>
                  <th className="py-1 pr-2">Refrigerant</th>
                  <th className="py-1 pr-2">Movement</th>
                  <th className="py-1 pr-2 text-right">kg</th>
                  <th className="py-1">Leak test</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => {
                  const bottle = state.bottles.find((b) => b.id === t.bottleId)
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-200 align-top dark:border-slate-800"
                    >
                      <td className="py-1 pr-2 whitespace-nowrap">
                        {formatPlainDate(
                          localDateTimeInput(new Date(t.date), tz).slice(0, 10),
                        )}
                      </td>
                      <td className="py-1 pr-2">
                        {bottle?.bottleNumber ?? t.bottleNumber ?? '—'}
                      </td>
                      <td className="py-1 pr-2">
                        {t.bottleRefrigerantType ?? bottle?.refrigerantType ?? '—'}
                      </td>
                      <td className="py-1 pr-2">
                        {transactionLabel(t.kind)}
                        {t.reason ? ` · ${REASON_LABELS[t.reason]}` : ''}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {t.amount > 0 ? t.amount.toFixed(3) : '—'}
                      </td>
                      <td className="py-1">
                        {t.kind === 'charge' || t.kind === 'recover'
                          ? t.leakTestPerformed == null
                            ? '—'
                            : t.leakTestPerformed
                              ? 'Yes'
                              : 'No'
                          : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {byRef.size > 0 && (
          <section className="break-inside-avoid">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Refrigerant summary
            </h3>
            <table className="w-full text-xs">
              <thead className="border-b border-slate-400 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
                <tr>
                  <th className="py-1 pr-2">Refrigerant</th>
                  <th className="py-1 pr-2 text-right">Charged kg</th>
                  <th className="py-1 text-right">Recovered kg</th>
                </tr>
              </thead>
              <tbody>
                {[...byRef.entries()].map(([ref, r]) => (
                  <tr key={ref} className="border-b border-slate-200 dark:border-slate-800">
                    <td className="py-1 pr-2 font-medium">{ref}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {r.charged > 0 ? r.charged.toFixed(3) : '—'}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {r.recovered > 0 ? r.recovered.toFixed(3) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {photos.length > 0 && (
          <section className="break-inside-avoid">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Photos ({photos.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {photos.slice(0, 9).map((p) => (
                <figure key={p.a.id}>
                  <img
                    src={p.url}
                    alt={p.a.caption || 'Job photo'}
                    className="h-28 w-full rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                  />
                  {p.a.caption && (
                    <figcaption className="mt-0.5 truncate text-[9px] text-slate-500">
                      {p.a.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
            {photos.length > 9 && (
              <p className="mt-1 text-[10px] text-slate-500">
                +{photos.length - 9} more photo{photos.length - 9 === 1 ? '' : 's'} on the job record.
              </p>
            )}
          </section>
        )}

        <footer className="break-inside-avoid border-t-2 border-slate-800 pt-3 dark:border-slate-200">
          <div className="grid grid-cols-2 gap-8 pt-4">
            <SignatureLine label="Technician" />
            {signature ? (
              <div>
                <img
                  src={signature.url}
                  alt="Customer signature"
                  className="h-16 border-b border-slate-500 object-contain object-left"
                />
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  Customer
                  {signature.a.signedBy ? ` — ${signature.a.signedBy}` : ''} ·
                  signed{' '}
                  {formatDateTime(signature.a.createdAt, tz, state.clock)}
                </div>
              </div>
            ) : (
              <SignatureLine label="Customer" />
            )}
          </div>
          <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">
            Generated {generatedAt}. Refrigerant handled under a Refrigerant
            Trading Authorisation; figures are recorded in this business's
            audit-tracked log.
          </p>
          <IntegrityStamp />
        </footer>
      </div>

      {sharing && (() => {
        const { subject, body } = serviceReportText(job, state)
        return (
          <ShareTextModal
            open
            onClose={() => setSharing(false)}
            subject={subject}
            body={body}
          />
        )
      })()}
    </Modal>
  )
}

function Kv({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="font-semibold">{label}:</span>
      <span className="min-w-0 break-words">{v}</span>
    </div>
  )
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-slate-500" />
      <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {label} — name &amp; date
      </div>
    </div>
  )
}
