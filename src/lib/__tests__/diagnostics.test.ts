// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearDiagnostics,
  diagnosticsToText,
  getDiagnostics,
  logDiagnostic,
} from '../diagnostics'

beforeEach(() => clearDiagnostics())
afterEach(() => clearDiagnostics())

describe('diagnostics ring buffer', () => {
  it('records entries newest-first', () => {
    logDiagnostic('app', 'first')
    logDiagnostic('error', 'second')
    const entries = getDiagnostics()
    expect(entries.map((e) => e.message)).toEqual(['second', 'first'])
    expect(entries[0].kind).toBe('error')
  })

  it('caps the buffer so it never grows without bound', () => {
    for (let i = 0; i < 70; i++) logDiagnostic('app', `e${i}`)
    const entries = getDiagnostics()
    expect(entries.length).toBe(50)
    // Newest kept, oldest dropped.
    expect(entries[0].message).toBe('e69')
    expect(entries.some((e) => e.message === 'e19')).toBe(false)
  })

  it('truncates pathologically long messages and details', () => {
    logDiagnostic('error', 'x'.repeat(1000), 'y'.repeat(5000))
    const [e] = getDiagnostics()
    expect(e.message.length).toBe(500)
    expect(e.detail!.length).toBe(2000)
  })

  it('clear empties the buffer', () => {
    logDiagnostic('app', 'gone')
    clearDiagnostics()
    expect(getDiagnostics()).toEqual([])
    expect(diagnosticsToText()).toBe('No issues recorded.')
  })

  it('renders a copyable text block with each entry', () => {
    logDiagnostic('error', 'boom', 'at line 1')
    const text = diagnosticsToText()
    expect(text).toContain('error: boom')
    expect(text).toContain('at line 1')
  })
})
