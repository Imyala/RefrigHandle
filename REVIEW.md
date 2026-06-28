# RefrigHandle — Full Product Review

*A complete walk-through of the app from the perspective of the two people who'll
actually use it: the **field technician** logging refrigerant on a rooftop with
gloves on, and the **supervisor / business owner** who has to hand defensible
records to an ARC auditor. Followed by a plan for what makes this a showstopper
on a conference stage.*

Reviewed: June 2026 · Codebase: React + TypeScript PWA, ~25k lines · Australia-only
(ARC RHL / RTA, AS 2030, AS/NZS 5149).

---

## 0. Status — what's been fixed since the review

The findings below have been **resolved on this branch** (each typechecked,
linted, with the full test suite passing and a clean production build):

- **C1** — Record-edit roles now enforced (apprentices can't delete/correct;
  Restore gated too).
- **C2** — Audit chain now detects tail-truncation via a per-device
  high-water mark (with tests); integrity card updated.
- **H1** — Backup import is now safe: validates shape, warns with record
  counts, auto-downloads a backup first, and verifies the imported chain.
- **H2** — Overfill / cross-refrigerant overrides are persisted on the row
  and shown to supervisors.
- **H3** — Bottle tare + refrigerant frozen onto rows, so quarterly
  "returned" survives a bottle deletion.
- **H4** — Printed logbook & site audit now honour the kg/lb setting
  (plus L3: accurate "AR4/AR5" GWP label).
- **M1–M6** — No-op/zero rows blocked; returned bottles excluded as a
  recovery source; plausibility guard extended to recoveries; manual
  weight edits now log an `adjust`; active-duplicate bottle numbers
  blocked; `__attachments` stripped defensively on import.
- **U2** — Quick-log shows which technician's licence it will stamp.
- **U4** — A site's equipment/bottles default open (one less tap to the
  common action).
- **U7** — Signature pad survives device rotation.
- **L1 / L7** — Real maskable PWA icon; clearer `RefrigHandle` short_name.

**New features built for the conference:**

- **Compliance health** — an at-a-glance traffic-light scorecard at the top
  of the home screen, rolling technician licences, the business RTA,
  cylinder testing (AS 2030) and backups into one green/amber/red view that
  deep-links to each fix. (Dashboard also de-cluttered: this is now the
  single compliance surface on home; the detailed alerts live on the Log
  page.)
- **Explore-with-sample-data onboarding** — a new user (or a stage demo) can
  open the app on seeded sample data and try logging immediately, behind a
  persistent "sample data" banner, *before* filling in business/licence
  details. "Set up my business" clears the sample data and starts real
  setup.
- **Auditor PDF + integrity stamp** — every printable record (quarterly,
  equipment logbook, site audit) now carries a self-attesting "Change log
  verified — no tampering detected, N entries sealed" badge, and a print bug
  that produced duplicated multi-page PDFs is fixed (now a clean single page).
- **Store-level test suite** — the trust-critical mutations in `store.tsx`
  (weight math, corrections, bottle-to-bottle, soft-delete/restore) are now
  covered by tests driving the real provider (145 tests passing).
- **First-run polish** — Bottles list auto-opens groups for a small
  inventory; the empty Log state has an actionable CTA; dark mode + empty
  states reviewed across the app.

**One finding was withdrawn on inspection (C3, bottle-to-bottle inventory):**
the source/destination asymmetry is *correct* — it captures hose/decant
loss, which legitimately reduces total inventory.

**Still open** (larger/architectural or product decisions): M7 (field-level
settings-sync merge), M8 (local reset wipes the on-device audit log), U1
(leak-test default — deliberately left as a per-job answer for compliance
integrity), U3 (unify the two log forms), and the §6 "make it amazing"
feature roadmap.

---

## 1. The verdict in one paragraph

This is a genuinely good app — not a prototype. The domain knowledge baked into it
is the real differentiator: refrigerant-aware safe-fill (water capacity × filling
ratio, not a flat 80% rule), AS 2030 hydrostatic-test tracking with due/overdue
alerts, a tamper-evident hash-chained change log, frozen-at-time-of-work licence
stamping, append-only corrections, IPCC GWP / CO₂-e figures, and ARC quarterly
reporting. Most competitors are spreadsheets or generic inventory apps; this one
speaks the regulation fluently. **The bones are excellent.** What's holding it
back from "amazing" is a handful of trust-critical bugs, friction in the everyday
logging path, and an onboarding wall that hides all of that polish behind a long
setup form. Fix the items in §3 and §6 and this is conference-stage ready.

