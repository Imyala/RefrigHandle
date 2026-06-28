// Read-only detail body for a single refrigerant-log transaction.
//
// Extracted from the Refrigerant log row so the SAME rich detail can be
// shown wherever a transaction needs to be described in full — the
// activity log, and the Change log's "Removed transaction" entries,
// where an owner reviewing a deletion needs to see exactly what was
// removed (bottle, amount, site/unit, who logged it…) before deciding to
// restore it. Keeping one renderer means the two views can never drift.
//
// This renders only the descriptive body (the left column of a row);
// the surrounding Card and any action buttons stay with the caller.

import { useStore } from '../lib/store'
import { Pill } from './ui'
import {
  type Transaction,
  type TransactionKind,
  REASON_LABELS,
  isRestatement,
  movementSummary,
  transactionLabel,
  transactionLoss,
} from '../lib/types'
import { formatWeight, kgToDisplay } from '../lib/units'
import { formatStampedTime } from '../lib/datetime'
import { profileFor } from '../lib/compliance'

// Pill colour per transaction kind — mirrors the tone vocabulary the ui
// Pill component supports.
const kindTone: Record<
  TransactionKind,
  'green' | 'amber' | 'blue' | 'slate' | 'red'
> = {
  charge: 'amber',
  recover: 'green',
  transfer: 'blue',
  return: 'slate',
  adjust: 'red',
  intake: 'green',
}

