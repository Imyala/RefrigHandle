// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { StoreProvider, useStore } from '../store'
import { ToastProvider } from '../toast'
import { ConfirmProvider } from '../confirm'
import { LogForm } from '../../components/LogForm'
import type { TransactionKind } from '../types'

// The unified LogForm (one form behind both the bottle quick-log and the
// Refrigerant-log "+ Log") has no other UI coverage, so these are crash /
// wiring smoke tests: render it inside the real providers with a seeded
// bottle and assert the union features (quick chips, bottle-to-bottle) are
// reachable from the shared component.

afterEach(cleanup)

function Harness({
  initialKind,
  open,
}: {
  initialKind?: TransactionKind
  open: boolean
}) {
  const { state, addBottle } = useStore()
  useEffect(() => {
    if (state.bottles.length === 0) {
      addBottle({
        bottleNumber: 'CYL-1',
        refrigerantType: 'R32',
        tareWeight: 10,
        grossWeight: 25,
        initialNetWeight: 15,
        status: 'in_stock',
      })
    }
  }, [state.bottles.length, addBottle])
  if (state.bottles.length === 0) return null
  return (
    <LogForm
      open={open}
      initialBottleId={state.bottles[0].id}
      initialKind={initialKind}
      onClose={() => {}}
      onSave={() => {}}
    />
  )
}

// Render closed (seeds the bottle), then re-render open — mirroring how the
// pages keep LogForm mounted and toggle it. initialKind / initialBottleId
// are applied on that closed→open transition (the form's reset block).
function renderOpened(initialKind?: TransactionKind) {
  const ui = (open: boolean) => (
    <ToastProvider>
      <ConfirmProvider>
        <StoreProvider>
          <Harness initialKind={initialKind} open={open} />
        </StoreProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
  const view = render(ui(false))
  view.rerender(ui(true))
  return view
}

describe('LogForm — unified log form smoke', () => {
  it('renders the shared form with quick-amount chips on the charge path', () => {
    renderOpened('charge')
    expect(screen.getByText('Log transaction')).toBeTruthy()
    // Quick-amount chips (a quick-log-only feature pre-unification) are now
    // on the shared form.
    expect(screen.getByText('2 kg')).toBeTruthy()
  })

  it('offers bottle-to-bottle recovery on the recover path', () => {
    renderOpened('recover')
    // Recover shows the source toggle; picking "Another bottle" reveals the
    // source-bottle field (a quick-log-only capability pre-unification).
    fireEvent.click(screen.getByText('Another bottle'))
    expect(screen.getByText('Source bottle')).toBeTruthy()
  })
})
