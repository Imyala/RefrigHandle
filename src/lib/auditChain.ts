import type { AuditEntry } from './types'
import { uid } from './storage'

// Tamper-evidence for the audit trail.
//
// Every audit entry is sealed into a hash chain shortly after it is
// written: hash = SHA-256(canonical content + previous entry's hash).
// Editing, deleting or reordering a sealed entry breaks every later
// link, which the verifier reports with the exact entries affected.
//
// Chains are PER DEVICE (chainId), not one global chain: multi-device
// sync merges audit logs by union, and a single chain would fork on
// every merge. Each device extends only its own chain; the verifier
// checks every chain it finds.
//
// Honest limits: this is client-side. It reliably detects casual
// edits, deletions and storage corruption — but someone who controls
// the device and understands the scheme could re-hash a whole chain.
// True non-repudiation needs the chain heads anchored on a server the
// editor can't rewrite; that's the next step once team accounts exist.

const CHAIN_ID_KEY = 'refrighandle.chainId'

export function deviceChainId(): string {
  try {
    let id = localStorage.getItem(CHAIN_ID_KEY)
    if (!id) {
      id = uid()
      localStorage.setItem(CHAIN_ID_KEY, id)
    }
    return id
  } catch {
    // localStorage unavailable — fall back to a per-session id. Chains
    // stay valid; this device just starts a new one each session.
    return 'session'
  }
}

// The byte content a seal commits to. Excludes the seal fields except
// chainId/seq/prevHash (which are part of the link) and is rebuilt the
// same way at verification time, so any drift in the committed fields
// breaks the hash.
function canonical(e: AuditEntry): string {
  return JSON.stringify([
    e.chainId,
    e.seq,
    e.prevHash,
    e.id,
    e.at,
    e.action,
    e.entity,
    e.entityId ?? '',
    e.target,
    e.summary,
    e.by ?? '',
    e.byLicence ?? '',
    e.changes ?? [],
  ])
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Seal every unsealed entry into this device's chain. Returns a patch
// map (entry id → seal fields) — empty when everything is sealed.
// `log` is newest-first (the store prepends); unsealed entries are
// adopted oldest-first so seq increases with time.
export async function sealAuditLog(
  log: readonly AuditEntry[],
): Promise<Map<string, Pick<AuditEntry, 'chainId' | 'seq' | 'prevHash' | 'hash'>>> {
  const patch = new Map<
    string,
    Pick<AuditEntry, 'chainId' | 'seq' | 'prevHash' | 'hash'>
  >()
  const chainId = deviceChainId()

  // Current tip of this device's chain.
  let seq = 0
  let prevHash = ''
  for (const e of log) {
    if (e.chainId === chainId && e.hash && (e.seq ?? 0) > seq) {
      seq = e.seq!
      prevHash = e.hash
    }
  }

  const unsealed = log
    .filter((e) => !e.hash)
    .sort((a, b) => a.at.localeCompare(b.at))

  for (const e of unsealed) {
    seq += 1
    const sealed: AuditEntry = { ...e, chainId, seq, prevHash }
    const hash = await sha256Hex(canonical(sealed))
    patch.set(e.id, { chainId, seq, prevHash, hash })
    prevHash = hash
  }
  return patch
}

export interface ChainProblem {
  chainId: string
  seq?: number
  entryId?: string
  message: string
}

export interface ChainReport {
  total: number // entries in the log
  sealed: number // entries carrying a seal
  unsealed: number // not yet sealed (normal for just-written entries)
  chains: number // distinct device chains found
  valid: boolean // every sealed chain checks out
  problems: ChainProblem[]
}

// Re-derive every chain and compare. Any edit to a sealed entry's
// committed fields, any deleted or reordered entry, and any broken
// link shows up as a problem naming the chain and sequence number.
export async function verifyAuditChains(
  log: readonly AuditEntry[],
): Promise<ChainReport> {
  const problems: ChainProblem[] = []
  const byChain = new Map<string, AuditEntry[]>()
  let sealed = 0
  for (const e of log) {
    if (!e.hash) continue
    sealed += 1
    if (!e.chainId || e.seq == null) {
      problems.push({
        chainId: e.chainId ?? '(none)',
        entryId: e.id,
        message: 'Sealed entry is missing its chain id or sequence number.',
      })
      continue
    }
    const arr = byChain.get(e.chainId) ?? []
    arr.push(e)
    byChain.set(e.chainId, arr)
  }

  for (const [chainId, entries] of byChain) {
    entries.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    let prevHash = ''
    let expectedSeq = 1
    for (const e of entries) {
      if (e.seq !== expectedSeq) {
        problems.push({
          chainId,
          seq: e.seq,
          entryId: e.id,
          message: `Sequence jumps from ${expectedSeq - 1} to ${e.seq} — ${
            e.seq! > expectedSeq
              ? 'one or more entries have been deleted'
              : 'duplicate or reordered entries'
          }.`,
        })
        // Resync so one gap doesn't cascade into noise.
        expectedSeq = e.seq ?? expectedSeq
        prevHash = e.prevHash ?? ''
      }
      if ((e.prevHash ?? '') !== prevHash) {
        problems.push({
          chainId,
          seq: e.seq,
          entryId: e.id,
          message: 'Link to the previous entry does not match — the chain was altered here.',
        })
      }
      const recomputed = await sha256Hex(canonical(e))
      if (recomputed !== e.hash) {
        problems.push({
          chainId,
          seq: e.seq,
          entryId: e.id,
          message: 'Entry content does not match its seal — this entry was edited after sealing.',
        })
      }
      prevHash = e.hash ?? ''
      expectedSeq = (e.seq ?? expectedSeq) + 1
    }
  }

  return {
    total: log.length,
    sealed,
    unsealed: log.length - sealed,
    chains: byChain.size,
    valid: problems.length === 0,
    problems,
  }
}
