import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Button, Field, Modal } from './ui'
import { Picker, type PickerOption } from './Picker'
import { DateInput } from './DateInput'
import { IntegrityStamp } from './IntegrityStamp'
import { useStore } from '../lib/store'
import {
  type Transaction,
  type Quarter,
  REASON_LABELS,
  expiryStatus,
  gwpFor,
  hydroStatusFor,
  isTechnicianActive,
  leakStatusFor,
  netWeight,
  quarterKey,
  quarterLabel,
  quarterOfDay,
  roleInfo,
  siteLabel,
  statusLabel,
  supersededIds,
  tonnesCO2eFor,
  transactionLabel,
  UNIT_KIND_LABELS,
} from '../lib/types'
import {
  complianceRows,
  quarterlyTotals,
  rangeTotals,
  worstLevel,
  type ComplianceLevel,
  type QuarterTotals,
} from '../lib/reports'
import { profileFor } from '../lib/compliance'
import { formatDateTime, formatPlainDate, localDateTimeInput } from '../lib/datetime'
import { formatWeight } from '../lib/units'

// The auditor hand-off. One print-optimised "Compliance & Audit Pack" that
// gathers everything an ARC permit-condition check asks for into a single
// document a Refrigerant Trading Authorisation holder can hand over:
//   1. who they are (business, ABN, RTA)
//   2. proof the records weren't tampered with (the hash-chain stamp)
//   3. the compliance scorecard (RHL, RTA, AS 2030, DA19, backup)
//   4. the ARC quarterly refrigerant record for the period
//   5. the underlying refrigerant movement log for the period
//   6. the cylinder, equipment and technician registers
//   7. a signature block + retention statement
// Designed to read cleanly in black & white (the print stylesheet forces
// mono), so nothing relies on colour to be understood.

export function AuditReportCard() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Audit pack
      </div>
      <p className="mb-3 text-xs text-slate-500">
        One document to hand your auditor: business and licence details, the
        change-log integrity stamp, the compliance scorecard, the ARC
        quarterly record, the movement log, and the cylinder, equipment and
        technician registers — for a chosen quarter, ready to print or save
        as PDF.
      </p>
      <Button onClick={() => setOpen(true)}>Generate audit pack</Button>
      {open && <AuditReportModal onClose={() => setOpen(false)} />}
    </div>
  )
}

