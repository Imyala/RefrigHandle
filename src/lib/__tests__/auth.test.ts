import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from '../auth'

describe('password hashing', () => {
  it('round-trips a PBKDF2 hash', async () => {
    const hash = await hashPassword('correct horse')
    expect(hash.startsWith('pbkdf2$sha256$')).toBe(true)
    expect(await verifyPassword('correct horse', hash)).toBe(true)
    expect(await verifyPassword('wrong horse', hash)).toBe(false)
  })

  it('salts each hash so the same password differs every time', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toEqual(b)
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })

  it('still verifies legacy single-round SHA-256 hashes', async () => {
    // "<saltHex>:<sha256Hex>" — produced by the previous version. This
    // fixture is sha256("<salt>:secret") for the salt below, so existing
    // passwords keep working after the PBKDF2 upgrade.
    const salt = '00112233445566778899aabbccddeeff'
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${salt}:secret`),
    )
    const digest = Array.from(new Uint8Array(buf))
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
    const legacy = `${salt}:${digest}`
    expect(await verifyPassword('secret', legacy)).toBe(true)
    expect(await verifyPassword('nope', legacy)).toBe(false)
  })

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'garbage')).toBe(false)
    expect(await verifyPassword('x', 'pbkdf2$sha256$abc$zz$zz')).toBe(false)
  })

  it('exposes a sane minimum length', () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(6)
  })
})
