---
title: "Working conventions"
date: 2026-06-20
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 82
---

## Working conventions

- **No em dashes in user-facing copy.** Use commas, periods, or "to" for ranges.
- **`i¢` is the IDEA Coin symbol, written as the raw character**, never the
  `i&cent;` entity and never the word "coins" beside a rendered value. Two
  exclusions a blanket replace would corrupt -- GREENLINE's `IC` (Ignition
  Credits, a separate currency) and VANGUARD's own currency string -- plus the
  three SVG `<text>` glyphs that keep `i&#162;`. Full rule: "The coin display
  layer" above.
- **Intent-based, surgical edits.** Change what the task needs and no more.
- **A SESSION THAT CREATES MIGRATION FILES LISTS THEIR FULL REPO PATHS AT THE
  END OF ITS RESPONSE.** Migrations here are applied BY HAND in the Supabase SQL
  editor, immediately, and that is the first thing that happens after the work
  lands -- so the path belongs where it is about to be used, not somewhere the
  reader has to go and find it. One line per file, full path from the repo root,
  in apply order. A session that created none says nothing.
- **Commit and push every session.** Do not leave work uncommitted.
- **Keep this file current.** When the app gains routes, tiers, roles, env
  vars, or conventions, update CLAUDE.md in the same change. This
  self-maintenance is part of the job.
- **Automated tests are the exception, not the default.** `npm test` exists (see
  "Automated tests" above) and must stay green, but new work is still verified
  by dev harnesses and browser passes. Add a test only for a guarantee whose
  regression would be SILENT -- security boundaries, mainly -- and mutation-check
  any test you add: a test that cannot fail is proving nothing.
- **Interactive/visual verification:** when a task involves interactive or
  visual UI (custom viewers, canvas or three.js/3D, animations, drag/pan/zoom,
  pop-out/PiP, complex forms, or anything whose correctness is not visible to
  type-checking), you must (1) add or reuse a dev-guarded harness route that
  renders only when `dev` is true, returns 404 in production, and needs no auth
  or Supabase, mounting the component with representative sample data, and (2)
  verify every interaction and visual in a real browser via that harness before
  finishing. Report what you verified. svelte-check passing is necessary but not
  sufficient. Harness routes stay in the repo as regression tools.

### Interface standards (standing rules for every app surface)

- **Desktop is a first-class layout.** Every surface needs a real layout above
  1024px; master-detail is the default for list-plus-detail surfaces. A single
  narrow column at every width is a defect, not a simplification.
- **An instructor's view of student-facing content is the student view plus
  edit affordances, through the same render path.** Instructor-only content
  belongs in a visually distinct region, never a parallel re-derivation of what
  the student sees.
- **A preview path must read through the same payload as the thing it
  previews.** A preview built from a second, hand-shaped read can drift from
  what it claims to show.
- **Everything an item needs is attachable at creation, on one surface.** Do
  not make an author save first and come back to attach the rest.
- **Interface changes are verified at a desktop width of at least 1440px and
  at 375px.** A pass at one end is not a pass.

