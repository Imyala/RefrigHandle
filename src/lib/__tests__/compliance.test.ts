import { describe, expect, it } from 'vitest'
import { profileFor } from '../compliance'

describe('compliance profile', () => {
  it('always resolves to the Australian (ARC) profile', () => {
    expect(profileFor(undefined).id).toBe('AU')
    expect(profileFor('AU').id).toBe('AU')
    expect(profileFor('AU').techLicenceShort).toBe('RHL')
    expect(profileFor('AU').businessAuthShort).toBe('RTA')
  })
})
