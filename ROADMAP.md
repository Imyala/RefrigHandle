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
2. ~~Onboarding import from a spreadsheet~~ — **done (July 2026)**:
   Bottles → "Import from spreadsheet" takes a pasted Excel selection or
   a CSV file (synonym header matching, kg weights, dd/mm/yyyy or
   mm/yyyy dates), previews every row with per-row errors/warnings, and
   creates each cylinder through the normal path — change-log entry and
   intake ledger row included. Template downloadable in-app.
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

1. **Reminders that reach people** *(the #1 retention lever)* —
   **first half done (July 2026)**: Settings → "Reminders on your
   calendar" builds an .ics file (licence/RTA renewals 60 days ahead and
   on the day, each cylinder's AS 2030 test date, a heads-up two weeks
   before every quarter closes) shared straight to the phone's calendar;
   deterministic event IDs so re-imports update rather than duplicate.
   **Still to do**: push notifications + email via a serverless sender
   once the domain exists — the calendar file then remains the offline
   fallback.
2. **The job becomes the centre, with a customer-facing service report**
   — **largely done (July 2026)**: the service report now embeds the
   customer's captured signature (name + time) and the job's photos, and
   has a Share… sheet (device share / copy / email) alongside Print/PDF,
   and **Jobs now has its own tab** in the bottom bar. **Still to do**:
   a real PDF attachment once transactional email exists.
3. ~~Quarter-close ritual~~ — **done (July 2026)**: in the last fortnight
   of each quarter a dashboard card lists the outstanding fixes (overdue /
   undated cylinder tests, lapsing licences or RTA, stale risk plan,
   overdue backup) with one-tap links, flips green when everything's
   clear ("a nil return is still a record"), and opens the quarterly
   record directly.
4. **Managed accounts + cloud sync (the category jump)** — per-tech
   sign-in, real revocation, server-anchored audit chain, nightly managed
   backups. This is what makes multi-van businesses adopt it as the
   system of record — and data gravity is the strongest retention there
   is. It is also the natural paid tier. (RELEASE-GO-LIVE §2.1; the
   quarter-scale project.)
5. **Faster capture in the field** — **app shortcut done (July 2026)**:
   long-press the home-screen icon → "Log refrigerant" opens the form
   directly (manifest shortcut + `#/?action=log` deep link). **Still to
   do**: camera-first entry (snap the docket / nameplate, fill the form
   around it — OCR later); bulk "move these 5 bottles to site X".
6. ~~A monthly summary that makes the owner look~~ — **in-app card done
   (July 2026)**: "June 2026 at a glance" on the dashboard — charged /
   recovered / purchased / sold kg, movement count, busiest site, leak-
   watch flags; hidden for months with nothing logged. **Still to do**:
   the email edition once §B.1's sender exists.
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
