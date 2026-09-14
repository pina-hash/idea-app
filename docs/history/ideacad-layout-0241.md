---
title: "IdeaCAD repairs its production editor layout"
date: 2026-09-14
branches: ["codex/ideacad-layout-0241"]
migrations: []
subsystems: ["IdeaCAD"]
---

The Blade editor's optional orientation row had made CSS grid auto-placement
load-bearing. When that row was closed, the edit footer occupied the graphics
area's flexible track, so its Accept and Cancel buttons stretched into two tall
bordered columns. The toolbar, orientation chooser, graphics well, and footer now
name fixed grid rows. The controls keep the same handlers and remain together in
the edit footer; feature and material edits continue to use their owning
PropertyManager confirm pair.

FeatureManager and PropertyManager visibility moved out of the view toolbar and
onto docked controls at the corresponding pane edges. The view toolbar now
contains view operations only. Its old six-pixel gap, bottom rule, and shadow
were removed, and the graphics well drops its duplicate top border so toolbar
and viewport read as one assembly.

The status bar now owns a minimum 36-pixel grid track and border-box height.
Right-side inset space keeps its final selection readout out from under the
portal's fixed Report a problem control, while wrapping remains available at
phone width.

`svelte-check` matched the requested baseline: 0 errors and 37 warnings in 20
files. The full test runner reported 9,072 passing, 21 failing, and 15 skipped
tests across 477 files (469 passing and 8 failing). The pre-existing IdeaCAD DOM
failures reproduce unchanged from commit `799d203`; the remaining failures also
include the baseline's unapplied-migration record mismatch. This bundle does not
alter feature editing or migrations to repair failures outside its layout scope.

The required browser pass was attempted through `npm run verify:browser`. Vite
served the harness, but the installed Playwright Chromium could not launch
because `libatk-1.0.so.0` is absent, so no screenshot or real-browser dimensions
could be recorded in this environment.
