import { describe, expect, it } from 'vitest'
import { sealAuditLog, verifyAuditChains } from '../auditChain'
import { makeAudit } from './fixtures'
import type { AuditEntry } from '../types'

// Tamper-evidence: every sealed entry commits to its content AND its
// predecessor's hash, so edits, deletions and reordering all surface.

async function sealedLog(count: number): Promise<AuditEntry[]> {
  // Oldest-first creation, then newest-first like the store keeps it.
  const entries: AuditEntry[] = []
  for (let i = 0; i < count; i++) {
    entries.unshift(
      makeAudit({
        at: `2026-06-0${i + 1}T00:00:00.000Z`,
        summary: `entry ${i + 1}`,
      }),
    )
  }
  const patch = await sealAuditLog(entries)
  return entries.map((e) => ({ ...e, ...patch.get(e.id) }))
}

describe('sealAuditLog', () => {
  it('seals oldest-first with increasing seq and linked hashes', async () => {
    const log = await sealedLog(3)
    const bySeq = [...log].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    expect(bySeq.map((e) => e.seq)).toEqual([1, 2, 3])
    expect(bySeq[0].prevHash).toBe('')
    expect(bySeq[1].prevHash).toBe(bySeq[0].hash)
    expect(bySeq[2].prevHash).toBe(bySeq[1].hash)
    expect(bySeq.every((e) => /^[0-9a-f]{64}$/.test(e.hash ?? ''))).toBe(true)
  })

  it('extends the existing chain instead of restarting it', async () => {
    const first = await sealedLog(2)
    const newer = makeAudit({ at: '2026-06-09T00:00:00.000Z' })
    const log = [newer, ...first]
    const patch = await sealAuditLog(log)
    expect(patch.size).toBe(1)
    const seal = patch.get(newer.id)!
    expect(seal.seq).toBe(3)
    const tip = first.find((e) => e.seq === 2)!
    expect(seal.prevHash).toBe(tip.hash)
  })

  it('is a no-op when everything is already sealed', async () => {
    const log = await sealedLog(2)
    expect((await sealAuditLog(log)).size).toBe(0)
  })
})

describe('verifyAuditChains', () => {
  it('a clean chain verifies', async () => {
    const log = await sealedLog(4)
    const report = await verifyAuditChains(log)
    expect(report.valid).toBe(true)
    expect(report.sealed).toBe(4)
    expect(report.chains).toBe(1)
    expect(report.problems).toEqual([])
  })

  it('detects an entry edited after sealing, naming the seq', async () => {
    const log = await sealedLog(3)
    const victim = log.find((e) => e.seq === 2)!
    const tampered = log.map((e) =>
      e.id === victim.id ? { ...e, summary: 'rewritten history' } : e,
    )
    const report = await verifyAuditChains(tampered)
    expect(report.valid).toBe(false)
    expect(
      report.problems.some(
        (p) => p.seq === 2 && p.message.includes('edited after sealing'),
      ),
    ).toBe(true)
  })

  it('detects a deleted entry as a sequence gap', async () => {
    const log = await sealedLog(3)
    const withoutMiddle = log.filter((e) => e.seq !== 2)
    const report = await verifyAuditChains(withoutMiddle)
    expect(report.valid).toBe(false)
    expect(report.problems.some((p) => p.message.includes('deleted'))).toBe(true)
  })

  it('catches tail-truncation only when given the recorded head', async () => {
    // Deleting the NEWEST entries leaves a contiguous 1..k chain that the
    // link/hash/sequence checks alone cannot flag — this is the gap the
    // recorded head closes.
    const log = await sealedLog(4)
    const bySeq = [...log].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    const tip = bySeq[bySeq.length - 1]
    const head = { chainId: tip.chainId!, seq: tip.seq!, hash: tip.hash! }
    // Lop off the two most recent entries.
    const truncated = log.filter((e) => (e.seq ?? 0) <= 2)

    // Without the head, truncation is invisible (the original weakness).
    const blind = await verifyAuditChains(truncated)
    expect(blind.valid).toBe(true)

    // With the head, it is caught and named.
    const seen = await verifyAuditChains(truncated, head)
    expect(seen.valid).toBe(false)
    expect(
      seen.problems.some((p) => /removed|stops/.test(p.message)),
    ).toBe(true)
  })

  it('a full chain that still reaches its recorded head verifies', async () => {
    const log = await sealedLog(3)
    const bySeq = [...log].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    const tip = bySeq[bySeq.length - 1]
    const head = { chainId: tip.chainId!, seq: tip.seq!, hash: tip.hash! }
    const report = await verifyAuditChains(log, head)
    expect(report.valid).toBe(true)
  })

  it('detects a broken link (prevHash rewritten)', async () => {
    const log = await sealedLog(3)
    const tampered = log.map((e) =>
      e.seq === 3 ? { ...e, prevHash: 'f'.repeat(64) } : e,
    )
    const report = await verifyAuditChains(tampered)
    expect(report.valid).toBe(false)
    expect(report.problems.length).toBeGreaterThan(0)
  })

  it('unsealed entries are reported but never invalidate the chain', async () => {
    // Normal state right after a write: the newest entry has no seal yet.
    const chain = await sealedLog(2)
    const justWritten = makeAudit({ at: '2026-06-10T00:00:00.000Z' })
    const report = await verifyAuditChains([justWritten, ...chain])
    expect(report.valid).toBe(true)
    expect(report.chains).toBe(1)
    expect(report.sealed).toBe(2)
    expect(report.unsealed).toBe(1)
  })

  it('the seal commits to the chain id — relabelling an entry breaks it', async () => {
    // Moving an entry to another device's chain (e.g. trying to hide a
    // gap) changes the canonical content, so the hash no longer matches.
    const log = await sealedLog(1)
    const relabelled = log.map((e) => ({ ...e, chainId: 'device-b' }))
    const report = await verifyAuditChains(relabelled)
    expect(report.valid).toBe(false)
  })
})
