import { useSyncExternalStore } from 'react'

// Per-device, per-browser preferences that aren't part of the synced
// AppState — they describe how THIS device behaves/displays, so they must
// not travel to other devices via sync. Backed by localStorage with a tiny
// subscribe/snapshot store so components re-render reactively on change.

// How timestamps are shown on this device:
//  'local' — in the zone the record was logged in (or the device zone)
//  'utc'   — in UTC only, always labelled
//  'both'  — local (logger's zone) with the UTC time alongside it, so a
//            multi-timezone crew never has to convert in their head
export type TimeDisplay = 'local' | 'utc' | 'both'

export interface DevicePrefs {
  // Resolve the timezone from the device's physical location (geolocation)
  // rather than trusting the device clock's timezone — for a tech whose
  // phone clock isn't set to update automatically while travelling.
  locationTimezone: boolean
  // How times are displayed (see TimeDisplay). Records are always stored in
  // UTC regardless of this setting.
  timeDisplay: TimeDisplay
}

const KEY = 'refrighandle.devicePrefs'
const DEFAULTS: DevicePrefs = { locationTimezone: false, timeDisplay: 'local' }

function load(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<DevicePrefs> & {
      displayUtc?: boolean
    }
    const merged = { ...DEFAULTS, ...parsed }
    // Migrate the legacy boolean "displayUtc" toggle to the new mode.
    if (parsed.timeDisplay == null && typeof parsed.displayUtc === 'boolean') {
      merged.timeDisplay = parsed.displayUtc ? 'utc' : 'local'
    }
    return {
      locationTimezone: !!merged.locationTimezone,
      timeDisplay: merged.timeDisplay,
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let prefs: DevicePrefs = load()
const listeners = new Set<() => void>()

export function getDevicePrefs(): DevicePrefs {
  return prefs
}

export function setDevicePref<K extends keyof DevicePrefs>(
  key: K,
  value: DevicePrefs[K],
): void {
  if (prefs[key] === value) return
  prefs = { ...prefs, [key]: value }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // ignore (private mode / disabled storage)
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Reactive read — components re-render when any device pref changes.
export function useDevicePrefs(): DevicePrefs {
  return useSyncExternalStore(subscribe, getDevicePrefs, getDevicePrefs)
}
