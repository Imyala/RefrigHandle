# RefrigHandle — Final Pre-Release Review (July 2026)

*Total review before public release to thousands of businesses. Four parallel
deep passes over the current code on `claude/app-review-release-5azd38`:
core data layer, field UX, security & release engineering, and verification
of the prior review's blocker list. Verified this session: **197 tests pass,
lint clean, production build succeeds, bundle properly code-split**
(357 kB entry vs the old 759 kB monolith; zxing/Supabase/qrcode lazy).*

---

## 0. Verdict

**The prior blocker list is genuinely closed** — the unified LogForm, logged
attachment deletion, code-splitting, meta tags, diagnostics log, Audit Pack,
focus rings, busy states and verb cleanup are all real in the code, and the
everyday glove path is now a legitimate **6–8 taps, zero typing** charge log.
The offline, single-device core is release-quality and better engineered than
most shipped PWAs.

**But the app is not launchable to thousands of businesses as configured.**
The new risks cluster in four places, none of which were in scope of the
earlier reviews:

1. **The documented cloud-sync setup is world-readable and world-writable** —
   anyone who views source on the public site can read or destroy every
   syncing team's compliance records, customer PII and password hashes.
2. **One real compliance-math defect** — deleting a cylinder silently rewrites
   already-reported ARC quarterly figures, and restore doesn't heal it.
3. **The two newest features (Jobs, unified LogForm) carry fresh defects** —
   the customer-facing service report double-counts corrections.
4. **The privacy/deletion story is dishonest in both directions** — the policy
   describes data flows that don't exist and omits the ones that do; the
   account-deletion flow collects contact details it never uses and deletes
   nothing.

Fix the blocker tier below (~1–2 weeks of focused work), run a small pilot,
and this ships with confidence.

### Scorecard

| Area | State |
|---|---|
| Compliance/domain correctness | Excellent, one quarterly-figures defect (B2) |
| Everyday logging UX | Excellent — 6–8 taps, zero typing, unified form |
| Onboarding | Demo-first shipped; one validation trap (S6) |
| Data integrity (single device) | Excellent; attachment hard-delete is the one hole |
| Multi-device sync | **Not release-grade** — security + data-loss modes |
| Role permissions | Advisory only — sign-out escape, ungated self-promotion |
| Privacy/legal surface | **Blocker** — policy and deletion flow don't match reality |
| Release engineering | Good build/split; CI runs no tests; SW update trap |
| Tests | 197 green; sync/restore edge cases untested |

---

## 1. Release blockers — do not launch without these

### B1. Cloud sync is open to the world *(SYNC.md:38–57, src/lib/sync.ts:46–57)*
The documented RLS policies grant `select/insert/update … using (true)` to
`anon`, and the anon key ships in the public JS bundle. Anyone can read
**every team's entire dataset** — customer names/sites, technician names and
RHL numbers, ABNs, and technician `passwordHash` values (the PBKDF2 hashes
live inside the synced `AppState`, types.ts:887) — and can overwrite any
team's row, propagating destruction to all their devices via merge. Team IDs
are free-text; two businesses picking "acme" silently merge records with no
attack at all. This is an APP 11 failure the moment sync is configured.

**Decision required:** ship v1 with sync **disabled or explicitly
beta-gated** ("self-hosted, small teams, at your own risk" with a locked-down
SQL template), or hold launch until a real authenticated backend exists.
Recommendation: ship local-only + backup now; sync stays a labelled beta.

### B2. Deleting a bottle rewrites past ARC quarterly figures *(store.tsx:704–717, 1390–1394)*
`deleteBottle` soft-deletes every one of the bottle's transactions;
quarterly/leak math excludes soft-deleted rows; restoring the bottle
re-inserts only the bottle. A Q1 report re-printed for an auditor after a Q2
cylinder cleanup under-reports charged kg — records that must be reproducible
for five years. Fix: stop cascading soft-delete to transactions (they're
already frozen-stamped and site-agnostic), or restore them with the bottle
and exclude only from *live* views, not historical reports.

### B3. Jobs service report double-counts corrections *(Jobs.tsx:109–123, 383–396)*
`jobTransactions` filters only `deletedAt` and never excludes superseded
originals (`supersededIds`, types.ts:1577 — used correctly everywhere else).
Correct a 5 kg charge to 3 kg and the customer-facing report says 8 kg,
listing both rows unmarked — wrong exactly when the record is scrutinized.
Also: editing a job's site never refreshes the frozen `siteName`/`clientName`
snapshot (store.tsx:1064–1083), so the printed report shows the old site.
Both are small, localized fixes.

### B4. Privacy policy and deletion flow don't match the product
- `Privacy.tsx` claims collection of email, billing, IP, analytics, cookies —
  none exist — while omitting what *does* happen: the HIBP k-anonymity call,
  and optional sync uploading all business data. An APP 1.3 policy must
  describe actual practices. Rewrite to reality; get it legally reviewed.
