---
title: "Two of three merged-feature states never driven in a browser now are, through the classroom-split harness (`claude/dev-routes-merged-features-pglx6a`, no migration)"
date: 2026-08-28
branches: [claude/dev-routes-merged-features-pglx6a]
migrations: []
subsystems: ["Classroom", "browser-verify harness"]
---

## Two of three merged-feature states never driven in a browser now are, through the classroom-split harness (`claude/dev-routes-merged-features-pglx6a`, no migration)

Three features merged into `main` in the two days before this session, and none
had ever run in a real browser -- each because the session that built it could
not reach the state from any dev route it was allowed to touch. This bundle
closes that for two of the three, from inside the ownership boundary this
session was given (`src/routes/dev/classroom-split/`, `src/routes/dev/classroom/`,
`tools/browser-verify/`, harness test files -- nothing under `src/lib/`,
`src/routes/classroom/`, `src/lib/foundry/`, or any migration was touched).

### What already existed, established before changing anything

`/dev/classroom-split/[sectionId]/item/[itemId]` already mounted the real
`ItemDetail`, and `/dev/classroom-split/s-1?manage=1` was already in
`tools/browser-verify/routes.mjs` (driving the bulk-selection bar and drag
reorder). So reaching the composer's staged-rubric state needed no new route --
just a second `prepare` sequence against the composer that route's own layout
already owns. Reaching the item page's second check-in door needed the route
FILE (the item page never wired `checkInTransports` or `checkIns` at all --
both were simply absent from its props list), plus a routes.mjs entry, since no
prior entry drove `/item/[itemId]`.

### State 1: the composer's staged rubric builder (assignment, create)

