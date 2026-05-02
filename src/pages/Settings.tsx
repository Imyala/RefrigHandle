import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Field,
  Pill,
  Select,
  TextInput,
} from '../components/ui'
import { useStore } from '../lib/store'
import {
  REFRIGERANT_TYPES,
  transactionLoss,
  type Theme,
  type WeightUnit,
} from '../lib/types'
import { useToast } from '../lib/toast'
import { isSyncConfigured } from '../lib/sync'

export default function Settings() {
  const {
    state,
    setTechnician,
    setUnit,
    setTheme,
    setSyncSettings,
    addCustomRefrigerant,
    removeCustomRefrigerant,
    toggleFavoriteRefrigerant,
    resetAll,
    importState,
  } = useStore()
  const toast = useToast()
  const [techName, setTechName] = useState(state.technician)
  const [newType, setNewType] = useState('')
  const [teamIdInput, setTeamIdInput] = useState(state.sync.teamId)
  const fileRef = useRef<HTMLInputElement>(null)
  const favorites = state.favoriteRefrigerants

  useEffect(() => setTechName(state.technician), [state.technician])
  useEffect(() => setTeamIdInput(state.sync.teamId), [state.sync.teamId])

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refrighandle-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportCsv() {
    const rows = [
      [
        'date',
        'kind',
        'bottleNumber',
        'sourceBottleNumber',
        'refrigerantType',
        'amount_into_equipment_kg',
        'amount_from_bottle_kg',
        'loss_kg',
        'weightBefore_kg',
        'weightAfter_kg',
        'sourceWeightBefore_kg',
        'sourceWeightAfter_kg',
        'site',
        'client',
        'unit',
        'equipment',
        'reason',
        'returnDestination',
        'technician',
        'notes',
      ],
      ...state.transactions.map((t) => {
        const b = state.bottles.find((x) => x.id === t.bottleId)
        const sb = t.sourceBottleId
          ? state.bottles.find((x) => x.id === t.sourceBottleId)
          : null
        const s = state.sites.find((x) => x.id === t.siteId)
        const u = state.units.find((x) => x.id === t.unitId)
        const loss = transactionLoss(t)
        return [
          t.date,
          t.kind,
          b?.bottleNumber ?? '',
          sb?.bottleNumber ?? '',
          b?.refrigerantType ?? '',
          t.amount.toFixed(3),
          (t.bottleAmount ?? t.amount).toFixed(3),
          loss.toFixed(3),
          t.weightBefore.toFixed(3),
          t.weightAfter.toFixed(3),
          t.sourceWeightBefore?.toFixed(3) ?? '',
          t.sourceWeightAfter?.toFixed(3) ?? '',
          s?.name ?? '',
          s?.client ?? '',
          u?.name ?? '',
          t.equipment ?? '',
          t.reason ?? '',
          t.returnDestination ?? '',
          t.technician ?? '',
          (t.notes ?? '').replace(/[\r\n]+/g, ' '),
        ]
      }),
    ]
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const s = String(cell ?? '')
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
          })
          .join(','),
      )
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `refrighandle-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importJson(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || !Array.isArray(data.bottles)) {
        alert('That file does not look like a RefrigHandle export.')
        return
      }
      if (confirm('Replace ALL current data with this file?')) {
        importState(data)
      }
    } catch {
      alert('Could not read that file.')
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
        Settings
      </h2>

      <Card>
        <Field label="Default technician name">
          <div className="flex gap-2">
            <TextInput
              value={techName}
              onChange={(e) => setTechName(e.target.value)}
              placeholder="Your name"
            />
            <Button
              onClick={() => {
                setTechnician(techName)
                toast.show('Saved')
              }}
            >
              Save
            </Button>
          </div>
        </Field>
      </Card>

      <Card>
        <Field
          label="Theme"
          hint="Dark mode is easier on the eyes in plant rooms and basements"
        >
          <div className="grid grid-cols-3 gap-2">
            {(['light', 'dark', 'system'] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTheme(t)
                  toast.show(
                    t === 'system' ? 'Following system theme' : `${t[0].toUpperCase()}${t.slice(1)} mode`,
                  )
                }}
                className={`rounded-xl px-3 py-3 text-sm font-medium capitalize transition ${
                  state.theme === t
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card>
        <Field label="Weight units" hint="Display only — data is always stored in kg internally">
          <Select
            value={state.unit}
            onChange={(e) => {
              setUnit(e.target.value as WeightUnit)
              toast.show(`Switched to ${e.target.value}`)
            }}
          >
            <option value="kg">Kilograms (kg)</option>
            <option value="lb">Pounds (lb)</option>
          </Select>
        </Field>
      </Card>

      <Card>
        <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Refrigerants
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Tap the star to favourite the ones you use most — they'll appear at the
          top of every refrigerant dropdown.
        </p>

        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Built-in
        </div>
        <div className="flex flex-wrap gap-2">
          {REFRIGERANT_TYPES.map((t) => (
            <RefrigerantChip
              key={t}
              name={t}
              starred={favorites.includes(t)}
              onToggleStar={() => toggleFavoriteRefrigerant(t)}
            />
          ))}
        </div>

        <div className="my-3 h-px bg-slate-200 dark:bg-slate-800" />

        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Custom
        </div>
        {state.customRefrigerants.length === 0 ? (
          <div className="text-sm text-slate-500">None added.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.customRefrigerants.map((t) => (
              <RefrigerantChip
                key={t}
                name={t}
                starred={favorites.includes(t)}
                onToggleStar={() => toggleFavoriteRefrigerant(t)}
                onRemove={() => {
                  if (confirm(`Remove ${t} from the list?`))
                    removeCustomRefrigerant(t)
                }}
              />
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <TextInput
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="e.g. R12B1"
          />
          <Button
            onClick={() => {
              addCustomRefrigerant(newType)
              setNewType('')
            }}
          >
            Add
          </Button>
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Cloud sync
          </div>
          {isSyncConfigured() ? (
            <Pill tone={state.sync.enabled ? 'green' : 'slate'}>
              {state.sync.enabled ? 'On' : 'Off'}
            </Pill>
          ) : (
            <Pill tone="amber">Not configured</Pill>
          )}
        </div>
        {!isSyncConfigured() ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Cloud sync is built in but inactive — see{' '}
            <a
              className="font-medium text-brand-600 hover:underline"
              href="https://github.com/Imyala/RefrigHandle/blob/main/SYNC.md"
              target="_blank"
              rel="noreferrer"
            >
              SYNC.md
            </a>{' '}
            for the one-time Supabase setup. Without it the app stays fully
            offline (data only on this device).
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Devices using the same <strong>Team ID</strong> share the same
              data in real time. Last write wins.
            </p>
            <Field label="Team ID" hint="Pick anything — must match across all devices">
              <div className="flex gap-2">
                <TextInput
                  value={teamIdInput}
                  onChange={(e) => setTeamIdInput(e.target.value)}
                  placeholder="e.g. acme-hvac"
                />
                <Button
                  onClick={() => {
                    setSyncSettings({
                      enabled: !!teamIdInput.trim(),
                      teamId: teamIdInput.trim(),
                    })
                    toast.show(
                      teamIdInput.trim() ? 'Cloud sync enabled' : 'Cloud sync paused',
                    )
                  }}
                >
                  {state.sync.enabled ? 'Update' : 'Connect'}
                </Button>
              </div>
            </Field>
            {state.sync.enabled && (
              <Button
                variant="secondary"
                onClick={() => {
                  setSyncSettings({ enabled: false, teamId: state.sync.teamId })
                  toast.show('Cloud sync paused')
                }}
              >
                Pause sync
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Backup &amp; export
        </div>
        <p className="mb-3 text-xs text-slate-500">
          CSV is the F-Gas-friendly log. JSON is a full backup of all data
          on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportJson}>
            Export JSON
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            Export log CSV
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">
          Danger zone
        </div>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Erase every bottle, site, unit, and transaction stored on this device. Export first if you want a backup.
        </p>
        <Button variant="danger" onClick={resetAll}>
          Erase all data
        </Button>
      </Card>

      <p className="px-1 text-center text-xs text-slate-400">
        RefrigHandle · data stored locally on this device
      </p>
    </div>
  )
}

function RefrigerantChip({
  name,
  starred,
  onToggleStar,
  onRemove,
}: {
  name: string
  starred: boolean
  onToggleStar: () => void
  onRemove?: () => void
}) {
  const baseChip = onRemove
    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${baseChip}`}
    >
      <button
        type="button"
        onClick={onToggleStar}
        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none ${
          starred
            ? 'text-amber-500'
            : 'text-slate-400 hover:text-amber-500 dark:text-slate-500'
        }`}
        aria-label={starred ? `Unfavourite ${name}` : `Favourite ${name}`}
        title={starred ? 'Unfavourite' : 'Favourite'}
      >
        {starred ? '★' : '☆'}
      </button>
      <span>{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full px-1 text-slate-500 hover:bg-red-100 hover:text-red-700 dark:text-slate-400 dark:hover:bg-red-900/40"
          aria-label={`Remove ${name}`}
        >
          ✕
        </button>
      )}
    </div>
  )
}
