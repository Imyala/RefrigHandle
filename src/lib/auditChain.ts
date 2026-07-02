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
const CHAIN_HEAD_KEY = 'refrighandle.chainHead'

// The highest sealed sequence (and its hash) this device has ever
// written to its own chain — a tamper-resistant high-water mark kept
// OUTSIDE the audit log. Deleting the newest entries leaves a perfectly
// contiguous 1..k chain that the link/hash checks alone can't flag;
// comparing against this recorded head is what catches that. It lives in
// localStorage (per device) and so shares the same honest limit as the
// rest of the scheme: it raises the bar for casual deletion and storage
// corruption, but full non-repudiation still needs a server anchor.
export interface ChainHead {
  chainId: string
  seq: number
  hash: string
}

export function getRecordedHead(): ChainHead | null {
  try {
    const raw = localStorage.getItem(CHAIN_HEAD_KEY)
    if (!raw) return null
    const h = JSON.parse(raw)
    if (
      h &&
      typeof h.chainId === 'string' &&
      typeof h.seq === 'number' &&
      typeof h.hash === 'string'
    ) {
      return h
    }
    return null
  } catch {
    return null
  }
}

function writeHead(head: ChainHead | null): void {
  try {
    if (head) localStorage.setItem(CHAIN_HEAD_KEY, JSON.stringify(head))
    else localStorage.removeItem(CHAIN_HEAD_KEY)
  } catch {
    // localStorage unavailable — head tracking is best-effort.
  }
}

// Record the local chain tip after a seal, but never LOWER a previously
// recorded head: deleting recent entries and re-sealing the remainder
// must not be able to quietly reset the high-water mark.
function recordHead(chainId: string, seq: number, hash: string): void {
  if (seq <= 0 || !hash) return
  const existing = getRecordedHead()
  if (existing && existing.chainId === chainId && existing.seq >= seq) return
  writeHead({ chainId, seq, hash })
}

// Re-baseline the head from a log we now trust wholesale — a backup the
// user chose to import, or a fresh install. This overwrites the
// high-water mark so importing an older/smaller backup doesn't read as
// truncation. Callers should verify the imported chain separately.
export function rebaseChainHead(log: readonly AuditEntry[]): void {
  const chainId = deviceChainId()
  let seq = 0
  let hash = ''
  for (const e of log) {
    if (e.chainId === chainId && e.hash && (e.seq ?? 0) > seq) {
      seq = e.seq!
      hash = e.hash
    }
  }
  writeHead(seq > 0 ? { chainId, seq, hash } : null)
}

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

  // Seal only entries THIS device originated (or legacy entries with no
  // origin stamp). A foreign unsealed entry that arrived mid-sync must
  // wait for its own device's seal — if both sides sealed it, the two
  // different seals for one entry id would never converge in a merge.
  const unsealed = log
    .filter((e) => !e.hash && (!e.origin || e.origin === chainId))
    .sort((a, b) => a.at.localeCompare(b.at))

  for (const e of unsealed) {
    seq += 1
    const sealed: AuditEntry = { ...e, chainId, seq, prevHash }
    const hash = await sha256Hex(canonical(sealed))
    patch.set(e.id, { chainId, seq, prevHash, hash })
    prevHash = hash
  }
  // `seq`/`prevHash` now hold the local chain tip (whether we just sealed
  // new entries or only found an existing tip) — record it as the head.
  if (seq > 0) recordHead(chainId, seq, prevHash)
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
  recordedHead: ChainHead | null = null,
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

  // Tail-truncation check. The link/hash/sequence checks above only see
  // the entries present, so lopping the newest entries off a chain leaves
  // a clean 1..k that would otherwise pass. The recorded head is this
  // device's independent memory of how far its chain reached.
  if (recordedHead && recordedHead.seq > 0) {
    const entries = byChain.get(recordedHead.chainId) ?? []
    const headEntry = entries.find((e) => e.seq === recordedHead.seq)
    const maxSeq = entries.reduce((m, e) => Math.max(m, e.seq ?? 0), 0)
    if (!headEntry) {
      problems.push({
        chainId: recordedHead.chainId,
        seq: recordedHead.seq,
        message: `This device sealed entries up to #${recordedHead.seq}, but the change log now stops at #${maxSeq} — the most recent entries appear to have been removed.`,
      })
    } else if ((headEntry.hash ?? '') !== recordedHead.hash) {
      problems.push({
        chainId: recordedHead.chainId,
        seq: recordedHead.seq,
        message: `The most recent sealed entry (#${recordedHead.seq}) does not match this device's record — the end of the chain was altered.`,
      })
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
