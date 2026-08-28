---
title: "The 24px chip floor closes for `.btn.tiny`/`.btn.secondary.tiny`, and the harness stops flagging the six controls that already clear it (`claude/classroom-button-sizing-3y81ad`, no migration)"
date: 2026-08-28
branches: [claude/classroom-button-sizing-3y81ad]
migrations: []
subsystems: ["Classroom", "browser-verify harness"]
---

## The 24px chip floor closes for `.btn.tiny`/`.btn.secondary.tiny`, and the harness stops flagging the six controls that already clear it (`claude/classroom-button-sizing-3y81ad`, no migration)

`npm run verify:browser` went from 2 outside threshold to 8 after yesterday's
`claude/dev-routes-merged-features-pglx6a` bundle wired two previously
unreachable states (the composer's staged rubric builder, and an item that
already carries a check-in) into real dev routes for the first time. Six of
the eight were the same defect measured six times: `.btn.secondary.tiny`
inside `RubricBuilder.svelte` and `CheckInStager.svelte` sits under neither
`.cr-console` nor `.engine-host`, so it stayed on the bare `.cr-root
.btn.tiny` rule in `classroom.css`, which measured ~22.9px -- under
`IDEA_INTERFACE_STANDARDS` 10's 24px absolute floor for a control that is
neither phone-touched nor on the student-facing engine. The other two
(`/dev/pathways` "harness controls" at 26.2px) are the known, pre-existing
finding and are untouched.

**Measured before fixing anything** (both widths identical, since these
controls do not respond to viewport):

| control | class | measured |
|---|---|---|
| rubric builder "Build rubric" / "Generate from spec" | `.btn.secondary.tiny` | 103.5x22.9 |
| item inspector "Add a check-in" (second attach door) | `.btn.secondary.tiny` | 117.2x22.9 |
| item inspector "Detach" | `.btn.secondary.tiny` | 124.1x22.9 |

**The decision:** close the gap in the shared rule rather than carve out a
harness exception for six numbers that will only recur every time another
route reaches one of the ten other `.btn.tiny` call sites. `classroom.css`'s
base `.cr-root .btn.tiny, .cr-root .btn.secondary.tiny` rule gained
`min-height: 24px` (block padding left untouched -- at this size the padding
is most of what makes the control read as a chip rather than a button, and
the gap to close was ~1.1px). `min-height`, never a fixed height, so a chip
whose label wraps still grows with it, same reasoning as the `.cr-console`
and `.engine-host` 44px rules immediately below it in the same file. Their
stale "21px" / "measures 21px tall" prose (written before this control had
ever actually run in a browser to be measured) is corrected to the real
number and re-worded: the comment now says which controls are 24px-floor
chips and which are 44px worked controls, instead of asserting one number
for the whole class.

**The audit asked for in the brief: is any of the six a worked control that
wants 44px rather than 24px?** No. All six are one-time authoring or
attach/detach actions on a manage-only surface (build a rubric once per
assignment, attach or detach one check-in), not a rapid-fire surface like the
grading console's Save/Approve loop that `.cr-console` already promotes to
44px. None needed a component-level fix; the shared-stylesheet fix covers
all six.

**After:** all six measure 24.0px (0 under the 24px floor). `npm run
verify:browser` reports 2 outside threshold, both `/dev/pathways`'s known
finding, unchanged from before yesterday's routes.

**routes.mjs's own three tap-target checks** for these controls previously
asserted `min: 44` with a comment calling the ~22.9px result a "known
finding, not a new defect" -- correct at the time (the 24px floor did not yet
hold), now stale once the CSS fix landed. Changed to `min: 24`, since that is
the standard that actually applies to a manage-only chip, and the comments
rewritten to explain why 24 rather than 44 (not phone-touched, not the
student-facing engine).

