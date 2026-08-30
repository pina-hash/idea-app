---
title: "The pathway-year picker is retired (and two launcher cards with it)"
date: 2026-08-15
branches: []
migrations: []
subsystems: ["Home page, launcher, tour"]
record_order: 74
---

The home page's "Your Pathway Year" divider, its picker card, the pinned-class
summary, the staff note and the signed-out note are all **gone**, along with the
`#your-class` anchor and the `data-tour="your-class"` hook. The GAUNTLET
"continue / next best" nudge strip went in the same pass.

- **WHY IT COULD GO WITHOUT MIGRATING ANYTHING: the value it wrote had exactly
  two readers, both on the page that wrote it.** An audit of every
  `profiles.section_id` reference found the header chip and the picker's own
  selected-state highlight, and nothing else. Classroom reads
  `classroom_enrollments`; the notebook stopped reading it at `0094`; the coin
  economy never could (`0073`'s header says so outright, since a self-selected
  value only exists for a student who has already signed in). Every other
  `section_id` in the codebase belongs to a DIFFERENT table.
- **`profiles.section_id` IS NOT DROPPED and `SECTIONS` IS NOT TRIMMED.** The
  column keeps every stored value, `sectionById` still resolves every id, and no
  row is orphaned. What changed is that **nothing writes it any more** -- there
  is no longer a `profiles` update for `section_id` anywhere in `src/`. Treat it
  as historical data until something deliberately picks it up again.
- **The header chip is rebuilt on REAL enrollment, with no new query.** It reads
  `data.feedSections` -- the `classroom_sections` the home load already fetches
  for the feed -- so one class renders `sectionTitle()` (`IDEA 209H · Period 2 ·
  Block B`), several render `N classes`, and the link goes to `/classroom`.
  **Staff get no chip at all**, because for an admin that list is every section
  in the school and "your class" would be a lie. The alternative in the brief was
  to delete the chip outright; it was kept because the data was already there and
  a new query was never needed.
- **Two launcher cards removed** (`portal-apps.ts`): **Courses & Assignments**,
  whose `href` was `#your-class` -- a same-page anchor to a section that had not
  held courses or assignments since the classroom feed landed -- and **Course
  Archive**, which is reference material rather than something to launch.
  `/archive` ITSELF IS UNTOUCHED and still 200s; it is still linked from the home
  footer, `/fsp/archive`, and the dashboard callout. Their two now-unused
  `appIcon` branches went with them (the `archive` icon id in
  `src/lib/fsp/archive.ts` is a DIFFERENT registry and is unaffected).
- **The GAUNTLET nudge strip is gone**: its markup, the `.nudge-*` block in
  `src/app.css`, and the `challenges` query + `gauntletNudge` bundle in the home
  server load. `suggestNext`, `modeHref` and `SuggestibleChallenge` were deleted
  from `progression.ts` (verified importerless first; the `MODES` import went
  with `modeHref`). `xpFromProgression` / `levelFromXp` / `computeStreak` STAY --
  `/gauntlet` and its leaderboard still use them, and that route runs
  `gauntlet_progression` for itself, so the RPC is not orphaned.
- **Dead CSS swept with it:** the `.legacy-index .picker-*` / `.teacher-note` /
  `.signin-note` rules. `.courses` and `.course-card` stay -- the classroom feed
  still uses them. (The FSP components' own scoped `.picker-head` is unrelated.)

