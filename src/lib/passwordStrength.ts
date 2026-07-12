// Password screening for the profile-switch lock. Modern guidance
// (NIST 800-63B) is "length over complexity": don't impose character-
// class rules or rotation, but DO screen new passwords against the
// passwords that actually get cracked — the common ones and the ones
// already exposed in known breaches.
//
// Two layers:
//  1. A small offline blocklist of the most common passwords, so the
//     check still works with no connection (the app is offline-first).
//  2. The Have I Been Pwned "range" API, which is k-anonymous: we send
//     only the first five hex characters of the password's SHA-1 hash —
//     never the password, and never its full hash — and scan the
//     returned suffixes locally. Best-effort: if the network is
//     unavailable the set still goes through (the offline list having
//     already caught the obvious cases).

// The most common / most-breached passwords. Compared case-insensitively,
// so "Password" and "password" are both rejected. Not exhaustive — the
// Have I Been Pwned check below covers the long tail — just enough to
// catch the obvious offenders without a network round-trip.
const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  [
    'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd',
    '123456', '1234567', '12345678', '123456789', '1234567890',
    '12345', '1234', '123123', '123321', '111111', '000000', '666666',
    '654321', '121212', '555555', '999999', '888888', 'abc123', '123abc',
    'a123456', '123456a', 'qwerty', 'qwerty123', 'qwertyuiop', 'qwertyui',
    'asdfghjkl', 'asdfgh', 'zxcvbnm', '1q2w3e4r', '1q2w3e', '1qaz2wsx',
    'zaq12wsx', 'qazwsx', 'qweasd', 'q1w2e3r4', 'iloveyou', 'admin',
    'admin123', 'administrator', 'root', 'toor', 'letmein', 'welcome',
    'welcome1', 'login', 'master', 'monkey', 'dragon', 'football',
    'baseball', 'soccer', 'superman', 'batman', 'shadow', 'ninja',
    'mustang', 'jordan', 'harley', 'ranger', 'hunter', 'buster',
    'sunshine', 'princess', 'flower', 'hottie', 'loveme', 'whatever',
    'trustno1', 'freedom', 'secret', 'starwars', 'computer', 'internet',
    'changeme', 'change', 'default', 'test', 'test123', 'temp',
    'aaaaaa', 'abcdef', 'abcd1234', 'abc12345', 'pass', 'pass123',
    'money', 'access', 'summer', 'winter', 'spring', 'autumn',
    'refrigerant', 'refrighandle', 'refrigister',
  ].map((p) => p.toLowerCase()),
)

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.trim().toLowerCase())
}

export type PwnedResult =
  | { status: 'pwned'; count: number }
  | { status: 'ok' }
  // Network unavailable / request failed — caller should not block on it.
  | { status: 'unknown' }

// Check a password against Have I Been Pwned's k-anonymity range API.
// Privacy-preserving: only the first five characters of the SHA-1 hash
// leave the device. Returns 'unknown' on any failure so an offline tech
// is never stuck.
export async function checkPasswordPwned(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PwnedResult> {
  try {
    const hash = await sha1Hex(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    const res = await fetchImpl(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      // Add-Padding pads the response with decoy entries so the length
      // of the result can't hint at how many real matches there were.
      { headers: { 'Add-Padding': 'true' } },
    )
    if (!res.ok) return { status: 'unknown' }
    const body = await res.text()
    for (const line of body.split('\n')) {
      const [suf, countStr] = line.trim().split(':')
      if (!suf) continue
      if (suf.toUpperCase() === suffix) {
        const count = parseInt(countStr ?? '0', 10)
        // Padding entries carry a count of 0 — ignore those.
        return count > 0 ? { status: 'pwned', count } : { status: 'ok' }
      }
    }
    return { status: 'ok' }
  } catch {
    return { status: 'unknown' }
  }
}

// Human-readable "N times" for a breach count.
export function describeBreachCount(count: number): string {
  if (count >= 1_000_000) return `${Math.round(count / 1_000_000)} million times`
  if (count >= 1000) return `over ${Math.floor(count / 1000)},000 times`
  return `${count} time${count === 1 ? '' : 's'}`
}

// Screen a *new* password: reject the common ones (offline), then the
// breached ones (online, best-effort). Returns a user-facing reason to
// reject, or null when it's acceptable. Length/confirmation are handled
// by the forms; this is only the "is it a known-bad password" gate.
export async function screenNewPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (isCommonPassword(password)) {
    return 'That’s one of the most common passwords in use — pick something less guessable.'
  }
  const pwned = await checkPasswordPwned(password, fetchImpl)
  if (pwned.status === 'pwned') {
    return `This password has appeared in known data breaches ${describeBreachCount(
      pwned.count,
    )} — please choose a different one.`
  }
  return null
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
