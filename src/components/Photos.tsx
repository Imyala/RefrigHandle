import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal } from './ui'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import {
  addPhoto,
  deleteAttachment,
  listAttachments,
  type Attachment,
  type AttachmentEntity,
} from '../lib/attachments'
import { formatDateTime } from '../lib/datetime'
import { useStore } from '../lib/store'

// Photo gallery + camera capture for a saved record (unit nameplate,
// intake invoice, return docket, job evidence). Photos live in
// IndexedDB (see lib/attachments.ts) and are included in the JSON
// backup, but never in the synced state.

interface LoadedPhoto {
  a: Attachment
  url: string
}

export function PhotoSection({
  entityType,
  entityId,
  hint,
  onCountChange,
}: {
  entityType: AttachmentEntity
  entityId: string
  hint?: string
  // Lets a parent (e.g. the log list's badge) refresh its count.
  onCountChange?: (n: number) => void
}) {
  const toast = useToast()
  const confirm = useConfirm()
  const { logAttachmentRemoved } = useStore()
  const [photos, setPhotos] = useState<LoadedPhoto[]>([])
  const [viewing, setViewing] = useState<LoadedPhoto | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    let urls: string[] = []
    listAttachments(entityType, entityId, 'photo')
      .then((list) => {
        if (cancelled) return
        const loaded = list.map((a) => ({ a, url: URL.createObjectURL(a.blob) }))
        urls = loaded.map((p) => p.url)
        setPhotos(loaded)
      })
      .catch(() => {
        if (!cancelled) {
          toast.show('Photos unavailable — storage could not be opened', 'error')
        }
      })
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  useEffect(() => {
    onCountChange?.(photos.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length])

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const added: LoadedPhoto[] = []
      for (const f of Array.from(files)) {
        const a = await addPhoto(entityType, entityId, f)
        added.push({ a, url: URL.createObjectURL(a.blob) })
      }
      setPhotos((p) => [...p, ...added])
    } catch {
      toast.show('Could not save that photo', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(p: LoadedPhoto) {
    const ok = await confirm({
      title: 'Delete this photo?',
      message:
        "The photo is removed from this device and from future backups. This can't " +
        'be undone unless you have a backup that still includes it. The removal is ' +
        'recorded on the change log.',
      confirmLabel: 'Delete photo',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteAttachment(p.a.id)
      // Record the removal on the change log so it isn't an off-the-record
      // delete — only after the blob is actually gone.
      logAttachmentRemoved(entityType, entityId, 'photo', p.a.caption)
      URL.revokeObjectURL(p.url)
      setPhotos((list) => list.filter((x) => x.a.id !== p.a.id))
      setViewing(null)
    } catch {
      toast.show('Could not delete the photo', 'error')
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <button
            key={p.a.id}
            type="button"
            onClick={() => setViewing(p)}
            className="h-20 w-20 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
            aria-label="View photo"
          >
            <img src={p.url} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-slate-500 transition hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400"
        >
          <span aria-hidden className="text-xl">📷</span>
          <span className="text-[11px] font-medium">{busy ? 'Saving…' : 'Add'}</span>
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files)
          e.target.value = ''
        }}
      />
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} onDelete={onDelete} />
    </div>
  )
}

function PhotoViewer({
  photo,
  onClose,
  onDelete,
}: {
  photo: LoadedPhoto | null
  onClose: () => void
  onDelete: (p: LoadedPhoto) => void
}) {
  const { state } = useStore()
  if (!photo) return null
  return (
    <Modal open title="Photo" onClose={onClose} size="lg">
      <div className="flex flex-col gap-3">
        <img
          src={photo.url}
          alt=""
          className="max-h-[70svh] w-full rounded-xl object-contain"
        />
        <div className="text-xs text-slate-500">
          Taken {formatDateTime(photo.a.createdAt, state.location.timezone, state.clock)} ·{' '}
          {(photo.a.byteSize / 1024).toFixed(0)} KB
        </div>
        <div className="flex justify-end">
          <Button variant="danger" onClick={() => onDelete(photo)}>
            Delete photo
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// Photos staged inside a form BEFORE the record exists (the log form):
// the form holds the picked Files and binds them to the transaction id
// right after save. Keeps the field flow "snap the docket while
// logging" without inventing placeholder records.
export function PendingPhotoPicker({
  files,
  onChange,
  label = 'Photos',
  hint,
}: {
  files: File[]
  onChange: (files: File[]) => void
  label?: string
  hint?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => {
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [urls])

  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </div>
      <div className="flex flex-wrap gap-2">
        {files.map((f, i) => (
          <div
            key={`${f.name}-${i}`}
            className="relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
          >
            <img src={urls[i]} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-slate-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400"
        >
          <span aria-hidden className="text-xl">📷</span>
          <span className="text-[11px] font-medium">Add</span>
        </button>
      </div>
      {hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            onChange([...files, ...Array.from(e.target.files)])
          }
          e.target.value = ''
        }}
      />
    </div>
  )
}
