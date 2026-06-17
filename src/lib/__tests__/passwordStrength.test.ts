import { describe, expect, it, vi } from 'vitest'
import {
  checkPasswordPwned,
  describeBreachCount,
  isCommonPassword,
  screenNewPassword,
} from '../passwordStrength'

describe('isCommonPassword', () => {
  it('flags common passwords case-insensitively', () => {
    expect(isCommonPassword('password')).toBe(true)
    expect(isCommonPassword('Password')).toBe(true)
    expect(isCommonPassword('  123456 ')).toBe(true)
    expect(isCommonPassword('qwerty')).toBe(true)
  })

  it('passes an uncommon passphrase', () => {
    expect(isCommonPassword('blue-walrus-piano-37')).toBe(false)
  })
})

// A stub HIBP "range" response. The real API returns "<SUFFIX>:<count>"
// lines for one 5-char SHA-1 prefix. We compute the actual suffix for the
// password under test so the lookup matches.
async function sha1Suffix(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .slice(5)
}

function stubFetch(body: string, ok = true): typeof fetch {
  return vi.fn(async () => ({ ok, text: async () => body })) as unknown as typeof fetch
}

describe('checkPasswordPwned', () => {
  it('reports a match with its breach count', async () => {
    const suffix = await sha1Suffix('hunter2hunter2')
    const res = await checkPasswordPwned(
      'hunter2hunter2',
      stubFetch(`${suffix}:42\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0`),
    )
    expect(res).toEqual({ status: 'pwned', count: 42 })
  })

  it('reports ok when the suffix is absent', async () => {
    const res = await checkPasswordPwned(
      'a-very-unique-passphrase',
      stubFetch('0123456789012345678901234567890123:5'),
    )
    expect(res).toEqual({ status: 'ok' })
  })

  it('treats padding entries (count 0) as not pwned', async () => {
    const suffix = await sha1Suffix('padded-example')
    const res = await checkPasswordPwned(
      'padded-example',
      stubFetch(`${suffix}:0`),
    )
    expect(res).toEqual({ status: 'ok' })
  })

  it('returns unknown when the request fails (offline)', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await checkPasswordPwned('whatever', throwing)).toEqual({
      status: 'unknown',
    })
  })
})

describe('screenNewPassword', () => {
  it('rejects a common password without any network call', async () => {
    const fetchSpy = vi.fn() as unknown as typeof fetch
    const reason = await screenNewPassword('password', fetchSpy)
    expect(reason).toMatch(/common/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a breached password', async () => {
    const suffix = await sha1Suffix('breached-one-here')
    const reason = await screenNewPassword(
      'breached-one-here',
      stubFetch(`${suffix}:1500`),
    )
    expect(reason).toMatch(/breach/i)
  })

  it('accepts a clean password (and an offline check is not blocking)', async () => {
    expect(
      await screenNewPassword('blue-walrus-piano-37', stubFetch('XXXX:1')),
    ).toBeNull()
    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await screenNewPassword('blue-walrus-piano-37', throwing)).toBeNull()
  })
})

describe('describeBreachCount', () => {
  it('formats counts', () => {
    expect(describeBreachCount(1)).toBe('1 time')
    expect(describeBreachCount(5)).toBe('5 times')
    expect(describeBreachCount(2500)).toBe('over 2,000 times')
    expect(describeBreachCount(3_000_000)).toBe('3 million times')
  })
})
