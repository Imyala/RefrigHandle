// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { StoreProvider, useStore } from '../store'
import { ToastProvider } from '../toast'
import { ConfirmProvider } from '../confirm'
import { MemoryRouter } from 'react-router-dom'
import Jobs from '../../pages/Jobs'

// Smoke test for the Jobs page + service report: seed a job and a movement
// against it, open the detail, and open the service report — a render crash
// (bad helper, missing field) is the main risk for this new surface.

afterEach(cleanup)

function Seeder() {
  const { state, addBottle, addJob, addTransaction } = useStore()
  useEffect(() => {
    if (state.jobs.length === 0) {
      const b = addBottle({
        bottleNumber: 'JCYL-1',
        refrigerantType: 'R32',
        tareWeight: 10,
        grossWeight: 25,
        initialNetWeight: 15,
        status: 'in_stock',
      })
      const j = addJob({ reference: 'WO-777', date: new Date().toISOString() })
      addTransaction({
        bottleId: b.id,
        kind: 'charge',
        amount: 2,
        jobId: j.id,
        date: new Date().toISOString(),
      })
    }
  }, [state.jobs.length, addBottle, addJob, addTransaction])
  return null
}

function renderJobs() {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <MemoryRouter>
            <Seeder />
            <Jobs />
          </MemoryRouter>
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>,
  )
}

describe('Jobs page + service report smoke', () => {
  it('lists a job, opens it, and renders the service report', () => {
    renderJobs()
    // The seeded job is listed.
    expect(screen.getAllByText('WO-777').length).toBeGreaterThan(0)
    // Open the detail (the job card button).
    fireEvent.click(screen.getAllByText('WO-777')[0])
    expect(screen.getByText(/Movements \(1\)/)).toBeTruthy()
    // Open the service report.
    fireEvent.click(screen.getByText('Service report'))
    expect(screen.getByText('Work performed')).toBeTruthy()
    expect(screen.getByText('Refrigerant summary')).toBeTruthy()
  })
})
