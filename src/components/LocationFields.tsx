import { useMemo } from 'react'
import { Field, TextInput } from './ui'
import { Picker, type PickerOption } from './Picker'
import {
  AU_CITIES_BY_REGION,
  AU_REGIONS,
  CITY_OTHER_VALUE,
  TIMEZONE_OPTIONS,
  type LocationSettings,
} from '../lib/types'

const AU_REGION_OPTIONS: readonly PickerOption[] = AU_REGIONS.map((r) => ({
  value: r,
  label: r,
}))

type SetLoc = React.Dispatch<React.SetStateAction<LocationSettings>>

// State / city / timezone, shared between Settings and the first-run
// onboarding screen so both stay in lock-step. The app is
// Australia-only (ARC RTA / RHL licensing is Australian), so there is
// no country picker — every edit stamps country: 'Australia', which
// also migrates any pre-Australia-only stored value on the next save.
// Pure UI over a LocationSettings value — the caller owns the state
// and decides when to persist it.
export function LocationFields({
  loc,
  setLoc,
}: {
  loc: LocationSettings
  setLoc: SetLoc
}) {
  const timezoneOptions = useMemo<PickerOption[]>(
    () =>
      TIMEZONE_OPTIONS.map((tz) => ({
        value: tz.iana,
        label: tz.label,
      })),
    [],
  )

  return (
    <div className="space-y-3">
      <Field label="State / territory">
        <Picker
          title="State / territory"
          value={loc.region}
          onChange={(v) =>
            setLoc((l) => ({ ...l, country: 'Australia', region: v }))
          }
          emptyLabel="—"
          options={AU_REGION_OPTIONS}
        />
      </Field>
      <Field label="City / town">
        <CityField loc={loc} setLoc={setLoc} />
      </Field>
      <Field
        label="Timezone"
        hint='Used for "now" defaults and timestamp display. Pick the one your work day actually runs in.'
      >
        <Picker
          title="Timezone"
          value={loc.timezone}
          onChange={(v) =>
            setLoc((l) => ({ ...l, country: 'Australia', timezone: v }))
          }
          emptyLabel="— follow this device —"
          options={timezoneOptions}
        />
      </Field>
    </div>
  )
}

export function CityField({
  loc,
  setLoc,
}: {
  loc: LocationSettings
  setLoc: SetLoc
}) {
  // Cities for the picked state; until a state is chosen, offer the
  // whole country grouped by state (same behaviour as the Sites form).
  const cityList: readonly string[] = useMemo(() => {
    if (loc.region) return AU_CITIES_BY_REGION[loc.region] ?? []
    return AU_REGIONS.flatMap((r) => AU_CITIES_BY_REGION[r] ?? [])
  }, [loc.region])

  const cityOptions = useMemo<PickerOption[]>(() => {
    const opts: PickerOption[] = loc.region
      ? cityList.map((c) => ({ value: c, label: c }))
      : AU_REGIONS.flatMap((r) =>
          (AU_CITIES_BY_REGION[r] ?? []).map((c) => ({
            value: c,
            label: c,
            group: r,
          })),
        )
    opts.push({
      value: CITY_OTHER_VALUE,
      label: 'Other — type my own',
    })
    return opts
  }, [loc.region, cityList])

  // A city counts as "custom" when it has a value and that value isn't
  // in the curated list for the current state.
  const isCustom = !!loc.city && !cityList.includes(loc.city)
  // pickerValue is the value displayed by the Picker trigger. When the
  // stored city is custom, we show the "Other" marker so the field
  // makes sense; the real value lives in loc.city and is editable
  // below via the TextInput.
  const pickerValue = isCustom ? CITY_OTHER_VALUE : loc.city

  // If a state change leaves the stored city missing from the curated
  // list, we keep the typed value in loc.city and just surface "Other"
  // — the tech doesn't lose their entry.

  return (
    <div className="space-y-2">
      <Picker
        title="City / town"
        value={pickerValue}
        onChange={(v) => {
          if (v === CITY_OTHER_VALUE) {
            // Switching to Other clears the stored city only if it's
            // currently one of the curated values — preserves a
            // previously typed custom city.
            setLoc((l) =>
              cityList.includes(l.city)
                ? { ...l, country: 'Australia', city: '' }
                : { ...l, country: 'Australia' },
            )
            return
          }
          setLoc((l) => ({ ...l, country: 'Australia', city: v }))
        }}
        emptyLabel="—"
        options={cityOptions}
      />
      {(pickerValue === CITY_OTHER_VALUE || isCustom) && (
        <TextInput
          value={loc.city}
          onChange={(e) =>
            setLoc((l) => ({
              ...l,
              country: 'Australia',
              city: e.target.value,
            }))
          }
          placeholder="Type city / town name"
          aria-label="Custom city name"
        />
      )}
    </div>
  )
}
