import { describe, it, expect } from 'vitest'
import {
  generateBusinessId,
  normalizeBusinessId,
  isValidBusinessId,
} from '../businessId'

describe('generateBusinessId', () => {
  it('produces the RH-XXXX-XXXX shape', () => {
    expect(generateBusinessId()).toMatch(/^RH-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  })

  it('is deterministic for injected bytes and uses the safe alphabet', () => {
    const id = generateBusinessId(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]))
    // No ambiguous characters (0/O, 1/I/L, U) ever appear.
    expect(id).not.toMatch(/[01OILU]/)
    expect(isValidBusinessId(id)).toBe(true)
  })

  it('always generates a valid id', () => {
    for (let i = 0; i < 50; i++) {
      expect(isValidBusinessId(generateBusinessId())).toBe(true)
    }
  })
})

describe('normalizeBusinessId', () => {
  it('canonicalises spacing, case and dashes', () => {
    expect(normalizeBusinessId('rh 23ab 4567')).toBe('RH-23AB-4567')
    expect(normalizeBusinessId('23AB4567')).toBe('RH-23AB-4567')
    expect(normalizeBusinessId('RH-23AB-4567')).toBe('RH-23AB-4567')
  })

  it('rejects wrong length or ambiguous characters', () => {
    expect(normalizeBusinessId('23AB456')).toBe('') // 7 chars
    expect(normalizeBusinessId('23AB45678')).toBe('') // 9 chars
    expect(normalizeBusinessId('01OILU23')).toBe('') // not in alphabet
    expect(normalizeBusinessId('')).toBe('')
  })
})

describe('isValidBusinessId', () => {
  it('accepts valid, rejects invalid', () => {
    expect(isValidBusinessId('RH-23AB-4567')).toBe(true)
    expect(isValidBusinessId('rh23ab4567')).toBe(true)
    expect(isValidBusinessId('nope')).toBe(false)
    expect(isValidBusinessId('RH-0000-0000')).toBe(false) // 0 not allowed
  })
})