---

## 2. What's genuinely excellent (lead with these on stage)

These are the things that will make an audience of fridgies and compliance people
lean forward:

- **Scale entry.** The tech reads the new gross weight straight off the scale and
  the app does the subtraction — killing the #1 source of arithmetic error in the
  field. It even validates direction (a charge must *decrease* the bottle, a
  recovery must *increase* it) and tracks hose/decant loss automatically.
- **Refrigerant-aware safe fill.** Overfill is checked against water-capacity ×
  the *specific refrigerant's* filling ratio, with a real overfill warning. This
  is domain-correct in a way generic apps simply aren't.
- **Tamper-evident change log.** Every edit is sealed into a per-device SHA-256
  hash chain you can re-verify from Settings. Append-only corrections mean a wrong
  entry is re-stated, never silently overwritten — both rows stay on the record.
- **Frozen history.** Technician name + RHL, business ABN + RTA, and site/unit
  names are stamped onto each transaction at the time of work. Change a tech's
  role or the company details later and history is *not* rewritten. This is
  exactly the model an auditor wants.
- **Physical-impossibility guards.** You can't draw a bottle below its tare,
  can't recover into a returned cylinder — and the Save button *relabels itself
  to say why* it's disabled. That's excellent mobile UX.
- **Compliance-aware home screen.** Licence/RTA expiry, overdue AS 2030 tests, and
  backup reminders — the three things that actually get a business in trouble —
  surface on the dashboard, sorted most-urgent-first, each deep-linking to the
  thing that needs action. Snoozable so they don't become wallpaper.
- **Offline-first PWA done properly.** Installs on iPhone, Android, and desktop
  from one codebase; the install flow handles the messy iOS "Add to Home Screen"
  path and confirms "running offline-ready." Works with no signal at all.
- **Honest, plain-English copy** throughout, with arctick.org links and a careful
  "this is a tool, not a compliance guarantee" stance. Trust-building.
- **Strong password layer** (PBKDF2, 210k iterations, per-set salt, timing-safe
  compare, breached-password screening via the HIBP k-anonymity API). Better than
  most production apps.

---

## 3. Bugs & faults — prioritized

Severity is about **trust and data**, because that's this app's whole promise.
Every item below was confirmed against the source.

### 🔴 Critical — fix before any public demo

**C1. The role permissions are a promise the app doesn't keep.**
The UI tells users an apprentice "cannot delete records" and that corrections/
deletions are supervisor-and-above. But the transaction screen never checks those
gates — `canDeleteRecords` / `canCorrectRecords` are not even imported into
`Transactions.tsx`. **Any active profile, including an apprentice, can delete and
correct refrigerant records.** For a compliance product this is the most important
finding: you're displaying a permission boundary you don't enforce. Either enforce
it or stop showing the blurbs until per-tech sign-in lands.
→ *src/pages/Transactions.tsx* (no permission import); roles defined in *src/lib/types.ts:657–665*.

**C2. The audit chain can't prove it's complete (tail-truncation is invisible).**
The hash chain catches an edit, a deletion in the *middle*, a reorder, or a
relabel. But if someone deletes the **most recent** N entries, the remaining rows
still form a perfect 1…k chain and verification returns *valid*. There's no stored
"expected chain length / head hash," so lopping the newest rows off the log is
undetectable. To an ARC auditor, the strongest defensible claim today is "no
*detected* tampering in the entries present" — not "this is the complete record."
This needs a head-anchor (length + hash) the editor can't rewrite, ideally
server-side.
→ *src/lib/auditChain.ts:147–187*.

**C3. Bottle-to-bottle recovery can silently change total inventory.**
On a bottle-to-bottle decant, the destination cylinder is incremented by
`bottleAmount ?? amount`, but the **source** is decremented by `amount`. The same
refrigerant leaving one cylinder and entering another must move by the *same*
quantity; if a loss is ever recorded, the two sides diverge and total tracked
refrigerant changes out of nowhere. The UI currently hides the loss field for this
case so it isn't reachable *today* — but the store has no guard, so any future
caller, import, or synced row with a `sourceBottleId` + `bottleAmount` corrupts the
books. This is a latent landmine under the inventory numbers.
→ *src/lib/store.tsx:808–819*.

### 🟠 High — fix before the conference

