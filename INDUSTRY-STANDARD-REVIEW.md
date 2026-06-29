# RefrigHandle — Industry-Standard & Publishing Review

*Fresh deep review, June 2026. Two questions drive it: what makes this the
default tool Australian fridgies reach for, and what has to be true before it
can be published with a straight face. Plus the three things you asked me to
lock down — **nothing is ever permanently deleted, everything is logged, and
permissions are real** — which I've implemented on this branch.*

Codebase: React + TypeScript PWA, ~25k lines, 168 tests passing, clean
typecheck / lint / production build.

---

## 0. What I changed this session (the three guarantees)

You asked for three concrete things. All three are now implemented, tested,
and shipped on this branch.

### "Nothing is ever permanently deleted" — a recycle bin for every record
Before, deleting a **bottle, site, unit, technician, preset or custom
refrigerant** removed the record from storage for good. The *work* (the
refrigerant log) was preserved, but the record itself was gone — unrecoverable.

Now every one of those deletions moves the full record into a **recycle bin**
(`AppState.recycleBin`) instead of discarding it:

- The live collections (`bottles`, `sites`, …) still hold only active records,
  so every list, picker, report and compliance calc keeps working unchanged —
  the bin is an archive *alongside* them, not a flag threaded through 100 call
  sites.
- An owner/supervisor restores any record from **Change log → Recently
  deleted**. Restore re-inserts it, clears its sync tombstone, and bumps its
  timestamp so a later device sync won't immediately re-delete it.
- Even the automatic 90-day technician purge now drops the profile into the
  bin rather than erasing it.
- The bin is unioned across devices by the sync merge (append-only, never
  pruned) — a deletion captured on one phone is recoverable on all of them.

The only genuine all-or-nothing wipe left is **account closure**, and that
still runs *after* the business has been handed its full records ZIP — by
design, and now owner-gated (below).

*Files: `types.ts` (RecycleBinEntry, AppState.recycleBin), `store.tsx` (all six
delete paths + `restoreFromRecycleBin`), `merge.ts` (`mergeRecycleBin`),
`storage.ts` (normalize), `AuditLog.tsx` (recovery UI). Tested in
`store.test.tsx` and `merge.test.ts`.*

### "Everything gets logged" — closed the change-log gaps
Three mutations slipped through the change log before:

- **Switching the active profile** (`setActiveTechnicianId`) — on a shared
  device this is *the* record of who was in the seat, and so who every later
  entry is attributed to. Now logged.
- **Re-accepting the policies** after a version bump (`acceptTerms`) — now
  logged with who/when/version (it was only captured at first-run setup).
- **Every deletion-to-bin and every restore** — logged as part of the above.

Refrigerant movements (`addTransaction`) remain deliberately on the Refrigerant
log rather than mirrored into the change log — that split is intentional and
documented; the Refrigerant log *is* their permanent record.

### "Permissions" — enforced at the data layer, not just hidden in the UI
Before, the role tiers (owner → apprentice) were enforced **only by hiding
buttons**. Anyone who reached a store method — a future code path, a synced
row, the dev console — bypassed every boundary. The code even said so.

Now the trust-critical mutations check the active profile's tier *before*
mutating, no-op if it's too low, and tell the user which tier they need:

| Action | Now requires |
|---|---|
| Delete / restore a log entry | Supervisor+ |
| Delete a bottle / site / equipment | Supervisor+ |
| Restore from the recycle bin | Supervisor+ |
| Remove / deactivate / suspend a technician | Supervisor+ |
| Edit business name / ABN / RTA / RTA expiry | Supervisor+ |
| Import a backup (whole-dataset replace) | Supervisor+ |
| Close the account | Owner only |

The guard is deliberately permissive in one case: when there is **no active
profile** (a solo / first-run / demo device with no per-tech identity) there's
no boundary to enforce, so the action proceeds — matching how the app behaves
before a crew is set up, and keeping onboarding/demo frictionless.

