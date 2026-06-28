import {
  chargeSanity,
  overfillKg,
  scaleDeltaKg,
  type ChargeSanity,
  type TransactionKind,
  type UnitKind,
} from './types'

// Shared weight math + guards for the two log entry forms (the quick log on
// the Bottles tab and the full form on the Refrigerant log). These derived
// values used to be computed inline, near-identically, in BOTH forms — and
// drift between the two copies is exactly how several inventory/guard bugs
// crept in. Centralising it here (pure, all in kg, fully tested) means the
// two forms can never disagree again.
//
// Form-specific gates (reason/leak-test answered, correction reason, already
// returned, refrigerant-mismatch warnings) stay in the forms — this function
// owns only the weight-derived numbers and the weight-based blocks.

export interface LogCalcInput {
  kind: TransactionKind | null
  // Destination bottle (the row's bottle). null when none picked yet.
  bottleGross: number | null
  bottleTare: number
  bottleSafeFillCap: number // bottle.initialNetWeight
  // Equipment-side amount (always kg). For adjust this is the signed delta.
  amountKg: number
  // Explicit bottle-side amount when entering a loss by hand (0 if none).
  enteredBottleKg: number
  // Scale reading = the bottle's NEW gross, in kg (0 when not entered).
  scaleReadingKg: number
  // True when the scale-reading entry mode is active for this kind/bottle.
  scaleMode: boolean
  // Whether the amount field shows (charge/recover/adjust), i.e. not a
  // pure transfer/return.
  showAmount: boolean
  // Whether an explicit hose/decant loss can be entered (charge/recover).
  showLoss: boolean
  // Re-statement correction: the original entry's bottle-side amount. The
  // bottle only moves by the DELTA beyond what the original already moved.
  restateOriginalBottleKg?: number
  // Bottle-to-bottle recover source (loses weight). undefined when N/A.
  sourceGross?: number | null
  sourceTare?: number
  // Plausibility inputs (selected unit), when known.
  unitKind?: UnitKind
  recordedChargeKg?: number
}

export interface LogCalc {
  scaleDelta: number
  scaleInvalid: boolean
  bottleAmountKg: number
  lossKg: number
  bottleEffectKg: number
  projectedAfter: number
  projectedNet: number
  projectedOverSafeFill: boolean
  projectedSourceAfter: number
  projectedSourceNet: number
  blockOverdraw: boolean
  blockSourceOverdraw: boolean
  blockNoOp: boolean
  sanity: ChargeSanity
  blockImplausible: boolean
}

const EPS = 0.0005

export function computeLog(input: LogCalcInput): LogCalc {
  const {
    kind,
    bottleGross,
    bottleTare,
    bottleSafeFillCap,
    amountKg,
    enteredBottleKg,
    scaleReadingKg,
    scaleMode,
    showAmount,
    showLoss,
    restateOriginalBottleKg = 0,
    sourceGross,
    sourceTare = 0,
    unitKind,
    recordedChargeKg,
  } = input

  const isChargeOrRecover = kind === 'charge' || kind === 'recover'

  // Scale mode: the typed reading is the bottle's new gross; the bottle-side
  // delta is derived from it. Adjust treats the signed delta as the change.
  const scaleDelta =
    scaleMode &&
    bottleGross != null &&
    (kind === 'charge' || kind === 'recover' || kind === 'adjust')
      ? scaleDeltaKg(kind, bottleGross, scaleReadingKg)
      : 0
  const scaleInvalid =
    scaleMode &&
    (scaleReadingKg <= 0 || (kind !== 'adjust' && scaleDelta <= 0))

  // Bottle-side amount: from the scale delta in scale mode (except adjust,
  // whose amount is the signed delta itself); else an explicit loss entry;
  // else equal to the equipment amount.
  const bottleAmountKg =
    scaleMode && kind !== 'adjust'
      ? Math.max(0, scaleDelta)
      : showLoss && enteredBottleKg > 0
        ? enteredBottleKg
        : amountKg

  const lossKg =
    showLoss || scaleMode
      ? kind === 'charge'
        ? Math.max(0, bottleAmountKg - amountKg)
        : kind === 'recover'
          ? Math.max(0, amountKg - bottleAmountKg)
          : 0
      : 0

  // For a re-statement, the original already moved refrigerant — only the
  // delta hits the bottle (mirrors the store's addTransaction).
  const bottleEffectKg = bottleAmountKg - restateOriginalBottleKg

  let projectedAfter = bottleGross ?? 0
  if (bottleGross != null) {
    if (kind === 'charge') projectedAfter = bottleGross - bottleEffectKg
    else if (kind === 'recover') projectedAfter = bottleGross + bottleEffectKg
    else if (kind === 'adjust') projectedAfter = bottleGross + amountKg
  }
  const projectedNet = Math.max(0, projectedAfter - bottleTare)
  const projectedOverSafeFill =
    bottleGross != null &&
    showAmount &&
    overfillKg(projectedNet, bottleSafeFillCap) > 0

  // Bottle-to-bottle recover source loses the gross amount that left it.
  const hasSource = sourceGross != null
  const projectedSourceAfter = hasSource
    ? Math.max(0, (sourceGross as number) - amountKg)
    : 0
  const projectedSourceNet = hasSource
    ? Math.max(0, projectedSourceAfter - sourceTare)
    : 0

  const currentNet =
    bottleGross != null ? Math.max(0, bottleGross - bottleTare) : 0
  const blockOverdraw =
    bottleGross != null && kind === 'charge' && bottleEffectKg > currentNet + 0.01
  const sourceNet = hasSource
    ? Math.max(0, (sourceGross as number) - sourceTare)
    : 0
  const blockSourceOverdraw = hasSource && amountKg > sourceNet + 0.01

  // No-op guard: a 0 charge/recover, or an adjust that changes nothing,
  // would just litter the permanent log.
  const blockNoOp = isChargeOrRecover
    ? amountKg <= EPS
    : kind === 'adjust'
      ? Math.abs(amountKg) <= EPS
      : false

  const sanity: ChargeSanity = isChargeOrRecover
    ? chargeSanity(amountKg, { unitKind, recordedChargeKg })
    : { level: 'ok' }
  const blockImplausible = sanity.level === 'block'

  return {
    scaleDelta,
    scaleInvalid,
    bottleAmountKg,
    lossKg,
    bottleEffectKg,
    projectedAfter,
    projectedNet,
    projectedOverSafeFill,
    projectedSourceAfter,
    projectedSourceNet,
    blockOverdraw,
    blockSourceOverdraw,
    blockNoOp,
    sanity,
    blockImplausible,
  }
}
