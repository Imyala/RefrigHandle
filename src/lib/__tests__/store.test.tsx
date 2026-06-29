// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { StoreProvider, useStore } from '../store'
import { ToastProvider } from '../toast'
import { ConfirmProvider } from '../confirm'
import type { Bottle } from '../types'

// Tests the REAL store provider end-to-end (no mocks of the reducer) — the
// trust-critical weight math, corrections, bottle-to-bottle decants and
// soft-delete/restore all live in store.tsx and were previously untested.
// A tiny harness grabs the latest store api on every render so assertions
// read post-update state.

type Api = ReturnType<typeof useStore>
function setup() {
  const ref: { current: Api | null } = { current: null }
  function Grabber() {
    ref.current = useStore()
    return null
  }
  render(
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <Grabber />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>,
  )
  return ref as { current: Api }
}

const BOTTLE: Omit<Bottle, 'id' | 'createdAt' | 'updatedAt'> = {
  bottleNumber: 'B1',
  refrigerantType: 'R32',
  tareWeight: 10,
  grossWeight: 20, // 10 kg net
  initialNetWeight: 10,
  status: 'in_stock',
}

function addBottle(api: Api, over: Partial<Bottle> = {}): Bottle {
  let made!: Bottle
  act(() => {
    made = api.addBottle({ ...BOTTLE, ...over })
  })
  return made
}

const DATE = '2026-03-01T00:00:00.000Z'

// addTransaction returns the new row, but that return is only reliable in a
// real event handler (React's eager-state path), not when wrapped in act();
// read the latest matching row off state instead.
function txIdFor(api: Api, bottleId: string, predicate: (t: { correctsId?: string }) => boolean = () => true): string {
  const rows = api.state.transactions.filter((t) => t.bottleId === bottleId && predicate(t))
  return rows[0].id // store prepends, so newest first
}

beforeEach(() => {
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})
afterEach(cleanup)

describe('addTransaction — weight math', () => {
  it('charge reduces the bottle gross by the amount', () => {
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'charge', amount: 3, date: DATE })
    })
    const after = api.current.state.bottles.find((x) => x.id === b.id)!
    expect(after.grossWeight).toBe(17)
  })

  it('charge with a hose loss moves the bottle by bottleAmount, not amount', () => {
    // 3 kg reached the equipment, but 3.5 kg left the bottle (0.5 lost).
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({
        bottleId: b.id,
        kind: 'charge',
        amount: 3,
        bottleAmount: 3.5,
        date: DATE,
      })
    })
    const after = api.current.state.bottles.find((x) => x.id === b.id)!
    expect(after.grossWeight).toBe(16.5)
  })

  it('recover increases the bottle gross', () => {
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'recover', amount: 4, date: DATE })
    })
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(24)
  })

  it('adjust applies a signed delta', () => {
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'adjust', amount: -2, date: DATE })
    })
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(18)
  })

  it('never drives the gross below zero', () => {
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'charge', amount: 999, date: DATE })
    })
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(0)
  })

  it('auto-flips status to empty when net reaches ~zero', () => {
    const api = setup()
    const b = addBottle(api.current) // 10 net
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'charge', amount: 10, date: DATE })
    })
    const after = api.current.state.bottles.find((x) => x.id === b.id)!
    expect(after.grossWeight).toBe(10) // back to tare
    expect(after.status).toBe('empty')
  })
})

describe('addTransaction — re-statement correction', () => {
  it('a corrected charge moves the bottle only by the DELTA from the original', () => {
    const api = setup()
    const b = addBottle(api.current) // gross 20
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'charge', amount: 3, date: DATE })
    })
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(17)
    const originalId = txIdFor(api.current, b.id)

    // Correct it: the true charge was 4 kg (1 kg more). The bottle must
    // move by the 1 kg delta, NOT another full 4 kg.
    act(() => {
      api.current.addTransaction({
        bottleId: b.id,
        kind: 'charge',
        amount: 4,
        date: DATE,
        correctsId: originalId,
        correctionReason: 'misread scale',
      })
    })
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(16)
  })
})

