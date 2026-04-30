import { useEffect, useRef, useState } from 'react'
import { deletePhoto, loadPhoto, savePhoto } from '../lib/photos'
import { Button } from './ui'

export function PhotoPicker({
  photoIds,
  onChange,
}: {
  photoIds: string[]
  onChange: (next: string[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      const ids: string[] = []
      for (const f of Array.from(files)) {
        const id = await savePhoto(f)
        ids.push(id)
      }
      onChange([...photoIds, ...ids])
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    await deletePhoto(id)
    onChange(photoIds.filter((p) => p !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          📷 {busy ? 'Saving…' : photoIds.length ? 'Add more' : 'Add photo'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {photoIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photoIds.map((id) => (
            <Thumbnail key={id} id={id} onRemove={() => remove(id)} />
          ))}
        </div>
      )}
    </div>
  )
}

export function Thumbnail({
  id,
  onRemove,
}: {
  id: string
  onRemove?: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let revoke: string | null = null
    let cancelled = false
    loadPhoto(id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      revoke = u
      setUrl(u)
    })
    return () => {
      cancelled = true
      if (revoke) URL.revokeObjectURL(revoke)
    }
  }, [id])

  if (!url) {
    return (
      <div className="h-16 w-16 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
    )
  }

  return (
    <div className="relative">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt=""
          className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
        />
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 rounded-full bg-red-600 px-1.5 text-xs text-white shadow"
          aria-label="Remove photo"
        >
          ✕
        </button>
      )}
    </div>
  )
}