**H1. "Import" wipes the device with one tap, shallow validation, and no safety net.**
Restoring a JSON backup overwrites every bottle, site, unit and transaction after a
single confirm. The only validation is "does `bottles` look like an array." It does
*not* auto-export the current data first (the account-closure flow does), so a
supervisor restoring a teammate's file onto a phone with unsynced field work
destroys that work. Worse: import sets a data-reset watermark, so on a synced team
the *missing* records on other devices get treated as deliberately erased and won't
come back — propagating the loss. Add an automatic pre-import backup, a real
schema/version + record-count check, and an "this device has N records" warning.
→ *src/pages/Settings.tsx:290–324*, *src/lib/store.tsx:1682*.

**H2. Warn-only saves aren't recorded as warnings.**
Overfill and bottle-to-bottle refrigerant contamination show an on-screen amber/red
panel but are **not** persisted on the saved row. A supervisor reviewing the log
later can't tell a tech saved *through* an overfill or a cross-refrigerant
contamination warning. (Refrigerant *mismatch against equipment* is correctly
flagged — do the same for these.) Persist a boolean so the override is auditable.
→ *src/pages/Bottles.tsx:1397+*, *src/pages/Transactions.tsx:853*.

**H3. Quarterly "returned kg" silently drops to zero if the bottle is later deleted.**
The ARC quarterly "returned" figure is computed as `weightBefore − bottle.tareWeight`
using the *live* bottle record. Tare is not frozen onto the transaction (unlike
tech/site/unit names, which are). Delete the cylinder later and that return
contributes 0 kg to the quarter — understating what left the books, on the exact
number an auditor reads. Freeze `tareWeight` onto return/intake rows.
→ *src/components/QuarterlyReport.tsx:129–134*, *src/lib/types.ts:249–255*.

