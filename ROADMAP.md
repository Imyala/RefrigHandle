# RefrigHandle — Finalisation & Retention Roadmap (July 2026)

*What stands between the current main branch and a finished product, and
which features make people open the app every day rather than only when
an auditor calls. Ordered by leverage. Engineering state at time of
writing: 227 tests green, lint clean, production build passing; the
July 2026 review rounds (see APP-REVIEW-JULY-2026.md) closed every
in-app blocker they found.*

---

## A. Finalise for release (in order)

1. **Custom domain + hosting cutover** — before anything else; installed
   PWAs pin to their origin forever. (RELEASE-GO-LIVE §1.4.)
2. **Onboarding import from a spreadsheet** *(engineering, ~2–3 days)* —
   a "Bring your cylinders in" CSV/paste import (bottle number,
   refrigerant, tare, gross, test date). Every real business already has
   a spreadsheet; retyping 60 cylinders on a phone is the single biggest
   reason a trial dies in the first hour. This is an adoption feature,
   but it must exist *before* the pilot.
3. **Pilot with 3–5 real businesses for a full quarter cycle** — exit
   criterion: one business does setup → daily logs → quarterly record →
   audit pack ZIP → restore-from-backup without help.
4. **Legal & scheme review** *(process)* — Privacy/Terms against the
   APPs; the CoP 2025 / Reg 141 wording checked by someone who audits
   RTAs; never claim ARC endorsement.
5. **Repo hygiene + 1.0.0 tag** — move the internal review docs private,
   ship store-quality screenshots and a landing page.
6. **Error telemetry (opt-in)** — without it the only field-failure
   signal after launch is a support email.

## B. The habit-formers — features that keep people coming back

Ranked by how directly they change a technician's or owner's week.

1. **Reminders that reach people** *(the #1 retention lever)* — licence /
   RTA expiry, cylinder test due, "quarter closes in 14 days", backup
   overdue — delivered as push notifications and email, not just in-app
   badges. An app that taps you on the shoulder before the regulator
   does is the one you keep. Web Push + a tiny serverless sender; the
   alert model already exists in-app. *(Needs the domain; ~1–2 weeks.)*
2. **The job becomes the centre, with a customer-facing service report**
   — fridgies think in jobs, not transactions. Give Jobs a tab, and give
   every job a one-tap, good-looking **service report PDF/share**: site,
   work done, refrigerant in/out, leak test, photos, customer signature.
   That's the artifact they send to *their* customer — daily utility
   beyond compliance, and free word-of-mouth (every report carries the
   app's name). Most pieces (jobs, share text, signatures, print CSS)
   already exist. *(~1–2 weeks.)*
3. **Quarter-close ritual** — a card that appears in the last fortnight
   of each quarter: "Q3 closes in 12 days — 2 charges missing a leak-test
   answer, 1 cylinder with no test date, risk plan review due" with
   one-tap fixes, ending in "Quarterly record ready — share it". Turns
   compliance from a scramble into a 5-minute routine, 4 guaranteed
   sessions a year. *(Mostly client-side; ~1 week.)*
4. **Managed accounts + cloud sync (the category jump)** — per-tech
   sign-in, real revocation, server-anchored audit chain, nightly managed
   backups. This is what makes multi-van businesses adopt it as the
   system of record — and data gravity is the strongest retention there
   is. It is also the natural paid tier. (RELEASE-GO-LIVE §2.1; the
   quarter-scale project.)
5. **Faster capture in the field** — the record only exists if entering
   it beats a notebook: PWA **app-shortcut** "Log a charge" straight from
   the home-screen icon *(hours)*; camera-first entry (snap the docket /
   nameplate, fill the form around it — OCR later); bulk "move these 5
   bottles to site X" *(days)*.
6. **A monthly summary that makes the owner look** — "March: 42 kg
   charged, 11 recovered, top site Harbour View, unit #2 flagged on leak
   watch, all licences current." In-app card first, email once §B.1
   exists. Owners forward it; forwarding is marketing. *(~3–4 days.)*
7. **Xero deepening** — the purchases CSV ships today; the next step is
   OAuth push of draft bills, only justified once pilots actually use
   the CSV route.
8. **ARCtick licence lookup** at onboarding — investigate, don't promise
   (no public API; scraping/data agreement).

## C. Principles worth keeping

- Offline-first stays non-negotiable — plant rooms are black spots.
- Every new feature must survive the "gloves test": reachable in ≤3 taps
  or it won't be used on a roof.
- Compliance data stays versioned and stamped (COMPLIANCE.md cadence).
- Nothing is ever silently deleted; every shortcut still writes the
  ledger row.
