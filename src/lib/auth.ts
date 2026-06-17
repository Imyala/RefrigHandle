// Soft lock for switching the active technician on a shared device.
// The hash lives in localStorage where any browser dev-tools user can
// read it, so this only deters casual snooping — it isn't real auth.
// Even so, we use a slow key-derivation function (PBKDF2) rather than a
// bare hash so a stolen backup can't be brute-forced cheaply offline.
//
// Stored format (current): "pbkdf2$sha256$<iterations>$<saltHex>$<hashHex>"
// with a random 16-byte salt generated fresh on every set, so the same
// password yields a different hash per profile and per change. The
// iteration count is stored in the string so it can be tuned up later
// without invalidating existing passwords.
//
// Legacy format ("<saltHex>:<sha256Hex>", a single SHA-256 round) is
// still accepted by verifyPassword so passwords set by older versions
// keep working until the tech next changes them.

// Minimum password length, shared by the onboarding and Settings forms
// so the rule lives in one place. Per NIST 800-63B we favour length over
// complexity (no character-class rules), and screen new passwords against
// common/breached lists instead — see lib/passwordStrength.ts.
export const MIN_PASSWORD_LENGTH = 8

// OWASP-recommended floor for PBKDF2-HMAC-SHA256 (2023). Runs in well
// under a second on a phone for a single check, but makes a large
// offline dictionary attack expensive.
const PBKDF2_ITERATIONS = 210_000
const PBKDF2_HASH = 'SHA-256'
const KEY_BITS = 256

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS)
  return `pbkdf2$sha256$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(hash)}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (stored.startsWith('pbkdf2$')) {
    // pbkdf2 $ sha256 $ <iterations> $ <saltHex> $ <hashHex>
    const parts = stored.split('$')
    if (parts.length !== 5) return false
    const iterations = Number(parts[2])
    const salt = hexToBytes(parts[3])
    const expected = parts[4]
    if (!Number.isInteger(iterations) || iterations <= 0 || !salt) return false
    const hash = await pbkdf2(password, salt, iterations)
    return timingSafeEqualHex(bytesToHex(hash), expected)
  }
  // Legacy single-round SHA-256 hashes from earlier versions.
  const [saltHex, digest] = stored.split(':')
  if (!saltHex || !digest) return false
  const candidate = await sha256(`${saltHex}:${password}`)
  return timingSafeEqualHex(candidate, digest)
}

async function pbkdf2(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return bytesToHex(new Uint8Array(buf))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) {
    return null
  }
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

// Length-independent comparison so verification time doesn't leak how
// many leading characters matched.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
