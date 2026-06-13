import { describe, expect, it } from 'vitest'
import { normalizeState } from '../storage'

// Roles were added after technician profiles shipped. normalize() must
// seed a default tier for legacy profiles and guarantee every install
// has exactly one owner for the future per-tech logins to anchor to.
describe('technician role migration in normalizeState', () => {
  it('promotes the active profile to owner when none is set', () => {
    const state = normalizeState({
      technicians: [
        { id: 't1', name: 'Jane', arcLicenceNumber: 'L1', createdAt: 'x' },
        { id: 't2', name: 'Sam', arcLicenceNumber: 'L2', createdAt: 'x' },
      ],
      activeTechnicianId: 't2',
    })
    expect(state.technicians.find((t) => t.id === 't2')?.role).toBe('owner')
    expect(state.technicians.find((t) => t.id === 't1')?.role).toBe('technician')
    expect(state.technicians.filter((t) => t.role === 'owner')).toHaveLength(1)
  })

  it('falls back to the first profile as owner when no active id', () => {
    const state = normalizeState({
      technicians: [
        { id: 't1', name: 'Jane', arcLicenceNumber: 'L1', createdAt: 'x' },
        { id: 't2', name: 'Sam', arcLicenceNumber: 'L2', createdAt: 'x' },
      ],
    })
    expect(state.technicians[0].role).toBe('owner')
  })

  it('leaves an existing owner untouched', () => {
    const state = normalizeState({
      technicians: [
        { id: 't1', name: 'Jane', arcLicenceNumber: 'L1', createdAt: 'x', role: 'supervisor' },
        { id: 't2', name: 'Sam', arcLicenceNumber: 'L2', createdAt: 'x', role: 'owner' },
      ],
      activeTechnicianId: 't1',
    })
    expect(state.technicians.find((t) => t.id === 't2')?.role).toBe('owner')
    expect(state.technicians.find((t) => t.id === 't1')?.role).toBe('supervisor')
  })
})
