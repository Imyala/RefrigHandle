import { useMemo, useState } from 'react'
import { Button, Card, Field, Modal } from './ui'
import { Picker, type PickerOption } from './Picker'
import { IntegrityStamp } from './IntegrityStamp'
import { useStore } from '../lib/store'
import {
  quarterKey,
  quarterLabel,
  quarterOfDay,
  type Quarter,
  type Transaction,
} from '../lib/types'
import { quarterlyTotals, type QuarterTotals } from '../lib/reports'
import { formatDateTime, localDateTimeInput } from '../lib/datetime'

// ARC quarterly refrigerant record (Refrigerant Trading Authorisation
// permit condition). RTA holders must keep quarterly records of
// refrigerant bought, recovered, sold and otherwise disposed of, retain
// them five years, and produce them on request — permit condition
// checks ask for the last two quarters. This report produces those
// numbers per refrigerant for a chosen calendar quarter, printable via
// the same print stylesheet as the equipment logbook.

export function QuarterlyReportCard() {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        ARC quarterly records
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Refrigerant bought, used, recovered and returned per quarter — the
        record an ARC permit condition check asks for (they request the last
        two quarters; records must be kept for the period required by
        applicable regulations).
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Quarterly report
      </Button>
      {open && <QuarterlyReportModal onClose={() => setOpen(false)} />}
    </Card>
  )
}

function QuarterlyReportModal({ onClose }: { onClose: () => void }) {
  const { state } = useStore()
  const tz = state.location.timezone

  // Local calendar day (business timezone) for each live transaction —
  // quarter membership is a wall-calendar question, not a UTC one.
  const live = useMemo(
    () => state.transactions.filter((t) => !t.deletedAt),
    [state.transactions],
  )
  const dayOf = (t: Transaction) =>
    localDateTimeInput(new Date(t.date), tz).slice(0, 10)

  // Every quarter that has at least one transaction, newest first, plus
  // the current quarter so a fresh period can be printed as "nil".
  const quarters = useMemo(() => {
    const seen = new Map<string, Quarter>()
    const nowQ = quarterOfDay(localDateTimeInput(new Date(), tz).slice(0, 10))
    if (nowQ) seen.set(quarterKey(nowQ), nowQ)
    for (const t of live) {
      const q = quarterOfDay(dayOf(t))
      if (q) seen.set(quarterKey(q), q)
    }
    return [...seen.values()].sort(
      (a, b) => b.year - a.year || b.q - a.q,
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, tz])

  const [selectedKey, setSelectedKey] = useState(() =>
    quarters.length > 0 ? quarterKey(quarters[0]) : '',
  )
  const selected = quarters.find((q) => quarterKey(q) === selectedKey)

  const totals = useMemo<QuarterTotals[]>(
    () =>
      selected ? quarterlyTotals(live, state.bottles, selectedKey, tz) : [],
    [live, selectedKey, selected, state.bottles, tz],
  )

  const sum = (f: (t: QuarterTotals) => number) =>
    totals.reduce((s, t) => s + f(t), 0)

  const quarterOptions: PickerOption[] = quarters.map((q) => ({
    value: quarterKey(q),
    label: quarterLabel(q),
  }))

  const generatedAt = formatDateTime(new Date().toISOString(), tz, state.clock)

  return (
    <Modal open onClose={onClose} title="ARC quarterly record" size="lg">
      <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Field label="Quarter">
            <Picker
              title="Quarter"
              value={selectedKey}
              onChange={setSelectedKey}
              options={quarterOptions}
            />
          </Field>
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div className="print-region space-y-4 text-sm text-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-300 pb-3 dark:border-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Quarterly Refrigerant Record
            {selected ? ` — ${quarterLabel(selected)}` : ''}
          </div>
          <div className="mt-1 text-lg font-semibold">
            {state.businessName || 'Business name not set in Settings'}
          </div>
          <div className="text-xs text-slate-500">
            {[
              state.businessAbn
                ? `ABN ${state.businessAbn}`
                : 'ABN not set in Settings',
              state.arcAuthorisationNumber
                ? `ARC RTA ${state.arcAuthorisationNumber}`
                : 'ARC RTA not set in Settings',
            ].join(' · ')}
          </div>
        </header>

        <section>
          {totals.length === 0 ? (
            <p className="text-sm text-slate-500">
              No refrigerant movements recorded in this quarter (nil return).
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-300 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
                  <tr>
                    <th className="py-1 pr-2">Refrigerant</th>
                    <th className="py-1 pr-2 text-right">Purchased kg</th>
                    <th className="py-1 pr-2 text-right">Charged kg</th>
                    <th className="py-1 pr-2 text-right">Recovered kg</th>
                    <th className="py-1 pr-2 text-right">Returned kg</th>
                    <th className="py-1 pr-2 text-right">Adjust ± kg</th>
                    <th className="py-1 text-right">Loss kg</th>
                  </tr>
                </thead>
                <tbody>
                  {totals.map((r) => (
                    <tr
                      key={r.refrigerant}
                      className="border-b border-slate-200 align-top dark:border-slate-800"
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
                  <tr className="border-t border-slate-300 font-semibold dark:border-slate-700">
                    <td className="py-1 pr-2">Total</td>
                    <Num v={sum((t) => t.purchasedKg)} />
                    <Num v={sum((t) => t.chargedKg)} />
                    <Num v={sum((t) => t.recoveredKg)} />
                    <Num v={sum((t) => t.returnedKg)} />
                    <Num v={sum((t) => t.adjustKg)} signed />
                    <Num v={sum((t) => t.lossKg)} last />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="text-[11px] text-slate-500">
          <p>
            Purchased = cylinders entering the system (intake). Charged =
            refrigerant into equipment. Recovered = refrigerant out of
            equipment into cylinders (bottle-to-bottle decants excluded).
            Returned = net refrigerant in cylinders at the time they were
            returned to a store/supplier. Loss = recorded hose / decant
            losses. Deleted log entries are excluded; they remain available
            in the JSON/CSV export audit trail.
          </p>
        </section>

        <footer className="border-t border-slate-300 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          <p>
            Quarterly refrigerant record kept per the conditions of a
            Refrigerant Trading Authorisation under the Ozone Protection and
            Synthetic Greenhouse Gas Management Regulations (records of
            refrigerant acquired, recovered, sold or otherwise disposed of,
            retained for the period required by applicable regulations).
          </p>
          <p className="mt-2">Generated {generatedAt}.</p>
          <IntegrityStamp />
          <div className="mt-4 grid grid-cols-2 gap-6 print:mt-8">
            <div>
              <div className="border-b border-slate-400 dark:border-slate-600">
                &nbsp;
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                Authorised signature
              </div>
            </div>
            <div />
          </div>
        </footer>
      </div>
    </Modal>
  )
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
