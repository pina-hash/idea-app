---
title: "Home page: the live IDEA Classroom feed (the legacy class cards are retired)"
date: 2026-08-12
branches: []
migrations: ["0048"]
subsystems: ["IDEA Classroom"]
record_order: 72
---

The home page's pre-classroom class-content system is **gone**. That system was
the pinned FSP card plus the six empty year-grouped course cards, all rendered
from hardcoded `curriculum.ts` data through a local `sectionCard` snippet, with
per-slug icon and ordering lookup tables in `FspHomeSection.svelte`. In its
place, a signed-in user's home page opens onto their real classes.

- **What was deleted:** `src/lib/fsp/FspHomeSection.svelte`, the `sectionCard`
  snippet and the year-grouped course grid in `src/routes/+page.svelte`,
  `/dev/fsp-home`, and the now-dead `summerProgram()` / `sectionsByYear()` /
  `YearGroup` exports from `curriculum.ts`. The `.fsp-home-card`, `.live-pulse`
  and `.open-progress` CSS went with them.
- **`curriculum.ts` KEEPS EVERY SECTION ENTRY, `summer-2026` included.** Each id
  is a value that may already sit in a real `profiles.section_id`; deleting one
  would orphan those rows and break `sectionById`. It was the **self-selection
  catalog** until the picker was retired (below); it is a course catalog and a
  lookup now -- **classroom owns class content**. Its `assignments` arrays are
  legacy and render nowhere.
- **`fsp_item_opens` (0048) and its migration are untouched and now UNREAD.**
  The module stays, no caller imports it, and the home page load no longer
  queries it. Nothing was dropped.

### The feed

`src/lib/classroom/feed.ts` is the pure ranking layer (no Svelte, no Supabase --
the classroom.ts convention) and `src/lib/classroom/ClassroomFeed.svelte` is the
presentation, mounted by `src/routes/+page.svelte` inside `.legacy-index` so it
**reuses the retired cards' own chrome** (`.course-card`, `.assignment-item`, the
badge row) and the page reads as one surface rather than two systems.

- **Three RLS-scoped reads, no role branch, no `student_email` filter anywhere**
  (`+page.server.ts`, the /coin-balance doctrine): `classroom_sections`,
  `classroom_items` (with its postings and own view stamp), and
  `classroom_submissions`. The two `.in(...)` filters are about PAYLOAD SIZE, not
  privacy -- dropping them would leak nothing, the policies still answer
  correctly. **feed.ts therefore never filters for privacy; it only decides
  RANK.**
- **`manages` mirrors `classroom_manages_section`** (teacher of record, or
  admin) from data already loaded, rather than one RPC per section. It only
  decides which QUESTION the card answers, so getting it wrong shows a teacher
  the student framing, never another section's rows.
- **Ranked by urgency, not recency**, because the class page is already a
  reverse-chronological stream and repeating it here would say nothing
  actionable. Student order: `overdue` -> `returned` (a released grade not
  opened since it was released, from `classroom_item_views` vs `returned_at`) ->
  `due-soon` (7 days) -> `unsubmitted` -> `updated` -> `pinned`. Teacher order:
  `ungraded` -> `draft` -> `due-soon` -> `pinned`.
- **`isAwaitingGrade` is not "graded_at is null".** A resubmission after a
  return is submitted AGAIN with the old `graded_at` still on the row, so the
  naive check would silently drop every resubmission out of the grading queue;
  it compares `submitted_at > graded_at`.
- **Materials are a SEPARATE standing shelf**, never ranked against work: a
  syllabus is needed all year and acted on approximately never. A pinned
  material goes to the shelf; a pinned ANNOUNCEMENT still ranks (lowest) because
  it is worth seeing. An UPDATED material does rank -- a changed syllabus is
  news. `actionCount` (the header chip) counts only actionable reasons and
  counts PAST the display cap, so folding a card never understates the work.
- **Kind glyphs** (`ICON_KINDS` in the component, the legacy approach): one mark
  per kind -- announcement / assignment / material. Deliberately **no live-state
  indicator and no first-open progress dots**; `classroom_item_views` stays
  consumed only by the Updated badge. Tones use existing tokens only and
  `--crimson` is deliberately absent (reserved for LIVE/REC/error).
- **`now` is threaded, not defaulted per call.** The component takes the same
  `Date` the caller gave `buildFeed`; a component reading its own `new Date()`
  silently disagreed with the ranking it was rendering (found in the harness).
- **States:** signed out renders a sign-in card where the FSP card used to be;
  enrolled-but-nothing-posted and caught-up read differently on purpose; a
  pre-0082 backend fails soft to a flagged card.

### Collapse: fixed, and persisted per user

The legacy cards collapsed through a **document-level click listener on a bare
`<div>`** -- mouse-only and invisible to assistive tech. That listener is gone
from `+page.svelte` and **must not be reintroduced**: it would double-toggle
against the feed's own control. Each feed header is a real
`<button type="button">` with `aria-expanded` and `aria-controls`, in the natural
tab order, with the arrow `aria-hidden`; `.legacy-index button.course-header`
carries the button reset. Collapse persists to
**`profiles.preferences.classroomFeed`** (the AppLauncher `preferences.homepage`
pattern), so it follows the user across devices and needed no migration. The
archived surfaces carry no collapse control at all rather than inheriting the
bug.

### Harness + tests

`/dev/home-feed` (404 in production, no auth/Supabase) mounts the REAL
`ClassroomFeed` inside `.legacy-index` and drives it through the REAL
`buildFeed`, with student / teacher / no-classes / migrations-off modes; its
fixtures MIRROR RLS (a student's items exclude drafts, their submissions exclude
classmates') rather than pretending feed.ts filters. Tests live in
`tests/classroom-engine.test.ts` (which already applies 0086): they do NOT hand
`buildFeed` a fixture -- they read through the real policies AS each user,
exactly the way the page load does, and rank whatever came back. Mutation-checked
three ways (letting pinned materials rank, the naive `isAwaitingGrade`, demoting
the `overdue` rank) -- each reddens exactly one test.

