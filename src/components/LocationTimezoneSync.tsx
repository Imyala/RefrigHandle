import { useEffect } from 'react'
import { useDevicePrefs } from '../lib/devicePrefs'
import { setResolvedLocationTz } from '../lib/datetime'

// When the "Use my location for accurate timezone" device pref is on, watch
// the device's physical location and resolve it to an IANA timezone (offline,
// via tz-lookup). New logs are then stamped in the zone the tech is actually
// in — robust even if their phone clock isn't set to update automatically
// while travelling. Renders nothing; just drives the resolved-zone cache in
// lib/datetime. Falls back silently to the device-clock zone if permission is
// denied or the position can't be read.
export function LocationTimezoneSync() {
  const { locationTimezone } = useDevicePrefs()

  useEffect(() => {
    if (!locationTimezone) {
      setResolvedLocationTz('')
      return
    }
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    // Load the (sizeable) timezone dataset only when this pref is actually
    // on, so it stays out of the eager first-paint bundle. Resolved lazily
    // on first use and reused for subsequent position fixes.
    let tzlookup: ((lat: number, lon: number) => string) | null = null
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        void (async () => {
          try {
            if (!tzlookup) {
              tzlookup = (await import('tz-lookup')).default
            }
            const tz = tzlookup(pos.coords.latitude, pos.coords.longitude)
            if (tz) setResolvedLocationTz(tz)
          } catch {
            // Coordinates outside the lookup's data — keep the fallback.
          }
        })()
      },
      () => {
        // Permission denied / unavailable — leave the device-clock fallback.
      },
      // City-level accuracy is plenty for a timezone; keep it light on
      // battery and let a cached fix satisfy the watch.
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 30_000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [locationTimezone])

  return null
}
