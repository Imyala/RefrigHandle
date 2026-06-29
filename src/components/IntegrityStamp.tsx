import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import {
  getRecordedHead,
  verifyAuditChains,
  type ChainReport,
} from '../lib/auditChain'
import { formatDateTime } from '../lib/datetime'

// Self-attesting integrity stamp for printed records (quarterly report,
// equipment logbook, site audit). Re-derives the change-log hash chain and
// prints the result on the document itself, so an auditor reading the PDF
// can see — without opening the app — that the underlying change log was
// verified and not tampered with. Green when intact, red when a problem is
// detected (and it says so plainly rather than hiding it).
export function IntegrityStamp() {
  const { state } = useStore()
  const [report, setReport] = useState<ChainReport | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void verifyAuditChains(state.auditLog, getRecordedHead()).then((r) => {
      if (cancelled) return
      setReport(r)
      setCheckedAt(new Date().toISOString())
    })
    return () => {
      cancelled = true
    }
  }, [state.auditLog])

  if (!report || !checkedAt) return null

  const when = formatDateTime(checkedAt, state.location.timezone, state.clock)
  const ok = report.valid

  // Nothing logged yet — keep it honest rather than printing "0 chains".
  if (report.total === 0) {
    return (
      <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
        No change-log entries to verify yet. Each change is sealed into a
        cryptographic hash chain as it is made.
      </div>
    )
  }

  return (
    <div
      className={`mt-3 rounded-lg border px-3 py-2 text-[11px] ${
        ok
          ? 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-100'
          : 'border-red-400 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-100'
      }`}
    >
      <div className="font-semibold">
        {ok
          ? '✓ Change log verified — no tampering detected'
          : '⚠ Change log integrity check FAILED'}
      </div>
      <div className="mt-0.5">
        {report.sealed} of {report.total} change-log{' '}
        {report.total === 1 ? 'entry' : 'entries'} sealed into{' '}
        {report.chains} cryptographic hash chain
        {report.chains === 1 ? '' : 's'}
        {report.unsealed > 0
          ? ` (${report.unsealed} just written, not yet sealed)`
          : ''}
        . Verified {when}.
      </div>
      {!ok && (
        <div className="mt-0.5 font-medium">
          {report.problems.length} problem
          {report.problems.length === 1 ? '' : 's'} found — open the app's
          Audit trail integrity check for detail.
        </div>
      )}
      <div className="mt-1 opacity-75">
        This check re-derives the hash chain on this device. It detects any
        edit, deletion or corruption of sealed entries — it is not a
        third-party notarisation or timestamp.
      </div>
    </div>
  )
}
