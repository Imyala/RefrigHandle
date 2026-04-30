import { useRef, useState } from 'react'
import {
  Button,
  Card,
  Field,
  Pill,
  TextInput,
} from '../components/ui'
import { useStore } from '../lib/store'
import { REFRIGERANT_TYPES } from '../lib/types'

export default function Settings() {
  const {
    state,
    setTechnician,
    addCustomRefrigerant,
    removeCustomRefrigerant,
    resetAll,
    importState,
  } = useStore()
  const [techName, setTechName] = useState(state.technician)
  const [newType, setNewType] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

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
        'refrigerantType',
        'amount_kg',
        'weightBefore_kg',
        'weightAfter_kg',
        'job',
        'client',
        'equipment',
        'reason',
        'technician',
        'notes',
      ],
      ...state.transactions.map((t) => {
        const b = state.bottles.find((x) => x.id === t.bottleId)
        const j = state.jobs.find((x) => x.id === t.jobId)
        return [
          t.date,
          t.kind,
          b?.bottleNumber ?? '',
          b?.refrigerantType ?? '',
          t.amount.toFixed(3),
          t.weightBefore.toFixed(3),
          t.weightAfter.toFixed(3),
          j?.name ?? '',
          j?.client ?? '',
          t.equipment ?? '',
          t.reason ?? '',
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
            <Button onClick={() => setTechnician(techName)}>Save</Button>
          </div>
        </Field>
      </Card>

      <Card>
        <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Built-in refrigerants
        </div>
        <div className="flex flex-wrap gap-2">
          {REFRIGERANT_TYPES.map((t) => (
            <Pill key={t}>{t}</Pill>
          ))}
        </div>
        <div className="my-3 h-px bg-slate-200 dark:bg-slate-800" />
        <div className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Custom refrigerants
        </div>
        {state.customRefrigerants.length === 0 ? (
          <div className="text-sm text-slate-500">None added.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {state.customRefrigerants.map((t) => (
              <button
                key={t}
                onClick={() => {
                  if (confirm(`Remove ${t} from the list?`)) removeCustomRefrigerant(t)
                }}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 hover:bg-red-100 hover:text-red-800 dark:bg-blue-900/40 dark:text-blue-200"
              >
                {t} <span aria-hidden>✕</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <TextInput
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            placeholder="e.g. R448A"
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
        <div className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Backup &amp; export
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportJson}>
            ⬇ Export JSON
          </Button>
          <Button variant="secondary" onClick={exportCsv}>
            ⬇ Export log CSV
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            ⬆ Import JSON
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
          Erase every bottle, site, and transaction stored on this device. Export first if you want a backup.
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
