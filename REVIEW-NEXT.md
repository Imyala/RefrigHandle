# RefrigHandle — What's Next to Lead the Category

*Second review, June 2026. The data-integrity foundation is now done (see
below). This review is forward-looking: what turns "an excellent, trustworthy
compliance app" into the **industry-leading** one fridgies recommend to each
other — with **amazing ease of use** as the throughline.*

Grounded in the current code (onboarding, the logging path, navigation), not
the earlier review. 172 tests, clean typecheck / lint / build, all on `main`.

---

## 0. Where we are now (foundation = done)

These were the trust-critical gaps; all are closed and on `main`:

- **Nothing is ever permanently deleted** — bottles, sites, equipment,
  technicians, presets and refrigerants go to a recoverable recycle bin;
  log entries soft-delete; restore is one tap.
- **Everything is logged** — every create / edit / remove / restore, *every
  field* (incl. technician role and name parts, via a catch-all that makes
  silent edits impossible), plus automatic **licence / RTA / cylinder
  hydro-test lapse** entries. Refrigerant movements stay in the Refrigerant
  log by design.
- **Permissions are enforced at the data layer**, not just hidden in the UI.
- **Compliance Health card is complete** — RHL, RTA, AS 2030 testing,
  **DA19 equipment leak rate**, and backup, each surfacing expired/overdue.

The app is now *trustworthy*. The rest of this doc is about making it
*irresistible*.

---

## 1. The two levers

1. **Amazing ease of use** — mostly client-side, shippable now, and what wins
   daily users. This is where the biggest near-term gains are.
2. **A backend** — what unlocks the *category* (provable trust, real teams,
   durable retention). Bigger, but it's the ceiling-lifter.

Do the ease-of-use work first: it compounds adoption while the backend is
built.

---

## 2. Amazing ease of use — the priority list

### 2.1 Win the first 90 seconds: demo-first onboarding ⭐ highest leverage
Today a brand-new user hits a **15-field wall** (business name, ABN, RTA +
expiry, role, name, RHL + expiry, password ×2, state/city/timezone, a licence
self-declaration, and an 8-policy agreement) before *anything* is usable. The
"try with sample data" path exists but is a link at the bottom of that wall.

**Flip it.** Land every new user straight into the working app on sample data
(scan a bottle, read a scale, watch the overfill flag fire), with a persistent
"Set up my business" button. Ask for compliance details only when they go to
produce their first *real* record. Value first, setup as the upsell.
*Onboarding.tsx, App.tsx (OnboardingGate), Layout.tsx (demo banner).*

### 2.2 Cut the setup wall down (for when they do set up)
- **Auto-detect** timezone (already available via `deviceTimeZone()`),
  default country to Australia, and pre-select the state that matches the
  detected timezone — removes 2–3 picker taps.
- **Split into a short wizard** (Business → You → Location → Agree) with a
  progress indicator, instead of one 300-line scroll.
- **Soften the licence self-declaration** from a hard gate to a clear notice +
  an in-app reminder (the expiry tracking already exists). Lower the
  perceived-legal-risk barrier at signup.
- Default the two expiry date pickers sensibly and show a live password
  strength hint ("longer beats complex").

### 2.3 Make the everyday log "3 gloved taps"
The field tech is make-or-break. Concrete, current frictions and fixes:

- **Unify the two log forms.** There are two (a quick one on Bottles, a full
  one on Activity) that have already drifted — the quick one has no tech
  picker, no photos, no signature. One form, progressively disclosed.
- **Default the leak-test answer** to the last job's (with an explicit,
  obvious override). It's the one field forced fresh every time; for a string
  of top-ups that's a tap per job for no new information.
- **Inline tech switch on the quick path.** Today it *shows* who'll be stamped
  but you must leave the form to change it — make that label a tappable
  mini-picker so the right licence is one tap away on a shared device.
- **One-tap "same as last job"** that fills site + unit + reason *and* the
  leak answer, not just site/unit.
- **Default to scale-entry mode** on the quick path and add **quick-amount
  buttons** (last / 1 / 2 / 5 kg) so a routine top-up needs no typing.
