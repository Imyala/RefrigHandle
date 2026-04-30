import { useState } from 'react'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  TextArea,
  TextInput,
} from '../components/ui'
import { useStore } from '../lib/store'
import type { Location } from '../lib/types'
import { netWeight } from '../lib/types'

export default function Locations() {
  const { state, addLocation, updateLocation, deleteLocation } = useStore()
  const { locations, bottles, transactions } = state

  const [editing, setEditing] = useState<Location | null>(null)
  const [adding, setAdding] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Sites
        </h2>
        <Button onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          title="No sites yet"
          body="Add the locations or clients where bottles get used."
          action={<Button onClick={() => setAdding(true)}>+ Add site</Button>}
        />
      ) : (
        <div className="space-y-2">
          {locations
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((l) => {
              const onSite = bottles.filter((b) => b.currentLocationId === l.id)
              const charged = transactions
                .filter((t) => t.locationId === l.id && t.kind === 'charge')
                .reduce((s, t) => s + t.amount, 0)
              const recovered = transactions
                .filter((t) => t.locationId === l.id && t.kind === 'recover')
                .reduce((s, t) => s + t.amount, 0)
              return (
                <Card key={l.id} className="!p-3">
                  <button
                    className="w-full text-left"
                    onClick={() => setEditing(l)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {l.name}
                        </div>
                        {l.client && (
                          <div className="text-sm text-slate-500">{l.client}</div>
                        )}
                        {l.address && (
                          <div className="truncate text-xs text-slate-500">
                            {l.address}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {onSite.length}
                        </div>
                        <div className="text-slate-500">on site</div>
                      </div>
                      <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {charged.toFixed(2)} kg
                        </div>
                        <div className="text-slate-500">charged</div>
                      </div>
                      <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">
                          {recovered.toFixed(2)} kg
                        </div>
                        <div className="text-slate-500">recovered</div>
                      </div>
                    </div>
                    {onSite.length > 0 && (
                      <div className="mt-2 text-xs text-slate-500">
                        Bottles here:{' '}
                        {onSite
                          .map(
                            (b) =>
                              `${b.bottleNumber} (${netWeight(b).toFixed(1)} kg ${b.refrigerantType})`,
                          )
                          .join(', ')}
                      </div>
                    )}
                  </button>
                </Card>
              )
            })}
        </div>
      )}

      <LocationForm
        open={adding}
        title="New site"
        onClose={() => setAdding(false)}
        onSave={(data) => {
          addLocation(data)
          setAdding(false)
        }}
      />

      <LocationForm
        open={!!editing}
        title="Edit site"
        location={editing ?? undefined}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing) updateLocation(editing.id, data)
          setEditing(null)
        }}
        onDelete={
          editing
            ? () => {
                if (confirm('Delete this site? Bottles assigned here will be unassigned.')) {
                  deleteLocation(editing.id)
                  setEditing(null)
                }
              }
            : undefined
        }
      />
    </div>
  )
}

function LocationForm({
  open,
  title,
  location,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean
  title: string
  location?: Location
  onClose: () => void
  onSave: (data: Omit<Location, 'id' | 'createdAt'>) => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(location?.name ?? '')
  const [client, setClient] = useState(location?.client ?? '')
  const [address, setAddress] = useState(location?.address ?? '')
  const [notes, setNotes] = useState(location?.notes ?? '')

  const key = location?.id ?? 'new'
  const [lastKey, setLastKey] = useState(key)
  if (open && lastKey !== key) {
    setLastKey(key)
    setName(location?.name ?? '')
    setClient(location?.client ?? '')
    setAddress(location?.address ?? '')
    setNotes(location?.notes ?? '')
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    onSave({
      name: name.trim(),
      client: client.trim() || undefined,
      address: address.trim() || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <TextInput
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Westfield Mall — plant room"
          />
        </Field>
        <Field label="Client">
          <TextInput value={client} onChange={(e) => setClient(e.target.value)} />
        </Field>
        <Field label="Address">
          <TextInput value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="flex gap-2 pt-2">
          <Button type="submit" full>
            Save
          </Button>
          {onDelete && (
            <Button type="button" variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
