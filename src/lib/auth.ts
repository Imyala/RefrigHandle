// Soft lock for switching the active technician on a shared device.
// The hash lives in localStorage where any browser dev-tools user can
// read it, so this only deters casual snooping — it isn't real auth.
//
// Stored format: "<saltHex>:<sha256Hex>" with a random 16-byte salt.
// Salt is generated fresh on every set so the same password produces
// different hashes per profile and per change.
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const saltHex = bytesToHex(salt)
  const digest = await sha256(`${saltHex}:${password}`)
  return `${saltHex}:${digest}`
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, digest] = stored.split(':')
  if (!saltHex || !digest) return false
  const candidate = await sha256(`${saltHex}:${password}`)
  return candidate === digest
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
