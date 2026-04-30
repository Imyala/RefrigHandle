import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { Button, Modal } from './ui'

export function BarcodeScannerModal({
  open,
  onClose,
  onResult,
}: {
  open: boolean
  onClose: () => void
  onResult: (text: string) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    const reader = new BrowserMultiFormatReader()
    let cancelled = false

    ;(async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices()
        if (cancelled) return
        // Prefer rear-facing camera if labeled as such.
        const back =
          devices.find((d) => /back|rear|environment/i.test(d.label)) ??
          devices[devices.length - 1] ??
          devices[0]
        if (!videoRef.current) return
        controlsRef.current = await reader.decodeFromVideoDevice(
          back?.deviceId,
          videoRef.current,
          (result, err) => {
            if (result && !cancelled) {
              const text = result.getText().trim()
              controlsRef.current?.stop()
              controlsRef.current = null
              onResult(text)
            }
            // ignore err; zxing emits NotFoundException on every empty frame
            void err
          },
        )
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : 'Camera unavailable on this device.'
        setError(msg)
      }
    })()

    return () => {
      cancelled = true
      controlsRef.current?.stop()
      controlsRef.current = null
    }
  }, [open, onResult])

  return (
    <Modal open={open} title="Scan barcode" onClose={onClose}>
      <div className="space-y-3">
        {error ? (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            {error}
            <div className="mt-1 text-xs opacity-80">
              On iPhone you may need to allow camera access in Settings →
              Safari, or open the site in Safari (not in-app browsers).
            </div>
          </div>
        ) : (
          <>
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                className="aspect-square w-full object-cover"
                playsInline
                muted
              />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
            </div>
            <p className="text-center text-sm text-slate-500">
              Hold the barcode or QR code inside the frame
            </p>
          </>
        )}
        <Button variant="secondary" full onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  )
}

export function isBarcodeScanSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}