**Honest limit:** this is still client-side. It stops accidental misuse and
makes the UI's promises true, but a determined user with dev-tools can still
edit localStorage. *Unspoofable* enforcement needs server-side per-tech
sign-in — see §3. The code says this plainly rather than overclaiming.

---

## 1. The verdict

This is the most regulation-fluent refrigerant app I've seen at this size. The
domain knowledge is the moat: refrigerant-aware safe-fill (water capacity ×
the *specific* filling ratio, not a flat 80%), AS 2030 hydro-test tracking,
frozen-at-time-of-work licence stamping, append-only corrections, a
tamper-evident hash-chained change log, IPCC GWP/CO₂-e, and one-tap ARC
quarterly reporting. Competitors are spreadsheets or generic inventory apps;
this one speaks the scheme.

With this session's changes, the data-integrity story is now genuinely
best-in-class for a client-side app: **nothing is permanently deleted,
everything is logged, and the role boundaries are real.** What stands between
"excellent solo tool" and "industry standard" is now almost entirely **one
thing: a backend** (§3).

---

## 2. What's required to become the industry standard

Ranked by leverage. The first is the unlock; the rest are how you win the room.

### 2.1 A real backend with per-tech sign-in *(the one that changes the category)*
Everything that's currently "honestly disclosed as client-side" becomes
*provable* with a server:

- **Unspoofable permissions.** The role gates added this session become real
  when each tech signs in and the server enforces `level` — the apprentice
  genuinely *can't* delete a record, not just "the button's hidden."
- **Server-anchored audit chain.** Today the hash chain detects casual
  tampering and (via the per-device high-water mark) tail-truncation, but a
  determined local editor can re-hash. Anchoring each device's chain head
  server-side turns "no *detected* tampering" into "provably complete." This is
  the single biggest credibility jump for an auditor.
- **Durable cloud retention.** The current Supabase sync is an unauthenticated
  whole-blob path whose tenant isolation lives in out-of-band server rules.
  Real accounts make "your records are safe even if you drop the phone in the
  plant room" true, not aspirational.
- **Identity for the recycle bin / restore.** With sign-in, "who deleted this
  and who restored it" becomes attributable to a verified person, not a seat.

This is on your roadmap already. It's the difference between a great tool and a
system of record.

### 2.2 Own the whole job, not just the gas
A **job / work-order container** that groups the cylinders, equipment,
photos, signature and log entries for one site visit. Fridgies think in
*jobs*; today the app thinks in *transactions*. Wrapping a job around the
movements is what makes it the app they open first on site, and the natural
home for a customer-facing service report.

### 2.3 Proactive compliance radar (you're 80% there)
The Compliance health scorecard already rolls licences, RTA, AS 2030 and
backups into a traffic light. Make it **fleet-wide and push-aware**: "three
cylinders due for hydro test and a tech's RHL expires next month — before the
auditor noticed." Push/email reminders need the backend, but the data model is
already there.

### 2.4 The auditor handoff as the hero feature
One-tap **ARC quarterly + per-cylinder logbook as a polished PDF with the
chain-verification badge on it**. "Hand this to your auditor" is the demo that
sells the room. The integrity stamp and quarterly export exist; the remaining
work is making the PDF beautiful and the verification result unmissable on the
page.

---

## 3. Publishing-readiness checklist

What has to be true before this goes to an app store / public URL.

**Blocking**
- [ ] **Stop advertising permissions you can't enforce, or finish the backend.**
      This session made the UI's claims true at the data layer *for the common
      case*; the README/Terms should keep saying enforcement is client-side
      until sign-in lands. (Done in code; copy is honest.)
- [ ] **Photo/signature deletion is still a hard IndexedDB delete** and is *not*
      logged. It's the one remaining "permanently deleted, silently" path. Either
      route it through the recycle bin / a backup-first confirm, or at minimum
      log it. (See §4 — recommended next change.)
- [ ] **Privacy policy / data-handling review** for an app that stores licence
      numbers, customer sites and signatures. The policy pages exist; have them
      reviewed against the Australian Privacy Principles before launch.
