import { describe, expect, it } from 'vitest'
import { computeLog, type LogCalcInput } from '../logCalc'

// The shared log-form math. Locks in the behaviour both entry forms rely on
// so they can never drift apart again.

const base: LogCalcInput = {
  kind: 'charge',
  bottleGross: 20,
  bottleTare: 10,
  bottleSafeFillCap: 10,
  amountKg: 0,
  enteredBottleKg: 0,
  scaleReadingKg: 0,
  scaleMode: false,
  showAmount: true,
  showLoss: true,
}

describe('computeLog — typed amount', () => {
  it('charge moves the bottle down by the amount', () => {
    const c = computeLog({ ...base, kind: 'charge', amountKg: 3 })
    expect(c.bottleAmountKg).toBe(3)
    expect(c.projectedAfter).toBe(17)
    expect(c.lossKg).toBe(0)
    expect(c.blockOverdraw).toBe(false)
    expect(c.blockNoOp).toBe(false)
  })

  it('recover moves the bottle up by the amount', () => {
    const c = computeLog({ ...base, kind: 'recover', amountKg: 4 })
    expect(c.projectedAfter).toBe(24)
  })

  it('explicit loss: bottle drops by bottleAmount, loss = bottle − equip', () => {
    const c = computeLog({ ...base, kind: 'charge', amountKg: 3, enteredBottleKg: 3.5 })
    expect(c.bottleAmountKg).toBe(3.5)
    expect(c.lossKg).toBeCloseTo(0.5, 5)
    expect(c.projectedAfter).toBe(16.5)
  })

  it('blocks an over-draw charge (more than the bottle holds)', () => {
    const c = computeLog({ ...base, kind: 'charge', amountKg: 50 })
    expect(c.blockOverdraw).toBe(true)
  })

  it('blocks a zero charge as a no-op', () => {
    expect(computeLog({ ...base, kind: 'charge', amountKg: 0 }).blockNoOp).toBe(true)
  })

  it('recover over safe fill is flagged (warn, not blocked)', () => {
    // tare 10, safe-fill cap 10 → full at gross 20; recover 5 → gross 25.
    const c = computeLog({ ...base, kind: 'recover', amountKg: 5 })
    expect(c.projectedOverSafeFill).toBe(true)
    expect(c.blockOverdraw).toBe(false)
  })
})

describe('computeLog — scale mode', () => {
  it('derives the charge amount from a lower gross reading', () => {
    const c = computeLog({
      ...base,
      kind: 'charge',
      scaleMode: true,
      scaleReadingKg: 16, // 20 → 16 = 4 kg out
      amountKg: 4,
    })
    expect(c.scaleDelta).toBe(4)
    expect(c.scaleInvalid).toBe(false)
    expect(c.bottleAmountKg).toBe(4)
    expect(c.projectedAfter).toBe(16)
  })

  it('flags an invalid reading that moves the wrong way', () => {
    const c = computeLog({
      ...base,
      kind: 'charge',
      scaleMode: true,
      scaleReadingKg: 25, // charge should DECREASE gross, not increase
    })
    expect(c.scaleInvalid).toBe(true)
  })
})

describe('computeLog — adjust', () => {
  it('applies a signed delta and blocks a zero change', () => {
    expect(computeLog({ ...base, kind: 'adjust', amountKg: -2 }).projectedAfter).toBe(18)
    expect(computeLog({ ...base, kind: 'adjust', amountKg: 0 }).blockNoOp).toBe(true)
    expect(computeLog({ ...base, kind: 'adjust', amountKg: 1.5 }).blockNoOp).toBe(false)
  })
})

describe('computeLog — re-statement correction', () => {
  it('only the delta beyond the original hits the bottle', () => {
    // Original charge was 3; corrected to 4 → bottle moves a further 1.
    const c = computeLog({
      ...base,
      kind: 'charge',
      amountKg: 4,
      restateOriginalBottleKg: 3,
    })
    expect(c.bottleEffectKg).toBe(1)
    expect(c.projectedAfter).toBe(19)
  })
})

describe('computeLog — bottle-to-bottle source', () => {
  it('source loses the gross amount; over-draw of the source is blocked', () => {
    const c = computeLog({
      ...base,
      kind: 'recover',
      amountKg: 5,
      bottleGross: 20,
      sourceGross: 30,
      sourceTare: 10, // source net 20
    })
    expect(c.projectedSourceAfter).toBe(25)
    expect(c.blockSourceOverdraw).toBe(false)
    const over = computeLog({
      ...base,
      kind: 'recover',
      amountKg: 25, // more than source net 20
      sourceGross: 30,
      sourceTare: 10,
    })
    expect(over.blockSourceOverdraw).toBe(true)
  })
})

describe('computeLog — plausibility', () => {
  it('blocks a wildly implausible charge against a recorded unit charge', () => {
    const c = computeLog({
      ...base,
      kind: 'charge',
      amountKg: 50,
      bottleGross: 200, // big bottle so overdraw doesn't fire first
      recordedChargeKg: 5,
    })
    expect(c.blockImplausible).toBe(true)
  })
})
