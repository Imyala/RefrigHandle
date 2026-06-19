import { useSyncExternalStore } from 'react'

// Per-device, per-browser preferences that aren't part of the synced
// AppState — they describe how THIS device behaves/displays, so they must
// not travel to other devices via sync. Backed by localStorage with a tiny
// subscribe/snapshot store so components re-render reactively on change.

export interface DevicePrefs {
  // Resolve the timezone from the device's physical location (geolocation)
  // rather than trusting the device clock's timezone — for a tech whose
  // phone clock isn't set to update automatically while travelling.
  locationTimezone: boolean
  // Display all times in UTC (with a "UTC" label) instead of the local /
  // stamped zone.
  displayUtc: boolean
}

const KEY = 'refrighandle.devicePrefs'
const DEFAULTS: DevicePrefs = { locationTimezone: false, displayUtc: false }

function load(): DevicePrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<DevicePrefs>) }
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
