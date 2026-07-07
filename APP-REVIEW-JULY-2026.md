# RefrigHandle — Full App Review (July 2026)

*Complete review across four axes: ease of use / speed of entry, Australian
compliance currency (and staying current), export & sharing (auditing, Xero,
email, other apps), and layout / every-page-works. Ends with the ranked
fix list and the release & presentation plan for AIRAH / ARC audiences.
Verified this session: lint clean, 220 tests passing, production build
succeeds, and a hands-on Playwright walk of every route on phone (390×844)
and desktop (1280×800) viewports.*

---

## 0. Verdict

**The app works — all of it.** Every route rendered on both viewports with
**zero console errors, no broken pages, no dead buttons, no horizontal
scroll**. The repeat-charge flow is a genuine standout: **4 taps, zero
typing** (dashboard → + Log refrigerant → "Same as last job" one-tap
prefill → amount chip → Save). The compliance data is **current for
mid-2026 Australian requirements** on every fact checked against DCCEEW and
ARC sources. The visual design is consistent, professional and demo-ready,
including dark mode.

The material gaps this review found — a dangerous R12 form default, weak
audit evidence on location-less charges, file exports that couldn't reach
other apps on a phone, and no mechanism to keep the ruleset visibly
current — **were all fixed on this branch this session** (§5). What
remains is the ranked roadmap in §6 and the launch plan in §7.

---

## 1. Ease of use, speed of entry (hands-on, phone-first)

**Measured, not guessed** — driven with a real browser at phone size.

What's excellent:
- **Repeat charge: 4 taps, no typing.** First visit to a new site: ~8 taps.
  The disabled Save button always names its blocker ("Pick a reason",
  "Answer leak test") — no dead-end forms.
- The log form opens **pre-filled from the chosen cylinder** (its current
  site and unit), with a one-tap "Same as last job" that also carries
  reason and leak-test answer. Scale entry ("read the scale, we do the
  math") removes the arithmetic a gloved tech won't do.
- Barcode scan finds a cylinder in one action; quick-add creates a missing
  bottle without leaving the log form.

Fixed this session:
- **New-bottle forms defaulted the refrigerant to R12** — a phased-out CFC
  (first alphabetically). A rushed tap-through would have minted R12
  cylinders and stamped R12 onto every charge from them. Now defaults to
  the user's first favourite, else R410A (`defaultRefrigerantType`,
  applied to quick-add and the full form; regression-tested).
- **A charge/recovery could be saved naming no site, no unit and no
  equipment** — weak evidence at an ARC records check. Saving one now gets
  a confirm nudge ("Save anyway / Go back") — a nudge, not a block, since
  workshop bench work is legitimate.
- **Modals now close on Escape** (with correct top-layer-only peeling for
  stacked modals) — a desktop and accessibility expectation.

Still open (ranked, from the hands-on run):
1. **Sub-44px tap targets on frequent secondary controls** — filter chips
   (32px), row action rails Share/+Photos/Correct/Remove (~20px), "Filter
   by date range" (20px), inline links (14px). The primary buttons were
   fixed in a prior round; these are the between-jobs controls.
2. **Moves page buries the list under alerts** (~45% of first viewport);
   collapse the alert block after first sight.
3. **Jobs is hard to find** — no tab entry; only the Home card grid and the
   log form's job picker.
4. Settings remains a ~2,000-line single page; split it when convenient.

## 2. Australian compliance — current, and now visibly dated

Everything below was checked against primary sources (DCCEEW, ARC,
legislation.gov.au, Standards Australia) as of July 2026.

**Verified current:**
- **GWP basis = IPCC AR4 (100-year)** — correct; DCCEEW deliberately
  retains AR4 for HFC phase-down consistency. Spot-checked blend values
  (R32 675, R404A 3922, R454B 466 …) all consistent.
- **ANZ Refrigerant Handling Code of Practice 2025** — the app cites the
  current (4th, 2025) edition, not the old 2007 one.
