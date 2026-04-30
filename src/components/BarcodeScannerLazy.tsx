import { Suspense, lazy } from 'react'

const BarcodeScannerModal = lazy(() =>
  import('./BarcodeScanner').then((m) => ({ default: m.BarcodeScannerModal })),
)

export function BarcodeScannerModalLazy(props: {
  open: boolean
  onClose: () => void
  onResult: (text: string) => void
}) {
  if (!props.open) return null
  return (
    <Suspense fallback={null}>
      <BarcodeScannerModal {...props} />
    </Suspense>
  )
}

export function isBarcodeScanSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}
