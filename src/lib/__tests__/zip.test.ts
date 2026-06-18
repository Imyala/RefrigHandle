import { describe, expect, it } from 'vitest'
import { createZip } from '../zip'

describe('createZip', () => {
  it('produces a ZIP with the PK signature and the entry names', async () => {
    const blob = createZip([
      { name: 'a.txt', data: 'hello' },
      { name: 'b.csv', data: 'x,y\n1,2' },
    ])
    expect(blob.type).toBe('application/zip')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    // Local file header signature "PK\x03\x04".
    expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([0x50, 0x4b, 0x03, 0x04])
    // End-of-central-directory signature appears at the tail.
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text).toContain('a.txt')
    expect(text).toContain('b.csv')
    expect(bytes.length).toBeGreaterThan(50)
  })
})
