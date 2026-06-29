# RefrigHandle — Release-Readiness Review

*Deep review, June 2026. Grounded in the current code on
`claude/app-release-readiness-xlza03`, not the earlier review docs. Verified
this session: **172 tests pass, lint clean, production build succeeds.** This
review answers four questions: what's needed to ship, what makes it the best
in its market, what makes people actually want to use it, and where ease of
use / readability can still get easier.*

---

## 0. Verdict

This is the most regulation-fluent refrigerant app of its size I've seen, and
the engineering is genuinely above average — the data-integrity work
(recycle bin, full change log, hash-chained audit trail, data-layer role
gates) is done and tested. **It is close to publishable.** What stands between
"close" and "ship with confidence" is a short list of concrete gaps, almost
all of them in the everyday UX and a few publishing hygiene items — not the
compliance core.

The honest framing: the *trust* story is built. The *adoption* story (first 90
seconds, the three-tap log, the auditor handoff) is 80% built and has drifted
in a couple of places that will cost real users.

### Scorecard

| Area | State | Gap to ship |
|---|---|---|
| Compliance/domain correctness | Excellent | — |
| Data integrity & audit | Excellent (done this project) | — |
| Tests / lint / typecheck / build | All green (172 tests) | Bundle not code-split |
| Onboarding | Demo-first welcome shipped ✅ | Setup still a single long scroll |
| Everyday logging | Powerful | **Two forms have drifted apart (parity trap)** |
| Visual system | Calm, consistent, dark mode | A few polish gaps |
| Readability | Good; information-dense | Settings & dense cards |
| Publishing hygiene | Mostly there | Meta tags, bundle size, attachment-delete path |

---

## 1. Release blockers — fix before publishing

These are the things that would embarrass the product or lose data in front of
a real user/auditor.

### 1.1 The two logging forms have drifted into *different capabilities* ⭐ top fix
There are still two log forms — the quick one on **Bottles** (`QuickLogModal`)
and the full one on **Activity/Log** (`TransactionForm`) — and they no longer
do the same things. This is now a correctness problem, not just duplication:

| Capability | Bottles quick-log | Log tab (full) |
|---|---|---|
| Quick-amount chips (1/2/5 kg) | ✅ `Bottles.tsx:1491` | ❌ plain text input `Transactions.tsx:1170` |
| Photos at time of log | ❌ none | ✅ `Transactions.tsx:1460` |
| Customer signature | ❌ | ✅ (post-save) |
| Corrections / restatement | ❌ | ✅ `Transactions.tsx:691` |
| Bottle-to-bottle recovery | ✅ only here `Bottles.tsx:1098` | ❌ |
| Add new technician inline | ❌ | ✅ `Transactions.tsx:1417` |

The result: a tech doing a routine charge from Bottles gets the fast path but
*cannot attach a docket photo without saving, closing, and re-opening the
bottle*; a tech in the Log tab gets photos but has to type every amount; and
**bottle-to-bottle recovery is unreachable from the Log tab entirely.** A
record's completeness depends on which screen you happened to start from. Unify
to one progressively-disclosed form (chips + photos + signature + corrections +
bottle-to-bottle in both), or have one delegate to the other. This is the
single highest-value fix in the whole review.

### 1.2 Photo/signature deletion is still a hard, unlogged delete
This was flagged in the prior review and is still open: deleting an attachment
is a permanent IndexedDB delete with no change-log entry — the one path that
contradicts "nothing is ever permanently deleted, everything is logged." At
minimum, log it with a "can't be undone unless backed up" confirm; ideally
route the blob (or a thumbnail) through the recycle bin like everything else.
The plumbing already exists.

### 1.3 Bundle is one 759 kB chunk, no code-splitting
`dist/assets/index-*.js` is **758.89 kB (229 kB gzip)** and the build prints
the >500 kB warning. First paint on plant-room Wi-Fi pays for the policy pages,
the PDF/quarterly report, the scanner library and the QR encoder up front.
Lazy-load the route components (`React.lazy` per page) and the heavy libs
(`@zxing`, `qrcode`) — they're used on a minority of screens.

### 1.4 Publishing hygiene
- **`index.html` has no `<meta name="description">` and no Open Graph/Twitter
  tags** — a shared link or app-store listing will look bare. Add description +
  OG image (the maskable icon set already exists).
- **No crash/error reporting.** A field tech who hits a save error has no way
  to tell you. A lightweight client logger (even a local ring buffer surfaced
  in Settings → "Send diagnostics") closes the loop.