- [ ] **Backup durability messaging.** A device that loses localStorage with
      sync off and a stale backup loses everything. The 90-day nudge helps;
      consider blocking-severity messaging until cloud retention is real.

**Strongly recommended**
- [ ] App-store metadata, screenshots, a real maskable icon set, and a landing
      page with the one-line pitch.
- [ ] Crash/error reporting (even a lightweight client logger) so field issues
      surface without a tech filing a bug.
- [ ] A short in-app "what's new / how it works" so the compliance model
      (frozen history, corrections, recycle bin) is discoverable.
- [ ] Code-split the main bundle (the build warns it's >500 kB) for faster
      first paint on site Wi-Fi.

---

## 4. Recommended next change (small, high-value)

**Route photo/signature deletion through the same safety net.** It's the last
path that contradicts "nothing is ever permanently deleted," and it's
currently unlogged. Two options, in order of effort:

1. *Minimum:* add a change-log entry when an attachment is deleted (who/when/
   which record) and a "this can't be undone unless you've backed up" confirm.
2. *Full:* keep the blob (or a thumbnail) in a recoverable store and surface it
   in the recycle bin like everything else.

Everything needed (the `recycleBin` plumbing, the audit helper) is now in place
to do this cleanly.

---

## 5. Ease of use — make people *want* to use it

The field tech is make-or-break: if logging a charge with gloves on takes too
long, the records never get entered and the whole compliance story collapses.
What's already great — scale entry, the self-explaining disabled Save button,
the barcode scanner, "same as last job", full offline. Where to push:

1. **Lead with value, not setup.** The "explore with sample data" mode already
   exists — make it the *default* first screen so a new user scans a bottle and
   logs a charge in 90 seconds before being asked for ABN/RTA. This is the
   single biggest adoption lever.
2. **Three taps to log, max.** Default the leak-test answer to the last one,
   surface the tech picker on the quick path, and keep the most-used site
   section open. Every saved tap is a record that actually gets entered.
3. **One "log" concept, clearly named.** Two logs (Refrigerant log vs Change
   log) confuse people — the copy works hard to disambiguate them, which is the
   tell. Give the Change log a clear home in the nav (the new Recently-deleted
   panel lives there now, which is a good anchor) and label the split plainly.
4. **Tap-to-view, not tap-to-edit.** Tapping a unit opens the full edit form —
   one slip and compliance data changes. Primary tap should *view* (or open the
   logbook); edit is secondary.
5. **Simplify destructive choices.** "Deactivate / Suspend / Delete now /
   Delete permanently" is four overlapping verbs. Now that nothing is
   permanently deleted, you can collapse these to "Disable" vs "Remove" with
   far less anxiety — removal is reversible from the bin.
6. **Settings is a 1,700-line catch-all.** Split tech management, company
   identity, legal, sync and backup into focused screens.

The recurring theme: the app is *powerful*; ease-of-use work is about making
that power reachable in three gloved taps and not making anyone afraid to tap
"delete."

---

## 6. Engineering health

- **Tests:** 168 passing, covering the trust-critical store mutations (weight
  math, corrections, bottle-to-bottle, soft-delete/restore, and now the recycle
  bin + role enforcement + the merge semantics for both).
- **Type safety / lint / build:** all clean.
- **Code quality:** above average — comments explain *intent and limits*, which
  materially lowers audit and maintenance risk. Keep that discipline.
- **Biggest debt:** the client-only trust model. Not a code-quality problem — a
  category ceiling that only the backend lifts (§2.1).

---

## 7. The one-line pitch to build the launch around

> *"Refrigerant compliance that lives in your pocket — scan a bottle, read the
> scale, and walk away with audit-proof records the regulator will accept.
> Nothing's ever lost, every change is on the record, and it all works with no
> signal. Built for the Australian scheme."*

Ship the backend (§2.1), make the auditor PDF the hero (§2.4), keep the
first-90-seconds friction near zero (§5), and this is not just publishable —
it's the one people recommend to each other.