- **Scan inside the charge modal**, not only when adding a bottle.

Target everyday path: tap bottle → Charge → "2 kg" → "same as last" → Save.

### 2.4 Navigation & information architecture
- **Two logs, one confusing word.** The "Log" tab is the *Refrigerant* log;
  the *Change* log (the audit trail) is buried three taps deep in Settings.
  Give the change log a real home in the nav (a two-log switcher, or a clearer
  label like "Movements" vs "Change log"). A supervisor should reach the
  tamper-evident record in one tap.
- **Split Settings** (currently ~1,830 lines / a catch-all) into focused
  screens: Team, Audit & records, Business identity, App preferences. Easier
  to use one-handed, easier to maintain.
- **Sticky filter/search headers** and a "showing 23 of 456 · clear filter"
  status line on the long list pages, so people don't think data is missing.

### 2.5 Polish people notice
- **Loading/progress feedback** for export/import and (future) sync — a
  5-year backup serialises for a beat with no feedback today.
- **Count badge** on the Compliance Health header ("2 need action") so it's
  scannable before expanding; and fold "persistent storage not granted" into
  the backup row.
- **Visible focus rings** (`focus-visible`) and a "back to top" on long pages.
- Compressed photos (phone shots are 3–8 MB) so backups stay small.

---

## 3. Industry-leading — the category bets

### 3.1 Backend with per-tech sign-in ⭐ the ceiling-lifter
Turns today's honestly-disclosed client-side limits into provable facts:
- **Unspoofable permissions** — the apprentice genuinely *can't* delete a
  record (the gates we added become server-enforced).
- **Server-anchored audit chain** — anchor each device's chain head so the
  claim moves from "no *detected* tampering" to **"provably complete."** This
  is the single biggest credibility jump for an auditor.
- **Durable cloud retention** — real accounts, real tenant isolation, records
  safe even if the phone dies. (Today's sync is an unauthenticated whole-blob
  path.)

### 3.2 Own the whole job (work-order container)
Fridgies think in *jobs*, the app thinks in *transactions*. A job groups a
visit's cylinders, equipment, photos, signature and log entries — and becomes
the natural home for a **customer-facing service report**. This is the leap
from "great gas tracker" to "runs the whole job."

### 3.3 The auditor handoff as the hero feature
One-tap **ARC quarterly + per-cylinder logbook as a beautiful PDF with the
chain-verification badge on the page**. The export and the integrity stamp
already exist; make it gorgeous and make "hand this to your auditor" the demo
that closes the room.

### 3.4 Proactive compliance radar (push/email)
The Compliance Health data is all there; with a backend, *push* it: "3
cylinders due for hydro test and a tech's RHL expires next month — before the
auditor noticed."

### 3.5 Hardware & native depth
- **Bluetooth scale integration** — read the cylinder weight straight off the
  scale. Kills the #1 field error and a whole input step. This is a "wow" no
  spreadsheet competitor can touch.
- **Native iOS/Android wrappers** for deeper camera, notifications, a
  home-screen widget ("today's jobs"), and Apple/Google Wallet-style cylinder
  passes.

---

## 4. Suggested sequence

1. **Now (1–2 sprints, client-side):** demo-first onboarding (2.1), unify +
   de-friction the log form (2.3), change-log in nav (2.4). Biggest
   adoption-per-effort.
2. **Next:** setup wizard + auto-detect (2.2), Settings split (2.4), polish
   pass (2.5), the beautiful auditor PDF (3.3 — partly client-side).
3. **Bet:** backend + sign-in (3.1), then the job container (3.2), push
   reminders (3.4), Bluetooth scale (3.5).

---

## 5. The pitch this builds toward

> *"Open the app, scan a bottle, read the scale — the math, the safe-fill
> check, and an audit-proof record happen for you. Nothing's ever lost, every
> change is on the record, and the whole crew's work is on every phone, online
> or off. Hand the PDF to your auditor and walk away. Built for the Australian
> scheme."*

Nail the ease-of-use list and demo the backend trust story, and this isn't
just compliant — it's the one people line up to switch to.
