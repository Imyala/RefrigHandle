import { useEffect, useRef, useState } from 'react'
import { Button, TextInput } from './ui'
import { useToast } from '../lib/toast'
import { useConfirm } from '../lib/confirm'
import {
  addSignature,
  deleteAttachment,
  listAttachments,
  type Attachment,
  type AttachmentEntity,
} from '../lib/attachments'
import { formatDateTime } from '../lib/datetime'
import { useStore } from '../lib/store'

// On-device sign-off. The customer (or site contact) signs the job on
// the phone right after the work; the signature is stored against the
// transaction in IndexedDB, shown on the log row, and included in the
// JSON backup. Like photos, signatures never enter the synced state.

interface LoadedSignature {
  a: Attachment
  url: string
}

export function SignatureSection({
  entityType,
  entityId,
  onCountChange,
}: {
  entityType: AttachmentEntity
  entityId: string
  onCountChange?: (n: number) => void
}) {
  const { state, logAttachmentRemoved } = useStore()
  const toast = useToast()
  const confirm = useConfirm()
  const [signatures, setSignatures] = useState<LoadedSignature[]>([])
  const [capturing, setCapturing] = useState(false)

  useEffect(() => {
    let cancelled = false
    let urls: string[] = []
    listAttachments(entityType, entityId, 'signature')
      .then((list) => {
        if (cancelled) return
        const loaded = list.map((a) => ({ a, url: URL.createObjectURL(a.blob) }))
        urls = loaded.map((s) => s.url)
        setSignatures(loaded)
      })
      .catch(() => {
        if (!cancelled) {
          toast.show('Signatures unavailable — storage could not be opened', 'error')
        }
      })
    return () => {
      cancelled = true
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  useEffect(() => {
    onCountChange?.(signatures.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatures.length])

  async function onSave(blob: Blob, signedBy: string) {
    try {
      const a = await addSignature(entityType, entityId, blob, signedBy)
      setSignatures((s) => [...s, { a, url: URL.createObjectURL(a.blob) }])
      setCapturing(false)
      toast.show('Sign-off saved', 'success')
    } catch {
      toast.show('Could not save the signature', 'error')
    }
  }

  async function onDelete(s: LoadedSignature) {
    const ok = await confirm({
      title: 'Delete this sign-off?',
      message:
        "The signature is removed from this device and from future backups. This can't " +
        'be undone unless you have a backup that still includes it. The removal is ' +
        'recorded on the change log.',
      confirmLabel: 'Delete sign-off',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteAttachment(s.a.id)
      // Record the removal on the change log so a sign-off can't be deleted
      // off the record — only after the blob is actually gone.
      logAttachmentRemoved(entityType, entityId, 'signature', s.a.signedBy)
      URL.revokeObjectURL(s.url)
      setSignatures((list) => list.filter((x) => x.a.id !== s.a.id))
    } catch {
      toast.show('Could not delete the signature', 'error')
    }
  }

  return (
    <div className="space-y-2">
      {signatures.map((s) => (
        <div
          key={s.a.id}
          className="rounded-xl border border-slate-200 p-2 dark:border-slate-700"
        >
          <img
            src={s.url}
            alt={`Signature${s.a.signedBy ? ` of ${s.a.signedBy}` : ''}`}
            className="h-20 w-full rounded-lg bg-white object-contain"
          />
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
            <span>
              {s.a.signedBy ? <strong>{s.a.signedBy}</strong> : 'Unnamed'} ·{' '}
              {formatDateTime(s.a.createdAt, state.location.timezone, state.clock)}
            </span>
            <button
              type="button"
              onClick={() => onDelete(s)}
              className="font-medium text-slate-500 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
      {capturing ? (
        <SignatureCapture onSave={onSave} onCancel={() => setCapturing(false)} />
      ) : (
        <Button variant="secondary" onClick={() => setCapturing(true)}>
          {signatures.length > 0 ? '+ Add another sign-off' : '✍ Capture sign-off'}
        </Button>
      )}
    </div>
  )
}

function SignatureCapture({
  onSave,
  onCancel,
}: {
  onSave: (blob: Blob, signedBy: string) => void
  onCancel: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  // Size the bitmap to the rendered box (device pixels), and KEEP it sized
  // as the box changes — a phone rotated to landscape to sign, or a
  // keyboard opening, resizes the canvas; sizing only once on mount left
  // the bitmap mismatched with the box so strokes landed offset. A
  // ResizeObserver re-fits on every change and re-paints existing ink so a
  // half-finished signature survives the rotation. White background so the
  // PNG stays legible in dark mode, in print and in exports.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const fit = (preserveInk: boolean) => {
      const dpr = window.devicePixelRatio || 1
      const rect = canvas.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const w = Math.max(1, Math.round(rect.width * dpr))
      const h = Math.max(1, Math.round(rect.height * dpr))
      if (canvas.width === w && canvas.height === h) return // no real change

      // Snapshot current ink before the resize wipes the bitmap.
      let prev: HTMLCanvasElement | null = null
      if (preserveInk && canvas.width > 0 && canvas.height > 0) {
        prev = document.createElement('canvas')
        prev.width = canvas.width
        prev.height = canvas.height
        prev.getContext('2d')?.drawImage(canvas, 0, 0)
      }

      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, rect.width, rect.height)
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      if (prev) {
        ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, rect.width, rect.height)
      }
    }

    fit(false)
    const ro = new ResizeObserver(() => fit(true))
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, rect.width, rect.height)
    setHasInk(false)
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    canvas.toBlob((blob) => {
      if (blob) onSave(blob, name)
      else toast.show('Could not capture the signature', 'error')
    }, 'image/png')
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <TextInput
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name of signer (e.g. site contact)"
        aria-label="Name of signer"
      />
      <canvas
        ref={canvasRef}
        className="h-40 w-full touch-none rounded-lg border border-slate-300 bg-white dark:border-slate-600"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          const ctx = e.currentTarget.getContext('2d')
          if (!ctx) return
          drawingRef.current = true
          const { x, y } = pos(e)
          ctx.beginPath()
          ctx.moveTo(x, y)
          // A dot for taps, so a single press leaves a mark.
          ctx.lineTo(x + 0.1, y + 0.1)
          ctx.stroke()
          setHasInk(true)
        }}
        onPointerMove={(e) => {
          if (!drawingRef.current) return
          const ctx = e.currentTarget.getContext('2d')
          if (!ctx) return
          const { x, y } = pos(e)
          ctx.lineTo(x, y)
          ctx.stroke()
        }}
        onPointerUp={() => {
          drawingRef.current = false
        }}
        onPointerCancel={() => {
          drawingRef.current = false
        }}
      />
      <p className="text-xs text-slate-500">Sign in the box above.</p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="ghost" onClick={clear} disabled={!hasInk}>
          Clear
        </Button>
        <Button onClick={save} disabled={!hasInk}>
          Save sign-off
        </Button>
      </div>
    </div>
  )
}