- **Privacy review.** The app stores licence numbers, customer sites and
  signatures; have the existing policy pages checked against the Australian
  Privacy Principles before launch (engineering can't sign this off).

---

## 2. Ease of use — making the everyday log "three gloved taps"

The field tech is make-or-break: if logging a charge with gloves takes too
long, the records never get entered and the whole compliance story collapses.

**What's already great (keep it):** scale-entry mode with auto-derived amount,
quick-amount chips on the bottle path, "same as last job" prefill, the
self-explaining dead Save button, inline tech-switch on a shared device, the
barcode scanner, full offline.

**Where to push (concrete, current frictions):**

1. **Unify the form (see 1.1)** — this is also the biggest ease-of-use win, not
   just a correctness fix.
2. **Default the leak-test answer** to the last job's, with an obvious
   override. Today reason *and* leak-test are forced fresh on every entry
   (`Transactions.tsx:831-832`, `Bottles.tsx:1263-1264`); for a string of
   top-ups that's pure repetition. "Same as last job" should also carry the
   reason and leak answer, not just site/unit.
3. **Bring quick-amount chips to the Log-tab form** so routine charges don't
   require typing there.
4. **Scan inside the charge modal on the bottle path** too — today the scanner
   is one level deep in the bottle-select sub-modal.

Target everyday path: tap bottle → Charge → "2 kg" chip → "same as last" → Save.

---

## 3. Readability & visual overwhelm

The visual system is genuinely calm and consistent — one brand blue, semantic
green/amber/red used only for status, grid-aligned spacing, real dark mode,
focus rings on inputs. It does *not* feel overwhelming. The issues are local
density and a few polish gaps:

- **Settings is still a long scroll.** It's now split into three collapsible
  sections (Audit & records, Business & people, App settings) — a real
  improvement — but with everything expanded it's 10–15 phone screens, and
  technician management + backup/export are big enough to deserve their own
  sub-screens. The long explanatory paragraphs in `text-xs` are the heaviest
  part; tighten the prose and let the UI carry more of the meaning.
- **Bottle cards stack 5–8 elements** (number, refrigerant, status, pump-down,
  hydro, overfill pills, weight, fill bar). Scannable, but on a busy bottle
  every pill fires at once. Consider showing only *exceptions* (overfill, hydro
  due) as pills and demoting the always-true ones.
- **No "showing 23 of 456 · clear filter" status line** on the Bottles/Sites
  lists, and the search/filter bar isn't sticky — after filtering, people
  can't tell at a glance that records are filtered, not missing.
- **No `:focus-visible` ring on buttons** (inputs have one). A keyboard or
  switch-access user loses track of focus. One utility class fixes it globally.
- **No loading/progress feedback** for export/import — a multi-year JSON backup
  serialises for a beat with no spinner; add a busy state.

---

## 4. The "two logs" naming problem (still live)

The bottom tab says **"Log"** (the *Refrigerant* movement log). The **Change
log** (the tamper-evident audit trail — arguably the product's proudest
feature) is buried **3–4 taps deep**: Settings → expand "Audit & records" →
"Change log" card → Open. A supervisor handing records to an auditor should
reach the audit trail in one tap. Give it a real home in the navigation (a
two-log switcher, or rename to "Movements" vs "Change log") so the labels
disambiguate themselves without the copy having to work so hard.

---

## 5. Smaller polish that users will notice

- **Overlapping destructive verbs.** "Delete" means *soft-delete* on a bottle
  (`Bottles.tsx:676`) but *permanent removal* on a decommissioned unit
  (`Sites.tsx:1064`); "Remove", "Decommission", "Return to stock" add more.
  Now that nothing is truly gone, collapse to a smaller, consistent verb set so
  no one is afraid to tap.
- **Unit cards jump straight to edit.** Tapping a unit inside a site goes
  directly into the edit form (`Sites.tsx:943`), unlike bottles and sites which
  open a read-only view first. One slip edits compliance data — make the
  primary tap *view*, edit secondary.

---

## 6. What makes it the best in its market

The moat is domain fluency competitors (spreadsheets, generic inventory apps)
can't match: refrigerant-aware safe-fill (water capacity × the *specific*
filling ratio), AS 2030 hydro-test tracking, frozen-at-time-of-work licence
stamping, append-only corrections, the hash-chained change log, IPCC GWP/CO₂-e,
one-tap ARC quarterly. To turn "excellent tool" into "the one fridgies
recommend to each other":

1. **The auditor handoff as the hero feature.** One tap → ARC quarterly +
   per-cylinder logbook as a *beautiful* PDF with the chain-verification badge
   on the page. The export and integrity stamp already exist; make it gorgeous
   and make "hand this to your auditor" the demo that closes the room.
2. **A real backend with per-tech sign-in** — the ceiling-lifter. It turns
   today's honestly-disclosed client-side limits into provable facts:
   unspoofable permissions, a server-anchored audit chain ("provably complete,"
   not just "no tampering detected"), durable cloud retention, and identity for
   who-deleted/who-restored. This is the difference between a great tool and a
   system of record.
3. **Own the whole job.** Fridgies think in *jobs*; the app thinks in
   *transactions*. A work-order container grouping a visit's cylinders,
   equipment, photos, signature and log entries becomes the natural home for a
   customer-facing service report.
4. **Proactive compliance radar.** The Compliance Health data is all there;
   with a backend, *push* it ("3 cylinders due for hydro test and a tech's RHL
   expires next month") before the auditor notices.
5. **Bluetooth scale integration** — read the weight straight off the scale.
   Kills the #1 field error and a whole input step; no spreadsheet competitor
   can touch it.

---

## 7. Suggested sequence

1. **Ship-blockers (this sprint):** unify the log form (1.1), fix
   attachment-delete (1.2), code-split the bundle (1.3), meta tags + a client
   error logger (1.4).
2. **Ease-of-use polish:** leak-test/reason defaults (2.2), focus-visible
   rings, list status lines, export busy-states, change-log in nav (§4),
   verb cleanup (§5).
3. **Category bets:** the beautiful auditor PDF (6.1 — largely client-side),
   then backend + sign-in (6.2), the job container (6.3), push (6.4),
   Bluetooth scale (6.5).

---

## 8. The pitch this builds toward

> *"Open the app, scan a cylinder, read the scale — the math, the safe-fill
> check and an audit-proof record happen for you. Nothing's ever lost, every
> change is on the record, and it all works with no signal. Hand the PDF to
> your auditor and walk away. Built for the Australian scheme."*

Land the unified log and the blocker list, make the auditor PDF the hero, and
this isn't just publishable — it's the one people line up to switch to.
</content>
</invoke>