export function TransactionDetails({
  t,
  corrects,
  supersededBy,
}: {
  t: Transaction
  // Correction linkage. Callers that already compute these (the activity
  // log builds a map once for the whole page) pass them in; callers that
  // render a single row can leave them out and let the component resolve
  // them from the store.
  corrects?: Transaction
  supersededBy?: Transaction
}) {
  const { state } = useStore()
  const { bottles, sites, unit, transactions } = state
  const licShort = profileFor(state.jurisdiction).techLicenceShort

  const bottle = bottles.find((b) => b.id === t.bottleId)
  const sourceBottle = t.sourceBottleId
    ? bottles.find((b) => b.id === t.sourceBottleId)
    : null
  const site = sites.find((j) => j.id === t.siteId)
  const txUnit = state.units.find((u) => u.id === t.unitId)
  const move = movementSummary(
    t,
    transactions,
    (id) => sites.find((j) => j.id === id)?.name,
  )

  // Resolve correction linkage if the caller didn't supply it.
  const correctsEntry =
    corrects ??
    (t.correctsId ? transactions.find((x) => x.id === t.correctsId) : undefined)
  const supersededByEntry =
    supersededBy ??
    transactions.find((x) => x.correctsId === t.id && !x.deletedAt)

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={kindTone[t.kind]}>{transactionLabel(t.kind)}</Pill>
        {t.amount > 0 && (
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatWeight(t.amount, unit)}
          </span>
        )}
        <span className="text-sm text-slate-500">
          {bottle?.refrigerantType ?? '?'}
        </span>
        {correctsEntry && <Pill tone="blue">Correction</Pill>}
        {supersededByEntry && <Pill tone="amber">Corrected</Pill>}
      </div>
      {correctsEntry && (
        <div className="mt-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
          {isRestatement(t) ? 'Re-states' : 'Corrects'} a{' '}
          {transactionLabel(correctsEntry.kind).toLowerCase()} of{' '}
          {formatWeight(correctsEntry.amount, unit)} from{' '}
          {formatStampedTime(
            correctsEntry.date,
            correctsEntry.tz,
            state.location.timezone,
            state.clock,
          )}
          {t.correctionReason && <> — “{t.correctionReason}”</>}
          {isRestatement(t) && (
            <> · Equipment records and totals count this entry.</>
          )}
        </div>
      )}
      {supersededByEntry && (
        <div className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
          Superseded by a correction logged{' '}
          {formatStampedTime(
            supersededByEntry.loggedAt ?? supersededByEntry.date,
            supersededByEntry.tz,
            state.location.timezone,
            state.clock,
          )}
          {supersededByEntry.correctionReason && (
            <> — “{supersededByEntry.correctionReason}”</>
          )}
          {isRestatement(supersededByEntry) && (
            <> · Excluded from totals in favour of the correction.</>
          )}
        </div>
      )}
      <div className="mt-1 text-sm text-slate-700 dark:text-slate-300">
        {bottle?.bottleNumber ?? '(deleted)'}
        {sourceBottle && ` ← ${sourceBottle.bottleNumber}`}
        {/* Fall back to the name frozen on the row when the
            site record was deleted. */}
        {!move && (site?.name ?? t.siteName)
          ? ` · ${site?.name ?? t.siteName}`
          : ''}
      </div>
      {move && (
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
          <span className="text-xs uppercase tracking-wider text-slate-400">
            From
          </span>
          <span className="font-medium">{move.from}</span>
          <span aria-hidden className="text-slate-400">
            →
          </span>
          <span className="text-xs uppercase tracking-wider text-slate-400">
            to
          </span>
          <span className="font-medium">{move.to}</span>
        </div>
      )}
      {(txUnit || t.unitName || t.equipment || t.reason) && (
        <div className="text-xs text-slate-500">
          {txUnit?.name ?? t.unitName ?? t.equipment}
          {(txUnit || t.unitName || t.equipment) && t.reason && ' · '}
          {t.reason && REASON_LABELS[t.reason]}
        </div>
      )}
      {t.kind === 'return' && (t.returnDestination || t.docketNumber) && (
        <div className="text-xs text-slate-500">
          {t.returnDestination && `Returned to: ${t.returnDestination}`}
          {t.returnDestination && t.docketNumber && ' · '}
          {t.docketNumber && `Docket ${t.docketNumber}`}
        </div>
      )}
      {t.kind === 'intake' && (t.supplier || t.invoiceNumber) && (
        <div className="text-xs text-slate-500">
          {t.supplier && `Supplier: ${t.supplier}`}
          {t.supplier && t.invoiceNumber && ' · '}
          {t.invoiceNumber && `Invoice ${t.invoiceNumber}`}
        </div>
      )}
      {t.leakTestPerformed !== undefined && (
        <div className="text-xs text-slate-500">
          Leak test: {t.leakTestPerformed ? 'Yes' : 'No'}
        </div>
      )}
      <div className="text-xs text-slate-500">
        {formatStampedTime(t.date, t.tz, state.location.timezone, state.clock)}
        {t.amount > 0 && (
          <>
            {' · '}gross {kgToDisplay(t.weightBefore, unit).toFixed(2)} to{' '}
            {formatWeight(t.weightAfter, unit)}
          </>
        )}
      </div>
      {(t.technician ||
        t.technicianLicence ||
        t.businessName ||
        t.businessAbn ||
        t.arcAuthorisationNumber) && (
        <div className="mt-1 text-xs text-slate-500">
          {[
            t.technician &&
              `${t.technician}${t.technicianLicence ? ` · ${licShort} ${t.technicianLicence}` : ''}`,
            !t.technician &&
              t.technicianLicence &&
              `${licShort} ${t.technicianLicence}`,
            t.businessName &&
              `${t.businessName}${t.arcAuthorisationNumber ? ` · ${profileFor(state.jurisdiction).businessAuthShort || 'Auth'} ${t.arcAuthorisationNumber}` : ''}`,
            !t.businessName &&
              t.arcAuthorisationNumber &&
              `${profileFor(state.jurisdiction).businessAuthShort || 'Auth'} ${t.arcAuthorisationNumber}`,
            t.businessAbn &&
              `${profileFor(state.jurisdiction).businessNumberShort} ${t.businessAbn}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
      {transactionLoss(t) > 0 && (
        <div className="text-xs font-medium text-amber-600 dark:text-amber-400">
          Loss: {formatWeight(transactionLoss(t), unit)}
        </div>
      )}
      {t.refrigerantMismatch && (
        <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
          ⚠ Refrigerant mismatch acknowledged — bottle{' '}
          <strong>{t.refrigerantMismatch.bottleType}</strong> into unit set up
          for <strong>{t.refrigerantMismatch.unitType}</strong>
        </div>
      )}
      {t.refrigerantContamination && (
        <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
          ⚠ Cross-refrigerant decant acknowledged — source{' '}
          <strong>{t.refrigerantContamination.sourceType}</strong> into{' '}
          <strong>{t.refrigerantContamination.destType}</strong> bottle
        </div>
      )}
      {t.savedOverSafeFill && (
        <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-100">
          ⚠ Saved over safe fill — the bottle's net was left above its
          safe-fill limit
        </div>
      )}
      {t.notes && (
        <div className="mt-1 text-xs italic text-slate-500">“{t.notes}”</div>
      )}
    </div>
  )
}