**Confirming the whole set, since a shared button class touches more than
six controls.** `.btn.tiny`/`.btn.secondary.tiny` renders roughly fifty
places across the classroom module; only four components are mounted by any
harness-covered route (`ClassView`, `ContentComposer` + `RubricBuilder`,
`ItemDetail` + `CheckInStager`, `SpecRenderer`). Measured (1440px; these
controls do not respond to viewport):

- `ClassView` "New post" (`[data-testid="new-post"]`) and "Units (3)"
  (`[data-testid="units-toggle"]`), visible at
  `/dev/classroom-split/s-1?manage=1`: 22.9px -> 24.0px, width unchanged
  (76.1 and 82.9 respectively). Not covered by an existing harness
  tap-target check (only the bulk-bar controls are); measured directly with
  a scratch script against the dev server for this report.
- `ClassView`'s bulk-bar buttons (Publish, Delete, Clear selection) already
  carry their own `.bulk-bar .btn.tiny` override to the 44px floor
  (classroom.css, pre-existing) and are unaffected -- confirmed unchanged at
  69.2x44 in the full `verify:browser` report before and after.
- `SpecRenderer`'s "Add row" (`.btn.secondary.tiny`), mounted at
  `/dev/spec-table`, sits inside a closed Disclosure and is not visible on
  that route (only two disclosures ever open, and neither contains this
  control in the harness's default state), so the harness's own `button`
  tap-target check does not measure it either before or after this change.
  Not a regression; unchanged from its pre-existing coverage gap.
- Every other `.btn.tiny`/`.btn.secondary.tiny` render site (AdminConsole,
  AssignmentEngine, GradesPanel, GradingConsole, InstructorCopy,
  PeoplePanel, RevisionHistory, SpecImporter, SpecTextEditor, UnitManager) is
  not mounted by any route `tools/browser-verify/routes.mjs` covers and so
  was not measured here. Several of these already carry their own
  `.tap-44`/`min-height: 44px` overrides on individual controls
  (`InstructorCopy`, the danger/edit rows in `PeoplePanel`,
  `SpecTextEditor`) or a scoped 44px rule for the whole class
  (`RevisionHistory`'s `.tool-actions :global(.btn.tiny)`, `GradingConsole`
  and `ItemDetail` under `.cr-console`/`.engine-host`); those are unaffected
  because a component-scoped rule always outranks the shared `.cr-root .btn.tiny`
  rule (Svelte's compiled scoping attribute adds specificity the shared
  sheet's plain class selectors don't have). Every remaining unscoped
  instance in these components gains the same 22.9px -> 24px floor, which is
  the intended effect of a shared-class fix and not a finding to chase down
  file by file.

**No layout shift, no overflow.** `verify:browser`'s horizontal-scroll check
stayed 0px at both 375px and 1440px on every route, and the full report's
route/width run count, presence counts and console-error counts are
byte-identical before and after except for the eight tap-target lines this
bundle exists to change and normal per-run render-time jitter.

**Verified:** `npx svelte-kit sync && npx svelte-check` — 0 errors, 37
warnings (31 `state_referenced_locally`, 5 `css_unused_selector`, 1
`perf_avoid_nested_class`), matching the documented baseline exactly. Full
suite: 135 files, 3110 tests, all passing (no application logic touched by
this bundle, so this is a confirmation, not a defense). `npm run
verify:browser`: 24 route/width runs, 174 measurements, 2 outside threshold
(both the known `/dev/pathways` finding).

**Not verified:** a real signed-in session (this bundle touches no route or
data path, only shared CSS and the harness's own scoring), and the visual
result was read from computed geometry rather than a screenshot (per the
Browser pane's own limits -- geometry is the auditable number here, not a
picture).

**What was NOT changed:** `transports.ts`, anything under
`src/routes/classroom/`, any migration, and anything under
`src/lib/foundry/`, per this session's ownership boundary. No student-facing
behaviour changed, so no `classroom-updates.json` entry was added.
