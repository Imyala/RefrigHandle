// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { StoreProvider, useStore } from '../store'
import { ToastProvider } from '../toast'
import { ConfirmProvider } from '../confirm'
import { AuditReportCard } from '../../components/AuditReport'

// Smoke test for the auditor hand-off: it pulls together compliance rows,
// the quarterly record, registers and the integrity stamp, so a render
// crash (a bad helper call, a missing field) is the main risk. Seed a
// bottle + a charge, open the pack, assert the major sections render.

afterEach(cleanup)

function Harness() {
  const { state, addBottle, addTransaction } = useStore()
  useEffect(() => {
    if (state.bottles.length === 0) {
      const b = addBottle({
        bottleNumber: 'CYL-9',
        refrigerantType: 'R32',
        tareWeight: 10,
        grossWeight: 25,
        initialNetWeight: 15,
        status: 'in_stock',
      })
      addTransaction({ bottleId: b.id, kind: 'charge', amount: 2, date: new Date().toISOString() })
    }
  }, [state.bottles.length, addBottle, addTransaction])
  return <AuditReportCard />
}

function renderCard() {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <Harness />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>,
  )
}

describe('AuditReport — auditor pack smoke', () => {
  it('opens the pack with all major sections', () => {
    renderCard()
    fireEvent.click(screen.getByText('Generate audit pack'))
    // The modal title and the headline sections an auditor expects.
    expect(screen.getByText('Records integrity')).toBeTruthy()
    expect(screen.getByText('Compliance summary')).toBeTruthy()
    expect(screen.getByText('Cylinder register (in service)')).toBeTruthy()
    expect(
      screen.getByText('Refrigerant movement log (this quarter)'),
    ).toBeTruthy()
    // The seeded cylinder shows up in the register.
    expect(screen.getAllByText('CYL-9').length).toBeGreaterThan(0)
  })
})
