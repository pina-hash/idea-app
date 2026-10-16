---
title: "Ledger 0392: feedback triage batch 2026-10-16, eight items plus the conference dashboard (0265, 0266) (`claude/modest-dirac-64jya0`)"
date: 2026-10-16
branches: [claude/modest-dirac-64jya0]
migrations: ["0265", "0266"]
subsystems: [Classroom, Grading, Student page, Coins, Ledger, Feedback, Tournaments, Home, Migrations]
---

Mr. Pina's export of 2026-10-16 carried eight reports for this batch (the
gallery reports were excluded by the prompt). Each was checked against the
tree before anything was edited; all eight reproduced. Mid-run he added a
ninth ask: the per-student page under People is for parent-teacher
conferences, so it should show a grade, a gallery of the student's work that
plays by itself and can be stepped through by hand, larger text, and
assignments opening newest due date first.

## What changed, item by item

1. **The Ledger's feedback button was the old one.** The panel the Ledger
   carries (`$lib/server/legacy-report-panel.ts`) now asks what the root box
   asks: the horizon chips (Fix soon / Long-term idea), "What happened", and
   the optional "What did you try?" capped by `FEEDBACK_TRIED_MAX`. The one
   signed-in handler (`legacy-feedback-post.ts`) takes `tried` and the
   horizon and refuses an over-long `tried` as `tried_too_long` (a new entry
   in `FEEDBACK_REFUSALS`). On a page that declares the Ledger's plate tokens
   the panel and its trigger wear that page's own key and panel classes, so
   it looks like every other key on the page in both themes; elsewhere it
   keeps the neon or paper palette it had.
2. **The Ledger's IDEA logo was the old text mark.** `injectLedgerLogo`
   (`$lib/server/ledger-logo.ts`) swaps the anchor for the site emblem,
   server-rendered from `AnimatedLogo`, on the served string. The component's
   layout rules do not travel with `render`, so they are restated and
   `tests/ledger-logo.test.ts` reddens if a number drifts from the component.
   **The frozen Ledger file was not edited** for either item.
3. **The Classes dropdown was ugly.** One aligned line per class (the course
   code in a fixed column, the section beside it, an ellipsis rather than a
   wrap), All my classes first with a glyph and a check, then "Your classes"
   and "Archived" under labels (archived rows quieter), and the staff doors
   last with glyphs. Below the fold it is a section of the Menu's panel, never
   a second panel nested inside it.
4. **Grading view scroll stuck, bottom blank, with a ported worksheet.** Root
   cause: the full-height classroom frame was `overflow: hidden`, which is
   still a scroll container. Measured at 1920x912: the frame's content was
   1019px in a 912px box; a `scrollIntoView` from inside the work scrolled the
   frame 107px, the footer slid under the console and the window's foot went
   blank, and nothing could scroll it back (every pane is
   `overscroll-behavior: contain`). Fix: `overflow: clip` after `hidden`.
   The new spec `html-assignment-grading-state-frame-clip` tries three script
   scrolls and reads the frame at 0; with the fix reverted it reads 214.
5. **The student page print.** Two Letter pages at 0.75in margins for the
   fixture, from six, with no printed text under 9.00pt and body leading 1.3
   (headings 1.15). The page's container queries were stacking every grid in
   print; print sets `container-type: normal`.
6. **Undo a grade, any time, server side.** Migration 0265 adds three verbs,
   each gated on `classroom_can_review_submission` and never on coins: take a
   return back (the grade stays as a draft only the teacher sees), revoke
   (every grading column snapshotted into `classroom_grade_revocations`, then
   cleared; bought extra credit is kept), and restore (the snapshot put back
   exactly, refused as `graded_since` if somebody graded in between). Each
   re-runs the Perfect Score sync, so that reward follows the grade. The
   grading console shows the row under the return dock, with a two-step
   confirm for revoke that says what it costs.
7. **Change any tournament setting while it is live.** Migration 0266 adds a
   preview and an apply for an admin. The preview answers, in words, what
   changes and what happens to matches already decided, started or not
   started; the apply takes the previewed config back and refuses `stale` if
   anything moved. Played and started matches keep their length, nothing is
   re-decided, no coins move, qualifying stays locked, and the change is
   logged as a correction.
8. **"Need attention" on home cards in Space White.** The count now carries a
   warning mark beside its words, sits on a warm wash laid over white on
   Space White (it was a muddy grey-beige at 4.74:1; now 6.16:1) and over the
   chip ground on the dark themes (4.70:1), and a folded card has no empty
   16px band under its header.

**The conference dashboard.** The grade (points on returned work as a
percent, with a sentence that FACTS weighs categories), "Coming up" (live
work still to do, due ahead, soonest first), the slideshow of their work
(hand-in pictures and turned-in notebook photos, auto-advancing every five
seconds, pausing for hover, focus, a hidden tab, the Lightbox and reduced
motion, with Previous, Next, Pause and a thumbnail strip, the caption on a
band below the picture), a Missing tile, a Needs attention list, score bars
for returned work, and type sized for a table of parents. Assignments open on
due date, newest first.

## Measured

- Student page print: 6 pages before, 2 after (Letter, 0.75in), smallest
  printed text 9.00pt.
- Browser harness, every spec this bundle added or touched, at 375 and 1440:
  `classroom-student*` 14 runs 292 measurements 0 outside; the class menu
  specs 4 runs 68 measurements 0 outside; the attention specs 4 runs 44
  measurements 0 outside; grading undo, tournament live settings, coins and
  the assignment feedback specs 0 outside.
- Mutants, each killed: 0265's reviewer gate, `graded_since`, the coin sync
  and an anon grant; 0266's stale check, the pending-match filter, the admin
  gate and the qualifying lock; the gallery filters; `studentUpcoming`'s done
  and date filters; the frame clip; the class menu grid (stacked and
  wrapped); the folded-card padding.

## Found, not this bundle's

- `html-assignment-grading-state-present` failed at 375 with HEAD's own
  console: the harness's floating Feedback pill sits over the Present key at
  375x900 (the real classroom docks it). The spec now centres the key first.
- On this checkout, `classroom-palette` (a row's wording), its settings-help
  count (11 against 10), the list-width spec, and every changelog spec (the
  checkout is shallow, so the changelog holds 27 entries) fail with files this
  bundle did not touch.

## Decisions owed (with the default shipped)

- **A letter grade.** Shipped: a percent only, with the FACTS sentence. A
  scale is Mr. Pina's to set.
- **Revoking a grade does not reverse the weekly Highest Score payout.**
  Shipped: Perfect Score follows the grade; the weekly payout stays paid,
  stated in 0265's header.
- **A student-facing version of the dashboard.** Shipped: teacher only, as
  the page was.

## Not verified

- No session here can reach production: 0265 and 0266 are applied by the
  migrate workflow on the push, and nothing here ran them against live data.
- The slideshow and print were measured in the harness Chromium; Safari and
  a real printer were not.

## Undo

0265: drop the four client functions, the three helpers and
`classroom_grade_revocations`. 0266: drop `tournament_live_config_apply`,
`tournament_live_config_preview` and `_tournament_live_config_plan`.
