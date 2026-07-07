import { useMemo, useState } from 'react'
import { Button, Card } from './ui'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { buildReminderEvents, shareReminderCalendar } from '../lib/reminders'
import { localDateTimeInput } from '../lib/datetime'

// Reminders that reach the owner OUTSIDE the app, with no server: one
// calendar file, imported once, and the phone does the nagging — licence
// and RTA renewals, cylinder tests, the quarterly-record cadence.

export function ReminderCalendarCard() {
  const { state } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const today = localDateTimeInput(new Date(), state.location.timezone).slice(0, 10)
  const count = useMemo(
    () => buildReminderEvents(state, today).length,
    [state, today],
  )

  async function share() {
    if (busy) return
    setBusy(true)
    try {
      const { outcome, count: n } = await shareReminderCalendar(state, today)
      if (outcome === 'downloaded') {
        toast.show(
          `Saved ${n} reminders as a calendar file — open it to add them to your calendar.`,
          'success',
        )
      } else if (outcome === 'shared') {
        toast.show(`Shared ${n} reminders — add them via your calendar app.`, 'success')
      }
    } catch {
      toast.show('Could not build the reminder calendar.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Reminders on your calendar
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Put the deadlines where you'll actually see them: one calendar file
        with every licence and RTA renewal (60 days ahead and on the day),
        each cylinder's test due date, and a heads-up two weeks before every
        quarter closes. Re-add it after renewals to refresh the dates —
        updated reminders replace the old ones.
      </p>
      <Button variant="secondary" onClick={() => void share()} disabled={busy || count === 0}>
        {count === 0
          ? 'No upcoming reminders yet'
          : busy
            ? 'Building…'
            : `Add ${count} reminder${count === 1 ? '' : 's'} to calendar…`}
      </Button>
    </Card>
  )
}
