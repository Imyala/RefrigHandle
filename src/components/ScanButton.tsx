import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from './ui'

// Camera barcode / QR scanner for cylinder labels. Typing "JX-10442" on
// a rooftop in gloves is the slow part of logging — pointing the camera
// at the cylinder's barcode isn't. Built on @zxing/browser (dynamically
// imported so the scanner code never loads unless someone taps Scan),
// which decodes locally and works offline on both Android and iOS —
// unlike the native BarcodeDetector API, which Safari doesn't ship.

export function ScanButton({
  onScan,
  title = 'Scan barcode',
}: {
  // Called with the decoded text once a code is read. The modal closes
  // itself first, so handlers can immediately open another sheet.
  onScan: (text: string) => void
  title?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        <BarcodeIcon />
        Scan
      </Button>
      {open && (
        <ScannerModal
          title={title}
          onClose={() => setOpen(false)}
          onScan={(text) => {
            setOpen(false)
            onScan(text)
          }}
        />
      )}
    </>
  )
}

function ScannerModal({
  title,
  onScan,
  onClose,
}: {
  title: string
  onScan: (text: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  // Keep the latest onScan in a ref so the camera effect runs exactly
  // once — a parent re-render must not restart the video stream.
  const onScanRef = useRef(onScan)
  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let stopped = false
    let controls: { stop(): void } | null = null
    ;(async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (stopped || !videoRef.current) return
        const reader = new BrowserMultiFormatReader()
        // deviceId undefined → zxing asks for the environment-facing
        // camera, which is the right default for scanning a cylinder.
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            const text = result?.getText().trim()
            if (!text) return
            controls?.stop()
            try {
              navigator.vibrate?.(80)
            } catch {
              /* vibration unsupported — ignore */
            }
            onScanRef.current(text)
          },
        )
        if (stopped) controls.stop()
      } catch (e) {
        const name = (e as { name?: string } | null)?.name
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow camera permission for this app and try again.'
            : name === 'NotFoundError'
              ? 'No camera found on this device.'
              : 'Could not start the camera on this device.',
        )
      }
    })()
    return () => {
      stopped = true
      controls?.stop()
    }
  }, [])

  return (
    <Modal open title={title} onClose={onClose}>
      <div className="space-y-3">
        {error ? (
          <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
            {error}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              {/* muted + playsInline are required for iOS Safari to
                  autoplay the camera preview inside the page. */}
              <video
                ref={videoRef}
                className="aspect-[3/4] w-full object-cover"
                muted
                playsInline
              />
            </div>
            <p className="text-center text-xs text-slate-500">
              Point the camera at the barcode or QR code on the cylinder.
            </p>
          </>
        )}
        <Button full variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  )
}

function BarcodeIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="currentColor"
    >
      <path d="M3 5h2v14H3zM6 5h1v14H6zM9 5h2v14H9zM12 5h1v14h-1zM15 5h3v14h-3zM19 5h2v14h-2z" />
    </svg>
  )
}