- **AS/NZS 5149:2016 (+A1/A2 2018)** — still the current edition.
- **AS 2030 10-year cylinder test-stamp cycle** — matches ARC's fact
  sheet; the app's stamp-is-authoritative stance is right.
- **Quarterly RTA record** (bought / recovered / returned per refrigerant,
  producible on request; checks ask for the last two quarters) — matches
  Regulation 141 as summarised by ARC.
- **RHL 2-year duration**, 60-day expiry warning; no fixed statutory
  leak-rate threshold in AU (the app's 5%/10% leak-watch figures are
  correctly framed as advisory per AIRAH DA19 / CoP 2025).

**Gaps found (still open, ranked):**
1. **No "Sold" transaction kind.** Reg 141's enumerated quantities are
   bought, recovered, **sold**, otherwise disposed of. Service contractors
   are covered today ("return" ≈ back to supplier), but an RTA holder who
   sells refrigerant can't produce that quarterly figure. Add a `sell`
   kind that flows into the quarterly report.
2. **No risk-management-plan artefact** — an ARC RTA condition. Even a
   simple guided checklist stored per business (and printable into the
   audit pack) would close it.
3. **Licence classes not modelled** — ARC issues restricted classes and
   1-year trainee licences; the app stores number + expiry only and its
   copy says "RHLs run for two years". Low severity (expiry is
   user-entered); a class picker would make the audit pack show scope.
4. Terminology nit: "hydrostatic test" → safer as "periodic test
   (AS 2030)" since non-hydro methods qualify.

**Fixed this session — the "keep it updated" mechanism:**
- **Versioned compliance dataset stamp** (`COMPLIANCE_DATASET` in
  `src/lib/compliance.ts`): version + verified-as-of date + sources.
  Shown in **Settings** (next to the app version) and printed on the
  **ARC quarterly record** and the **audit pack** footers — an auditor
  and the owner can now see exactly how current the built-in ruleset is.
- **Offline staleness nudge**: once the stamp is >~2 quarters old, Settings
  shows a "ruleset may be stale — check for an app update" notice (pure
  client-side date math; works offline).
- **`COMPLIANCE.md`** — a quarterly review checklist mapping every
  regulated fact in code to its primary source (DCCEEW / ARC /
  legislation.gov.au URLs), plus the subscription list (ARC updates,
  DCCEEW announcements, HVAC&R News) and the rule: *bump the stamp every
  review, even when nothing changed*.
- Citation hygiene: "Regulations 1995" → "Regulations, as amended" (the
  regs have been amended through 2024–25 tranches; hardcoded years rot),
  and the stale EU F-Gas 517/2014 comparison in code comments updated to
  Regulation (EU) 2024/573.

This is the right mechanism for an offline-first PWA: the dataset ships
with the build (auditable, tamper-proof), staleness is *visible* instead
of silent, and the PWA's continuous deploys deliver updates. A remote
signed-JSON rules feed is possible later but unnecessary complexity now.

## 3. Export for auditing & sharing to other apps

**What already existed (and is good):** a one-document **audit pack**
(business identity + RTA, integrity/hash-chain stamp, compliance
scorecard, quarterly totals, full movement log, cylinder / equipment /
technician registers, signature block) with quarter/year/custom periods;
the ARC quarterly record; per-unit equipment logbooks; CSV ledger export
with a deleted-rows audit section and formula-injection guard; full JSON
backup including photos and signatures.

**Fixed this session:**
- **Share as a file to any app.** New `shareOrDownload` helper uses the
  device share sheet (`navigator.share` with files) — the only reliable
  way out of an installed PWA on iOS — with a download fallback and an
  honest toast on desktop. New **"Share JSON…" / "Share CSV…"** buttons in
  Settings → Backup & export: email straight to the auditor or
  bookkeeper, drop into Drive, WhatsApp, or a **Xero file inbox** — "many
  other apps" is exactly what the share sheet provides.
