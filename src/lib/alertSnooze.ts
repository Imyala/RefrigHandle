// Per-device "hide this alert" snooze. When a user dismisses a compliance
// alert (licence expiry, hydro test, …) we stash a timestamp in
// localStorage and suppress that alert until the window passes — then it
// re-alerts. Device-local UI state, deliberately NOT part of the synced
// AppState: a snooze on one tech's phone shouldn't hide the warning on
// another's.

const PREFIX = 'refrighandle.alertSnooze.'
// How long a dismissed alert stays hidden before it re-alerts.
export const ALERT_SNOOZE_HOURS = 24
const SNOOZE_MS = ALERT_SNOOZE_HOURS * 60 * 60 * 1000

export function snoozeAlert(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, String(Date.now()))
  } catch {
    // ignore (private mode / disabled storage) — the alert just stays up
  }
}

export function isAlertSnoozed(key: string): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < SNOOZE_MS
  } catch {
    return false
  }
}