function AuditReportModal({ onClose }: { onClose: () => void }) {
  const { state } = useStore()
  const profile = profileFor(state.jurisdiction)
  const tz = state.location.timezone

  const live = useMemo(
    () => state.transactions.filter((t) => !t.deletedAt),
    [state.transactions],
  )
  const dayOf = (t: Transaction) =>
    localDateTimeInput(new Date(t.date), tz).slice(0, 10)

  // Every quarter that has at least one movement, newest first, plus the
  // current quarter so a fresh period prints as a nil return.
  const quarters = useMemo(() => {
    const seen = new Map<string, Quarter>()
    const nowQ = quarterOfDay(localDateTimeInput(new Date(), tz).slice(0, 10))
    if (nowQ) seen.set(quarterKey(nowQ), nowQ)
    for (const t of live) {
      const q = quarterOfDay(dayOf(t))
      if (q) seen.set(quarterKey(q), q)
    }
    return [...seen.values()].sort((a, b) => b.year - a.year || b.q - a.q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tz])

  // Period: a single quarter, a full calendar year (shown as its quarters),
  // or a custom date range. The quarterly record stays quarter-by-quarter
  // where the period aligns to quarters (the ARC unit); a custom range is
  // aggregated over its exact days.
  const [mode, setMode] = useState<'quarter' | 'year' | 'custom' | 'all'>(
    'quarter',
  )
  const [selectedKey, setSelectedKey] = useState(() =>
    quarters.length > 0 ? quarterKey(quarters[0]) : '',
  )
  const quarterOptions: PickerOption[] = quarters.map((q) => ({
    value: quarterKey(q),
    label: quarterLabel(q),
  }))

  const years = useMemo(() => {
    const set = new Set<string>()
    set.add(localDateTimeInput(new Date(), tz).slice(0, 4))
    for (const q of quarters) set.add(String(q.year))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [quarters, tz])
  const [selectedYear, setSelectedYear] = useState(() => years[0] ?? '')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const selected = quarters.find((q) => quarterKey(q) === selectedKey)
  const curQ = quarterOfDay(localDateTimeInput(new Date(), tz).slice(0, 10))

  // The quarters that make up the period (empty for a custom range, which is
  // aggregated as one table instead). A full year shows only quarters that
  // aren't still in the future.
  const periodQuarters = useMemo<Quarter[]>(() => {
    if (mode === 'quarter') return selected ? [selected] : []
    if (mode === 'year') {
      const y = Number(selectedYear)
      if (!y) return []
      const QS: (1 | 2 | 3 | 4)[] = [1, 2, 3, 4]
      return QS.map((q) => ({ year: y, q })).filter((q) =>
        !curQ
          ? true
          : q.year < curQ.year || (q.year === curQ.year && q.q <= curQ.q),
      )
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selected, selectedYear, curQ?.year, curQ?.q])

  // Day-membership test for the movement log + custom aggregation. One
  // stable callback that branches internally (rather than a memo returning
  // different closures, which the React Compiler can't preserve).
  const inRange = useCallback(
    (day: string): boolean => {
      if (mode === 'all') return true
      if (mode === 'year') return day.slice(0, 4) === selectedYear
      if (mode === 'custom') {
        return (!fromDate || day >= fromDate) && (!toDate || day <= toDate)
      }
      const q = quarterOfDay(day)
      return !!q && quarterKey(q) === selectedKey
    },
    [mode, selectedYear, fromDate, toDate, selectedKey],
  )

  const periodLabel =
    mode === 'quarter'
      ? selected
        ? quarterLabel(selected)
        : 'No data'
      : mode === 'year'
        ? `Year ${selectedYear}`
        : mode === 'all'
          ? 'All records (complete history)'
          : fromDate || toDate
            ? `${fromDate || 'start'} to ${toDate || 'now'}`
            : 'All records'

  // The refrigerant-record tables to show: one per quarter when the period
  // aligns to quarters, or a single aggregated table for a custom range.
  const recordTables = useMemo(() => {
    if (mode === 'custom' || mode === 'all') {
      return [
        { label: periodLabel, totals: rangeTotals(live, state.bottles, inRange, tz) },
      ]
    }
    return periodQuarters.map((q) => ({
      label: quarterLabel(q),
      totals: quarterlyTotals(live, state.bottles, quarterKey(q), tz),
    }))
  }, [mode, periodQuarters, live, state.bottles, tz, inRange, periodLabel])

  // Movement log for the period, oldest first (the order an auditor reads).
  const superseded = useMemo(() => supersededIds(live), [live])
  const periodRows = useMemo(() => {
    return live
      .filter((t) => inRange(dayOf(t)))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, inRange, tz])

  const rows = useMemo(() => complianceRows(state), [state])
  const overall = worstLevel(rows.map((r) => r.level))

  const inServiceBottles = state.bottles
    .filter((b) => b.status !== 'returned')
    .slice()
    .sort((a, b) => a.bottleNumber.localeCompare(b.bottleNumber))
  const activeUnits = state.units.filter((u) => u.status === 'active')
  const activeTechs = state.technicians.filter(isTechnicianActive)

  const unit = state.unit
  const generatedAt = formatDateTime(new Date().toISOString(), tz, state.clock)

  return (
    <Modal open onClose={onClose} title="Audit pack" size="lg">
      <div className="no-print mb-3 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Report period">
              <Picker
                title="Report period"
                value={mode}
                onChange={(v) =>
                  setMode(v as 'quarter' | 'year' | 'custom' | 'all')
                }
                options={[
                  { value: 'quarter', label: 'By quarter (3 months)' },
                  { value: 'year', label: 'Full year' },
                  { value: 'all', label: 'All history' },
                  { value: 'custom', label: 'Custom date range' },
                ]}
              />
            </Field>
          </div>
          <Button variant="secondary" onClick={() => window.print()}>
            Print / Save PDF
          </Button>
        </div>
        {mode === 'quarter' && (
          <Field label="Quarter">
            <Picker
              title="Quarter"
              value={selectedKey}
              onChange={setSelectedKey}
              options={quarterOptions}
            />
          </Field>
        )}
        {mode === 'year' && (
          <Field label="Year">
            <Picker
              title="Year"
              value={selectedYear}
              onChange={setSelectedYear}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          </Field>
        )}
        {mode === 'custom' && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Field label="From" className="flex-1">
              <DateInput
                value={fromDate}
                onChange={setFromDate}
                max={toDate || undefined}
                ariaLabel="Report from date"
              />
            </Field>
            <Field label="To" className="flex-1">
              <DateInput
                value={toDate}
                onChange={setToDate}
                min={fromDate || undefined}
                ariaLabel="Report to date"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="print-region space-y-5 text-sm text-slate-900 dark:text-slate-100">
        {/* 1. Cover header */}
        <header className="border-b-2 border-slate-800 pb-3 dark:border-slate-200">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Refrigerant Compliance &amp; Audit Report
          </div>
          <div className="mt-1 text-2xl font-bold leading-tight">
            {state.businessName || 'Business name not set in Settings'}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-slate-600 dark:text-slate-300">
            <Kv
              label={profile.businessNumberShort}
              v={state.businessAbn || 'Not set'}
            />
            {profile.hasBusinessAuthorisation && (
              <Kv
                label={profile.businessAuthShort}
                v={state.arcAuthorisationNumber || 'Not set'}
              />
            )}
            <Kv label="Period" v={periodLabel} />
            <Kv label="Generated" v={generatedAt} />
          </div>
        </header>

        {/* 2. Integrity verification — the trust headline */}
        <Section title="Records integrity">
          <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">
            The change log underlying this report is sealed into a
            cryptographic hash chain. This stamp re-derives it on the spot, so
            you can see the records have not been altered.
          </p>
          <IntegrityStamp />
        </Section>

        {/* 3. Compliance scorecard */}
        <Section title="Compliance summary">
          <div className="mb-2 text-xs">
            Overall:{' '}
            <span className="font-semibold">{OVERALL_LABEL[overall]}</span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-slate-200 align-top dark:border-slate-800"
                >
                  <td className="py-1 pr-2 font-medium">{r.label}</td>
                  <td className="py-1 pr-2 text-slate-600 dark:text-slate-300">
                    {r.summary}
                  </td>
                  <td className="py-1 text-right font-semibold whitespace-nowrap">
                    {LEVEL_MARK[r.level]} {LEVEL_LABEL[r.level]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* 4. ARC refrigerant record — one table per quarter (or a single
            aggregated table for a custom range). */}
        <Section
          title={
            mode === 'custom' || mode === 'all'
              ? 'Refrigerant record (period totals)'
              : 'Quarterly refrigerant record'
          }
        >
          {recordTables.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose a period above.
            </p>
          ) : (
            recordTables.map((rt) => (
              <RefrigerantTable key={rt.label} label={rt.label} totals={rt.totals} />
            ))
          )}
          <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
            Purchased = cylinders entering the system. Charged = into
            equipment. Recovered = out of equipment into cylinders
            (bottle-to-bottle decants excluded). Returned = net refrigerant in
            cylinders when returned. Loss = recorded hose / decant losses.
            Figures in kilograms. Corrected entries are counted in place of the
            originals they supersede.
          </p>
        </Section>

        {/* 5. Refrigerant movement log for the period */}
        <Section title="Refrigerant movement log (this period)">
          {periodRows.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No movements recorded in this quarter.
            </p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="border-b border-slate-400 text-left font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
                <tr>
                  <th className="py-1 pr-1.5">Date</th>
                  <th className="py-1 pr-1.5">Cyl.</th>
                  <th className="py-1 pr-1.5">Ref.</th>
                  <th className="py-1 pr-1.5">Movement</th>
                  <th className="py-1 pr-1.5 text-right">kg</th>
                  <th className="py-1 pr-1.5">Site / equipment</th>
                  <th className="py-1 pr-1.5">Technician</th>
                  <th className="py-1">Leak</th>
                </tr>
              </thead>
              <tbody>
                {periodRows.map((t) => {
                  const bottle = state.bottles.find((b) => b.id === t.bottleId)
                  const site = state.sites.find((s) => s.id === t.siteId)
                  const u = state.units.find((x) => x.id === t.unitId)
                  const where = [
                    site?.name ?? t.siteName,
                    u?.name ?? t.unitName ?? t.equipment,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  const tech = [
                    t.technician,
                    t.technicianLicence &&
                      `${profile.techLicenceShort} ${t.technicianLicence}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                  const isSuperseded = superseded.has(t.id)
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-200 align-top dark:border-slate-800"
                    >
                      <td className="py-1 pr-1.5 whitespace-nowrap">
                        {formatPlainDate(dayOf(t))}
                      </td>
                      <td className="py-1 pr-1.5">
                        {bottle?.bottleNumber ?? t.bottleNumber ?? '—'}
                      </td>
                      <td className="py-1 pr-1.5">
                        {t.bottleRefrigerantType ?? bottle?.refrigerantType ?? '—'}
                      </td>
                      <td className="py-1 pr-1.5">
                        {transactionLabel(t.kind)}
                        {t.correctsId ? ' (correction)' : ''}
                        {isSuperseded ? ' (superseded)' : ''}
                        {t.reason ? ` · ${REASON_LABELS[t.reason]}` : ''}
                      </td>
                      <td className="py-1 pr-1.5 text-right tabular-nums">
                        {t.amount > 0 ? t.amount.toFixed(3) : '—'}
                      </td>
                      <td className="py-1 pr-1.5">{where || '—'}</td>
                      <td className="py-1 pr-1.5">{tech || '—'}</td>
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
        </Section>

        {/* 6a. Cylinder register */}
        <Section title="Cylinder register (in service)">
          {inServiceBottles.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No cylinders in service.
            </p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="border-b border-slate-400 text-left font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
                <tr>
                  <th className="py-1 pr-1.5">Cylinder</th>
                  <th className="py-1 pr-1.5">Refrigerant</th>
                  <th className="py-1 pr-1.5 text-right">Net</th>
                  <th className="py-1 pr-1.5">Status</th>
                  <th className="py-1 pr-1.5">Next test (AS 2030)</th>
                  <th className="py-1">Test status</th>
                </tr>
              </thead>
              <tbody>
                {inServiceBottles.map((b) => {
                  const h = hydroStatusFor(b)
                  return (
                    <tr
                      key={b.id}
                      className="border-b border-slate-200 dark:border-slate-800"
                    >
                      <td className="py-1 pr-1.5 font-medium">{b.bottleNumber}</td>
                      <td className="py-1 pr-1.5">{b.refrigerantType}</td>
                      <td className="py-1 pr-1.5 text-right tabular-nums">
                        {formatWeight(netWeight(b), unit)}
                      </td>
                      <td className="py-1 pr-1.5">{statusLabel(b.status)}</td>
                      <td className="py-1 pr-1.5">
                        {b.nextHydroTestDate
                          ? formatPlainDate(b.nextHydroTestDate)
                          : '—'}
                      </td>
                      <td className="py-1">{HYDRO_LABEL[h.status]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* 6b. Equipment register */}
        <Section title="Equipment register (in service)">
          {activeUnits.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No equipment in service.
            </p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="border-b border-slate-400 text-left font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
                <tr>
                  <th className="py-1 pr-1.5">Site</th>
                  <th className="py-1 pr-1.5">Unit</th>
                  <th className="py-1 pr-1.5">Refrigerant</th>
                  <th className="py-1 pr-1.5 text-right">Charge</th>
                  <th className="py-1 pr-1.5 text-right">GWP</th>
                  <th className="py-1 pr-1.5 text-right">t CO₂-e</th>
                  <th className="py-1">12-mo leak status</th>
                </tr>
              </thead>
              <tbody>
                {activeUnits.map((u) => {
                  const site = state.sites.find((s) => s.id === u.siteId)
                  const gwp = gwpFor(u.refrigerantType)
                  const co2e = u.refrigerantCharge
                    ? tonnesCO2eFor(u.refrigerantCharge, u.refrigerantType)
                    : undefined
                  const lk = leakStatusFor(u, state.transactions)
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-slate-200 align-top dark:border-slate-800"
                    >
                      <td className="py-1 pr-1.5">
                        {site ? siteLabel(site) : '—'}
                      </td>
                      <td className="py-1 pr-1.5 font-medium">
                        {u.name}
                        {u.kind ? ` · ${UNIT_KIND_LABELS[u.kind]}` : ''}
                      </td>
                      <td className="py-1 pr-1.5">{u.refrigerantType ?? '—'}</td>
                      <td className="py-1 pr-1.5 text-right tabular-nums">
                        {u.refrigerantCharge
                          ? formatWeight(u.refrigerantCharge, unit, 3)
                          : '—'}
                      </td>
                      <td className="py-1 pr-1.5 text-right tabular-nums">
                        {gwp != null ? gwp : '—'}
                      </td>
                      <td className="py-1 pr-1.5 text-right tabular-nums">
                        {co2e != null ? co2e.toFixed(3) : '—'}
                      </td>
                      <td className="py-1">
                        {LEAK_LABEL[lk.level]}
                        {lk.level !== 'ok' && lk.level !== 'unknown'
                          ? ` (${(lk.fraction * 100).toFixed(0)}% of charge)`
                          : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* 6c. Technician & licence register */}
        <Section title="Technician &amp; licence register">
          {activeTechs.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No active technicians recorded.
            </p>
          ) : (
            <table className="w-full text-[10px]">
              <thead className="border-b border-slate-400 text-left font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
                <tr>
                  <th className="py-1 pr-1.5">Technician</th>
                  <th className="py-1 pr-1.5">Role</th>
                  <th className="py-1 pr-1.5">{profile.techLicenceShort}</th>
                  <th className="py-1 pr-1.5">Expiry</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeTechs.map((t) => {
                  const ex = t.licenceExpiry ? expiryStatus(t.licenceExpiry) : null
                  return (
                    <tr
                      key={t.id}
                      className="border-b border-slate-200 dark:border-slate-800"
                    >
                      <td className="py-1 pr-1.5 font-medium">{t.name}</td>
                      <td className="py-1 pr-1.5">{roleInfo(t.role).label}</td>
                      <td className="py-1 pr-1.5">{t.arcLicenceNumber || '—'}</td>
                      <td className="py-1 pr-1.5">
                        {t.licenceExpiry ? formatPlainDate(t.licenceExpiry) : '—'}
                      </td>
                      <td className="py-1">
                        {!ex
                          ? 'No date'
                          : ex.level === 'expired'
                            ? '✕ Expired'
                            : ex.level === 'due_soon'
                              ? '⚠ Due soon'
                              : '✓ Current'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Section>

        {/* 7. Signature block + retention statement */}
        <footer className="break-inside-avoid border-t-2 border-slate-800 pt-3 dark:border-slate-200">
          <div className="grid grid-cols-2 gap-8 pt-4">
            <SignatureLine label={`Authorised representative — ${state.businessName || 'business'}`} />
            <SignatureLine label="Auditor / inspector" />
          </div>
          <p className="mt-4 text-[10px] text-slate-500 dark:text-slate-400">
            Records kept under the conditions of a Refrigerant Trading
            Authorisation (Ozone Protection and Synthetic Greenhouse Gas
            Management Regulations) — refrigerant acquired, recovered, sold or
            otherwise disposed of, retained for the period required by
            applicable regulations. Deleted log entries are excluded here and
            remain available in the full JSON/CSV export audit trail. Generated
            {' '}{generatedAt}.
          </p>
        </footer>
      </div>
    </Modal>
  )
}

const OVERALL_LABEL: Record<ComplianceLevel, string> = {
  ok: 'All compliant',
  attention: 'Attention needed',
  action: 'Action needed',
}
const LEVEL_LABEL: Record<ComplianceLevel, string> = {
  ok: 'Compliant',
  attention: 'Attention',
  action: 'Action',
}
const LEVEL_MARK: Record<ComplianceLevel, string> = {
  ok: '✓',
  attention: '⚠',
  action: '✕',
}
const HYDRO_LABEL: Record<string, string> = {
  ok: '✓ In date',
  due_soon: '⚠ Due soon',
  overdue: '✕ Overdue',
  unknown: '— No date',
}
const LEAK_LABEL: Record<string, string> = {
  ok: '✓ Within range',
  watch: '⚠ Watch',
  suspected: '✕ Suspected leak',
  unknown: '— Charge not set',
}

// One refrigerant-record table (the ARC quarterly figures) for a single
// quarter or aggregated period, captioned with its label. A nil period
// prints "nil return" rather than an empty table.
function RefrigerantTable({
  label,
  totals,
}: {
  label: string
  totals: QuarterTotals[]
}) {
  const sum = (f: (t: QuarterTotals) => number) =>
    totals.reduce((s, t) => s + f(t), 0)
  return (
    <div className="mb-3 break-inside-avoid last:mb-0">
      <div className="mb-1 text-xs font-semibold">{label}</div>
      {totals.length === 0 ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          No refrigerant movements in this period (nil return).
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead className="border-b border-slate-400 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-600">
            <tr>
              <th className="py-1 pr-2">Refrigerant</th>
              <Th>Purchased</Th>
              <Th>Charged</Th>
              <Th>Recovered</Th>
              <Th>Returned</Th>
              <Th>Adjust ±</Th>
              <Th last>Loss</Th>
            </tr>
          </thead>
          <tbody>
            {totals.map((r) => (
              <tr
                key={r.refrigerant}
                className="border-b border-slate-200 dark:border-slate-800"
              >
                <td className="py-1 pr-2 font-medium">{r.refrigerant}</td>
                <Num v={r.purchasedKg} />
                <Num v={r.chargedKg} />
                <Num v={r.recoveredKg} />
                <Num v={r.returnedKg} />
                <Num v={r.adjustKg} signed />
                <Num v={r.lossKg} last />
              </tr>
            ))}
            <tr className="border-t border-slate-400 font-semibold dark:border-slate-600">
              <td className="py-1 pr-2">Total (kg)</td>
              <Num v={sum((t) => t.purchasedKg)} />
              <Num v={sum((t) => t.chargedKg)} />
              <Num v={sum((t) => t.recoveredKg)} />
              <Num v={sum((t) => t.returnedKg)} />
              <Num v={sum((t) => t.adjustKg)} signed />
              <Num v={sum((t) => t.lossKg)} last />
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      {children}
    </section>
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

function Th({ children, last }: { children: ReactNode; last?: boolean }) {
  return <th className={`py-1 text-right ${last ? '' : 'pr-2'}`}>{children}</th>
}

function Num({ v, signed, last }: { v: number; signed?: boolean; last?: boolean }) {
  const text =
    Math.abs(v) < 0.0005 ? '—' : `${signed && v > 0 ? '+' : ''}${v.toFixed(3)}`
  return (
    <td className={`py-1 text-right tabular-nums ${last ? '' : 'pr-2'}`}>
      {text}
    </td>
  )
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-slate-500 dark:border-slate-500" />
      <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-3 h-6 border-b border-slate-400 dark:border-slate-600" />
      <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        Name &amp; date
      </div>
    </div>
  )
}
