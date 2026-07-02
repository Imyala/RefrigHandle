import { describe, expect, it } from 'vitest'
import { mergeStates } from '../merge'
import { makeAudit, makeBottle, makeState, makeTx } from './fixtures'

// Two-device merge semantics — the difference between "two techs can
// log at once" and "two techs silently overwrite each other".

function makeJob(over: Record<string, unknown> = {}) {
  return {
    id: 'j1',
    reference: 'WO-1',
    status: 'open' as const,
    date: '2026-06-01T00:00:00.000Z',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  }
}

describe('jobs merge', () => {
  it('unions jobs created on different devices', () => {
    const merged = mergeStates(
      makeState({ jobs: [makeJob({ id: 'j1', reference: 'A' })] }),
      makeState({ jobs: [makeJob({ id: 'j2', reference: 'B' })] }),
    )
    expect(new Set(merged.jobs.map((j) => j.id))).toEqual(new Set(['j1', 'j2']))
  })

  it('newer updatedAt wins for the same job (e.g. closed on one device)', () => {
    const openCopy = makeJob({ id: 'j1', status: 'open', updatedAt: '2026-06-01T00:00:00.000Z' })
    const closedCopy = makeJob({ id: 'j1', status: 'closed', updatedAt: '2026-06-09T00:00:00.000Z' })
    const merged = mergeStates(
      makeState({ jobs: [openCopy] }),
      makeState({ jobs: [closedCopy] }),
    )
    expect(merged.jobs.find((j) => j.id === 'j1')?.status).toBe('closed')
  })

  it('a tombstone removes a job whose last write predates the deletion', () => {
    const job = makeJob({ id: 'j1', updatedAt: '2026-06-01T00:00:00.000Z' })
    const merged = mergeStates(
      makeState({ jobs: [job] }),
      makeState({
        jobs: [],
        tombstones: [{ entity: 'job', id: 'j1', at: '2026-06-05T00:00:00.000Z' }],
      }),
    )
    expect(merged.jobs.some((j) => j.id === 'j1')).toBe(false)
  })
})

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

  it('a restore that happened after a deletion beats the stale deleted copy', () => {
    // A restored row carries restoredAt and no deletedAt; a stale copy on
    // the other device still holds the earlier deletion. The later
    // lifecycle action (the restore) must win so the row stays live.
    const dead = makeTx({
      deletedAt: '2026-06-05T00:00:00.000Z',
      deletedReason: 'dupe',
    })
    const restored = {
      ...dead,
      deletedAt: undefined,
      deletedReason: undefined,
      restoredAt: '2026-06-06T00:00:00.000Z',
    }
    const a = mergeStates(
      makeState({ transactions: [dead] }),
      makeState({ transactions: [restored] }),
    )
    const b = mergeStates(
      makeState({ transactions: [restored] }),
      makeState({ transactions: [dead] }),
    )
    expect(a.transactions[0].deletedAt).toBeUndefined()
    expect(a.transactions[0].restoredAt).toBe(restored.restoredAt)
    expect(b.transactions[0].deletedAt).toBeUndefined()
  })

  it('a re-deletion after a restore beats the restored copy', () => {
    const restored = makeTx({ restoredAt: '2026-06-06T00:00:00.000Z' })
    const reDeleted = {
      ...restored,
      deletedAt: '2026-06-07T00:00:00.000Z',
      deletedReason: 'still a dupe',
    }
    const merged = mergeStates(
      makeState({ transactions: [restored] }),
      makeState({ transactions: [reDeleted] }),
    )
    expect(merged.transactions[0].deletedAt).toBe(reDeleted.deletedAt)
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

  it('a BACKDATED entry logged after the wipe survives the reset watermark', () => {
    // A tech catches up on last Friday's work after a supervisor restored
    // a backup: the work date predates the wipe but the row was WRITTEN
    // after it — brand-new work, not part of the wiped snapshot.
    const backdated = makeTx({
      date: '2026-05-30T00:00:00.000Z',
      loggedAt: '2026-06-06T09:00:00.000Z',
    })
    const wiped = makeState({ dataResetAt: '2026-06-05T00:00:00.000Z' })
    const other = makeState({ transactions: [backdated] })
    expect(
      mergeStates(wiped, other).transactions.map((t) => t.id),
    ).toEqual([backdated.id])
    // …and symmetrically when the wiped side is remote.
    expect(
      mergeStates(other, wiped).transactions.map((t) => t.id),
    ).toEqual([backdated.id])
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

  it('a RESTORED custom refrigerant survives merging with a device that still holds the tombstone', () => {
    // Device A deleted R-XYZ, device B restored it from the recycle bin
    // (tombstone revoked in place — refrigerants have no timestamps of
    // their own to out-date a tombstone with).
    const restored = makeState({
      customRefrigerants: ['R-XYZ'],
      tombstones: [
        {
          entity: 'refrigerant',
          id: 'R-XYZ',
          at: '2026-06-02T00:00:00.000Z',
          revokedAt: '2026-06-03T00:00:00.000Z',
        },
      ],
    })
    const stale = makeState({
      tombstones: [
        { entity: 'refrigerant', id: 'R-XYZ', at: '2026-06-02T00:00:00.000Z' },
      ],
    })
    // Survives from both directions (merge is commutative)…
    expect(mergeStates(restored, stale).customRefrigerants).toEqual(['R-XYZ'])
    expect(mergeStates(stale, restored).customRefrigerants).toEqual(['R-XYZ'])
    // …and the revocation itself propagates for the next round.
    expect(
      mergeStates(stale, restored).tombstones.find((t) => t.id === 'R-XYZ')
        ?.revokedAt,
    ).toBe('2026-06-03T00:00:00.000Z')
  })

  it('a re-delete AFTER the restore wins again', () => {
    const restoredThenDeleted = makeState({
      tombstones: [
        {
          entity: 'refrigerant',
          id: 'R-XYZ',
          at: '2026-06-05T00:00:00.000Z', // fresh delete
          revokedAt: '2026-06-03T00:00:00.000Z', // older restore
        },
      ],
    })
    const other = makeState({ customRefrigerants: ['R-XYZ'] })
    expect(mergeStates(other, restoredThenDeleted).customRefrigerants).toEqual([])
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

describe('settings merge — per field', () => {
  const T2 = '2026-06-02T00:00:00.000Z'
  const T3 = '2026-06-03T00:00:00.000Z'

  it('keeps concurrent edits to DIFFERENT settings fields (no clobber)', () => {
    // Device A renamed the business; device B (later overall) changed the
    // ABN. Whole-block last-write-wins used to drop A's rename.
    const a = makeState({
      businessName: 'Acme Cooling',
      businessAbn: '11111111111',
      settingsUpdatedAt: T2,
      settingsFieldsUpdatedAt: { businessName: T2 },
    })
    const b = makeState({
      businessName: 'Stale Name',
      businessAbn: '99999999999',
      settingsUpdatedAt: T3,
      settingsFieldsUpdatedAt: { businessAbn: T3 },
    })
    for (const m of [mergeStates(a, b), mergeStates(b, a)]) {
      expect(m.businessName).toBe('Acme Cooling')
      expect(m.businessAbn).toBe('99999999999')
    }
  })

  it('same field edited on both sides: newer per-field stamp wins', () => {
    const a = makeState({
      businessName: 'A name',
      settingsFieldsUpdatedAt: { businessName: T2 },
    })
    const b = makeState({
      businessName: 'B name',
      settingsFieldsUpdatedAt: { businessName: T3 },
    })
    expect(mergeStates(a, b).businessName).toBe('B name')
    expect(mergeStates(b, a).businessName).toBe('B name')
  })

  it('falls back to block-level when per-field stamps are absent (old states)', () => {
    const a = makeState({ businessName: 'A', settingsUpdatedAt: T2 })
    const b = makeState({ businessName: 'B', settingsUpdatedAt: T3 })
    expect(mergeStates(a, b).businessName).toBe('B')
  })

  it('merged per-field stamps keep the latest of each', () => {
    const a = makeState({ settingsFieldsUpdatedAt: { businessName: T2, unit: T3 } })
    const b = makeState({ settingsFieldsUpdatedAt: { businessName: T3 } })
    const m = mergeStates(a, b)
    expect(m.settingsFieldsUpdatedAt).toEqual({ businessName: T3, unit: T3 })
  })
})

describe('recycle bin merge', () => {
  const binEntry = (over: Record<string, unknown> = {}) => ({
    id: 'bin1',
    entity: 'bottle' as const,
    recordId: 'b1',
    label: 'Bottle B1',
    deletedAt: '2026-06-01T00:00:00.000Z',
    record: { id: 'b1' },
    ...over,
  })

  it('unions recycle-bin entries from both devices, newest first', () => {
    const e1 = binEntry({ id: 'bin1', deletedAt: '2026-06-01T00:00:00.000Z' })
    const e2 = binEntry({ id: 'bin2', deletedAt: '2026-06-02T00:00:00.000Z' })
    const merged = mergeStates(
      makeState({ recycleBin: [e1] }),
      makeState({ recycleBin: [e2] }),
    )
    expect(merged.recycleBin.map((e) => e.id)).toEqual(['bin2', 'bin1'])
  })

  it('a restored record (bin entry dropped + record live) is not re-deleted by a stale bin copy', () => {
    // Device A restored b1: the bin entry is gone, the bottle is live with
    // a fresh updatedAt, and the tombstone was cleared. Device B still holds
    // the bin entry and the tombstone. The record must survive the merge.
    const bottle = makeBottle({ id: 'b1', updatedAt: '2026-06-10T00:00:00.000Z' })
    const a = makeState({ bottles: [bottle] }) // restored: no tombstone, no bin
    const b = makeState({
      recycleBin: [binEntry()],
      tombstones: [{ entity: 'bottle', id: 'b1', at: '2026-06-01T00:00:00.000Z' }],
    })
    const merged = mergeStates(a, b)
    expect(merged.bottles.some((x) => x.id === 'b1')).toBe(true)
  })
})