- `AccountDeletion.tsx:93–95, 194` collects email/phone "to confirm the
  closure" — nothing is ever sent or received (there is no backend), and if
  sync is on, those contact details are pushed to the world-readable table.
  Nothing server-side is ever deleted. Make the flow honest: local erase +
  records download, no contact collection, accurate copy.

### B5. The corruption-recovery path points at a screen that doesn't exist *(store.tsx:273)*
The recovery toast says "see Settings → Storage health" — no such section
exists; `listCorruptedBackups`/`readCorruptedBackup` (storage.ts:382–434)
have zero callers. Build the small Storage-health card (list preserved blob,
download, restore, storage estimate) or correct the toast. Related:
storage.ts:325–332 — on the corruption+quota path the preserved blob can be
overwritten by the immediate `EMPTY_STATE` save.

### B6. Scale-mode sign/staleness bug in the unified LogForm *(LogForm.tsx:815–824)*
The derived amount is only recomputed inside the scale field's onChange.
Enter a reading as *charge* (+5 kg derived), switch kind to *adjust*: the
form saves **+5** when the scale said −5. Switching the destination bottle
similarly keeps the old bottle's delta. Re-derive or clear the amount when
kind/bottle changes in scale mode.

---

## 2. Serious — fix before launch or in the first patch

1. **Backdrop tap silently discards a half-filled log form** (ui.tsx:246–259;
   no dirty-state confirm in LogForm). The worst failure for the glove
   persona. Add a "Discard entry?" confirm when dirty.
2. **Onboarding timezone trap** — the Picker offers "— follow this device —"
   but validation requires a non-empty timezone (LocationFields.tsx:90,
   Onboarding.tsx:192). Prefill from `deviceTimeZone()` and accept the option.
3. **Sub-glove tap targets on the highest-frequency controls** — amount chips
   ~26 px tall (LogForm.tsx:869), Correct/Delete/Attach row actions,
   "Same as last job" as a bare text link. Bump to ≥44 px.
4. **Sign-out raises privileges** — `ensureRole` returns true with no active
   profile and `setActiveTechnicianId(undefined)` is ungated
   (store.tsx:525–527, 1736–1759); an apprentice signs out and can delete
   anything, unattributed. Also `updateTechnician` has no role gate — any
   caller can self-promote to owner (store.tsx:1524–1581). Gate both.
5. **Attachment deletion is the one true hard-delete** — no recycle bin, no
   role gate (attachments.ts:118–123). Signatures are customer-facing legal
   evidence; at minimum gate deletion to supervisor+.
6. **Sync push failures are silently swallowed and recorded as pushed**
   (sync.ts:46–57, store.tsx:578–583) — a business can believe it's
   replicated for months. Surface errors, feed the diagnostics log.
   (Plus, if sync stays: stale-device whole-blob upsert destroys the server
   superset with no pull-before-push; restore-on-a-synced-team deletes
   everything the team logged after the backup, bypassing the recycle bin
   (merge.ts:47–97); the reset watermark compares the *work date* not
   `loggedAt`, killing backdated catch-up entries (merge.ts:145,161);
   concurrent bottle use leaves merged gross weight contradicting the ledger;
   unsealed audit entries double-seal into divergent chains and raise false
   tamper alarms (auditChain.ts:162–166, merge.ts:176–188). These are the
   reasons sync ships beta or not at all.)
7. **CI deploys with no test gate** (.github/workflows/deploy.yml) — 197
   tests never run before shipping to production. Add test+lint to the
   workflow; drop `--legacy-peer-deps` and move `react-router-dom` out of
   devDependencies.
8. **Service-worker update trap** — `registerType: 'autoUpdate'` with
   skipWaiting + lazy routes means a mid-session deploy strands old lazy
   chunks (Suspense forever until manual reload). Use `virtual:pwa-register`
   with an "Update ready — reload" prompt, or handle chunk-load failure with
   a reload.
9. **iOS 7-day eviction can outrun the first warning** — the data-safety
   message only renders inside the backup-overdue card; tie an eviction
   warning to `persisted === false` independently of backup staleness
   (backup.ts:34, Alerts.tsx:76–100).
10. **New movements silently default onto the most recent open job**
    (LogForm.tsx:212–222) — a job forgotten open swallows a week of unrelated
    movements into a customer report. Restrict the default to same-day jobs.

---

## 3. Minor / polish (worth a sweep, not blocking)

- Stale hidden fields stamped across mode switches — `reason`/`equipment`
  saved unconditionally (LogForm.tsx:475,486); a decant gets labelled
  "Top up" on the service report.
- Correcting an entry on a *closed* job shows "— none —" but silently keeps
  the job (LogForm.tsx:1181–1188).
