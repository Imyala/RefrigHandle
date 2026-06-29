import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Modal, Button } from './ui'
import type { Bottle } from '../lib/types'
import { formatWeight, type WeightUnit } from '../lib/units'

// Printable QR labels for cylinders. Each QR encodes the bottle number, so
// scanning a sticker with the app's scanner opens that cylinder's action
// sheet (the scan handler already matches on bottle number). Sticking a
// label on every cylinder puts the physical world into the app — the
// cheapest durable lock-in — and removes the #1 daily friction (finding
// the right bottle).
export function BottleLabels({
  bottles,
  unit,
  onClose,
}: {
  bottles: Bottle[]
  unit: WeightUnit
  onClose: () => void
}) {
  const [qr, setQr] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    Promise.all(
      bottles.map(
        async (b) =>
          [
            b.id,
            await QRCode.toString(b.bottleNumber || b.id, {
              type: 'svg',
              margin: 0,
              errorCorrectionLevel: 'M',
            }),
          ] as const,
      ),
    ).then((pairs) => {
      if (!cancelled) setQr(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [bottles])

  return (
    <Modal
      open
      onClose={onClose}
      title={bottles.length === 1 ? 'Cylinder label' : 'Cylinder labels'}
      size="lg"
    >
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          Print and stick one on each cylinder. Scanning a sticker in the app
          (Bottles → Scan) opens that cylinder.
        </p>
        <Button variant="secondary" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div className="print-region">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {bottles.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-3 rounded-xl border border-slate-300 p-2.5 dark:border-slate-700"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              <div
                className="h-[4.5rem] w-[4.5rem] shrink-0 [&>svg]:h-full [&>svg]:w-full"
                aria-hidden
                dangerouslySetInnerHTML={{ __html: qr[b.id] ?? '' }}
              />
              <div className="min-w-0">
                <div className="break-words text-base font-bold leading-tight text-slate-900 dark:text-slate-100">
                  {b.bottleNumber || '(no number)'}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  {b.refrigerantType}
                </div>
                <div className="text-[11px] text-slate-500">
                  Tare {formatWeight(b.tareWeight, unit)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
