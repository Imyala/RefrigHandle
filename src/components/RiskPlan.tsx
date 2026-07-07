import { useState } from 'react'
import { Button, Card, Modal, TextInput } from './ui'
import { useStore } from '../lib/store'
import { useToast } from '../lib/toast'
import { RISK_PLAN_ITEMS } from '../lib/compliance'
import type { RiskPlanItemState } from '../lib/types'
import { formatDateTime } from '../lib/datetime'

// Guided risk management plan — an ARC RTA condition. Deliberately a
// checklist, not a document editor: each item states the practical
// obligation, the business ticks what's in place and notes how, and the
// review stamp (who/when) prints on the plan and on the audit pack.

export function RiskPlanCard() {
  const { state } = useStore()
  const [open, setOpen] = useState(false)
  const plan = state.riskPlan
  const doneCount = plan
    ? RISK_PLAN_ITEMS.filter((d) => plan.items[d.key]?.done).length
    : 0
  return (
    <Card>
      <div className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
        Risk management plan
      </div>
      <p className="mb-3 text-xs text-slate-500">
        An RTA condition: a plan covering how the business manages its
        refrigerant-handling risks. Work through the checklist, mark it
        reviewed, and it prints with your audit pack.
        {plan?.reviewedAt ? (
          <>
            {' '}
            Last reviewed{' '}
            <strong>
              {formatDateTime(plan.reviewedAt, state.location.timezone, state.clock)}
            </strong>
            {plan.reviewedBy ? ` by ${plan.reviewedBy}` : ''} —{' '}
            {doneCount}/{RISK_PLAN_ITEMS.length} items in place.
          </>
        ) : (
          <strong> Not reviewed yet.</strong>
        )}
      </p>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {plan ? 'Open risk plan' : 'Start risk plan'}
      </Button>
      {open && <RiskPlanModal onClose={() => setOpen(false)} />}
    </Card>
  )
}

function RiskPlanModal({ onClose }: { onClose: () => void }) {
  const { state, saveRiskPlan } = useStore()
  const toast = useToast()
  const [items, setItems] = useState<Record<string, RiskPlanItemState>>(() => {
    const out: Record<string, RiskPlanItemState> = {}
    for (const d of RISK_PLAN_ITEMS) {
      out[d.key] = state.riskPlan?.items[d.key] ?? { done: false }
    }
    return out
  })
  const doneCount = RISK_PLAN_ITEMS.filter((d) => items[d.key]?.done).length

  function setItem(key: string, patch: Partial<RiskPlanItemState>) {
    setItems((cur) => {
      const base = cur[key] ?? { done: false }
      return { ...cur, [key]: { ...base, ...patch } }
    })
  }

  function save(markReviewed: boolean) {
    saveRiskPlan(items, markReviewed)
    toast.show(
      markReviewed
        ? `Risk plan saved and marked reviewed — ${doneCount}/${RISK_PLAN_ITEMS.length} in place.`
        : 'Risk plan saved.',
      'success',
    )
    onClose()
  }

  const reviewed = state.riskPlan?.reviewedAt

  return (
    <Modal open title="Risk management plan" size="lg" onClose={onClose}>
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {doneCount}/{RISK_PLAN_ITEMS.length} items in place
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          Print / Save PDF
        </Button>
      </div>

      <div className="print-region space-y-4 text-sm text-slate-900 dark:text-slate-100">
        <header className="border-b border-slate-300 pb-3 dark:border-slate-700">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Refrigerant Handling — Risk Management Plan
          </div>
          <div className="mt-1 text-lg font-semibold">
            {state.businessName || 'Business name not set in Settings'}
          </div>
          <div className="text-xs text-slate-500">
            {[
              state.businessAbn ? `ABN ${state.businessAbn}` : 'ABN not set',
              state.arcAuthorisationNumber
                ? `ARC RTA ${state.arcAuthorisationNumber}`
                : 'ARC RTA not set',
            ].join(' · ')}
            {reviewed
              ? ` · Last reviewed ${formatDateTime(reviewed, state.location.timezone, state.clock)}${state.riskPlan?.reviewedBy ? ` by ${state.riskPlan.reviewedBy}` : ''}`
              : ''}
          </div>
        </header>

        <section className="space-y-3">
          {RISK_PLAN_ITEMS.map((d) => {
            const it = items[d.key] ?? { done: false }
            return (
              <div
                key={d.key}
                className="break-inside-avoid rounded-xl border border-slate-200 p-3 dark:border-slate-800"
              >
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-brand-600"
                    checked={it.done}
                    onChange={(e) => setItem(d.key, { done: e.target.checked })}
                  />
                  <span>
                    <span className="font-medium">{d.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {d.hint}
                    </span>
                  </span>
                </label>
                <div className="no-print mt-2">
                  <TextInput
                    value={it.note ?? ''}
                    onChange={(e) => setItem(d.key, { note: e.target.value })}
                    placeholder="How it's handled here (optional) — e.g. who, what equipment, where kept"
                  />
                </div>
                {it.note?.trim() ? (
                  <p className="print-only mt-1 text-xs text-slate-600">
                    {it.note}
                  </p>
                ) : null}
              </div>
            )
          })}
        </section>

        <footer className="border-t border-slate-300 pt-3 text-[11px] text-slate-500 dark:border-slate-700">
          Kept as part of the conditions of a Refrigerant Trading
          Authorisation. Review at least annually, and after any incident or
          change in how the business handles refrigerant.
        </footer>
      </div>

      <div className="no-print mt-4 flex flex-wrap gap-2">
        <Button onClick={() => save(true)}>Save &amp; mark reviewed</Button>
        <Button variant="secondary" onClick={() => save(false)}>
          Save draft
        </Button>
      </div>
    </Modal>
  )
}
