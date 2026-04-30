import { useState } from 'react'

// Reads a single weight from a Bluetooth Low Energy scale that exposes the
// standard BT-SIG Weight Scale Service (0x181D) and Weight Measurement
// characteristic (0x2A9D). Many fitness scales follow this; not all HVAC
// recovery scales do — when it doesn't work, the tech can still type the
// reading in.

const WEIGHT_SCALE_SERVICE = 'weight_scale'
const WEIGHT_MEASUREMENT_CHAR = 'weight_measurement'

interface NavigatorWithBluetooth extends Navigator {
  bluetooth?: {
    requestDevice: (options: unknown) => Promise<unknown>
    getAvailability?: () => Promise<boolean>
  }
}

interface BluetoothCharacteristic {
  startNotifications: () => Promise<BluetoothCharacteristic>
  stopNotifications: () => Promise<unknown>
  addEventListener: (
    type: 'characteristicvaluechanged',
    listener: (e: Event & { target: { value: DataView } }) => void,
  ) => void
  removeEventListener: (
    type: 'characteristicvaluechanged',
    listener: (e: Event & { target: { value: DataView } }) => void,
  ) => void
  readValue?: () => Promise<DataView>
  service: { device: { gatt?: { disconnect: () => void } } }
}

export function isBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as NavigatorWithBluetooth).bluetooth
}

function parseWeightMeasurement(value: DataView): number | null {
  // Per BT-SIG: byte 0 flags, then SFLOAT/uint16 weight.
  if (value.byteLength < 3) return null
  const flags = value.getUint8(0)
  const isImperial = (flags & 0x01) === 1
  const raw = value.getUint16(1, true)
  // SI: kg = raw * 0.005; Imperial: lb = raw * 0.01
  const kg = isImperial ? raw * 0.01 * 0.45359237 : raw * 0.005
  if (!isFinite(kg) || kg <= 0) return null
  return kg
}

export function ScaleButton({
  onWeightKg,
  label = '📡 Scale',
}: {
  onWeightKg: (kg: number) => void
  label?: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isBluetoothSupported()) return null

  async function readOnce() {
    type ScaleDevice = {
      gatt?: { connect: () => Promise<unknown>; disconnect: () => void }
    }
    setBusy(true)
    setError(null)
    let charRef: BluetoothCharacteristic | null = null
    let listener:
      | ((e: Event & { target: { value: DataView } }) => void)
      | null = null
    let device: ScaleDevice | null = null
    try {
      const nav = navigator as NavigatorWithBluetooth
      device = (await nav.bluetooth!.requestDevice({
        filters: [{ services: [WEIGHT_SCALE_SERVICE] }],
        optionalServices: [WEIGHT_SCALE_SERVICE],
      })) as ScaleDevice
      const server = (await device.gatt!.connect()) as {
        getPrimaryService: (s: string) => Promise<{
          getCharacteristic: (c: string) => Promise<BluetoothCharacteristic>
        }>
      }
      const service = await server.getPrimaryService(WEIGHT_SCALE_SERVICE)
      const char = await service.getCharacteristic(WEIGHT_MEASUREMENT_CHAR)
      charRef = char

      // Try a one-shot read first.
      if (char.readValue) {
        try {
          const v = await char.readValue()
          const kg = parseWeightMeasurement(v)
          if (kg !== null) {
            onWeightKg(kg)
            device.gatt?.disconnect()
            return
          }
        } catch {
          // fall through to notifications
        }
      }

      // Otherwise subscribe and wait for the first notification.
      await char.startNotifications()
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('No reading received in 15s — tap the scale again.'))
        }, 15_000)
        listener = (e) => {
          const kg = parseWeightMeasurement(e.target.value)
          if (kg !== null) {
            clearTimeout(timeout)
            onWeightKg(kg)
            resolve()
          }
        }
        char.addEventListener('characteristicvaluechanged', listener)
      })
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Could not connect to a scale.'
      setError(msg)
    } finally {
      try {
        if (charRef && listener) {
          charRef.removeEventListener('characteristicvaluechanged', listener)
          await charRef.stopNotifications()
        }
        device?.gatt?.disconnect()
      } catch {
        /* noop */
      }
      setBusy(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={readOnce}
        disabled={busy}
        className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {busy ? '⌛ Reading…' : label}
      </button>
      {error && (
        <div className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}