- Silent no-op when the bottle vanished mid-edit — `addTransaction` returns
  null and both save handlers do nothing, no toast (Transactions.tsx:453,
  Bottles.tsx:583).
- `updateJob` logs no field-level diff (unlike every other entity) and has no
  no-op guard (store.tsx:1064–1083).
- JobCard counts bottle-to-bottle decants as "recovered"; the ServiceReport
  excludes them — pick one.
- Sites list has search + filters but no "Showing X of Y · Clear" status line
  (Bottles/Transactions have it); Transactions' empty-filter state lacks a
  one-tap clear; no filter bar is sticky.
- Transaction soft-delete says "Delete" while being restorable — the one verb
  outlier left (Transactions.tsx:509–551).
- Jobs page blurb links "bottle quick-log" to `/` instead of `/bottles`
  (Jobs.tsx:72). Jobs list has no search/pagination yet.
- Dashboard has no logging CTA — the most common action needs a tab switch.
- `og:image` is root-relative → 404s on GitHub Pages; needs an absolute URL.
  No `robots.txt`.
- Versioning: `APP_VERSION` from `github.run_number` resets if the workflow
  is renamed; package.json stays 0.0.0; no CHANGELOG; no explicit schema
  version to detect "state written by a newer app".
- Restored custom refrigerants/presets can't survive sync (timestampless →
  tombstone always wins, merge.ts:260–275).
- Deleting a site leaves bottles `on_site` with no site (store.tsx:845–847).
- Old return rows with unresolvable tare are silently skipped in returnedKg
  (reports.ts:275–278).
- merge.ts contains a literal NUL byte (`'\x00'`) — file reads as binary to
  grep/diff; use `' '`.
- Internal review docs and `dist/` are committed to a public repo — prune
  before launch marketing points people at the source.
- Policy pages are both statically and dynamically imported, so their lazy
  chunks never split (build warning).

---

## 4. What is genuinely excellent — protect it

- **The glove path**: bottle → Charge → amount chip → reason → leak → Save,
  6–8 taps, zero typing; the morphing Save button that names the exact
  blocker; scale-entry deriving the amount; "Same as last job".
- **Demo-first onboarding** is fully real — seeded sample state, one-tap
  Explore, persistent demo banner with confirmed exit.
- **The audit discipline**: hash-chained change log with tail-truncation
  detection, append-only corrections, frozen-at-time-of-work stamps
  everywhere, `rawChanges` catch-all, recycle bin, the one-tap Audit Pack
  with correct superseded-row handling.
- **Password handling**: PBKDF2 210k iterations, timing-safe compare, HIBP
  with padding, length-over-complexity. Near-zero XSS surface; CSV
  formula-injection guarded.
- **Two-logs disambiguation** done with cross-links both ways; the change log
  is the first, default-open Settings section.
- Synchronous localStorage persistence (no lost-write window), quota
  detection, bounded diagnostics ring buffer, timezone-correct quarter
  bucketing, 197 passing tests over exactly the risky areas.

---

## 5. How to proceed — recommended sequence

**Week 1 — the blocker sprint (all small, localized):**
B2 quarterly-figures fix, B3 Jobs double-count + stale snapshot, B5
storage-health card, B6 scale-mode staleness, plus serious items 1–5
(dirty-form confirm, timezone prefill, tap targets, role-gate holes,
attachment gating). Add the CI test gate and the SW update prompt the same
week — they're each an hour.

**Week 1 decision — sync posture (B1):** ship v1 **local-only + backup**,
with cloud sync marked *beta, self-hosted, small teams* behind honest copy
and a locked-down SQL template — or removed from the Settings UI entirely
until the backend exists. Do not promote sync in launch marketing.

**Week 2 — honesty pass (B4):** rewrite the privacy policy to actual
behavior, fix the account-deletion flow, have both reviewed against the
Australian Privacy Principles by someone qualified. Prune review docs/dist
from the public repo. Set a real version + CHANGELOG.

**Weeks 2–4 — pilot before the thousands:** 10–20 friendly businesses for
2–4 weeks. The diagnostics log is your feedback channel — add a one-tap
"copy diagnostics" ask into the pilot onboarding. Watch for: lost-entry
complaints (dirty-form fix validation), iOS eviction, update-prompt
behavior, Audit Pack output handed to a real auditor.

**Then the category bets, in order:** the authenticated backend (it fixes
sync security, role enforcement, deletion, and retention in one move — build
it before scaling teams), the beautiful auditor PDF as the hero demo, jobs
polish (search, service-report fixes above), Bluetooth scale, native wrappers.

**The bar for "go":** blockers B1–B6 closed, policy honest, CI gating, one
pilot business has handed an Audit Pack to a real auditor and it held up.
That's the launch.
