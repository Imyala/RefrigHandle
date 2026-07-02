# UX & Friendliness Review

Scope: every main screen (Home, Bottles, Sites, Jobs, Refrigerant log,
Settings), the core forms (LogForm, QuickAdd, BottleForm, SiteForm), the
first-run flow (Onboarding), and the alert surfaces (Alerts,
ComplianceHealth). The question asked: **is the app user friendly, easy to
look at and understand, and does it avoid feeling overwhelming?**

## Verdict

The app is in good UX shape. It consistently applies the patterns that keep
a records-heavy compliance tool approachable: progressive disclosure
(quick-add first, "More fields" on demand), real empty states with a single
clear action, "Showing X of Y … Clear filter" feedback, discard guards on
half-filled forms, strong defaults (last bottle, active tech, device
timezone), and disabled buttons that *name* the blocker instead of sitting
dead. The dominant remaining risk is **density**: long explanatory
paragraphs and jargon-heavy fields on the data-entry forms, not broken
flows.

## What changed in this round

- **First screen** now leads with three clear doors — **Sign in** (restore
  your records onto this device from a backup file), **Create account**
  (the business setup form, retitled from "First-time setup"), and a
  **Guest test drive** on sample data. Each button carries a one-line
  explanation, so a brand-new user is never staring at a form wall.
- **Horizontal scrollbars removed** from the sideways-swiping filter-chip
  rows (Bottles, Sites, Refrigerant log, Change log). The rows still slide;
  the bar never appears. (Wide report *tables* keep their scrollbar — on
  desktop it's the only affordance that more columns exist.)
- **Scannable labels are now first-class**: Settings → App settings gained
  a "Cylinder labels" card that prints QR labels for every cylinder, and
  each bottle's action sheet button is now "🏷 New scannable label" so it's
  obvious a fresh sticker can be made for any bottle at any time.
- **Overwhelm trims** (copy only, no logic): the Settings change-log
  paragraph cut from 8 lines to 2; the Jobs intro cut to one sentence;
  "Functional location" renamed to "Site name / label" (FLOC demoted to
  the hint) so sole traders aren't greeted by SAP jargon; "W.C — water
  capacity" relabelled "Water capacity" with W.C explained in the hint.

## Screen-by-screen findings

### Home (Dashboard) — good, slightly tall
Hero stock figure with status pills is instantly scannable; the two heavy
sections (By refrigerant type, Recent activity) are collapsible; the tip
card is conditional. Mild redundancy: two compliance surfaces stack
back-to-back (ComplianceHealth then FleetLeakWatch). *Recommendation:* keep
one compliance surface on Home and nest FleetLeakWatch under it, collapsed.

### Bottles — good list, dense full form
List UX is strong (chips with counts, grouping, scan-to-open). The full
BottleForm is the densest routine screen: ~13 inputs plus a four-line live
safe-fill panel of derived math (`W.C × FR`). *Recommendations:* collapse
the AS 2030 test block and Supplier/Invoice pair behind a "More details"
disclosure; shorten the safe-fill panel to the net weight and an over/under
line, with the math behind an info affordance.

### Sites — good, one naming fix applied
Search + state chips + region grouping work well; the save-without-address
nudge is a confirm, not a block — right call. The "Functional location"
naming was the main trap (fixed this round). *Remaining:* the name/label
field still sits below the geography fields; moving it to the top would
match how people think ("what's this site called?" first).

### Jobs — lean, but hard to find
The form is a lean four fields and the service report is clean. Jobs has no
bottom-tab entry, so it's reachable only from the Home card grid — a
first-timer may never find it. *Recommendation:* consider surfacing Jobs in
the Log page (e.g. a "Jobs" link near the header) or in the tab bar if a
slot ever frees up.

### Refrigerant log (Transactions) — the "three logs" problem
The tab says **Log**, the page says **Refrigerant log**, and the page links
to a separate **Change log (audit trail)**. Three "log" concepts in one
viewport; the explainer paragraph is a patch over the collision.
*Applied in round 2:* the tab/page were renamed to "Moves" / "Refrigerant
movements", and the per-row action rail (four stacked text buttons on a
narrow phone) became a single "⋯" overflow.

### Log form — heaviest modal, well defended
8–11 visible controls on the charge path, but the defaults ("Same as last
job", most-recent bottle, quick-amount chips) and the folded notes/photos
section do a lot of work. *Recommendation:* group Reason + Leak test under
a small "Compliance" subheading so the required extras read as a unit, and
consider defaulting the leak-test answer to the last-used value.

### Settings — long but well chunked
Three collapsible sections keep it navigable; auto-save "Saved" flashes
remove did-it-save anxiety; the sync card stays hidden until configured.
The long change-log paragraph was the worst text wall (trimmed this
round). *Remaining:* the Technicians intro still packs roles, freezing and
permissions into one block — a candidate for the same trim.

### Onboarding — excellent gate, dense middle
Leading with Sign in / Create account / Guest test (this round) means no
one meets a 15-field form uninvited. Inside setup, the "Still needed: …"
live list under the Finish button is exemplary — a dead button never
mystifies. The "First account" card is the densest stack (9 controls);
the only optional field (middle name) could be folded away.

### Alerts & ComplianceHealth — model pattern
ComplianceHealth's traffic-light rows deep-link straight to the fix.
Alerts can stack three amber/red cards on a bad day; capping to the most
urgent with "+N more" would soften the wall of warnings.

## Recommendations — all applied in round 2

1. **Naming collision resolved.** The tab is now "Moves" (aria:
   "Refrigerant movements"), the page is "Refrigerant movements", and
   every user-facing "Refrigerant log" reference (Jobs empty state,
   Change-log copy) was updated to match. "Change log" now unambiguously
   means the audit trail.
2. **BottleForm decluttered.** Supplier/invoice and the AS 2030 test block
   fold behind "More details" (auto-open when the bottle already has any
   of that data, so nothing existing is ever hidden). The live safe-fill
   panel shows just the net weight — and the over-limit warning when it
   applies — with the W.C × FR maths behind a "Safe-fill details" toggle.
3. **One compliance surface on Home.** Equipment leak watch collapses to
   its header line + count pill by default; ComplianceHealth is the one
   expanded summary.
4. **Transactions rows calmed.** The four stacked text buttons became a
   single "⋯" per row that expands an action strip (Share, Photos /
   sign-off, Correct, Remove). The 📎 attachment count stays visible —
   it's information, not just an action.
5. **LogForm compliance grouping.** Reason + Leak test now sit under a
   small "Compliance" heading. (The leak-test answer is deliberately NOT
   defaulted from the last entry — pre-answering a regulatory question
   risks false records; the explicit "Same as last job" prefill already
   covers the routine case.)
6. **Settings → Technicians intro** trimmed from 7 lines to 2; the role
   tiers explain themselves in the add/edit profile picker.
7. **Jobs discoverable** from the Movements page — the header blurb links
   to the Jobs page alongside the Change log link.
8. **Alerts capped.** Only the most urgent alert card shows (severity
   order: cylinder safety, licences, backups) with a "Show N more alerts"
   expander.
