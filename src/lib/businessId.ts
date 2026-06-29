// Auto-generated business account ID — the shareable code an owner hands
// to their techs so they can sign in to the same business. Format:
//
//   RH-XXXX-XXXX
//
// The body uses a Crockford-style base32 alphabet with the visually
// ambiguous characters removed (no 0/O, 1/I/L, U), so the ID is easy to
// read aloud over the phone and type without confusion. 30^8 ≈ 6.5e11
// combinations — collisions are checked server-side at creation time once
// the cloud backend exists; locally we just generate and display it.

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'
const BODY_LEN = 8
const ID_RE = new RegExp(`^RH-[${ALPHABET}]{4}-[${ALPHABET}]{4}$`)

// Fill a byte buffer with cryptographically-strong randomness when
// available, falling back to Math.random only where Web Crypto is absent
// (it isn't, in any supported browser — the fallback just keeps tests and
// odd runtimes happy).
function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n)
  const c = typeof crypto !== 'undefined' ? crypto : undefined
  if (c?.getRandomValues) {
    c.getRandomValues(arr)
  } else {
    for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256)
  }
  return arr
}

// Generate a fresh Business ID. `bytes` can be injected for deterministic
// tests; otherwise a secure random source is used.
export function generateBusinessId(bytes: Uint8Array = randomBytes(BODY_LEN)): string {
  let body = ''
  for (let i = 0; i < BODY_LEN; i++) {
    body += ALPHABET[bytes[i % bytes.length] % ALPHABET.length]
  }
  return `RH-${body.slice(0, 4)}-${body.slice(4)}`
}

// Canonicalise user-typed input — uppercases, drops spaces/dashes, and
// re-inserts the dashes. Returns '' if it isn't 8 valid body characters
// (optionally prefixed with "RH"), so callers can treat '' as invalid.
export function normalizeBusinessId(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z]/g, '')
  const body = cleaned.startsWith('RH') ? cleaned.slice(2) : cleaned
  if (body.length !== BODY_LEN) return ''
  const formatted = `RH-${body.slice(0, 4)}-${body.slice(4)}`
  return ID_RE.test(formatted) ? formatted : ''
}

export function isValidBusinessId(raw: string): boolean {
  return normalizeBusinessId(raw) !== ''
}
