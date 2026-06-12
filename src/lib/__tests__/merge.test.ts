import { describe, expect, it } from 'vitest'
import { mergeStates } from '../merge'
import { makeAudit, makeBottle, makeState, makeTx } from './fixtures'

// Two-device merge semantics — the difference between "two techs can
// log at once" and "two techs silently overwrite each other".

describe('transaction merge', () => {
  it('unions rows logged on different devices, newest first', () => {
    const t1 = makeTx({ date: '2026-06-01T00:00:00.000Z' })
    const t2 = makeTx({ date: '2026-06-02T00:00:00.000Z' })
    const merged = mergeStates(
      makeState({ transactions: [t1] }),
      makeState({ transactions: [t2] }),
    )
    expect(merged.transactions.map((t) => t.id)).toEqual([t2.id, t1.id])
  })

  it('a soft-deleted copy beats a live copy, in either direction', () => {
    const live = makeTx()
    const dead = { ...live, deletedAt: '2026-06-05T00:00:00.000Z', deletedReason: 'dupe' }
    const a = mergeStates(
      makeState({ transactions: [live] }),
      makeState({ transactions: [dead] }),
    )
    const b = mergeStates(
      makeState({ transactions: [dead] }),
      makeState({ transactions: [live] }),
    )
    expect(a.transactions[0].deletedAt).toBe(dead.deletedAt)
    expect(b.transactions[0].deletedAt).toBe(dead.deletedAt)
    expect(b.transactions[0].deletedReason).toBe('dupe')
  })

  it('is commutative on the record set', () => {
    const shared = makeTx({ date: '2026-06-01T00:00:00.000Z' })
    const onlyA = makeTx({ date: '2026-06-02T00:00:00.000Z' })
    const onlyB = makeTx({ date: '2026-06-03T00:00:00.000Z' })
    const stateA = makeState({ transactions: [onlyA, shared] })
    const stateB = makeState({ transactions: [onlyB, shared] })
    const ab = mergeStates(stateA, stateB).transactions.map((t) => t.id)
    const ba = mergeStates(stateB, stateA).transactions.map((t) => t.id)
    expect(ab).toEqual(ba)
    expect(ab).toHaveLength(3)
  })
})

describe('record collections (bottles / sites / units)', () => {
  it('per-id last-write-wins on updatedAt', () => {
    const base = makeBottle({ updatedAt: '2026-06-01T00:00:00.000Z', notes: 'old' })
    const newer = { ...base, updatedAt: '2026-06-02T00:00:00.000Z', notes: 'new' }
    const merged = mergeStates(
      makeState({ bottles: [base] }),
      makeState({ bottles: [newer] }),
    )
    expect(merged.bottles).toHaveLength(1)
    expect(merged.bottles[0].notes).toBe('new')
  })

  it('a tombstone kills a record deleted after its last write', () => {
    const b = makeBottle({ updatedAt: '2026-06-01T00:00:00.000Z' })
    const withRecord = makeState({ bottles: [b] })
    const withTombstone = makeState({
      tombstones: [{ entity: 'bottle', id: b.id, at: '2026-06-02T00:00:00.000Z' }],
    })
    const merged = mergeStates(withRecord, withTombstone)
    expect(merged.bottles).toHaveLength(0)
    // The tombstone itself survives so a third device also deletes it.
    expect(merged.tombstones.some((t) => t.id === b.id)).toBe(true)
  })

  it('a record edited AFTER its tombstone survives (delete/edit race)', () => {
    const b = makeBottle({ updatedAt: '2026-06-03T00:00:00.000Z' })
    const merged = mergeStates(
      makeState({ bottles: [b] }),
      makeState({
        tombstones: [{ entity: 'bottle', id: b.id, at: '2026-06-02T00:00:00.000Z' }],
      }),
    )
    expect(merged.bottles).toHaveLength(1)
  })

  it('a reset watermark erases the other side’s pre-reset records, keeps newer ones', () => {
    const oldTx = makeTx({ date: '2026-05-01T00:00:00.000Z' })
    const newTx = makeTx({ date: '2026-06-10T00:00:00.000Z' })
    const wiped = makeState({ dataResetAt: '2026-06-05T00:00:00.000Z' })
    const other = makeState({ transactions: [newTx, oldTx] })
    const merged = mergeStates(wiped, other)
    expect(merged.transactions.map((t) => t.id)).toEqual([newTx.id])
  })
})

describe('settings and per-device state', () => {
  it('the settings block comes wholesale from the newer settingsUpdatedAt', () => {
    const a = makeState({
      businessName: 'Old Name',
      settingsUpdatedAt: '2026-06-01T00:00:00.000Z',
    })
    const b = makeState({
      businessName: 'New Name',
      businessAbn: '51824753556',
      settingsUpdatedAt: '2026-06-02T00:00:00.000Z',
    })
    const merged = mergeStates(a, b)
    expect(merged.businessName).toBe('New Name')
    expect(merged.businessAbn).toBe('51824753556')
  })

  it('sync settings and the active seat stay local', () => {
    const local = makeState({ sync: { enabled: false, teamId: '' } })
    const remote = makeState({ sync: { enabled: true, teamId: 'team-9' } })
    expect(mergeStates(local, remote).sync).toEqual({ enabled: false, teamId: '' })
  })

  it('repoints the active seat when the merge removed that technician', () => {
    const tech = {
      id: 'tech-1',
      name: 'Alex',
      arcLicenceNumber: 'L1',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const local = makeState({
      technicians: [tech],
      activeTechnicianId: 'tech-gone',
    })
    const merged = mergeStates(local, makeState({}))
    expect(merged.activeTechnicianId).toBe('tech-1')
  })
})

describe('reference lists', () => {
  it('custom refrigerants union minus tombstones', () => {
    const a = makeState({ customRefrigerants: ['R-XYZ'] })
    const b = makeState({
      customRefrigerants: ['R-ABC'],
      tombstones: [{ entity: 'refrigerant', id: 'R-XYZ', at: '2026-06-02T00:00:00.000Z' }],
    })
    const merged = mergeStates(a, b)
    expect(merged.customRefrigerants).toEqual(['R-ABC'])
  })

  it('favourite presets keep built-ins, drop favourites whose custom preset is gone', () => {
    const a = makeState({ favoriteBottlePresets: ['au-rec-22wc', 'custom-zombie'] })
    const merged = mergeStates(a, makeState({}))
    expect(merged.favoriteBottlePresets).toContain('au-rec-22wc')
    expect(merged.favoriteBottlePresets).not.toContain('custom-zombie')
  })
})

describe('audit log merge', () => {
  it('unions by id and prefers the sealed copy of an entry', () => {
    const unsealed = makeAudit()
    const sealed = { ...unsealed, chainId: 'dev-1', seq: 1, prevHash: '', hash: 'abc123' }
    const a = mergeStates(
      makeState({ auditLog: [sealed] }),
      makeState({ auditLog: [unsealed] }),
    )
    const b = mergeStates(
      makeState({ auditLog: [unsealed] }),
      makeState({ auditLog: [sealed] }),
    )
    expect(a.auditLog[0].hash).toBe('abc123')
    expect(b.auditLog[0].hash).toBe('abc123')
  })

  it('survives a data reset (the record of the reset must outlive it)', () => {
    const entry = makeAudit({ at: '2026-05-01T00:00:00.000Z' })
    const wiped = makeState({ dataResetAt: '2026-06-05T00:00:00.000Z' })
    const other = makeState({ auditLog: [entry] })
    expect(mergeStates(wiped, other).auditLog.map((e) => e.id)).toContain(entry.id)
  })
})