describe('addTransaction — bottle-to-bottle recover', () => {
  it('decrements the source by amount and increments the destination by what arrived', () => {
    const api = setup()
    const dest = addBottle(api.current, { bottleNumber: 'DEST', grossWeight: 20 })
    const src = addBottle(api.current, { bottleNumber: 'SRC', grossWeight: 30 })
    // 5 kg leaves the source; 4.7 kg arrives in the destination (0.3 loss).
    act(() => {
      api.current.addTransaction({
        bottleId: dest.id,
        sourceBottleId: src.id,
        kind: 'recover',
        amount: 5,
        bottleAmount: 4.7,
        date: DATE,
      })
    })
    const d = api.current.state.bottles.find((x) => x.id === dest.id)!
    const s = api.current.state.bottles.find((x) => x.id === src.id)!
    expect(d.grossWeight).toBe(24.7) // 20 + 4.7 arrived
    expect(s.grossWeight).toBe(25) // 30 - 5 left
  })
})

describe('soft-delete and restore', () => {
  it('soft-delete hides the row but keeps the bottle weight; restore brings it back', () => {
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'charge', amount: 3, date: DATE })
    })
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(17)
    const txId = txIdFor(api.current, b.id)

    act(() => {
      api.current.deleteTransaction(txId, 'logged twice')
    })
    const deleted = api.current.state.transactions.find((t) => t.id === txId)!
    expect(deleted.deletedAt).toBeTruthy()
    expect(deleted.deletedReason).toBe('logged twice')
    // Weight chain is preserved on soft-delete (not reverted).
    expect(api.current.state.bottles.find((x) => x.id === b.id)!.grossWeight).toBe(17)

    act(() => {
      api.current.restoreTransaction(txId)
    })
    expect(api.current.state.transactions.find((t) => t.id === txId)!.deletedAt).toBeFalsy()
  })
})

// Add a technician with a given role and make it the active profile.
function addActiveTech(
  api: { current: Api },
  role: Parameters<Api['addTechnician']>[0]['role'],
) {
  act(() => {
    const t = api.current.addTechnician({
      name: `${role}-user`,
      firstName: role as string,
      lastName: 'User',
      arcLicenceNumber: 'L-1',
      role,
    })
    api.current.setActiveTechnicianId(t.id)
  })
}

describe('recycle bin — nothing is permanently deleted', () => {
  it('deleting a bottle moves it to the recycle bin and restore brings it back', () => {
    const api = setup()
    const b = addBottle(api.current, { bottleNumber: 'RB1' })

    act(() => api.current.deleteBottle(b.id))
    // Gone from the live collection…
    expect(api.current.state.bottles.some((x) => x.id === b.id)).toBe(false)
    // …but captured in the recycle bin, with a tombstone for sync.
    const entry = api.current.state.recycleBin.find((e) => e.recordId === b.id)
    expect(entry).toBeTruthy()
    expect(entry!.entity).toBe('bottle')
    expect(api.current.state.tombstones.some((t) => t.id === b.id)).toBe(true)

    act(() => api.current.restoreFromRecycleBin(entry!.id))
    // Record is back, the bin entry is consumed, and the tombstone cleared
    // so a later sync won't re-delete it.
    expect(api.current.state.bottles.some((x) => x.id === b.id)).toBe(true)
    expect(api.current.state.recycleBin.some((e) => e.id === entry!.id)).toBe(false)
    expect(api.current.state.tombstones.some((t) => t.id === b.id)).toBe(false)
  })

  it('deleting a site recycle-bins the site and each of its units', () => {
    const api = setup()
    let siteId = ''
    let unitId = ''
    act(() => {
      const site = api.current.addSite({ name: 'Roof', client: '', address: '', state: '', city: '', notes: '' })
      siteId = site.id
      const unit = api.current.addUnit({ siteId: site.id, name: 'AHU-1', kind: 'split', refrigerantType: 'R32', refrigerantCharge: 2 })
      unitId = unit.id
    })
    act(() => api.current.deleteSite(siteId))
    const binned = api.current.state.recycleBin
    expect(binned.some((e) => e.entity === 'site' && e.recordId === siteId)).toBe(true)
    expect(binned.some((e) => e.entity === 'unit' && e.recordId === unitId)).toBe(true)
  })
})

