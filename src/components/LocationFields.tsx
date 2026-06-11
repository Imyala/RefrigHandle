import { useMemo } from 'react'
import { Field, TextInput } from './ui'
import { Picker, type PickerOption } from './Picker'
import {
  AU_CITIES_BY_REGION,
  AU_REGIONS,
  CITIES_BY_COUNTRY,
  CITY_OTHER_VALUE,
  TIMEZONE_OPTIONS,
  type LocationSettings,
} from '../lib/types'

const COUNTRY_OPTIONS: readonly PickerOption[] = [
  { value: 'Australia', label: 'Australia' },
  { value: 'New Zealand', label: 'New Zealand' },
  { value: 'United Kingdom', label: 'United Kingdom' },
  { value: 'United States', label: 'United States' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Other', label: 'Other' },
]

const AU_REGION_OPTIONS: readonly PickerOption[] = AU_REGIONS.map((r) => ({
  value: r,
  label: r,
}))

type SetLoc = React.Dispatch<React.SetStateAction<LocationSettings>>

// Country / region / city / timezone, shared between Settings and the
// first-run onboarding screen so both stay in lock-step. Pure UI over a
// LocationSettings value — the caller owns the state and decides when to
// persist it.
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
        group: tz.group,
      })),
    [],
  )

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Country">
          <Picker
            title="Country"
            value={loc.country}
            onChange={(v) =>
              setLoc((l) => ({
                ...l,
                country: v,
                // Clear region when leaving Australia — the curated AU
                // state list doesn't apply to other countries.
                region: v === 'Australia' ? l.region : '',
              }))
            }
            emptyLabel="—"
            options={COUNTRY_OPTIONS}
          />
        </Field>
        <Field label={loc.country === 'Australia' ? 'State / territory' : 'Region'}>
          {loc.country === 'Australia' ? (
            <Picker
              title="State / territory"
              value={loc.region}
              onChange={(v) => setLoc((l) => ({ ...l, region: v }))}
              emptyLabel="—"
              options={AU_REGION_OPTIONS}
            />
          ) : (
            <TextInput
              value={loc.region}
              onChange={(e) => setLoc((l) => ({ ...l, region: e.target.value }))}
              placeholder="e.g. region / state"
            />
          )}
        </Field>
      </div>
      <Field label="City">
        <CityField loc={loc} setLoc={setLoc} />
      </Field>
      <Field
        label="Timezone"
        hint='Used for "now" defaults and timestamp display. Pick the one your work day actually runs in.'
      >
        <Picker
          title="Timezone"
          value={loc.timezone}
          onChange={(v) => setLoc((l) => ({ ...l, timezone: v }))}
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
  // City list depends on Country (and Region for Australia).
  const cityList: readonly string[] = useMemo(() => {
    if (loc.country === 'Australia') {
      return loc.region ? AU_CITIES_BY_REGION[loc.region] ?? [] : []
    }
    return CITIES_BY_COUNTRY[loc.country] ?? []
  }, [loc.country, loc.region])

  const cityOptions = useMemo<PickerOption[]>(() => {
    const opts: PickerOption[] = cityList.map((c) => ({ value: c, label: c }))
    opts.push({
      value: CITY_OTHER_VALUE,
      label: 'Other — type my own',
    })
    return opts
  }, [cityList])

  // A city counts as "custom" when it has a value and that value isn't
  // in the curated list for the current country/region.
  const isCustom = !!loc.city && !cityList.includes(loc.city)
  // pickerValue is the value displayed by the Picker trigger. When the
  // stored city is custom, we show the "Other" marker so the field
  // makes sense; the real value lives in loc.city and is editable
  // below via the TextInput.
  const pickerValue = isCustom ? CITY_OTHER_VALUE : loc.city

  // If the country/region change leaves the stored city missing from
  // the curated list, we keep the typed value in loc.city and just
  // surface "Other" — the tech doesn't lose their entry.

  if (cityList.length === 0) {
    // No curated list for this country — fall back to a plain text
    // input so the field still works.
    return (
      <TextInput
        value={loc.city}
        onChange={(e) => setLoc((l) => ({ ...l, city: e.target.value }))}
        placeholder="e.g. Sydney"
      />
    )
  }

  return (
    <div className="space-y-2">
      <Picker
        title="City"
        value={pickerValue}
        onChange={(v) => {
          if (v === CITY_OTHER_VALUE) {
            // Switching to Other clears the stored city only if it's
            // currently one of the curated values — preserves a
            // previously typed custom city.
            setLoc((l) => (cityList.includes(l.city) ? { ...l, city: '' } : l))
            return
          }
          setLoc((l) => ({ ...l, city: v }))
        }}
        emptyLabel="—"
        options={cityOptions}
      />
      {(pickerValue === CITY_OTHER_VALUE || isCustom) && (
        <TextInput
          value={loc.city}
          onChange={(e) => setLoc((l) => ({ ...l, city: e.target.value }))}
          placeholder="Type city name"
          aria-label="Custom city name"
        />
      )}
    </div>
  )
}
