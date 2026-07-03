# RefrigHandle — Go-Live Review (July 2026)

*What is left to do — on the app and on the server side — to take
RefrigHandle from a release candidate on GitHub Pages to a finished,
publicly released product. Supersedes the "Remaining before launch" list in
RELEASE-REVIEW-FINAL.md. Verified this session: 212 tests green, lint
clean, production build succeeds.*

---

## 0. Where we are

The engineering blockers from the two prior review sprints are closed.
As of this branch the app also has:

- **Account closure that finishes cleanly** — the closed screen now returns
  the device to the welcome screen after **3 minutes or on any page
  refresh, whichever comes first** (previously 5 minutes, and a refresh
  resumed the countdown instead of resetting).
- **A way out of guest mode** — the sample-data banner now offers **"Exit
  guest mode"** back to the welcome screen alongside "Set up my business";
  previously the only exit was into account creation.
- **Bottom bars that can never cover content** — the tab bar and the
  setup screen's action bar are `position: sticky` instead of `fixed`, so
  they occupy real layout space; the policy/acknowledgement checkboxes can
  always scroll clear of them on any screen size. This was a real trap: the
  setup bar grows (the "Still needed" list plus the guest link) taller than
  the fixed padding allowed for.

The offline, single-device product is release-quality. What remains falls
into three buckets: **process items** (legal, pilot, repo hygiene),
**server-side items** (the real gap between "excellent PWA" and "finished
product"), and **polish**.

---

## 1. Must do before public release

### 1.1 Legal & privacy sign-off *(process — non-engineering)*
- Have the Privacy Policy, Terms, Billing & Refund and Data Retention
  documents reviewed by a lawyer against the **Australian Privacy
  Principles**. The text now honestly describes the product (on-device
  data, optional self-hosted sync, closure = local erase), but only a
  practitioner can sign it off.
- Confirm the ABN/business entity named in the Terms is the one actually
  trading, and that the Billing policy matches whatever payment mechanism
  ships (see §2.4 — today nothing is billed).

### 1.2 Pilot with real businesses *(process)*
- 3–5 real refrigeration businesses, 2–4 weeks, before any marketing.
  Watch for: onboarding drop-off, glove-path logging speed in the field,
  quarterly report vs their existing paperwork, backup/restore round-trip
  on their actual phones, and (for one team) the sync beta.
- Exit criteria: a pilot business completes a full quarter-style cycle
  (setup → logs → report → backup) without support intervention.

### 1.3 Repository hygiene *(30 minutes)*
- The public repo (and therefore anyone curious) carries seven internal
  review documents (REVIEW.md, UX-REVIEW.md, RELEASE-READINESS.md,
  RELEASE-REVIEW-FINAL.md, REVIEW-NEXT.md, INDUSTRY-STANDARD-REVIEW.md,
  this file). Before announcing: move them to a private location or a
  `docs/internal` folder in a private repo. They candidly enumerate every
  historical weakness — great engineering culture, poor marketing.
- Bump `1.0.0-rc.1` → `1.0.0` when §1 is done and tag the release.

### 1.4 Production hosting *(server — small)*
- **Custom domain** (e.g. `app.refrighandle.com.au`) in front of GitHub
  Pages, or move hosting to Cloudflare Pages/Netlify. `BASE_PATH` is
  already parameterised, so this is DNS + one workflow variable. A real
  domain matters for: PWA identity (users' home-screen app should not be
  bound to `imyala.github.io`), email deliverability later, and the
  ability to move hosts without stranding installed PWAs.
  **Do this before the pilot** — installed PWAs are pinned to their origin
  forever; every install on the github.io URL is an install you can't
  migrate.
- **Uptime monitoring** on the production URL (UptimeRobot or similar,
  free tier is fine). The app is offline-first so outages are low-drama,
  but new installs and SW updates need the origin up.
- Keep the deploy workflow's lint+test gate (already in place).

---

## 2. Server-based work (the roadmap items)

RefrigHandle deliberately ships with **no backend**: data is on-device,
sync is an opt-in beta against the customer's own Supabase project, and
"Email a copy" is a `mailto:` handoff. That is a defensible v1.0 posture —
*keep it* for launch — but each of the following is a server capability
the product will need to graduate from "tool" to "service". Listed in the
order they should be built.

### 2.1 Authenticated sync backend *(the big one — replaces the beta)*
Today: one Postgres row per team in the **customer's** Supabase project,
guarded by RLS-with-no-policies + `SECURITY DEFINER` RPCs where knowing
the long random Team ID *is* the credential. Honest beta, but:
possession-of-ID is not real auth, there's no revocation, no per-person
identity server-side, and asking a fridgie to create a Supabase project
is a hard filter on adoption.

The v1.x replacement, hosted by RefrigHandle (Supabase or equivalent):

- **Per-user accounts** (email + password / passkey) via the platform's
  auth, mapped to a `team` with owner/manager/tech roles — mirroring the
  roles the app already enforces locally.
- **Row-level security keyed to team membership**, not a shared secret.
  Revoking a departed tech = deleting their membership row; today it
  requires rotating the Team ID on every device.
- **Server-side merge audit**: keep the append-only audit chain verifiable
  across devices by storing chain heads server-side.
- **Managed backups**: nightly server-side snapshot of each team row with
  30-day retention — this converts "keep taking JSON backups" from a user
  duty into a feature, and is the single strongest paid-tier hook.
- **Account deletion, server side**: the in-app closure flow then gets a
  real server action (delete team row + memberships + snapshots), closing
  the current gap where cloud-sync users must delete their Supabase row
  themselves.
- Migration: the app already does pull-merge-push; ship a one-tap
  "move team to RefrigHandle cloud" that imports the old row and retires
  the Team ID.
- **Groundwork already in place (July 2026):** the welcome screen has a
  real email + password sign-in form, accounts capture an email at
  creation (stored lowercased on the technician profile), and a signed-out
  device shows a sign-in screen (profile + password). Until the backend
  exists, the sign-in form authenticates a **built-in test account**
  (`test@refrighandle.app` / `Test1234`) that provisions a clearly-bannered
  local sandbox. When the server lands: point the form's submit at the
  remote auth call, and **remove `src/lib/testAccount.ts`** and its uses —
  a hardcoded credential must not survive into the real-auth era.

### 2.2 Transactional email *(small, after a domain exists)*
- Replace `mailto:` handoffs (closure record, audit pack share) with real
  sending via a transactional provider (SES/Postmark/Resend) behind a tiny
  serverless function — `mailto:` fails silently on devices with no mail
  app configured, which in trade businesses is common.
- Needs: SPF/DKIM on the custom domain, a `noreply@` sender, and a privacy
  policy line covering the processor.
- Also enables: licence/RTA/hydro-test expiry **email reminders** (the app
  only surfaces these in-app today) — high compliance value, low cost.

### 2.3 Error telemetry *(small, opt-in)*
- Self-hosted GlitchTip or Sentry with an **opt-in** toggle in Settings →
  Diagnostics (the app already has a local diagnostics log to build on).
  Without it, the only field-failure signal after launch is a support
  email. Scrub payloads: never include `AppState` (it contains customer
  PII and password hashes).
- Privacy policy must name the endpoint and the opt-in.

### 2.4 Billing *(when the product charges money)*
- Stripe Checkout + customer portal on a serverless backend; entitlement =
  a signed token the app verifies offline (it must keep working in a
  black spot even if a subscription check can't run).
- Free tier: single device, on-device only. Paid: cloud sync + managed
  backups + email reminders (all of §2.1–2.2). The Billing & Refund
  policy shipped in-app must be updated to match reality at that point.

### 2.5 Later / nice-to-have *(server)*
- **ARC licence verification**: a lookup against the ARCtick public
  register at onboarding (the app currently takes a self-declaration).
  Needs scraping or a data agreement — investigate, don't promise.
- **Play Store presence** via TWA (Bubblewrap) once the custom domain is
  live; App Store needs a thin wrapper — decide post-pilot whether store
  distribution is worth the review overhead vs. the current install-PWA
  button.
- **Server-rendered share links** for audit packs (today they travel as
  files) — only meaningful once auth (§2.1) exists.

---

## 3. Client polish (small, can ride along with the pilot)

- The remaining minor-polish list from RELEASE-REVIEW-FINAL.md §3 (copy
  nits, empty-state art, a handful of focus-order items).
- Sweep the app for any other overlay that could shadow content the way
  the fixed bars did (this branch fixed the two `fixed` bars; the modals
  and pickers were already scroll-safe with `max-h` + safe-area padding).
  Rule going forward: **bottom bars are `sticky`, never `fixed`.**
- A guest-mode Settings page shows the full settings surface including
  "Close account"; consider trimming account-lifecycle actions while in
  demo mode (exit guest mode is the correct verb there, and it's now in
  the banner).

---

## 4. Suggested order

| # | Item | Kind | Size |
|---|------|------|------|
| 1 | Custom domain + hosting cutover (§1.4) | server | ~1 day |
| 2 | Prune internal docs, tag 1.0.0 (§1.3) | process | ~1 hour |
| 3 | Legal sign-off started in parallel (§1.1) | process | external |
| 4 | Pilot (§1.2) | process | 2–4 weeks |
| 5 | Error telemetry, opt-in (§2.3) | server | ~2 days |
| 6 | Transactional email + expiry reminders (§2.2) | server | ~1 week |
| 7 | Authenticated sync backend (§2.1) | server | the next quarter's project |
| 8 | Billing (§2.4) | server | with first paid tier |

Launch happens after 1–4. Items 5–8 are the v1.x roadmap and none of them
block going live, because the shipped product is honest about what it is:
an offline-first, on-device compliance tool with an optional self-hosted
sync beta.
