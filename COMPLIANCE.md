# Compliance dataset — review checklist

RefrigHandle bakes Australian regulatory facts into the build: the GWP
table and its IPCC AR4 basis, filling ratios, the AS 2030 10-year
cylinder-test default, licence durations, leak-watch thresholds, the
record-retention figure, and the standards editions cited on printouts.
Those facts change on the regulator's schedule, not ours — so they are
**versioned and stamped**, and this checklist is how the stamp stays
honest.

The stamp lives in `src/lib/compliance.ts` (`COMPLIANCE_DATASET`):
`version` + `verifiedAsOf` are shown in Settings (next to the app
version), printed on the ARC quarterly record and the audit pack, and
drive an in-app "ruleset may be stale" notice once `verifiedAsOf` is
more than ~two quarters old (`complianceDataStale`, pure client-side
date math — works offline).

## Cadence

Run this checklist **once a quarter** (aligning with the ARC quarterly
record cycle) and before every tagged release. **Always bump
`verifiedAsOf` when the checklist completes — even when nothing
changed** — and bump `version` (`YYYY.MM`) whenever any fact changes.

## The checklist

For each item: confirm the current state at the source, compare with the
value in code, and update code + tests if they diverge.

1. **Legislation name & status** — Ozone Protection and Synthetic
   Greenhouse Gas Management Act 1989 and Regulations (as amended).
   Check the series page for remakes/amendments:
   https://www.legislation.gov.au/Series/F1996B02085 and
   https://www.dcceew.gov.au/environment/protection/ozone/legislation
   *In code:* citation strings in `src/lib/compliance.ts`, the
   acknowledgement text in `src/pages/AccountDeletion.tsx`.
2. **GWP basis and values** — Australia currently uses IPCC AR4
   (100-year); DCCEEW has deliberately retained AR4 for HFC phase-down
   consistency. Confirm no move to AR5/AR6, and spot-check blend values:
   https://www.dcceew.gov.au/environment/protection/ozone/rac/global-warming-potential-values-hfc-refrigerants
   *In code:* `REFRIGERANT_GWP` in `src/lib/types.ts`.
3. **Code of Practice edition** — Australia and New Zealand Refrigerant
   Handling Code of Practice (2025 edition as of this writing):
   https://www.arctick.org/ (Codes of Practice).
   *In code:* `compliance.ts` citation, report footers.
4. **AS/NZS 5149 edition** — 2016 series (+A1/A2 2018) as of this
   writing. Check Standards Australia / Standards NZ for a new edition.
   *In code:* `compliance.ts` citation, logbook footer in
   `src/pages/Sites.tsx`.
5. **AS 2030 cylinder testing** — 10-year test-stamp cycle per ARC's
   cylinder fact sheet; the cylinder's stamp remains authoritative:
   https://www.arctick.org/media/1105/fact-sheet-2-gas-cylinders.pdf
   *In code:* the next-due auto-fill in `src/pages/Bottles.tsx`,
   `hydroStatusFor` in `src/lib/types.ts`.
6. **RTA record-keeping conditions** — quarterly quantities (bought,
   recovered, sold, otherwise disposed of), 14-day production on written
   request, permit-condition checks covering the last two quarters:
   https://www.arctick.org/refrigerant-trading-authorisation/conditions-of-authorisation/
   *In code:* `quarterlyTotals` in `src/lib/reports.ts`,
   `QuarterlyReport.tsx` copy, `recordRetentionYears` in
   `compliance.ts` (retention is a conservative 5-year figure — check
   whether ARC/DCCEEW have published a definitive period).
7. **Licence types & durations** — full RHLs run 2 years; trainee
   licences up to 1 year; restricted classes exist:
   https://www.arctick.org/refrigerant-handling-licence/licence-types/
   *In code:* licence copy in `src/lib/types.ts` / `Onboarding.tsx`.
8. **Equipment GWP limits & bans** — e.g. the 1 July 2024 / 1 July 2025
   GWP-750 limits on small air conditioners. Check DCCEEW news for new
   equipment or import rules that the equipment register should flag:
   https://www.dcceew.gov.au/environment/protection/ozone
9. **Leak-management guidance** — no fixed statutory leak-rate threshold
   in AU today; the app's 5%/10% figures are advisory (AIRAH DA19 / CoP
   2025 / AS/NZS 5149.2). Confirm that remains true.
   *In code:* leak-watch thresholds in `src/lib/types.ts`.
10. **Filling ratios** — cross-check against AS 2030.5 / supplier data;
    the cylinder's stamped ratio remains authoritative.
    *In code:* filling-ratio table in `src/lib/types.ts`.

## Staying informed between reviews

- Subscribe to ARC industry updates / media releases: https://www.arctick.org/
- Watch DCCEEW ozone & SGG announcements:
  https://www.dcceew.gov.au/environment/protection/ozone
- AIRAH news (HVAC&R News) reports scheme changes early:
  https://www.hvacrnews.com.au/
- Refrigerant Reclaim Australia and Refrigerants Australia both publish
  plain-English summaries of regulatory movement.

## When something changed

1. Update the fact where it lives (prefer `src/lib/compliance.ts`; the
   longer-term direction is to migrate remaining scattered facts —
   GWP/filling-ratio tables, thresholds — into one dataset module).
2. Update or add a test asserting the new value.
3. Bump `COMPLIANCE_DATASET.version` and `verifiedAsOf`.
4. Note the change in the release notes — businesses need to know their
   printed reports' basis moved.
5. Ship a release; the PWA's service worker delivers it on next launch.
