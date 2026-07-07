import { useMemo, useRef, useState } from 'react'
import { Button, Modal, TextArea } from './ui'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import {
  IMPORT_TEMPLATE_CSV,
  parseBottleImport,
  normalizeRefrigerant,
} from '../lib/bottleImport'
import { REFRIGERANT_TYPES } from '../lib/types'
import { shareOrDownload } from '../lib/backup'

// "Bring your cylinders in" — paste the spreadsheet (or pick the CSV) a
// business already keeps, preview what will import row by row, and create
// the lot in one tap. Each imported cylinder goes through the normal
// addBottle path, so every one gets its change-log entry and its intake
// row on the refrigerant ledger — a bulk import leaves the same paper
// trail as sixty taps of the Add button.

export function BottleImportButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex min-h-11 items-center text-xs font-medium text-brand-600 hover:underline dark:text-brand-400'
        }
      >
        ⇪ Import from spreadsheet
      </button>
      {open && <BottleImportModal onClose={() => setOpen(false)} />}
    </>
  )
}

function BottleImportModal({ onClose }: { onClose: () => void }) {
  const { state, addBottle, addCustomRefrigerant } = useStore()
  const toast = useToast()
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () => (text.trim() ? parseBottleImport(text, state.bottles) : null),
    [text, state.bottles],
  )

  async function pickFile(f: File) {
    try {
      setText(await f.text())
    } catch {
      toast.show('Could not read that file.', 'error')
    }
  }

  function doImport() {
    if (!parsed || parsed.ready === 0 || importing) return
    setImporting(true)
    let created = 0
    // Unknown refrigerants become custom types once each, so the pickers
    // and reports can show them properly.
    const registered = new Set<string>()
    for (const row of parsed.rows) {
      if (!row.data) continue
      const [name, known] = normalizeRefrigerant(row.data.refrigerantType)
      if (
        !known &&
        name &&
        !registered.has(name) &&
        !state.customRefrigerants.includes(name) &&
        !(REFRIGERANT_TYPES as readonly string[]).includes(name)
      ) {
        addCustomRefrigerant(name)
        registered.add(name)
      }
      addBottle(row.data)
      created += 1
    }
    toast.show(
      `Imported ${created} cylinder${created === 1 ? '' : 's'}` +
        (parsed.skipped > 0 ? ` · ${parsed.skipped} skipped` : ''),
      'success',
    )
    onClose()
  }

  return (
    <Modal open title="Import cylinders" onClose={onClose} size="lg">
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Already keep your cylinder list in a spreadsheet? Copy the rows
          (with their header line) and paste them here, or pick the CSV
          file. Weights are read as <strong>kg</strong>. Each imported
          cylinder is recorded exactly as if it was added by hand — change
          log entry, intake row and all.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
          >
            Choose CSV file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void pickFile(f)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() =>
              void shareOrDownload(
                new Blob(['\uFEFF' + IMPORT_TEMPLATE_CSV], { type: 'text/csv' }),
                'refrighandle-import-template.csv',
                'RefrigHandle import template',
              )
            }
            className="inline-flex min-h-11 items-center text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
          >
            Get the template
          </button>
        </div>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={
            'Bottle number,Refrigerant,Tare (kg),Gross (kg),Last test,Next test\nCYL-001,R410A,12.5,21.3,06/2024,06/2034'
          }
          className="font-mono text-xs"
          aria-label="Pasted spreadsheet rows"
        />

        {parsed && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                {parsed.ready} ready
              </span>
              {parsed.skipped > 0 && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">
                  {parsed.skipped} will be skipped
                </span>
              )}
            </div>
            {parsed.unmatchedHeaders.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Ignored column{parsed.unmatchedHeaders.length === 1 ? '' : 's'}:{' '}
                {parsed.unmatchedHeaders.join(', ')}
              </p>
            )}
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-800">
              {parsed.rows.slice(0, 60).map((r) => (
                <div key={r.line} className="text-xs">
                  {r.data ? (
                    <span>
                      ✓{' '}
                      <span className="font-medium">{r.data.bottleNumber}</span>{' '}
                      · {r.data.refrigerantType} · tare{' '}
                      {r.data.tareWeight.toFixed(2)} kg · gross{' '}
                      {r.data.grossWeight.toFixed(2)} kg
                      {r.warnings.length > 0 && (
                        <span className="text-amber-700 dark:text-amber-300">
                          {' '}
                          — {r.warnings.join('; ')}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-red-700 dark:text-red-300">
                      ✕ Line {r.line}: {r.errors.join('; ')}
                    </span>
                  )}
                </div>
              ))}
              {parsed.rows.length > 60 && (
                <div className="text-xs text-slate-500">
                  …and {parsed.rows.length - 60} more rows
                </div>
              )}
            </div>
          </div>
        )}

        <Button
          full
          disabled={!parsed || parsed.ready === 0 || importing}
          onClick={doImport}
        >
          {importing
            ? 'Importing…'
            : parsed && parsed.ready > 0
              ? `Import ${parsed.ready} cylinder${parsed.ready === 1 ? '' : 's'}`
              : 'Paste your list to preview'}
        </Button>
      </div>
    </Modal>
  )
}