describe('role enforcement at the store layer', () => {
  it('an apprentice cannot delete a bottle, but an owner can', () => {
    const api = setup()
    const b = addBottle(api.current, { bottleNumber: 'PERM1' })

    addActiveTech(api, 'apprentice')
    act(() => api.current.deleteBottle(b.id))
    // Blocked — still live, nothing binned.
    expect(api.current.state.bottles.some((x) => x.id === b.id)).toBe(true)
    expect(api.current.state.recycleBin.length).toBe(0)

    addActiveTech(api, 'owner')
    act(() => api.current.deleteBottle(b.id))
    expect(api.current.state.bottles.some((x) => x.id === b.id)).toBe(false)
  })

  it('an apprentice cannot delete a transaction', () => {
    const api = setup()
    const b = addBottle(api.current)
    act(() => {
      api.current.addTransaction({ bottleId: b.id, kind: 'charge', amount: 1, date: DATE })
    })
    const txId = txIdFor(api.current, b.id)
    addActiveTech(api, 'apprentice')
    act(() => api.current.deleteTransaction(txId, 'nope'))
    expect(api.current.state.transactions.find((t) => t.id === txId)!.deletedAt).toBeFalsy()
  })
})

describe('audit logging gaps closed', () => {
  it('changing a technician role is logged', () => {
    const api = setup()
    let id = ''
    act(() => {
      const t = api.current.addTechnician({ name: 'Pat', firstName: 'Pat', lastName: 'Lee', arcLicenceNumber: 'L-9', role: 'apprentice' })
      id = t.id
    })
    act(() => api.current.updateTechnician(id, { role: 'technician' }))
    const entry = api.current.state.auditLog.find(
      (e) => e.entity === 'technician' && e.changes?.some((c) => c.field === 'Role'),
    )
    expect(entry).toBeTruthy()
    expect(entry!.changes!.find((c) => c.field === 'Role')).toMatchObject({
      from: 'Apprentice',
      to: 'Technician',
    })
  })

  it('updating a technician licence is logged but never the password hash', () => {
    const api = setup()
    let id = ''
    act(() => {
      const t = api.current.addTechnician({ name: 'Sam', firstName: 'Sam', lastName: 'Roe', arcLicenceNumber: 'OLD', role: 'technician' })
      id = t.id
    })
    act(() => api.current.updateTechnician(id, { arcLicenceNumber: 'NEW', passwordHash: 'secrethash' }))
    const entry = api.current.state.auditLog.find(
      (e) => e.entity === 'technician' && e.changes?.some((c) => c.field === 'RHL'),
    )
    expect(entry).toBeTruthy()
    // RHL change recorded…
    expect(entry!.changes!.some((c) => c.field === 'RHL' && c.to === 'NEW')).toBe(true)
    // …password recorded as a state, never the hash value itself.
    const serialized = JSON.stringify(api.current.state.auditLog)
    expect(serialized).not.toContain('secrethash')
    expect(entry!.changes!.some((c) => c.field === 'Password lock')).toBe(true)
  })

  it('logs a licence (RHL) lapse automatically, exactly once', async () => {
    const api = setup()
    await act(async () => {
      api.current.addTechnician({
        name: 'Lapsed',
        firstName: 'Lapsed',
        lastName: 'Tech',
        arcLicenceNumber: 'EXP1',
        licenceExpiry: '2020-01-01',
        role: 'technician',
      })
    })
    // The expiry sweep runs in a microtask after the commit — flush it.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    const expired = api.current.state.auditLog.filter((e) => e.action === 'expire')
    expect(expired.length).toBe(1)
    expect(expired[0].summary).toMatch(/expired on 2020-01-01/)
    // Deduped: the lapse key is recorded so it won't log again.
    expect(api.current.state.loggedExpiryKeys.some((k) => k.startsWith('rhl:'))).toBe(true)
  })

  it('switching the active profile is recorded on the change log', () => {
    const api = setup()
    addActiveTech(api, 'owner')
    let secondId = ''
    act(() => {
      const t = api.current.addTechnician({ name: 'Second', firstName: 'Second', lastName: 'Tech', arcLicenceNumber: 'L-2', role: 'technician' })
      secondId = t.id
    })
    act(() => api.current.setActiveTechnicianId(secondId))
    expect(
      api.current.state.auditLog.some((e) => /Switched the active profile/.test(e.summary)),
    ).toBe(true)
  })
})