**H4. The printed compliance logbook ignores the unit setting.**
A business set to `lb` sees pounds everywhere on screen — except the printed
equipment logbook and audit tables, which hard-code kg with `.toFixed(3)`. The same
unit shows different numbers depending on where you look, on the *legal printout*.
(For an Australian kg shop this is invisible, but it's wrong for any lb user and
it's the document that matters.)
→ *src/pages/Sites.tsx:1616, 1635, 2022–2036*.

### 🟡 Medium — clean up soon

- **M1. No-op and zero-amount rows can enter the permanent log.** A "0.00 kg"
  charge or an adjust with no net change can be saved; combined with soft-delete
  (rows are never truly removed) junk accumulates in the audit export. Add a
  "must be > 0" / "must change something" guard. *(Transactions.tsx, Bottles.tsx)*
- **M2. Returned cylinders are still selectable as a recovery source** — you can
  move refrigerant out of a bottle you've sent back to the supplier. Filter by
  status in the picker. *(BottleSelect.tsx:35)*
- **M3. Plausibility ("sanity") check only guards charges, not recoveries** — yet
  recovery is the scale-driven, high-volume path where a 5.0→50 fat-finger is just
  as likely. Extend the guard. *(Bottles.tsx:1144, Transactions.tsx:790)*
- **M4. Manual weight edits bypass the ledger.** Editing a bottle's gross/tare
  changes its net with no `adjust` transaction explaining the change — a supervisor
  sees the number move with no audit row. *(Bottles.tsx — `updateBottle` path)*
- **M5. Duplicate bottle numbers warn but never block**, and a scan resolves to the
  *first* match — so two active cylinders sharing a number make every scan/search
  ambiguous. At least block duplicates of *active* bottles. *(Bottles.tsx:1770)*
- **M6. Import strips photo attachments in the UI handler, not in the import
  function itself** — any other caller would shove base64 image blobs into
  localStorage and blow the quota. Move the strip into `importState`. *(backup.ts /
  storage.ts)*
- **M7. Sync is last-write-wins on the settings block** — two devices editing
  different business-identity fields offline: the older-stamped one's edits vanish
  with no conflict surfaced. *(merge.ts:207–244)*
- **M8. `resetToFreshInstall` wipes the local audit log too**, including the record
  of the reset itself — even though the code elsewhere claims the audit log
  "survives a data reset" (true only for the *merge* path). *(store.tsx:1461–1466)*

### ⚪ Low / cosmetic

- **L1. The "maskable" PWA icon isn't maskable** — `icon-512.png` and
  `icon-512-maskable.png` are byte-identical (confirmed same MD5). A true maskable
  icon needs ~20% safe-zone padding; Android will crop the logo edges on install.
- **L2. Code comment contradicts the code:** the role `level` comment says
  "4 = owner … 1 = apprentice" but owner is `level: 5`. Harmless at runtime, but it
  will mislead whoever next touches permissions. *(types.ts:559–562)*
- **L3. GWP label reads "AR4" even for HFOs that use AR5 values** (R1234yf/ze).
  Numbers are defensible; the printed provenance label is inaccurate. *(Sites.tsx:1620)*
- **L4. "Email a copy" on the closed-account screen opens a blank-recipient draft**
  (`mailto:?subject=…`). *(AccountClosed.tsx:63)*
- **L5. Signature canvas sizes once on mount** — rotating the phone to sign in
  landscape offsets the strokes. *(Signatures.tsx:149–165)*
- **L6. Photos are stored uncompressed** — modern phone shots are 3–8 MB each and
  bloat both IndexedDB and the JSON backup fast. *(Photos.tsx)*
- **L7. `short_name` is "Refrigerant"** — vague on a home screen full of icons.

---

## 4. Ease of use — the field technician's day

The tech is the make-or-break user: if logging a charge takes too long with gloves
on, the records never get entered and the whole compliance story collapses.

**Friction points, roughly in order of how often they bite:**

1. **Leak-test Yes/No is mandatory on *every* charge and recovery**, with no
   default and no carry-over — even the "same as last job" prefill copies the
   reason but not the leak answer. For a string of top-ups that's a forced extra
   tap each time. *(Default to the last answer.)*
2. **The fast logging path (from the Bottles tab) has no technician picker** — so
   on a multi-tech crew the quickest way to log silently stamps the *wrong* tech's
   licence. The tech must detour to the Activity tab to switch. *(Surface who'll be
   stamped, or add a compact picker.)*
3. **Common things are buried behind collapsed sections.** On a site, both "Units
   installed" and "Bottles on site" start collapsed, and region groups start
   collapsed — so logging against a unit is three taps deep behind two independent
   toggles. Default the most-used section open.
4. **Tapping a unit opens the full *edit* form**, not a read view or the logbook —
   risking accidental edits to compliance data (refrigerant type, factory charge)
   just from looking. Primary tap should view; edit should be secondary.
5. **Two separate, subtly different log forms** (the quick one on Bottles vs. the
   full one on Transactions) means features and fixes drift apart — the quick one
   lacks the tech picker, photos, and correction mode. Unify them.
6. **A failed barcode scan just drops text into the search box with a transient
   toast** — easy to miss on a rooftop, and there's no "add a new bottle with this
   number" shortcut from a no-match.
7. **Silent zero-charge factory data:** entering factory charge as `0` saves the
   unit with *no* charge, which silently disables leak monitoring and shows a
   "Leak ?" pill with no explanation.

**What the tech will love:** scale entry, the self-explaining disabled Save button,
the barcode scanner, "same as last job," and that it all works with no signal.

---

## 5. Ease of use — the supervisor / owner

1. **Onboarding is an all-or-nothing wall.** Nothing in the app is reachable until
   business identity, ABN, RTA + expiry, the first technician (name, RHL, expiry,
   password ×2), location, a licence self-declaration, and agreement to 8 policies
   are all done — ~13 fields across 4 cards on one screen. A tradesperson can't
   "kick the tyres" first. *(The live "Still needed: …" checklist and
   always-enabled Finish button are excellent — but the wall itself is the single
   biggest adoption risk.)*
2. **The Change log (the audit trail) has no place in the navigation.** There are
   two "logs" — the *Refrigerant log* (the "Log" tab, which actually routes to
   transactions) and the *Change log* (the audit trail, reachable only via deep
   links/Settings). A supervisor wanting the tamper-evident record won't find it.
   The copy works hard to disambiguate them, which is a tell that the split
   confuses people.
3. **Four overlapping ways to remove a technician** — Deactivate, Suspend, "Delete
   now," "Delete permanently" — with overlapping labels. A non-technical owner will
   struggle to pick the right one. Group them: "Temporarily disable" vs "Remove
   permanently."
4. **Settings is a 1,700-line catch-all** holding tech management, company
   identity, every legal page, sync, backup, and account deletion. Deep-link
   scroll targets exist but some keys don't match the section IDs, so an alert can
   scroll to the wrong place.
5. **Backup nudges are per-device and suppressed when sync is on** — but sync is an
   unauthenticated whole-blob Supabase path whose tenant isolation depends entirely
   on server-side rules configured out-of-band. A device that loses its
   localStorage with sync off and a stale backup loses years of records. This is
   the biggest *architectural* compliance exposure, and it's honestly disclosed in
   the code — but a supervisor needs it spelled out louder.

**What the supervisor will love:** the dashboard's expiry/overdue alerts, the
frozen-identity audit model, soft-delete with restore and a dedicated "deleted
transactions" CSV section, the quarterly ARC report to PDF, and the verifiable
change log (once C2 is shored up).

---

## 6. What makes this *amazing* — the conference plan

You're walking on stage in front of thousands. The goal isn't to list features —
it's to make a room of fridgies and compliance managers think *"I need this on
Monday."* Here's how to get there.

### Step 1 — Close the trust gaps (non-negotiable before the talk)
A compliance app lives or dies on trust. Fix **C1** (enforce roles or drop the
claim), **C2** (anchor the chain so you can say "provably complete," not just "no
detected tampering"), **C3** and **H1–H3** (no silent inventory or quarterly-number
drift, no one-tap data loss). If a skeptic in the audience asks "what stops an
apprentice deleting a record?" or "can you prove nothing was removed?", you want a
clean answer. These are the questions a compliance audience *will* ask.

### Step 2 — Win the first 90 seconds (onboarding)
Right now the demo opens on a 13-field form. **Lead with value, not setup.** Let a
new user add a cylinder and log a charge in a sandbox/demo mode immediately, then
ask for compliance details only when they go to produce a real record. On stage,
open with someone scanning a bottle, reading a scale, and watching the app do the
math and flag an overfill — *that's* the wow. Setup is the anticlimax; defer it.

### Step 3 — Make the everyday path frictionless (the §4 list)
Default the leak-test answer, add the tech picker to the quick path, default the
common sections open, unify the two log forms. "Log a recovery in three taps with
gloves on" is a line that lands with this audience.

### Step 4 — The three features that would genuinely wow this room
- **One-tap ARC quarterly + per-cylinder logbook as a polished PDF, with the
  verifiable hash badge on it.** "Hand this to your auditor" is the killer demo.
  Make the export beautiful and put the chain-verification result *on the document*.
- **Real team sync with sign-in and enforced roles** (already on your roadmap).
  The moment you can say "the whole crew's bottles and jobs on every phone, and the
  apprentice genuinely *can't* delete a record," you've answered the trust question
  and the multi-device question in one stroke. This is the single biggest leap from
  "great solo tool" to "business platform."
- **Proactive compliance radar.** You already track licence/RTA expiry and AS 2030
  due dates. Surface it as a single "Compliance health" score/screen — green/amber/
  red across licences, cylinder tests, and backup status — that a supervisor can
  glance at across the whole fleet. On stage: "RefrigHandle told me three cylinders
  were due for hydro test and a tech's licence expires next month — before the
  auditor did."

### Step 5 — Polish the things people screenshot
Real maskable icon (**L1**), a proper `short_name`, compressed photos so backups
stay small, and a signature pad that survives rotation. Small, but they're what an
audience sees on the projector.

### The one-line pitch to build the talk around
> *"Refrigerant compliance that lives in your pocket — scan a bottle, read the
> scale, and walk away with audit-proof records the regulator will accept. Offline,
> on every phone, built for the Australian scheme."*

Nail Steps 1–3, demo Step 4, and this is not just conference-ready — it's the kind
of thing that gets a line of people at your booth afterward.

---

## 7. Engineering health (for completeness)

- **Test coverage is strong on pure logic** (hash chain, merge semantics, GWP,
  quarter bucketing, charge sanity, auth, datetime, CSV) but **`store.tsx` — the
  trust-critical mutation layer — has zero tests.** The bottle math, soft-delete/
  restore, corrections delta, and sealing effect are all unverified. That's the
  highest-value place to add tests, and it's where C3 hides.
- The quarterly aggregation (the number an auditor reads) is computed in the
  component with no test of its own.
- Code quality and inline documentation are genuinely above average — the comments
  explain *intent and limits*, which materially lowers audit and maintenance risk.

*Note: the test suite couldn't be executed in this review environment (the sandbox
is missing `node_modules`/`vite`); findings are from source inspection and targeted
verification of each top item against the code.*
