---
title: "FSP is archived (the programme has concluded)"
date: 2026-08-12
branches: []
migrations: []
subsystems: ["FRC / FSP / feedback"]
record_order: 75
---

## FSP is archived (the programme has concluded)

The Freshman Summer Program is over. It is **archived, not migrated into
classroom**: it was pre-enrollment content for students who did not yet have
accounts, which is exactly the audience classroom's enrollment-keyed model
cannot serve, so there was nothing to move.

- **`/fsp/archive`** is the read-only home for the preserved content, following
  the precedent of `/archive` and the `/assignments/<slug>` endpoint. Public and
  session-blind, no writes, no collapse control. It mounts the ORIGINAL
  `FspPresentationsPanel` (all three Google Slides decks) and
  `FspCourseInfoPanel` (the three course-description records) unchanged, and
  lists every item the retired card carried, each tagged `Still active`,
  `Archived` or `Open`. `src/lib/fsp/archive.ts` holds that item list (it used to
  be assembled across `curriculum.ts` and the home page) so the archive owns its
  own contents. Linked from the home footer, `/archive` and `/fsp/class`.
- **EVERY FSP ROUTE STILL RESOLVES** -- QR codes printed for the sessions are in
  circulation: `/fsp/class`, `/fsp/ask`, `/fsp/live`, `/fsp/frc-interest` (+
  `/admin`), `/fsp/day1`, `/fsp/day2`, `/archive`, `/assignments/*`.
- **`FSP_CONCLUDED` in `src/lib/fsp/archive.ts` is a FLAG, not deleted code,
  because FSP is ANNUAL.** While true, `/fsp/ask` renders a "Session finished"
  card in place of the question form and `/fsp/live` shows a concluded banner
  above the record of what was asked. Flipping it back to `false` re-opens both
  surfaces next summer with nothing to restore.
- **Two things carry on unchanged and are marked `Still active`:** the
  SolidWorks add-in hub at `/fsp/class` with its `/downloads/fsp-pawn-addin.zip`
  (a real tool with use beyond FSP), and `/fsp/frc-interest` (recruiting runs all
  year).
- `site-manifest.ts`: the `archive` app now claims `src/routes/fsp/archive/` and
  `src/lib/fsp/archive.ts`; `classroom` claims `src/routes/dev/home-feed/`.

