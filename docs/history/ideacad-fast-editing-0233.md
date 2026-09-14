---
title: "IdeaCAD makes parameter editing immediate and scrub-first (`codex/ideacad-fast-editing-0233`, no migration)"
date: 2026-09-14
branches: [codex/ideacad-fast-editing-0233]
migrations: []
subsystems: ["IdeaCAD"]
---

Selecting a FeatureManager row now opens that row's parameters immediately; the
double-click and Enter paths remain. The instructional paragraph was removed.
Every row instead carries a lock affordance that locates the unavailable rename
and delete state where it applies.

Numeric parameters and station coordinates commit on blur or Enter and revert
the focused value on Escape. Pointer dragging horizontally over a numeric field
scrubs at the field's existing step, Shift reduces that step to one tenth, and
the edit commits at pointer-up. Choice controls and range sliders also commit
without requiring Accept. Native Tab order moves through parameter controls, and
the panel states all five interactions next to the controls.

Accept remains for structural edits: adding or removing a body station and moving
a feature in build order. Those operations change collection structure or build
order rather than one ordinary parameter, so they retain the existing deliberate
commit/cancel boundary. Their geometry rules, bounds, and meanings are unchanged.

Numbers use tabular figures, stronger type, right alignment, and a separate fixed
unit column so values dominate labels and units scan vertically. No stylesheet,
CSS custom property, geometry, validation, transport, persistence rule, feature
type, route, or migration changed.

The existing dev-only IdeaCAD harness was started, but Chromium could not launch
because the container lacks its host libraries, so no real-browser interaction or
screenshot was verified. The DOM suite exercises the real component but still
asserts ledger 0145's superseded double-click/Accept contract; those tests were
not in this bundle's owned files and now fail where the requested interaction
intentionally differs.