`ContentComposer`'s `canStageRubric` needs `mode === 'create' && specKind ===
'assignment' && !!teacherTransports`. The composer defaults to `kind = 'post'`,
so nothing reached this without opening the composer AND switching its kind
toggle -- a plain-text three-button row with no `data-testid`, selected in the
harness by its own label (`.kind-toggle .kind:has-text("Assignment")`).
`RubricBuilder` mounts with `itemId={null}` (its staging mode): "No rubric yet"
/ "Build rubric" / "Generate from spec", nothing saved until the create call
returns an id. No source change was needed here -- the harness's own layout
(`[sectionId]/+layout.svelte`) already hands the composer a
`teacherTransports`, so the gap was purely "nothing ever clicked through to
this state in a browser."

### State 2: the item page's second check-in attach door

`ItemDetail`'s check-in block used to be `{#if checkIns.length}...{:else}<the
attach control>{/if}`; 0139 changed that to mount `CheckInStager` beside the
list unconditionally once `canManageCheckIn` (`canManage && !!checkInTransports`)
holds. But `src/routes/dev/classroom-split/[sectionId]/item/[itemId]/+page.svelte`
never passed `checkInTransports` (it wasn't wired at all -- the prop simply
defaults to `null`, which turns the whole block off) or `checkIns`, so the
state -- checkIns.length > 0 AND the attach door still rendering -- was
unreachable from this route regardless of what 0139 changed. Fixed:

- `src/routes/dev/classroom-split/fixture.ts` gained a `CHECK_INS` export: one
  check-in (`ns-crowded-1`) already attached to `i-crowded`, `status: null`
  throughout (a manager has no personal standing on a check-in, matching
  `ItemDetail`'s own doc comment; this fixture is only ever read under
  `?manage=1`).
- The item page now imports `checkInsForItem` (the real narrowing function
  `ItemDetail` requires its caller to have already applied) and a harness
  `ClassCheckInTransports` answered in memory, same pattern as
  `/dev/classroom`'s own harness transport -- this route is for geometry, not
  the write path, so the point of the transport existing at all is making
  `checkInTransports` non-null.

The inspector strip is collapsed by default (`itemInspector.open` starts
`false` in `inspector.svelte.ts`, module-scoped so it does not reset per item),
so the harness `prepare` opens it (`[data-testid="inspector-toggle"]`) before
measuring.

### State 3: the grading-category datalist -- skipped, and still unreachable

`loadCategorySuggestions` exists only as a type on `ClassroomComposerTransports`
and a consumer read in `ContentComposer.svelte`; `grep -rln` across `src/`
found no route or RPC implementation, and `tests/classroom-category-suggestions.test.ts`
confirms it by mocking the transport itself rather than driving a real one. Per
the task's own instruction, this is reported and skipped rather than faked --
building a fixture around a transport shape nothing real produces would prove
nothing about the merged feature (there isn't one to drive yet).

### `tools/browser-verify/routes.mjs`, two new entries

Both use only existing check types (`presence`, `contrast`, `tapTargets`), so
no new negative control was added to `selftest.mjs` -- that file's `CASES`
tests the check FUNCTIONS themselves, not each route's use of them, and every
check type used here already has a proven pair there. `--selftest` was run
before and after this bundle: 24 controls (12 negative, 12 positive), 0
instrument failures, unchanged.

1. `/dev/classroom-split/s-1?manage=1&state=compose-assignment-rubric`
   (`aliasOf` the existing composer URL): opens the composer, switches to
   Assignment, asserts the kind tab is active and `.rubric-builder` is mounted
   in staging mode.
2. `/dev/classroom-split/s-1/item/i-crowded?manage=1`: opens the inspector,
   asserts the attached check-in (`insp-check-in`), its detach control
   (`detach-check-in`), AND the second attach door (`check-in-open`) all
   present simultaneously -- the exact combination the pre-0139 `{:else}`
   shape could never produce.

### Two findings surfaced by driving states that had never rendered before

- **Chip-sized tap targets, not a new defect.** Both routes' `.btn.secondary.tiny`
  controls (Build rubric / Generate from spec; the second attach door; detach)
  measure ~22.9px min-dimension, under the 44px floor. `classroom.css:196`
  already documents this as deliberate -- `.btn.tiny` is the "chip beside a
  heading" size everywhere except inside `.cr-console` (the grading page) and
  `.engine-host` (the assignment work surface), which bump it to 44px. Neither
  the composer's staged rubric block nor the item inspector is either wrapper,
  so this is the intended size, measured for the first time rather than a
  regression. Left in `routes.mjs` as a reported measurement per CLAUDE.md
  ("every check reports a number, never a bare pass"), not silenced.
- **A real console error, fixed by an `ignoreConsole` entry, not code.** The
  item route throws one `401` per width: `i-crowded` carries a real image
  attachment (`span-photo.jpg`), `AttachmentList` renders it unconditionally
  through `attachmentSrc()` -> `/api/classroom/attachment/<id>`, and that route
  needs a session this placeholder-`.env` dev server cannot provide. Pre-existing
  fixture behavior, unrelated to the check-in feature, and the first time this
  item's detail page ran in a browser at all -- documented and ignored the same
  way the harness ignores its own external-request blocks.

### `tools/browser-verify/README.md`

Corrected `--selftest`'s stated control count from "22, 11 negative and 11
positive" to "24, 12 negative and 12 positive," re-derived from `selftest.mjs`'s
own `CASES` array rather than trusted. The file already had 12 groups (the
twelfth, `console-errors (console.error)`, was already there); the README line
had simply drifted out of step with it. Unrelated to this bundle's feature
work, found only because `--selftest` was run as part of verifying the new
routes.

### Numbers, before and after

Baseline (this session's own re-measurement, `git stash` to the pre-change
tree, `npm ci` + `svelte-kit sync` + placeholder `.env`, then restored):
**20 route/width run(s), 146 measurement(s), 2 outside threshold** -- both the
known `/dev/pathways` tap-target finding, matching the number this file's
CLAUDE.md-cited baseline already claimed.

After: **24 route/width run(s), 174 measurement(s), 8 outside threshold** -- the
same 2 pathways findings, plus 6 new ones, all six being the chip-sized tap
targets above (1 control x 2 widths on the composer route, 2 controls x 2
widths on the item route). No console-error findings, no horizontal-scroll
findings, no regression on any of the 14 pre-existing route/width entries
(diffed line for line against the baseline log; only render-time numbers
differ, as expected on a re-run).

`svelte-check`: 0 errors, 37 warnings, matching the documented 31/5/1 mix both
before and after (re-derived with `svelte-kit sync` first, as CLAUDE.md
requires, since a fresh checkout with no `.env` reports phantom errors
otherwise).

`npm test`: 135 files, 3110 tests, all passing -- unchanged, since this bundle
adds no application code, only dev-route wiring, fixture data and harness
config.

### Not verified

- No real `/classroom` route, no Supabase, no signed-in session -- this
  session's boundary is the `/dev` harnesses, same as every prior
  browser-verify bundle.
- The staged rubric was reached and measured in its empty "No rubric yet"
  state, not driven through "Build rubric" -> add a criterion -> save; the
  task asked to reach the state, not exercise the full builder, and
  `/dev/classroom` already drives rubric editing at length elsewhere.
- The check-in door was measured collapsed (`check-in-open` present, not
  clicked); opening it to the unit/date/name form was not driven, for the
  same reason.
- State 3 (grading-category datalist) has no real transport anywhere in
  `src/` as of this branch's tip and was not built around.

No branch left unmerged: this bundle is a single, complete change pushed to
`claude/dev-routes-merged-features-pglx6a` per the task's own instructions
(develop on that branch, do not merge to `main`).
