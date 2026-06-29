// Per-device "hide this alert" snooze. When a user dismisses a compliance
// alert (licence expiry, hydro test, …) we stash a timestamp in
// localStorage and suppress that alert until the window passes — then it
// re-alerts. Device-local UI state, deliberately NOT part of the synced
// AppState: a snooze on one tech's phone shouldn't hide the warning on
// another's.

const PREFIX = 'refrighandle.alertSnooze.'
// Default window a dismissed alert stays hidden before it re-alerts.
export const ALERT_SNOOZE_HOURS = 24
// Cylinder hydrostatic test is a slower-moving, less day-to-day concern
// than a licence expiry, so its alert stays hidden longer once dismissed.
export const HYDRO_SNOOZE_HOURS = 72

export function snoozeAlert(key: string): void {
  try {
    localStorage.setItem(PREFIX + key, String(Date.now()))
  } catch {
    // ignore (private mode / disabled storage) — the alert just stays up
  }
}

// The snooze window is decided at check time (the stored value is just
// when it was dismissed), so different alerts can hide for different
// durations off the same timestamp.
export function isAlertSnoozed(
  key: string,
  hours: number = ALERT_SNOOZE_HOURS,
): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return false
    const at = Number(raw)
    if (!Number.isFinite(at)) return false
    return Date.now() - at < hours * 60 * 60 * 1000
  } catch {
    return false
  }
}