- **CSV opens cleanly in Excel**: UTF-8 BOM added (no more mojibake on
  non-ASCII site names/notes) and a **`local_date` column in dd/mm/yyyy**
  (AU convention) in the record's own timezone — the column a bookkeeper
  sorts on. Covered by tests.

**Still open (ranked):**
1. **One-tap "Audit pack ZIP" for a period** — bundle the CSV + JSON +
   photos/signatures as real image files + a verification statement, and
   share it via the new share helper. Everything needed (`createZip`,
   `buildLogCsv`, attachments store, integrity verifier) already exists;
   this is assembly, ~2–3 days. This is the auditor-handoff hero feature.
2. **Xero, pragmatic path**: add an optional **cost (AUD ex-GST) field on
   intake/return**, then a separate flat **"Purchases CSV (Xero bills
   format)"** export (`*ContactName, *InvoiceNumber, *InvoiceDate
   dd/mm/yyyy, Description, *Quantity, *UnitAmount, *AccountCode,
   TaxType`). With the new Share button, "share it to your Xero files
   email" works with zero API integration (~1–2 days). Full Xero
   OAuth/API is a v1.x decision, not a launch blocker — today no monetary
   data exists in the app at all, so nothing is postable yet.
3. **Change-log CSV export** on the Change log page — the hash-chained log
   the integrity stamp attests to should itself be producible on request.
4. The audit pack is print-to-PDF only; after (1), consider a real PDF
   generator only if pilots report trouble with the print flow — the
   print stylesheet is well-engineered.

## 4. Layout, look, and pages-all-work

- **16/16 routes PASS** on both viewports, zero console errors, all
  interactive flows (log, quick-add, jobs, quarterly, audit pack, dark
  mode, row actions) clean. Legal pages all render with working
  back-links.
- Design is consistent (one card language, one brand blue, coherent
  status pills), dashboard hierarchy is strong, dark mode is complete.
  It will not embarrass anyone on a projector in front of AIRAH or ARC.
- Nits worth a pass: desktop is a stretched phone layout (a `lg:` left
  nav rail would read more "enterprise" on a projector); the audit-pack
  period select truncates at phone width; "NOT ON SITE" group header
  reads as shouting; mixed-timezone timestamp presentation in one list is
  correct but jarring.

## 5. Changed on this branch (this session)

| Change | Files |
|---|---|
| New-bottle refrigerant default: favourites-first, else R410A — never R12 | `types.ts` (`defaultRefrigerantType`), `QuickAdd.tsx`, `Bottles.tsx` |
| Confirm nudge saving a charge/recovery with no site, unit or equipment | `LogForm.tsx` |
| Escape closes modals (stacked modals peel top-first) | `ui.tsx` |
| Share exports as files to any app (share sheet + download fallback) | `backup.ts` (`shareOrDownload`, `shareBackup`, `shareLogCsv`), `Settings.tsx` |
| CSV: UTF-8 BOM + dd/mm/yyyy `local_date` column | `backup.ts` |
| Compliance dataset stamp (version + verified date) in Settings and on printed quarterly record & audit pack; offline staleness nudge | `compliance.ts`, `Settings.tsx`, `QuarterlyReport.tsx`, `AuditReport.tsx` |
| Quarterly compliance review checklist with sources | `COMPLIANCE.md` |
| Citation hygiene (regs "as amended"; EU reference updated) | `AccountDeletion.tsx`, `types.ts`, `compliance.ts` |
| Tests for all of the above (214 → 220) | `types.test.ts`, `compliance.test.ts`, `backup.csv.test.ts` |

All verified end-to-end in the running app (Playwright): the nudge fires
on a location-less charge and stays quiet when a site is set; quick-add
opens on R410A; Escape closes; Share CSV falls back to a BOM'd,
`local_date`-bearing download with the fallback toast; the stamp appears
in Settings, the quarterly footer and the audit pack footer.

## 6. Recommended next corrections (ranked)

**Items 1–5 below were implemented on this branch in the follow-up
round (July 2026)** — all verified end-to-end in the running app:

1. ~~Audit pack ZIP + share~~ — **done**: the audit pack modal's
   "Share ZIP…" bundles the period CSV, the full JSON backup, every
   photo/signature as real image files (named by record id, cross-
   referenceable to the CSV), and a `VERIFICATION.txt` carrying the
   hash-chain result and the compliance-ruleset stamp.
2. ~~Tap-target pass~~ — **done**: filter chips, date-range toggles,
   alert snooze/hide links, guest-banner buttons, and the small
   link-buttons (Clear filter, Print labels, More details, View all,
   Show/Hide) all now render at the 44 px minimum.
3. ~~Cost field + Xero purchases CSV~~ — **done**: optional purchase
   cost (AUD ex-GST) on the cylinder form, frozen onto the intake row,
   and a "Purchases CSV (Xero)…" share in Settings emitting Xero's
   bills-import columns (dd/mm/yyyy, GST on Expenses) for costed intakes.
4. ~~"Sold" transaction kind~~ — **done**: Sell to another business, with
   buyer + invoice fields; the net contents feed a new **Sold kg** column
   on the quarterly record and audit pack (Regulation 141's "sold").
5. ~~Risk-management-plan checklist~~ — **done**: a guided 7-item plan
   (Settings → Audit & records), printable, merge-safe across devices,
   with the review stamp shown on the audit pack's compliance summary.

Still open, in order:

6. Moves-page alert collapse; Jobs discoverability; licence-class picker;
   change-log CSV export; "periodic test" wording.

## 7. Getting ready for release and the AIRAH / ARC stage

The engineering release plan in RELEASE-GO-LIVE.md stands (custom domain
→ prune internal docs → legal review → pilot). For presenting to
thousands of businesses and to AIRAH / ARC specifically:

1. **Do the pilot before the stage.** 3–5 real businesses for a full
   quarter cycle. Walking on stage with "already tracking N cylinders
   across M sites" beats any feature list.
2. **The demo script is the audit handoff.** Scan a bottle → log a charge
   with the 4-tap flow → open the audit pack → point at the integrity
   stamp and the *compliance ruleset verified date* → Share it to email,
   live. That last step is new this session and is the moment the room
   leans in. Build the audit-pack ZIP (§6.1) first so the shared file
   contains photos and signatures too.
3. **Get the claims lawyer-checked and scheme-checked.** Before an ARC
   audience: never say "ARC-approved" (no such endorsement exists —
   position as "built around the ARC scheme's record-keeping
   conditions"). Have the CoP-2025 and Reg-141 references in the app
   reviewed by someone who audits RTAs for a living; ARC publishes its
   reporting templates — bring a side-by-side showing the quarterly
   record maps 1:1.
4. **AIRAH angle**: the leak-watch feature already cites AIRAH DA19 —
   consider an AIRAH Streamline/DA19 alignment note, and pitch a piece to
   HVAC&R News (they cover compliance tooling). Exhibiting at AIRAH's
   events (ARBS is the big floor) is the natural venue; a pilot
   customer's testimonial matters more than a booth.
5. **Housekeeping before public eyes**: move the internal review docs
   (including this one) out of the public repo; tag 1.0.0; custom domain
   **before** the pilot (installed PWAs pin to their origin forever);
   uptime monitoring; keep the deploy gate.
6. **Have the answer ready for the one hard question a room of 1,000
   will ask**: "what happens when my phone dies?" Today's honest answer —
   offline-first with backup nudges, share-to-Drive backups (new this
   session), and the sync beta — is fine for a pilot; the managed cloud
   backend (RELEASE-GO-LIVE §2.1) is the answer that closes enterprise
   deals. Don't launch the stage tour before at least the transactional
   email + expiry reminders exist; they're the cheapest "it's a service,
   not an app" signal.
