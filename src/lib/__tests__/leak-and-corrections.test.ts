import { describe, expect, it } from 'vitest'
import {
  cumulativeTopUpKg,
  isRestatement,
  leakStatusFor,
  supersededIds,
  type Transaction,
} from '../types'
import { makeTx, makeUnit } from './fixtures'

const NOW = '2026-06-13T00:00:00.000Z'

function charge(over: Partial<Transaction> = {}): Transaction {
  return makeTx({ kind: 'charge', unitId: 'u1', reason: 'top_up', ...over })
}

describe('cumulativeTopUpKg', () => {
  it('sums live charges against the unit inside the window', () => {
    const txs = [
      charge({ amount: 2 }),
      charge({ amount: 3 }),
      charge({ amount: 9, unitId: 'other-unit' }),
    ]
    expect(cumulativeTopUpKg('u1', txs, '2026-01-01')).toBe(5)
  })

  it('excludes install charges, deleted rows, and rows before the window', () => {
    const txs = [
      charge({ amount: 2 }),
      charge({ amount: 5, reason: 'install' }),
      charge({ amount: 4, deletedAt: '2026-06-01T00:00:00.000Z' }),
      charge({ amount: 7, date: '2024-01-01T00:00:00.000Z' }),
    ]
    expect(cumulativeTopUpKg('u1', txs, '2026-01-01')).toBe(2)
  })

  it('counts the re-statement instead of the superseded original', () => {
    const original = charge({ amount: 5 })
    const fix = charge({ amount: 0.4, correctsId: original.id })
    expect(cumulativeTopUpKg('u1', [fix, original], '2026-01-01')).toBeCloseTo(0.4)
  })
})

describe('correction supersede rules', () => {
  it('a same-kind correction is a re-statement; a legacy adjust is not', () => {
    expect(isRestatement(makeTx({ kind: 'charge', correctsId: 'x' }))).toBe(true)
    expect(isRestatement(makeTx({ kind: 'recover', correctsId: 'x' }))).toBe(true)
    expect(isRestatement(makeTx({ kind: 'adjust', correctsId: 'x' }))).toBe(false)
    expect(isRestatement(makeTx({ kind: 'charge' }))).toBe(false)
  })

  it('supersedes the original only while the re-statement is live', () => {
    const original = charge({ amount: 5 })
    const fix = charge({ amount: 3, correctsId: original.id })
    expect(supersededIds([fix, original]).has(original.id)).toBe(true)
    // Deleting the correction revives the original in every aggregate.
    const deletedFix = { ...fix, deletedAt: '2026-06-01T00:00:00.000Z' }
    expect(supersededIds([deletedFix, original]).has(original.id)).toBe(false)
  })

  it('legacy bottle-adjust corrections never supersede equipment amounts', () => {
    const original = charge({ amount: 5 })
    const legacy = makeTx({ kind: 'adjust', amount: 2, correctsId: original.id })
    expect(supersededIds([legacy, original]).has(original.id)).toBe(false)
    expect(cumulativeTopUpKg('u1', [legacy, original], '2026-01-01')).toBe(5)
  })

  it('chains: only the head of A←B←C counts', () => {
    const a = charge({ amount: 5 })
    const b = charge({ amount: 0.4, correctsId: a.id })
    const c = charge({ amount: 0.6, correctsId: b.id })
    const ids = supersededIds([c, b, a])
    expect(ids.has(a.id)).toBe(true)
    expect(ids.has(b.id)).toBe(true)
    expect(ids.has(c.id)).toBe(false)
    expect(cumulativeTopUpKg('u1', [c, b, a], '2026-01-01')).toBeCloseTo(0.6)
  })
})

describe('leakStatusFor', () => {
  it('flags watch at 5% and suspected at 10% of the charge (AU advisory)', () => {
    const unit = makeUnit({ id: 'u1', refrigerantCharge: 10 })
    expect(leakStatusFor(unit, [charge({ amount: 0.4 })], NOW).level).toBe('ok')
    expect(leakStatusFor(unit, [charge({ amount: 0.6 })], NOW).level).toBe('watch')
    expect(leakStatusFor(unit, [charge({ amount: 1.2 })], NOW).level).toBe('suspected')
  })

  it('reports the top-up fraction', () => {
    const unit = makeUnit({ id: 'u1', refrigerantCharge: 10 })
    const s = leakStatusFor(unit, [charge({ amount: 2.5 })], NOW)
    expect(s.topUpKg).toBeCloseTo(2.5)
    expect(s.fraction).toBeCloseTo(0.25)
  })

  it('unknown when top-ups exist but no factory charge is recorded', () => {
    const unit = makeUnit({ id: 'u1', refrigerantCharge: undefined })
    expect(leakStatusFor(unit, [charge({ amount: 1 })], NOW).level).toBe('unknown')
    expect(leakStatusFor(unit, [], NOW).level).toBe('ok')
  })

  it('honours jurisdiction-specific thresholds (EPA §608 style)', () => {
    const unit = makeUnit({ id: 'u1', refrigerantCharge: 10 })
    // 15% top-up: suspected under AU (≥10%) but below a 20% commercial-
    // refrigeration threshold with watch at half.
    const s = leakStatusFor(unit, [charge({ amount: 1.5 })], NOW, {
      watch: 0.1,
      suspected: 0.2,
    })
    expect(s.level).toBe('watch')
  })

  it('ignores top-ups older than the trailing 12-month window', () => {
    const unit = makeUnit({ id: 'u1', refrigerantCharge: 10 })
    const old = charge({ amount: 5, date: '2025-01-01T00:00:00.000Z' })
    expect(leakStatusFor(unit, [old], NOW).level).toBe('ok')
  })

  it('a correction clears a false leak flag end to end', () => {
    // The exact scenario the re-statement model exists for: a typo'd
    // 5 kg charge reads as a 50% leak; correcting it to 0.4 kg drops
    // the unit back to OK without touching the original row.
    const unit = makeUnit({ id: 'u1', refrigerantCharge: 10 })
    const original = charge({ amount: 5 })
    expect(leakStatusFor(unit, [original], NOW).level).toBe('suspected')
    const fix = charge({ amount: 0.4, correctsId: original.id })
    expect(leakStatusFor(unit, [fix, original], NOW).level).toBe('ok')
  })
})
